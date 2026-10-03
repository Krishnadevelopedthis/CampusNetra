"""Analytics, reporting and scenario simulation."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.deps import DB, require_permission
from app.core.routing import CommitRoute
from app.core.enums import IssueStatus, Priority, UserRole, WorkOrderStatus
from app.models.identity import Department, User
from app.models.issues import Issue, IssueCategory
from app.models.lostfound import LFItem, LFMatch
from app.models.platform import Simulation
from app.models.spatial import Asset, AssetCategory, Building, Campus, Floor, Room
from app.models.work import WorkOrder
from app.services.references import next_reference

# Work whose cost is final. Closed is the last step after Verified; leaving it
# out made every closed job's spend vanish from the reports.
_FINISHED = [WorkOrderStatus.COMPLETED, WorkOrderStatus.VERIFIED, WorkOrderStatus.CLOSED]

router = APIRouter(route_class=CommitRoute, prefix="/analytics", tags=["Analytics & Simulation"])

RequireAnalyticsView = Annotated[User, Depends(require_permission("analytics:view"))]
RequireAnalyticsSimulate = Annotated[User, Depends(require_permission("analytics:simulate"))]

OPEN_ISSUES = [IssueStatus.REPORTED, IssueStatus.TRIAGED, IssueStatus.ASSIGNED,
               IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD]
CLOSED_ISSUES = [IssueStatus.RESOLVED, IssueStatus.VERIFIED, IssueStatus.CLOSED]


@router.get("/overview", response_model=dict)
async def overview(user: RequireAnalyticsView, db: DB, days: int = Query(30, ge=1, le=365)):
    org = user.organization_id
    since = datetime.now(timezone.utc) - timedelta(days=days)

    by_status = dict((await db.execute(
        select(Issue.status, func.count()).where(Issue.organization_id == org)
        .group_by(Issue.status))).all())
    by_priority = dict((await db.execute(
        select(Issue.priority, func.count()).where(Issue.organization_id == org)
        .group_by(Issue.priority))).all())

    by_category = (await db.execute(
        select(IssueCategory.name, IssueCategory.icon, func.count(Issue.id))
        .select_from(IssueCategory)
        .join(Issue, Issue.category_id == IssueCategory.id, isouter=True)
        .where(IssueCategory.organization_id == org)
        .group_by(IssueCategory.name, IssueCategory.icon)
        .order_by(func.count(Issue.id).desc()))).all()

    by_department = (await db.execute(
        select(Department.name, func.count(Issue.id),
               func.count(Issue.id).filter(Issue.status.in_(OPEN_ISSUES)))
        .select_from(Department)
        .join(Issue, Issue.department_id == Department.id, isouter=True)
        .where(Department.organization_id == org)
        .group_by(Department.name))).all()

    # Mean time to resolve, in hours.
    mttr = await db.scalar(
        select(func.avg(func.extract("epoch", Issue.resolved_at - Issue.created_at) / 3600.0))
        .where(Issue.organization_id == org, Issue.resolved_at.isnot(None),
               Issue.created_at >= since))

    total_closed = sum(by_status.get(s, 0) for s in CLOSED_ISSUES)
    # Scoped to the same population as total_closed — issues closed inside this
    # window. Counting every breach ever recorded, open ones included, against
    # only the tickets closed in the last month compares two different sets:
    # once the SLA sweep started flagging breaches the ratio passed 1 and
    # compliance was reported as -100%.
    breached = await db.scalar(
        select(func.count()).select_from(Issue)
        .where(Issue.organization_id == org,
               Issue.sla_breached.is_(True),
               Issue.status.in_(CLOSED_ISSUES),
               Issue.created_at >= since)) or 0

    # Still clamped: a proportion of a set cannot leave 0..100, and a metric
    # that can is one nobody trusts again after seeing it.
    compliance = round(100 * (1 - breached / total_closed), 1) if total_closed else 100.0

    # Rooms generating the most complaints — the "recurring problem" signal.
    hotspots = (await db.execute(
        select(Room.code, Room.name, Building.code, func.count(Issue.id))
        .select_from(Issue)
        .join(Room, Room.id == Issue.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Issue.organization_id == org, Issue.created_at >= since)
        .group_by(Room.code, Room.name, Building.code)
        .order_by(func.count(Issue.id).desc()).limit(10))).all()

    # Assets with repeat faults — candidates for replacement rather than repair.
    recurring = (await db.execute(
        select(Asset.tag, Asset.name, func.count(Issue.id))
        .select_from(Issue).join(Asset, Asset.id == Issue.asset_id)
        .where(Issue.organization_id == org, Issue.created_at >= since)
        .group_by(Asset.tag, Asset.name)
        .having(func.count(Issue.id) > 1)
        .order_by(func.count(Issue.id).desc()).limit(10))).all()

    # This window counts every job raised in it, finished or not, because the
    # page is about the last N days of operations rather than the books. That
    # makes it a different number from Maintenance & Expenses, which counts only
    # signed-off work and dates it by completion — so the split is reported
    # alongside it and both cards say which they are.
    cost = (await db.execute(
        select(func.coalesce(func.sum(WorkOrder.labour_cost), 0),
               func.coalesce(func.sum(WorkOrder.parts_cost), 0))
        .where(WorkOrder.organization_id == org, WorkOrder.created_at >= since))).first()

    settled = await db.scalar(
        select(func.coalesce(func.sum(WorkOrder.labour_cost + WorkOrder.parts_cost), 0))
        .where(WorkOrder.organization_id == org, WorkOrder.created_at >= since,
               WorkOrder.status.in_(_FINISHED))
    ) or 0

    return {
        "window_days": days,
        "issues": {
            "by_status": {k.value: v for k, v in by_status.items()},
            "by_priority": {k.value: v for k, v in by_priority.items()},
            "by_category": [
                {"name": n, "icon": i, "count": c} for n, i, c in by_category if c
            ],
            "by_department": [
                {"name": n, "total": t, "open": o} for n, t, o in by_department
            ],
            "total": sum(by_status.values()),
            "open": sum(by_status.get(s, 0) for s in OPEN_ISSUES),
        },
        "sla": {
            "breached": breached,
            "breached_open": await db.scalar(
                select(func.count()).select_from(Issue)
                .where(Issue.organization_id == org,
                       Issue.sla_breached.is_(True),
                       Issue.status.in_(OPEN_ISSUES))) or 0,
            "compliance_pct": max(0.0, min(100.0, compliance)),
            "mttr_hours": round(float(mttr), 1) if mttr else None,
        },
        "hotspots": [
            {"room_code": rc, "room_name": rn, "building": bc, "issues": n}
            for rc, rn, bc, n in hotspots
        ],
        "recurring_assets": [
            {"tag": t, "name": n, "fault_count": c} for t, n, c in recurring
        ],
        "cost": {
            "labour": float(cost[0]), "parts": float(cost[1]),
            "total": float(cost[0]) + float(cost[1]),
            "settled": float(settled),
            "in_progress": float(cost[0]) + float(cost[1]) - float(settled),
        },
    }


@router.get("/heatmap", response_model=dict)
async def heatmap(
    user: RequireAnalyticsView, db: DB,
    days: int = Query(30, ge=1, le=365),
    campus_id: Optional[uuid.UUID] = None,
):
    """Complaint density per building and per room, for the campus heatmap.

    Intensity is normalised against the busiest location rather than an absolute
    scale, so the map stays readable whether the campus saw five complaints this
    month or five hundred.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    campus = await db.scalar(
        select(Campus).where(
            Campus.organization_id == user.organization_id,
            *( [Campus.id == campus_id] if campus_id else [] ),
        ).limit(1)
    )
    if campus is None:
        return {"campus": None, "buildings": [], "rooms": [], "max_count": 0}

    building_rows = (await db.execute(
        select(Building.id, Building.name, Building.code,
               Building.map_x, Building.map_y,
               func.count(Issue.id))
        .select_from(Building)
        .join(Issue, (Issue.building_id == Building.id) & (Issue.created_at >= since), isouter=True)
        .where(Building.campus_id == campus.id)
        .group_by(Building.id, Building.name, Building.code, Building.map_x, Building.map_y)
    )).all()

    room_rows = (await db.execute(
        select(Room.id, Room.code, Room.name, Building.code, Floor.name,
               func.count(Issue.id))
        .select_from(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .join(Issue, (Issue.room_id == Room.id) & (Issue.created_at >= since), isouter=True)
        .where(Building.campus_id == campus.id)
        .group_by(Room.id, Room.code, Room.name, Building.code, Floor.name)
        .having(func.count(Issue.id) > 0)
        .order_by(func.count(Issue.id).desc())
        .limit(25)
    )).all()

    max_building = max((r[5] for r in building_rows), default=0)
    max_room = max((r[5] for r in room_rows), default=0)

    return {
        "campus": {"id": str(campus.id), "name": campus.name},
        "window_days": days,
        "max_count": max_building,
        "buildings": [
            {
                "id": str(bid), "name": name, "code": code,
                "map_x": float(mx) if mx is not None else None,
                "map_y": float(my) if my is not None else None,
                "count": count,
                # 0..1 against the busiest building, so colour is comparable
                # regardless of overall volume.
                "intensity": round(count / max_building, 3) if max_building else 0.0,
            }
            for bid, name, code, mx, my, count in building_rows
        ],
        "rooms": [
            {
                "id": str(rid), "code": rcode, "name": rname,
                "building": bcode, "floor": fname, "count": count,
                "intensity": round(count / max_room, 3) if max_room else 0.0,
            }
            for rid, rcode, rname, bcode, fname, count in room_rows
        ],
    }


@router.get("/technicians", response_model=list[dict])
async def technician_performance(user: RequireAnalyticsView, db: DB, days: int = Query(30, ge=1, le=365)):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (await db.execute(
        select(
            User.id, User.full_name, Department.name,
            func.count(WorkOrder.id),
            func.count(WorkOrder.id).filter(WorkOrder.status.in_(
                [WorkOrderStatus.COMPLETED, WorkOrderStatus.VERIFIED, WorkOrderStatus.CLOSED])),
            func.count(WorkOrder.id).filter(WorkOrder.sla_breached.is_(True)),
            func.avg(WorkOrder.actual_mins),
        )
        .select_from(User)
        .join(Department, Department.id == User.department_id, isouter=True)
        .join(WorkOrder, (WorkOrder.assigned_to == User.id) & (WorkOrder.created_at >= since), isouter=True)
        .where(User.organization_id == user.organization_id, User.role == UserRole.TECHNICIAN)
        .group_by(User.id, User.full_name, Department.name)
        .order_by(func.count(WorkOrder.id).desc()))).all()

    return [
        {
            "id": str(uid), "name": name, "department": dept,
            "assigned": assigned, "completed": completed, "breached": breached,
            "completion_rate": round(100 * completed / assigned, 1) if assigned else None,
            "avg_minutes": round(float(avg_mins)) if avg_mins else None,
        }
        for uid, name, dept, assigned, completed, breached, avg_mins in rows
    ]


# ---------------- Scenario simulation ----------------
class SimulationConfig(BaseModel):
    name: str = Field("Complaint surge", max_length=120)
    scenario_type: str = Field("complaint_surge",
                               pattern="^(complaint_surge|staff_shortage|asset_failure|what_if)$")
    complaint_count: int = Field(30, ge=1, le=500)
    # Optional: force a distribution instead of sampling historical proportions.
    category_weights: Optional[dict[str, float]] = None
    available_technicians: Optional[int] = Field(None, ge=0)
    hours_available: int = Field(8, ge=1, le=24)
    avg_minutes_per_job: int = Field(45, ge=5, le=480)


@router.post("/simulate", response_model=dict)
async def simulate(payload: SimulationConfig, user: RequireAnalyticsSimulate, db: DB):
    """Scenario Simulation.

    Fans N hypothetical complaints through classification, department routing and
    technician capacity, then projects SLA outcomes. Nothing is written to the
    live issue tables — only a Simulation row and its results.
    """
    org = user.organization_id

    # Sample the real historical mix so the fan-out reflects this campus.
    historical = (await db.execute(
        select(IssueCategory.id, IssueCategory.name, IssueCategory.code,
               Department.id, Department.name,
               IssueCategory.default_priority, IssueCategory.sla_resolve_mins,
               func.count(Issue.id))
        .select_from(IssueCategory)
        .join(Department, Department.id == IssueCategory.department_id, isouter=True)
        .join(Issue, Issue.category_id == IssueCategory.id, isouter=True)
        .where(IssueCategory.organization_id == org, IssueCategory.is_active.is_(True))
        .group_by(IssueCategory.id, IssueCategory.name, IssueCategory.code,
                  Department.id, Department.name, IssueCategory.default_priority,
                  IssueCategory.sla_resolve_mins))).all()

    if not historical:
        return {"error": "No issue categories configured; cannot simulate."}

    # Additive (Laplace) smoothing over the historical mix.
    #
    # A raw seen/total ratio is unusable on a young deployment: a single past
    # complaint would send 100% of the simulated surge to one department, which
    # is exactly the wrong answer when the tool is most likely to be demonstrated.
    # Blending in a uniform prior means the projection starts sensible and
    # converges on the real distribution as history accumulates.
    SMOOTHING = 5.0
    total_seen = sum(row[7] for row in historical)
    denominator = total_seen + SMOOTHING * len(historical)

    weights = {}
    for cid, cname, code, did, dname, prio, sla, seen in historical:
        if payload.category_weights and code in payload.category_weights:
            weights[code] = payload.category_weights[code]
        else:
            weights[code] = (seen + SMOOTHING) / denominator

    weight_sum = sum(weights.values()) or 1
    by_category = []
    assigned_total = 0
    for idx, (cid, cname, code, did, dname, prio, sla, _seen) in enumerate(historical):
        share = weights[code] / weight_sum
        # Largest-remainder style: give the final category whatever is left, so
        # the parts always sum exactly to complaint_count.
        n = (payload.complaint_count - assigned_total
             if idx == len(historical) - 1
             else round(payload.complaint_count * share))
        n = max(0, min(n, payload.complaint_count - assigned_total))
        assigned_total += n
        if n == 0:
            continue
        by_category.append({"code": code, "name": cname, "count": n, "department": dname,
                            "priority": prio.value, "sla_resolve_mins": sla})

    # Routing follows the real assignment rule: a complaint goes to an active
    # technician whose specialisation covers its category (as
    # work_orders.suggest_technician does) -- not to a department, which
    # technicians here usually have none of. Earlier this counted technicians
    # by department, found none, and reported zero capacity for everything.
    jobs_per_tech = max(1, (payload.hours_available * 60) // payload.avg_minutes_per_job)
    techs = (await db.execute(
        select(User.id, User.specialization).where(
            User.organization_id == org, User.role == UserRole.TECHNICIAN,
            User.status == "active"))).all()
    skills = {tid: {str(c).lower() for c in (spec or [])} for tid, spec in techs}

    if payload.available_technicians is not None:
        # "What if each category had N people?" -- a flat override per route.
        eligible = {c["code"]: [f"{c['code']}#{i}" for i in range(payload.available_technicians)]
                    for c in by_category}
        remaining = {t: jobs_per_tech for ts in eligible.values() for t in ts}
    else:
        eligible = {c["code"]: [t for t, sk in skills.items() if c["code"].lower() in sk]
                    for c in by_category}
        remaining = {t: jobs_per_tech for t in skills}

    # A technician's shift is shared across every category they cover. Each
    # pass splits every technician's remaining time across their categories
    # in proportion to what is still waiting there, so a shared specialist
    # serves all their categories fairly instead of whichever is listed first;
    # repeated passes hand time left over by satisfied categories to the rest.
    demand = {c["code"]: c["count"] for c in by_category}
    served = {code: 0.0 for code in demand}
    covers = {t: [code for code, pool in eligible.items() if t in pool] for t in remaining}
    left = {t: float(remaining[t]) for t in remaining}
    for _ in range(6):
        for t, codes in covers.items():
            waiting = {code: demand[code] - served[code] for code in codes if demand[code] - served[code] > 1e-9}
            total_wait = sum(waiting.values())
            if left[t] <= 1e-9 or not total_wait:
                continue
            budget = left[t]
            for code, w in waiting.items():
                give = min(budget * w / total_wait, demand[code] - served[code])
                served[code] += give
                left[t] -= give
    # Whole jobs: round the shares so they still add up to the total served
    # (flooring each one would quietly drop work the team can actually do).
    whole = {code: int(v + 1e-6) for code, v in served.items()}
    spare = int(round(sum(served.values()))) - sum(whole.values())
    for code in sorted(served, key=lambda c: served[c] - whole[c], reverse=True):
        if spare <= 0:
            break
        if whole[code] < demand[code]:
            whole[code] += 1
            spare -= 1
    served = whole

    # How loaded each technician is: the share of every category they cover,
    # split between the specialists available for it, against one shift.
    load = {
        t: sum(demand[code] / len(eligible[code]) for code in codes) / jobs_per_tech
        for t, codes in covers.items()
    }

    by_department = []   # one row per routed category (name kept for the API)
    for c in by_category:
        people = len(eligible[c["code"]])
        capacity = served[c["code"]]
        backlog = c["count"] - capacity
        by_department.append({
            "department": c["name"],
            "owning_department": c["department"],
            "categories": [c["name"]],
            "issues": c["count"],
            "technicians": people,
            "capacity": capacity,
            "backlog": backlog,
            # How busy this category's specialists are overall -- including the
            # other categories they also cover -- averaged across them.
            "utilisation_pct": round(100 * sum(load[t] for t in eligible[c["code"]]) / people, 1) if people else None,
            "at_risk": backlog > 0,
        })

    # Everything the team could do in one shift (each person counted once).
    total_capacity = len(remaining) * jobs_per_tech
    total_backlog = sum(d["backlog"] for d in by_department)
    projected_met = payload.complaint_count - total_backlog

    results = {
        "complaint_count": payload.complaint_count,
        "by_category": sorted(by_category, key=lambda c: c["count"], reverse=True),
        "by_department": sorted(by_department, key=lambda d: d["issues"], reverse=True),
        "capacity": {
            "jobs_per_technician": jobs_per_tech,
            "technicians": len(skills) if payload.available_technicians is None else None,
            "total_capacity": total_capacity,
            "total_backlog": total_backlog,
        },
        "sla_projection": {
            "expected_met": max(0, projected_met),
            "expected_breached": total_backlog,
            "projected_compliance_pct": round(100 * max(0, projected_met) / payload.complaint_count, 1),
        },
        "bottlenecks": [
            {"department": d["department"], "backlog": d["backlog"],
             "utilisation_pct": d["utilisation_pct"]}
            for d in sorted(by_department, key=lambda x: x["backlog"], reverse=True)
            if d["backlog"] > 0
        ],
    }

    sim = Simulation(
        organization_id=org, name=payload.name, scenario_type=payload.scenario_type,
        config=payload.model_dump(), status="completed", results=results,
        created_by=user.id, started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    db.add(sim)
    await db.flush()

    return {"simulation_id": str(sim.id), "name": sim.name, **results}


@router.get("/simulations", response_model=list[dict])
async def list_simulations(user: RequireAnalyticsSimulate, db: DB, limit: int = Query(20, ge=1, le=100)):
    rows = (await db.scalars(
        select(Simulation).where(Simulation.organization_id == user.organization_id)
        .order_by(Simulation.created_at.desc()).limit(limit))).all()
    return [
        {"id": str(s.id), "name": s.name, "scenario_type": s.scenario_type,
         "status": s.status, "config": s.config, "results": s.results,
         "created_at": s.created_at.isoformat()}
        for s in rows
    ]


# --------------------------------------------------------------------------
# Maintenance spend
#
# What a campus actually spends keeping itself running: the cost booked against
# completed work orders, plus what the assets cost to buy in the first place.
# Rolled up by period so the same figures answer "this month", "this quarter"
# and "this year" without three different reports.
# --------------------------------------------------------------------------

_GRAINS = {
    # ISO weeks, so a week that straddles a month boundary is still one bucket.
    "week": 'IYYY-"W"IW',
    "month": "YYYY-MM",
    "quarter": 'YYYY-"Q"Q',
    "year": "YYYY",
}


@router.get("/spend", response_model=dict)
async def maintenance_spend(
    user: RequireAnalyticsView,
    db: DB,
    granularity: str = Query("month", pattern="^(week|month|quarter|year)$"),
    months: int = Query(12, ge=1, le=60),
    campus_id: Optional[uuid.UUID] = None,
    building_id: Optional[uuid.UUID] = None,
    floor_id: Optional[uuid.UUID] = None,
    room_id: Optional[uuid.UUID] = None,
):
    """Maintenance expenditure over time, and where it went.

    Only completed work is counted. Cost accrues on a job while it is open and
    is not final until sign-off, so including in-flight work would make every
    period look more expensive than it turned out to be — and would move the
    figure for a period that has already been reported.
    """
    since = datetime.now(timezone.utc) - timedelta(days=months * 31)

    campus_scope = [Campus.organization_id == user.organization_id]
    if campus_id:
        campus_scope.append(Campus.id == campus_id)

    # Narrowing to one building, floor or room. Each level implies the ones
    # above it, so only the most specific filter needs applying.
    place_scope: list = []
    if room_id:
        place_scope.append(Room.id == room_id)
    elif floor_id:
        place_scope.append(Floor.id == floor_id)
    elif building_id:
        place_scope.append(Building.id == building_id)

    def spend_expr():
        return func.coalesce(func.sum(WorkOrder.labour_cost + WorkOrder.parts_cost), 0)

    # Where a job happened. A work order carries its own room, and also reaches
    # one through the asset it was raised against; taking either means a job
    # logged against a room with no asset still lands in the right building
    # instead of dropping out of every breakdown.
    wo_room = func.coalesce(WorkOrder.room_id, Asset.room_id)

    def spatial(query):
        return (
            query
            .outerjoin(Asset, Asset.id == WorkOrder.asset_id)
            .outerjoin(Room, Room.id == wo_room)
            .outerjoin(Floor, Floor.id == Room.floor_id)
            .outerjoin(Building, Building.id == Floor.building_id)
            .outerjoin(Campus, Campus.id == Building.campus_id)
        )

    completed = [
        WorkOrder.status.in_(_FINISHED),
        WorkOrder.completed_at.is_not(None),
        WorkOrder.completed_at >= since,
    ]

    label = func.to_char(WorkOrder.completed_at, _GRAINS[granularity])
    rows = (await db.execute(
        spatial(
            select(label.label("period"), spend_expr().label("total"),
                   func.count(WorkOrder.id).label("jobs"))
            .select_from(WorkOrder))
        .where(*completed, *place_scope)
        .group_by(label).order_by(label)
    )).all()

    series = [
        {"period": r.period, "total": float(r.total or 0), "jobs": r.jobs}
        for r in rows
    ]

    by_building = (await db.execute(
        spatial(
            select(Building.name, Building.code, spend_expr().label("total"),
                   func.count(WorkOrder.id).label("jobs"))
            .select_from(WorkOrder))
        .where(*completed, *campus_scope, *place_scope, Building.id.is_not(None))
        .group_by(Building.id, Building.name, Building.code)
        .order_by(spend_expr().desc()).limit(12)
    )).all()

    # Rooms matter once the view is narrowed to a building or a floor: "which
    # lab is eating the budget" is the question a building-level total prompts
    # and cannot answer.
    by_room = (await db.execute(
        spatial(
            select(Room.name, Room.code, Room.kind, spend_expr().label("total"),
                   func.count(WorkOrder.id).label("jobs"))
            .select_from(WorkOrder))
        .where(*completed, *campus_scope, *place_scope, Room.id.is_not(None))
        .group_by(Room.id, Room.name, Room.code, Room.kind)
        .order_by(spend_expr().desc()).limit(12)
    )).all()

    by_category = (await db.execute(
        spatial(
            select(AssetCategory.name, spend_expr().label("total"),
                   func.count(WorkOrder.id).label("jobs"))
            .select_from(WorkOrder))
        .join(AssetCategory, AssetCategory.id == Asset.category_id)
        .where(*completed, *place_scope)
        .group_by(AssetCategory.id, AssetCategory.name)
        .order_by(spend_expr().desc()).limit(12)
    )).all()

    # The assets that keep costing money — the argument for replacing rather
    # than repairing one more time.
    worst = (await db.execute(
        spatial(
            select(Asset.id, Asset.tag, Asset.name, Asset.cost.label("purchase"),
                   spend_expr().label("total"), func.count(WorkOrder.id).label("jobs"))
            .select_from(WorkOrder))
        .where(*completed, *place_scope, Asset.id.is_not(None))
        .group_by(Asset.id, Asset.tag, Asset.name, Asset.cost)
        .order_by(spend_expr().desc()).limit(10)
    )).all()

    # Purchase value follows the same filter, so the figure beside the repair
    # spend is what that same building or room cost to equip.
    capital_place: list = []
    if room_id:
        capital_place.append(Room.id == room_id)
    elif floor_id:
        capital_place.append(Floor.id == floor_id)
    elif building_id:
        capital_place.append(Building.id == building_id)

    capital = await db.scalar(
        select(func.coalesce(func.sum(Asset.cost), 0))
        .select_from(Asset)
        .join(Room, Room.id == Asset.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .join(Campus, Campus.id == Building.campus_id)
        .where(*campus_scope, *capital_place)
    ) or 0

    total = sum(p["total"] for p in series)
    jobs = sum(p["jobs"] for p in series)

    # Spend that reaches no room, and so appears in the total but in none of the
    # breakdowns. Without this a campus whose work orders were raised without an
    # asset sees a large figure beside three widgets reading "nothing recorded
    # yet", which looks like the page is broken rather than like the jobs are
    # missing a location.
    unattributed = await db.scalar(
        spatial(
            select(func.coalesce(func.sum(WorkOrder.labour_cost + WorkOrder.parts_cost), 0))
            .select_from(WorkOrder))
        .where(*completed, *place_scope, Room.id.is_(None))
    ) or 0

    return {
        "granularity": granularity,
        "series": series,
        "totals": {
            "maintenance": float(total),
            "jobs": jobs,
            "average_per_job": round(float(total) / jobs, 2) if jobs else 0.0,
            "capital": float(capital),
            "unattributed": float(unattributed),
        },
        "by_building": [
            {"name": r.name, "code": r.code, "total": float(r.total or 0), "jobs": r.jobs}
            for r in by_building
        ],
        "by_room": [
            {"name": r.name, "code": r.code,
             "kind": r.kind.value if hasattr(r.kind, "value") else str(r.kind),
             "total": float(r.total or 0), "jobs": r.jobs}
            for r in by_room
        ],
        "by_category": [
            {"name": r.name, "total": float(r.total or 0), "jobs": r.jobs}
            for r in by_category
        ],
        "worst_offenders": [
            {
                "id": str(r.id), "tag": r.tag, "name": r.name,
                "purchase": float(r.purchase or 0), "total": float(r.total or 0),
                "jobs": r.jobs,
                # Repairs past the purchase price is the clearest replace signal
                # there is, and it needs no judgement to read.
                "beyond_value": bool(r.purchase and float(r.total or 0) > float(r.purchase)),
            }
            for r in worst
        ],
    }
