"""Role-aware dashboard aggregates."""
from __future__ import annotations

import calendar as _calendar
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.core.routing import CommitRoute
from app.core.enums import AssetState, IssueStatus, LFKind, LFStatus, UserRole, WorkOrderStatus
from app.models.issues import Issue
from app.models.lostfound import LFItem
from app.models.spatial import Asset, Building, Campus, Floor, Room
from app.models.work import Inspection, WorkOrder
from app.services import issue_views

router = APIRouter(route_class=CommitRoute, prefix="/dashboard", tags=["Dashboard"])

OPEN_ISSUES = [IssueStatus.REPORTED, IssueStatus.TRIAGED, IssueStatus.ASSIGNED,
               IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD]
OPEN_WOS = [WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED, WorkOrderStatus.ACCEPTED,
            WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.AWAITING_PARTS, WorkOrderStatus.ON_HOLD]


@router.get("", response_model=dict)
async def dashboard(user: CurrentUser, db: DB):
    """One payload shaped for whichever dashboard the caller's role renders."""
    org = user.organization_id
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    async def count(model, *conditions) -> int:
        return await db.scalar(
            select(func.count()).select_from(model).where(*conditions)) or 0

    is_reporter = user.role in (UserRole.STUDENT, UserRole.TEACHER)

    # ---- Reporter view: only their own reports ----
    if is_reporter:
        # Two round trips instead of four: each pair of counts shares a
        # table and a base filter, so FILTER-clause aggregates fold them
        # into one query apiece rather than one query per number.
        issue_counts = (await db.execute(
            select(
                func.count().filter(Issue.status.in_(OPEN_ISSUES)).label("open"),
                func.count().filter(Issue.status.in_(
                    [IssueStatus.RESOLVED, IssueStatus.VERIFIED, IssueStatus.CLOSED])).label("resolved"),
            ).select_from(Issue).where(Issue.reported_by == user.id)
        )).one()
        lf_counts = (await db.execute(
            select(
                func.count().filter(LFItem.kind == LFKind.LOST).label("lost"),
                func.count().filter(LFItem.status == LFStatus.RETURNED).label("recovered"),
            ).select_from(LFItem).where(LFItem.reported_by == user.id)
        )).one()
        my_open, my_resolved = issue_counts.open, issue_counts.resolved
        lost_reported, recovered = lf_counts.lost, lf_counts.recovered

        recent = (await db.scalars(
            select(Issue).where(Issue.reported_by == user.id)
            .order_by(Issue.created_at.desc()).limit(5))).all()

        # 7-day sparklines for the two issue-backed metrics -- real daily
        # counts of this reporter's own activity, not decoration. Lost &
        # Found's two metrics don't get one: that would need a second
        # per-day query against a different table for a KPI-card flourish,
        # and a metric with no real trend behind it is better left as a
        # plain number than paired with a graph that isn't really it.
        week_start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        created_rows = (await db.execute(
            select(func.date_trunc("day", Issue.created_at).label("day"), func.count().label("n"))
            .select_from(Issue)
            .where(Issue.reported_by == user.id, Issue.created_at >= week_start)
            .group_by("day")
        )).all()
        resolved_rows = (await db.execute(
            select(func.date_trunc("day", Issue.resolved_at).label("day"), func.count().label("n"))
            .select_from(Issue)
            .where(Issue.reported_by == user.id, Issue.resolved_at >= week_start)
            .group_by("day")
        )).all()
        created_by_day = {r.day.date(): r.n for r in created_rows}
        resolved_by_day = {r.day.date(): r.n for r in resolved_rows}
        created_spark = []
        resolved_spark = []
        for offset in range(6, -1, -1):
            day = (now - timedelta(days=offset)).date()
            created_spark.append(created_by_day.get(day, 0))
            resolved_spark.append(resolved_by_day.get(day, 0))

        return {
            "role": user.role.value,
            "metrics": [
                {"label": "Active complaints", "value": my_open, "accent": "#f59e0b", "sparkline": created_spark},
                {"label": "Resolved", "value": my_resolved, "accent": "#10b981", "sparkline": resolved_spark},
                {"label": "Lost items reported", "value": lost_reported, "accent": "#3b82f6"},
                {"label": "Items recovered", "value": recovered, "accent": "#10b981"},
            ],
            "recent_activity": [
                i.model_dump(mode="json")
                for i in await issue_views.to_list_items(db, list(recent))
            ],
        }

    # ---- Staff / manager / admin view ----
    # These five used to be five separate round trips on the same table —
    # one query with a FILTER per count does the same work server-side.
    issue_agg = (await db.execute(
        select(
            func.count().filter(Issue.status.in_(OPEN_ISSUES)).label("open_issues"),
            func.count().filter(
                Issue.resolved_at.isnot(None), Issue.resolved_at >= week_ago,
            ).label("resolved_week"),
            func.count().filter(
                Issue.sla_breached.is_(True), Issue.status.in_(OPEN_ISSUES),
            ).label("breached"),
            func.count().filter(Issue.status.in_(
                [IssueStatus.RESOLVED, IssueStatus.VERIFIED, IssueStatus.CLOSED])).label("total_closed"),
            func.count().filter(Issue.sla_breached.is_(True)).label("total_breached"),
        ).select_from(Issue).where(Issue.organization_id == org)
    )).one()
    open_issues = issue_agg.open_issues
    resolved_week = issue_agg.resolved_week
    breached = issue_agg.breached
    total_closed = issue_agg.total_closed
    total_breached = issue_agg.total_breached
    sla_compliance = round(100 * (1 - total_breached / total_closed), 1) if total_closed else 100.0

    active_wos = await count(WorkOrder, WorkOrder.organization_id == org, WorkOrder.status.in_(OPEN_WOS))

    # Asset health across the whole organization.
    state_rows = (await db.execute(
        select(Asset.state, func.count())
        .select_from(Asset)
        .join(Room, Room.id == Asset.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .join(Campus, Campus.id == Building.campus_id)
        .where(Campus.organization_id == org)
        .group_by(Asset.state))).all()
    states = {s.value: 0 for s in AssetState}
    for state, n in state_rows:
        states[state.value] = n

    total_assets = sum(states.values())
    healthy = states.get(AssetState.HEALTHY.value, 0)
    health_score = round(100 * healthy / total_assets) if total_assets else 100

    # 7-day created-vs-resolved trend. Was 14 count() round trips (2 per
    # day, one per side); each side is now one GROUP BY query bucketed by
    # day server-side, then read out of a dict per day in Python.
    week_start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    created_rows = (await db.execute(
        select(func.date_trunc("day", Issue.created_at).label("day"), func.count().label("n"))
        .select_from(Issue)
        .where(Issue.organization_id == org, Issue.created_at >= week_start)
        .group_by("day")
    )).all()
    resolved_rows = (await db.execute(
        select(func.date_trunc("day", Issue.resolved_at).label("day"), func.count().label("n"))
        .select_from(Issue)
        .where(Issue.organization_id == org, Issue.resolved_at >= week_start)
        .group_by("day")
    )).all()
    created_by_day = {r.day.date(): r.n for r in created_rows}
    resolved_by_day = {r.day.date(): r.n for r in resolved_rows}

    trend = []
    for offset in range(6, -1, -1):
        day_start = (now - timedelta(days=offset)).replace(hour=0, minute=0, second=0, microsecond=0)
        trend.append({
            "day": day_start.strftime("%a"),
            "date": day_start.date().isoformat(),
            "created": created_by_day.get(day_start.date(), 0),
            "resolved": resolved_by_day.get(day_start.date(), 0),
        })

    alerts = (await db.scalars(
        select(Issue).where(
            Issue.organization_id == org, Issue.status.in_(OPEN_ISSUES),
            Issue.priority.in_(["critical", "high"]))
        .order_by(Issue.created_at.desc()).limit(6))).all()

    my_queue = []
    if user.role == UserRole.TECHNICIAN:
        my_queue = [
            {"id": str(w.id), "reference": w.reference, "title": w.title,
             "status": w.status.value, "priority": w.priority.value,
             "sla_due_at": w.sla_due_at.isoformat() if w.sla_due_at else None}
            for w in (await db.scalars(
                select(WorkOrder).where(
                    WorkOrder.assigned_to == user.id, WorkOrder.status.in_(OPEN_WOS))
                .order_by(WorkOrder.priority.desc(), WorkOrder.sla_due_at.asc().nullslast())
                .limit(8))).all()
        ]

    return {
        "role": user.role.value,
        "metrics": [
            {"label": "Open issues", "value": open_issues, "accent": "#f59e0b",
             "sparkline": [d["created"] for d in trend]},
            {"label": "Active work orders", "value": active_wos, "accent": "#3b82f6"},
            {"label": "Resolved (7d)", "value": resolved_week, "accent": "#10b981",
             "sparkline": [d["resolved"] for d in trend]},
            {"label": "SLA compliance", "value": f"{sla_compliance}%",
             "accent": "#10b981" if sla_compliance >= 90 else "#f59e0b"},
        ],
        "health_score": health_score,
        "asset_states": states,
        "sla_breaches": breached,
        "trend": trend,
        "alerts": [
            i.model_dump(mode="json")
            for i in await issue_views.to_list_items(db, list(alerts))
        ],
        "my_queue": my_queue,
        "pending_inspections": await count(
            Inspection, Inspection.organization_id == org,
            Inspection.status.in_(["scheduled", "in_progress"])),
    }


@router.get("/calendar", response_model=dict)
async def calendar(user: CurrentUser, db: DB, month: str = Query(..., description="YYYY-MM")):
    """Everything with a date this month, bucketed by day — Issues by when
    they were reported, Inspections/WorkOrders by when they're scheduled.
    Reuses the existing three tables (no new table for this): a calendar is
    just a different read of data that already exists, org-scoped exactly
    like every other dashboard number on this page.
    """
    try:
        year, mon = (int(p) for p in month.split("-", 1))
        _calendar.monthrange(year, mon)  # raises for an out-of-range month
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "month must be YYYY-MM")

    org = user.organization_id
    start = datetime(year, mon, 1, tzinfo=timezone.utc)
    days_in_month = _calendar.monthrange(year, mon)[1]
    end = datetime(year, mon, days_in_month, 23, 59, 59, tzinfo=timezone.utc)

    issues = (await db.scalars(
        select(Issue).where(
            Issue.organization_id == org,
            Issue.created_at >= start, Issue.created_at <= end,
        ).order_by(Issue.created_at.asc())
    )).all()
    inspections = (await db.scalars(
        select(Inspection).where(
            Inspection.organization_id == org,
            Inspection.scheduled_for >= start, Inspection.scheduled_for <= end,
        ).order_by(Inspection.scheduled_for.asc())
    )).all()
    work_orders = (await db.scalars(
        select(WorkOrder).where(
            WorkOrder.organization_id == org,
            WorkOrder.scheduled_for >= start, WorkOrder.scheduled_for <= end,
        ).order_by(WorkOrder.scheduled_for.asc())
    )).all()

    by_day: dict[str, dict[str, list]] = {}
    for i in issues:
        iso = i.created_at.date().isoformat()
        by_day.setdefault(iso, {"issues": [], "inspections": [], "work_orders": []})["issues"].append({
            "id": str(i.id), "reference": i.reference, "title": i.title, "status": i.status.value,
            "priority": i.priority.value,
        })
    for insp in inspections:
        iso = insp.scheduled_for.date().isoformat()
        by_day.setdefault(iso, {"issues": [], "inspections": [], "work_orders": []})["inspections"].append({
            "id": str(insp.id), "reference": insp.reference, "status": insp.status.value,
        })
    for wo in work_orders:
        iso = wo.scheduled_for.date().isoformat()
        by_day.setdefault(iso, {"issues": [], "inspections": [], "work_orders": []})["work_orders"].append({
            "id": str(wo.id), "reference": wo.reference, "title": wo.title, "status": wo.status.value,
            "priority": wo.priority.value,
        })

    return {"month": month, "days": by_day}
