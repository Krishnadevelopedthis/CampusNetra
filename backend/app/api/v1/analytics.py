"""Analytics, reporting and scenario simulation."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser, RequireManager
from app.core.enums import IssueStatus, Priority, UserRole, WorkOrderStatus
from app.models.identity import Department, User
from app.models.issues import Issue, IssueCategory
from app.models.lostfound import LFItem, LFMatch
from app.models.platform import Simulation
from app.models.spatial import Asset, Building, Campus, Floor, Room
from app.models.work import WorkOrder
from app.services.references import next_reference

router = APIRouter(prefix="/analytics", tags=["Analytics & Simulation"])

OPEN_ISSUES = [IssueStatus.REPORTED, IssueStatus.TRIAGED, IssueStatus.ASSIGNED,
               IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD]
CLOSED_ISSUES = [IssueStatus.RESOLVED, IssueStatus.VERIFIED, IssueStatus.CLOSED]


@router.get("/overview", response_model=dict)
async def overview(user: RequireManager, db: DB, days: int = Query(30, ge=1, le=365)):
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
    breached = await db.scalar(
        select(func.count()).select_from(Issue)
        .where(Issue.organization_id == org, Issue.sla_breached.is_(True))) or 0

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

    cost = (await db.execute(
        select(func.coalesce(func.sum(WorkOrder.labour_cost), 0),
               func.coalesce(func.sum(WorkOrder.parts_cost), 0))
        .where(WorkOrder.organization_id == org, WorkOrder.created_at >= since))).first()

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
            "compliance_pct": round(100 * (1 - breached / total_closed), 1) if total_closed else 100.0,
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
        },
    }


@router.get("/technicians", response_model=list[dict])
async def technician_performance(user: RequireManager, db: DB, days: int = Query(30, ge=1, le=365)):
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
async def simulate(payload: SimulationConfig, user: RequireManager, db: DB):
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
    by_category, by_department = [], {}
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

        by_category.append({"code": code, "name": cname, "count": n,
                            "priority": prio.value, "sla_resolve_mins": sla})
        dept_key = dname or "Unassigned"
        d = by_department.setdefault(dept_key, {
            "department": dept_key, "department_id": str(did) if did else None,
            "issues": 0, "categories": [],
        })
        d["issues"] += n
        d["categories"].append(cname)

    # Technician capacity per department.
    tech_rows = (await db.execute(
        select(Department.name, func.count(User.id))
        .select_from(Department)
        .join(User, (User.department_id == Department.id)
              & (User.role == UserRole.TECHNICIAN) & (User.status == "active"), isouter=True)
        .where(Department.organization_id == org)
        .group_by(Department.name))).all()
    tech_counts = {name: count for name, count in tech_rows}

    jobs_per_tech = max(1, (payload.hours_available * 60) // payload.avg_minutes_per_job)

    for dept in by_department.values():
        available = (payload.available_technicians
                     if payload.available_technicians is not None
                     else tech_counts.get(dept["department"], 0))
        capacity = available * jobs_per_tech
        dept["technicians"] = available
        dept["capacity"] = capacity
        dept["backlog"] = max(0, dept["issues"] - capacity)
        dept["utilisation_pct"] = round(100 * dept["issues"] / capacity, 1) if capacity else None
        dept["at_risk"] = dept["backlog"] > 0

    total_capacity = sum(d["capacity"] for d in by_department.values())
    total_backlog = sum(d["backlog"] for d in by_department.values())
    projected_met = payload.complaint_count - total_backlog

    results = {
        "complaint_count": payload.complaint_count,
        "by_category": sorted(by_category, key=lambda c: c["count"], reverse=True),
        "by_department": sorted(by_department.values(), key=lambda d: d["issues"], reverse=True),
        "capacity": {
            "jobs_per_technician": jobs_per_tech,
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
            for d in sorted(by_department.values(), key=lambda x: x["backlog"], reverse=True)
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
async def list_simulations(user: RequireManager, db: DB, limit: int = Query(20, ge=1, le=100)):
    rows = (await db.scalars(
        select(Simulation).where(Simulation.organization_id == user.organization_id)
        .order_by(Simulation.created_at.desc()).limit(limit))).all()
    return [
        {"id": str(s.id), "name": s.name, "scenario_type": s.scenario_type,
         "status": s.status, "config": s.config, "results": s.results,
         "created_at": s.created_at.isoformat()}
        for s in rows
    ]
