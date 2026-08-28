"""Role-aware dashboard aggregates."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.core.enums import AssetState, IssueStatus, LFKind, LFStatus, UserRole, WorkOrderStatus
from app.models.issues import Issue
from app.models.lostfound import LFItem
from app.models.spatial import Asset, Building, Campus, Floor, Room
from app.models.work import Inspection, WorkOrder
from app.services import issue_views

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

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
        my_open = await count(Issue, Issue.reported_by == user.id, Issue.status.in_(OPEN_ISSUES))
        my_resolved = await count(
            Issue, Issue.reported_by == user.id,
            Issue.status.in_([IssueStatus.RESOLVED, IssueStatus.VERIFIED, IssueStatus.CLOSED]))
        lost_reported = await count(
            LFItem, LFItem.reported_by == user.id, LFItem.kind == LFKind.LOST)
        recovered = await count(
            LFItem, LFItem.reported_by == user.id, LFItem.status == LFStatus.RETURNED)

        recent = (await db.scalars(
            select(Issue).where(Issue.reported_by == user.id)
            .order_by(Issue.created_at.desc()).limit(5))).all()

        return {
            "role": user.role.value,
            "metrics": [
                {"label": "Active complaints", "value": my_open, "accent": "#f59e0b"},
                {"label": "Resolved", "value": my_resolved, "accent": "#10b981"},
                {"label": "Lost items reported", "value": lost_reported, "accent": "#3b82f6"},
                {"label": "Items recovered", "value": recovered, "accent": "#10b981"},
            ],
            "recent_activity": [
                i.model_dump(mode="json")
                for i in await issue_views.to_list_items(db, list(recent))
            ],
        }

    # ---- Staff / manager / admin view ----
    open_issues = await count(Issue, Issue.organization_id == org, Issue.status.in_(OPEN_ISSUES))
    active_wos = await count(WorkOrder, WorkOrder.organization_id == org, WorkOrder.status.in_(OPEN_WOS))
    resolved_week = await count(
        Issue, Issue.organization_id == org, Issue.resolved_at.isnot(None),
        Issue.resolved_at >= week_ago)
    breached = await count(
        Issue, Issue.organization_id == org, Issue.sla_breached.is_(True),
        Issue.status.in_(OPEN_ISSUES))

    total_closed = await count(
        Issue, Issue.organization_id == org,
        Issue.status.in_([IssueStatus.RESOLVED, IssueStatus.VERIFIED, IssueStatus.CLOSED]))
    total_breached = await count(
        Issue, Issue.organization_id == org, Issue.sla_breached.is_(True))
    sla_compliance = round(100 * (1 - total_breached / total_closed), 1) if total_closed else 100.0

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

    # 7-day created-vs-resolved trend.
    trend = []
    for offset in range(6, -1, -1):
        day_start = (now - timedelta(days=offset)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        trend.append({
            "day": day_start.strftime("%a"),
            "date": day_start.date().isoformat(),
            "created": await count(Issue, Issue.organization_id == org,
                                   Issue.created_at >= day_start, Issue.created_at < day_end),
            "resolved": await count(Issue, Issue.organization_id == org,
                                    Issue.resolved_at >= day_start, Issue.resolved_at < day_end),
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
            {"label": "Open issues", "value": open_issues, "accent": "#f59e0b"},
            {"label": "Active work orders", "value": active_wos, "accent": "#3b82f6"},
            {"label": "Resolved (7d)", "value": resolved_week, "accent": "#10b981"},
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
