"""Work order lifecycle and technician assignment."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    WORK_ORDER_TRANSITIONS, AssetState, IssueStatus, Priority, TwinEventKind,
    UserRole, WorkOrderStatus, can_transition,
)
from app.models.identity import User
from app.models.issues import Issue
from app.models.spatial import Asset
from app.models.work import SLAPolicy, WorkOrder, WorkOrderEvent
from app.services import notifications as notify_svc
from app.services.references import next_reference
from app.services.twin import campus_id_for_room, record_event, set_asset_state


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def resolve_sla(
    db: AsyncSession, org_id: uuid.UUID, priority: Priority,
    department_id: Optional[uuid.UUID],
) -> tuple[Optional[SLAPolicy], Optional[datetime]]:
    """Department-specific policy wins over the organisation-wide default."""
    policy = await db.scalar(
        select(SLAPolicy).where(
            SLAPolicy.organization_id == org_id,
            SLAPolicy.priority == priority,
            SLAPolicy.department_id == department_id,
            SLAPolicy.is_active.is_(True),
        )
    )
    if policy is None:
        policy = await db.scalar(
            select(SLAPolicy).where(
                SLAPolicy.organization_id == org_id,
                SLAPolicy.priority == priority,
                SLAPolicy.department_id.is_(None),
                SLAPolicy.is_active.is_(True),
            )
        )
    if policy is None:
        return None, None
    return policy, _now() + timedelta(minutes=policy.resolve_mins)


async def suggest_technician(
    db: AsyncSession, org_id: uuid.UUID, department_id: Optional[uuid.UUID]
) -> Optional[User]:
    """Least-loaded active technician in the department.

    Load is counted as currently-open work orders, so assignment naturally
    balances rather than always picking the same person.
    """
    query = (
        select(User, func.count(WorkOrder.id).label("load"))
        .join(
            WorkOrder,
            (WorkOrder.assigned_to == User.id)
            & (WorkOrder.status.notin_([
                WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED, WorkOrderStatus.VERIFIED,
            ])),
            isouter=True,
        )
        .where(
            User.organization_id == org_id,
            User.role == UserRole.TECHNICIAN,
            User.status == "active",
        )
        .group_by(User.id)
        .order_by(func.count(WorkOrder.id).asc())
    )
    if department_id:
        query = query.where(User.department_id == department_id)

    row = (await db.execute(query.limit(1))).first()
    return row[0] if row else None


async def create_work_order(
    db: AsyncSession,
    creator: User,
    *,
    title: str,
    description: Optional[str] = None,
    issue_id: Optional[uuid.UUID] = None,
    room_id: Optional[uuid.UUID] = None,
    asset_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    assigned_to: Optional[uuid.UUID] = None,
    priority: Priority = Priority.MEDIUM,
    scheduled_for: Optional[datetime] = None,
    estimated_mins: Optional[int] = None,
    is_predictive: bool = False,
    auto_assign: bool = True,
) -> WorkOrder:
    org_id = creator.organization_id
    reference = await next_reference(db, org_id, "WO")

    # Inherit spatial context and routing from the originating issue.
    if issue_id:
        issue = await db.scalar(select(Issue).where(Issue.id == issue_id))
        if issue is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Issue not found")
        room_id = room_id or issue.room_id
        asset_id = asset_id or issue.asset_id
        department_id = department_id or issue.department_id
        priority = priority or issue.priority

    if assigned_to is None and auto_assign:
        tech = await suggest_technician(db, org_id, department_id)
        assigned_to = tech.id if tech else None

    policy, due = await resolve_sla(db, org_id, priority, department_id)

    wo = WorkOrder(
        reference=reference, organization_id=org_id, issue_id=issue_id,
        title=title, description=description, room_id=room_id, asset_id=asset_id,
        department_id=department_id, priority=priority,
        status=WorkOrderStatus.ASSIGNED if assigned_to else WorkOrderStatus.OPEN,
        assigned_to=assigned_to,
        assigned_by=creator.id if assigned_to else None,
        assigned_at=_now() if assigned_to else None,
        scheduled_for=scheduled_for, estimated_mins=estimated_mins,
        sla_policy_id=policy.id if policy else None, sla_due_at=due,
        is_predictive=is_predictive,
    )
    db.add(wo)
    await db.flush()

    db.add(WorkOrderEvent(
        work_order_id=wo.id, from_status=None, to_status=wo.status,
        actor_id=creator.id, created_at=_now(),
        note="Created" + (" by predictive maintenance" if is_predictive else ""),
    ))

    campus_id = await campus_id_for_room(db, room_id) if room_id else None
    if campus_id:
        await record_event(
            db, campus_id=campus_id, kind=TwinEventKind.WORK_ORDER_CREATED,
            entity_type="work_order", entity_id=wo.id, room_id=room_id, actor_id=creator.id,
            payload={"reference": wo.reference, "title": title,
                     "priority": priority.value, "assigned": bool(assigned_to)},
        )

    if assigned_to:
        await notify_svc.notify(
            db, [assigned_to],
            title=f"Work order assigned: {title}",
            body=f"{wo.reference} — {priority.value} priority",
            link=f"/work-orders/{wo.id}", kind="work_order",
            entity_type="work_order", entity_id=wo.id,
            code="workorder.assigned",
            context={
                "reference": wo.reference, "title": title,
                "priority": priority.value,
                "due": wo.sla_due_at.strftime("%d %b %Y, %H:%M") if wo.sla_due_at else "",
            },
        )
    return wo


async def assign_work_order(
    db: AsyncSession, wo: WorkOrder, technician_id: uuid.UUID, actor: User,
    note: Optional[str] = None, scheduled_for: Optional[datetime] = None,
) -> WorkOrder:
    tech = await db.scalar(select(User).where(User.id == technician_id))
    if tech is None or tech.organization_id != actor.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Technician not found")
    if tech.role != UserRole.TECHNICIAN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"{tech.full_name} is not a technician")

    previous = wo.status
    wo.assigned_to = tech.id
    wo.assigned_by = actor.id
    wo.assigned_at = _now()
    if scheduled_for:
        wo.scheduled_for = scheduled_for
    if wo.status == WorkOrderStatus.OPEN:
        wo.status = WorkOrderStatus.ASSIGNED

    db.add(WorkOrderEvent(
        work_order_id=wo.id, from_status=previous, to_status=wo.status,
        actor_id=actor.id, created_at=_now(),
        note=note or f"Assigned to {tech.full_name}",
        meta={"technician_id": str(tech.id), "technician_name": tech.full_name},
    ))

    await notify_svc.notify(
        db, [tech.id],
        title=f"Work order assigned: {wo.title}",
        body=f"{wo.reference} — {wo.priority.value} priority",
        link=f"/work-orders/{wo.id}", kind="work_order",
        entity_type="work_order", entity_id=wo.id,
        code="workorder.assigned",
        context={
            "reference": wo.reference, "title": wo.title,
            "priority": wo.priority.value,
            "due": wo.sla_due_at.strftime("%d %b %Y, %H:%M") if wo.sla_due_at else "",
        },
    )
    return wo


# A work order's status implies what the asset is doing right now.
WO_STATUS_TO_ASSET_STATE: dict[WorkOrderStatus, Optional[AssetState]] = {
    WorkOrderStatus.IN_PROGRESS:    AssetState.UNDER_MAINTENANCE,
    WorkOrderStatus.AWAITING_PARTS: AssetState.WARNING,
    WorkOrderStatus.ON_HOLD:        AssetState.WARNING,
    WorkOrderStatus.COMPLETED:      AssetState.HEALTHY,
    WorkOrderStatus.VERIFIED:       AssetState.HEALTHY,
    WorkOrderStatus.CLOSED:         AssetState.HEALTHY,
}


async def transition_work_order(
    db: AsyncSession,
    wo: WorkOrder,
    target: WorkOrderStatus,
    actor: User,
    *,
    note: Optional[str] = None,
    resolution_note: Optional[str] = None,
    actual_mins: Optional[int] = None,
    labour_cost: Optional[float] = None,
    parts_cost: Optional[float] = None,
    blocked_reason: Optional[str] = None,
) -> WorkOrder:
    if wo.status == target:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Work order is already {target.value}")
    if not can_transition(wo.status, target, WORK_ORDER_TRANSITIONS):
        allowed = sorted(s.value for s in WORK_ORDER_TRANSITIONS.get(wo.status, set()))
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot move from {wo.status.value} to {target.value}. "
            f"Allowed: {', '.join(allowed) if allowed else 'none (terminal state)'}",
        )

    # Only the assigned technician (or a manager) may progress the work.
    if actor.role == UserRole.TECHNICIAN and wo.assigned_to != actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "This work order is assigned to someone else")

    previous = wo.status
    wo.status = target
    now = _now()

    if target == WorkOrderStatus.IN_PROGRESS and wo.started_at is None:
        wo.started_at = now
    if target == WorkOrderStatus.COMPLETED:
        wo.completed_at = now
        if resolution_note:
            wo.resolution_note = resolution_note
        if actual_mins is not None:
            wo.actual_mins = actual_mins
        elif wo.started_at:
            wo.actual_mins = int((now - wo.started_at).total_seconds() // 60)
        if labour_cost is not None:
            wo.labour_cost = labour_cost
        if parts_cost is not None:
            wo.parts_cost = parts_cost
        if wo.sla_due_at and now > wo.sla_due_at:
            wo.sla_breached = True
    if target == WorkOrderStatus.VERIFIED:
        wo.verified_at = now
        wo.verified_by = actor.id
    if target in (WorkOrderStatus.ON_HOLD, WorkOrderStatus.AWAITING_PARTS) and blocked_reason:
        wo.blocked_reason = blocked_reason

    db.add(WorkOrderEvent(
        work_order_id=wo.id, from_status=previous, to_status=target,
        actor_id=actor.id, note=note, created_at=now,
    ))

    # Reflect on the twin.
    asset_state = WO_STATUS_TO_ASSET_STATE.get(target)
    if asset_state and wo.asset_id:
        asset = await db.scalar(select(Asset).where(Asset.id == wo.asset_id))
        if asset:
            # Don't clear a fault while the originating issue is still open —
            # completing the work order is not the same as the issue being verified.
            skip = False
            if asset_state == AssetState.HEALTHY and wo.issue_id:
                issue = await db.scalar(select(Issue).where(Issue.id == wo.issue_id))
                if issue and issue.status in (
                    IssueStatus.REPORTED, IssueStatus.TRIAGED,
                    IssueStatus.ASSIGNED, IssueStatus.IN_PROGRESS,
                ):
                    skip = True
            if not skip:
                await set_asset_state(
                    db, asset, asset_state,
                    reason=f"work order {target.value}", work_order_id=wo.id, actor_id=actor.id,
                )

    if wo.room_id:
        campus_id = await campus_id_for_room(db, wo.room_id)
        if campus_id:
            await record_event(
                db, campus_id=campus_id, kind=TwinEventKind.WORK_ORDER_STATUS_CHANGED,
                entity_type="work_order", entity_id=wo.id, room_id=wo.room_id, actor_id=actor.id,
                payload={"reference": wo.reference, "from": previous.value, "to": target.value},
            )

    # Tell the original reporter when the fix lands.
    if target == WorkOrderStatus.COMPLETED and wo.issue_id:
        issue = await db.scalar(select(Issue).where(Issue.id == wo.issue_id))
        if issue:
            await notify_svc.notify(
                db, [issue.reported_by],
                title=f"Work completed on {issue.reference}",
                body=resolution_note or f"{wo.reference} has been completed.",
                link=f"/issues/{issue.id}", kind="work_order",
                entity_type="work_order", entity_id=wo.id,
            )
    return wo
