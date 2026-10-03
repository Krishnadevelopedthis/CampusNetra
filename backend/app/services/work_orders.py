"""Work order lifecycle and technician assignment."""
from __future__ import annotations

import uuid
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    ISSUE_TRANSITIONS, WORK_ORDER_TRANSITIONS, AssetState, IssueStatus, Priority, TwinEventKind,
    UserRole, WorkOrderStatus, can_transition,
)
from app.models.identity import User
from app.models.issues import Issue, IssueCategory
from app.models.spatial import Asset
from app.models.work import SLAPolicy, WorkOrder, WorkOrderAttachment, WorkOrderEvent
from app.services import notifications as notify_svc
from app.services.references import next_public_id
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


async def category_code_for_issue(
    db: AsyncSession, issue_id: Optional[uuid.UUID],
) -> Optional[str]:
    """The Issue Configuration category code (ELEC, PLUMB, ...) behind a work
    order's originating issue — what technicians register as servicing."""
    if not issue_id:
        return None
    return await db.scalar(
        select(IssueCategory.code)
        .join(Issue, Issue.category_id == IssueCategory.id)
        .where(Issue.id == issue_id)
    )


async def suggest_technician(
    db: AsyncSession, org_id: uuid.UUID, department_id: Optional[uuid.UUID],
    exclude: Optional[uuid.UUID] = None,
    category_code: Optional[str] = None,
) -> Optional[User]:
    """Least-loaded active technician who can take the work.

    Technicians register against Issue Configuration categories (stored as
    category codes in User.specialization), so a technician who services the
    issue's category is preferred, whatever department they sit in. Only
    when nobody services that category does it fall back to the department,
    which keeps accounts created before category registration (and work
    orders with no originating issue) routable.

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
    if exclude:
        query = query.where(User.id != exclude)

    if category_code:
        row = (await db.execute(
            query.where(User.specialization.any(category_code)).limit(1)
        )).first()
        if row:
            return row[0]

    if department_id:
        query = query.where(User.department_id == department_id)

    row = (await db.execute(query.limit(1))).first()
    return row[0] if row else None


async def handover_open_work(
    db: AsyncSession, leaving: User, actor: User
) -> tuple[list[dict], list[dict]]:
    """Move a departing technician's live work onto someone who can do it.

    Eligibility is the department, because that is where a technician's
    speciality is recorded — handing an electrical fault to the plumbing team
    would clear the queue without anybody being able to act on it.

    Each order is placed separately rather than in one batch. `suggest_technician`
    ranks by current load, so flushing between placements lets that count move
    and spreads a departing technician's queue across the team instead of
    dropping all of it on whoever happened to be quietest first.

    Returns (moved, orphaned) — the second list is work with nobody left to take
    it, which is unassigned and reopened so it shows up as unclaimed rather than
    sitting with somebody who can no longer sign in.
    """
    open_orders = (await db.scalars(
        select(WorkOrder).where(
            WorkOrder.assigned_to == leaving.id,
            WorkOrder.status.notin_([
                WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED, WorkOrderStatus.VERIFIED,
            ]),
        ).order_by(WorkOrder.priority, WorkOrder.created_at)
    )).all()

    moved: list[dict] = []
    orphaned: list[dict] = []
    for wo in open_orders:
        successor = await suggest_technician(
            db, leaving.organization_id,
            wo.department_id or leaving.department_id,
            exclude=leaving.id,
            category_code=await category_code_for_issue(db, wo.issue_id),
        )
        if successor is None:
            wo.assigned_to = None
            wo.assigned_by = None
            wo.assigned_at = None
            if wo.status == WorkOrderStatus.ASSIGNED:
                wo.status = WorkOrderStatus.OPEN
            db.add(WorkOrderEvent(
                work_order_id=wo.id, from_status=WorkOrderStatus.ASSIGNED,
                to_status=wo.status, actor_id=actor.id, created_at=_now(),
                note=f"Unassigned — {leaving.full_name} was deactivated and no "
                     "other technician in that department is available",
            ))
            orphaned.append({"reference": wo.reference, "title": wo.title})
        else:
            await assign_work_order(
                db, wo, successor.id, actor,
                note=f"Reassigned from {leaving.full_name}, who was deactivated",
            )
            moved.append({"reference": wo.reference, "title": wo.title,
                          "technician": successor.full_name})
        await db.flush()

    return moved, orphaned


# ---------------------------------------------------------------------------
# The complaint follows its work order
#
# The person who reported a problem only ever sees the issue's status. Nobody
# should have to update it by hand after the technician has already updated the
# work order, so the issue is moved along automatically.
# ---------------------------------------------------------------------------

_ISSUE_FOLLOWS_WO: dict[WorkOrderStatus, IssueStatus] = {
    WorkOrderStatus.ASSIGNED:       IssueStatus.ASSIGNED,
    WorkOrderStatus.ACCEPTED:       IssueStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS:    IssueStatus.IN_PROGRESS,
    WorkOrderStatus.AWAITING_PARTS: IssueStatus.ON_HOLD,
    WorkOrderStatus.ON_HOLD:        IssueStatus.ON_HOLD,
    WorkOrderStatus.COMPLETED:      IssueStatus.RESOLVED,
    WorkOrderStatus.VERIFIED:       IssueStatus.VERIFIED,
    WorkOrderStatus.CLOSED:         IssueStatus.CLOSED,
}
_ISSUE_RANK = {
    IssueStatus.REPORTED: 0, IssueStatus.TRIAGED: 0, IssueStatus.ASSIGNED: 1,
    IssueStatus.IN_PROGRESS: 2, IssueStatus.ON_HOLD: 2,
    IssueStatus.RESOLVED: 3, IssueStatus.VERIFIED: 4, IssueStatus.CLOSED: 5,
}
# Sideways moves that are legitimate: pausing, resuming, and reopening a fix that failed.
_ISSUE_SIDEWAYS = {
    (IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD),
    (IssueStatus.ON_HOLD, IssueStatus.IN_PROGRESS),
    (IssueStatus.RESOLVED, IssueStatus.IN_PROGRESS),
}


def _issue_may_follow(current: IssueStatus, target: IssueStatus) -> bool:
    if current not in _ISSUE_RANK:      # rejected / duplicate: not part of this flow
        return False
    return _ISSUE_RANK[target] > _ISSUE_RANK[current] or (current, target) in _ISSUE_SIDEWAYS


def _issue_path(current: IssueStatus, target: IssueStatus) -> Optional[list[IssueStatus]]:
    """Shortest legal chain of issue states from `current` to `target`."""
    from collections import deque
    queue, seen = deque([(current, [])]), {current}
    while queue:
        node, path = queue.popleft()
        for nxt in sorted(ISSUE_TRANSITIONS.get(node, ()), key=lambda st: st.value):
            if nxt in seen:
                continue
            if nxt == target:
                return path + [nxt]
            seen.add(nxt)
            queue.append((nxt, path + [nxt]))
    return None


async def sync_issue_with_work_order(db: AsyncSession, wo: WorkOrder, actor: User) -> None:
    """Move the originating issue to the state its work order implies. The
    reporter is told once, for the state the issue ends up in, even when
    several steps were needed to get there."""
    if wo.issue_id is None:
        return
    target = _ISSUE_FOLLOWS_WO.get(wo.status)
    issue = await db.scalar(select(Issue).where(Issue.id == wo.issue_id))
    if target is None or issue is None or issue.status == target:
        return
    if not _issue_may_follow(issue.status, target):
        return
    if target in (IssueStatus.RESOLVED, IssueStatus.VERIFIED, IssueStatus.CLOSED):
        # One finished work order is not the whole job if another is still open.
        from app.services.issues import WO_NOT_DONE
        other_open = await db.scalar(
            select(func.count()).select_from(WorkOrder)
            .where(WorkOrder.issue_id == issue.id, WorkOrder.id != wo.id, WorkOrder.status.in_(WO_NOT_DONE)))
        if other_open:
            return
    path = _issue_path(issue.status, target)
    if not path:
        return
    from app.services.issues import transition_issue
    note = f"Work order {wo.reference} is {wo.status.value.replace('_', ' ')}"
    for i, step in enumerate(path):
        await transition_issue(db, issue, step, actor, note, notify_reporter=(i == len(path) - 1))


# Fallback allowance, in hours, when no SLA policy exists for the priority.
_DEFAULT_SLA_HOURS = {"critical": 4, "high": 8, "medium": 24, "low": 72}


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
    # A short random public ID (WO7K29A4X), same as CN issue and LF item
    # references -- not the old sequential WO-1024, which leaked a count of
    # every work order ever created and was guessable by incrementing.
    reference = await next_public_id(db, WorkOrder, "WO")

    # Inherit spatial context and routing from the originating issue.
    category_code = None
    if issue_id:
        issue = await db.scalar(select(Issue).where(Issue.id == issue_id))
        if issue is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Issue not found")
        room_id = room_id or issue.room_id
        asset_id = asset_id or issue.asset_id
        department_id = department_id or issue.department_id
        priority = priority or issue.priority
        category_code = await category_code_for_issue(db, issue_id)

    if assigned_to is None and auto_assign:
        tech = await suggest_technician(db, org_id, department_id, category_code=category_code)
        assigned_to = tech.id if tech else None

    policy, due = await resolve_sla(db, org_id, priority, department_id)
    if due is None:
        # No SLA policy is configured for this priority/department. A work order
        # still needs a deadline, or the SLA column is blank for ever and "met /
        # missed" can never be told: use the complaint's own deadline, else a
        # standard allowance for the priority.
        due = (issue.sla_due_at if issue_id and issue.sla_due_at else None) \
            or _now() + timedelta(hours=_DEFAULT_SLA_HOURS.get(priority.value, 24))

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
        await sync_issue_with_work_order(db, wo, creator)
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
    # Same eligibility suggest_technician() uses: a technician who services
    # the issue's category (registered against Issue Configuration), or —
    # for accounts without category registration — one in the work order's
    # department. A work order with neither stays open to any technician.
    category_code = await category_code_for_issue(db, wo.issue_id)
    serves_category = bool(category_code) and category_code in (tech.specialization or [])
    in_department = not wo.department_id or tech.department_id == wo.department_id
    if not (serves_category or in_department):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{tech.full_name} does not service this issue's category",
        )

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

    await sync_issue_with_work_order(db, wo, actor)
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


_UNIT_FIELDS = ("manufacturer", "model", "serial_no", "purchase_date", "cost", "warranty_months",
                "warranty_expiry", "expected_life_months", "service_interval_days",
                "annual_maintenance_cost", "last_service_at", "installed_at")


def _unit_snapshot(asset) -> dict:
    out = {}
    for f in _UNIT_FIELDS:
        v = getattr(asset, f, None)
        out[f] = v.isoformat() if hasattr(v, "isoformat") else (float(v) if isinstance(v, Decimal) else v)
    return out


async def replace_asset_unit(db: AsyncSession, wo: WorkOrder, actor: User, details: dict, now: datetime) -> None:
    """Swap the asset's unit details for the new one fitted on this job. The
    asset keeps its id, tag, place and QR code, so every link to it still
    works; the old unit's details are kept in asset_replacements."""
    from app.models.spatial import AssetReplacement

    asset = await db.scalar(select(Asset).where(Asset.id == wo.asset_id))
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    if not any(details.get(k) for k in ("manufacturer", "model", "serial_no")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Give at least the make, model or serial number of the new unit.")

    old = _unit_snapshot(asset)
    purchase = details.get("purchase_date") or now.date()
    months = details.get("warranty_months")
    expiry = details.get("warranty_expiry")
    if months and not expiry:
        y, m = divmod(purchase.month - 1 + months, 12)
        day = min(purchase.day, [31, 29 if (purchase.year + y) % 4 == 0 else 28, 31, 30, 31, 30,
                                 31, 31, 30, 31, 30, 31][m])
        expiry = purchase.replace(year=purchase.year + y, month=m + 1, day=day)

    asset.manufacturer = details.get("manufacturer") or None
    asset.model = details.get("model") or None
    asset.serial_no = details.get("serial_no") or None
    asset.purchase_date = purchase
    asset.cost = details.get("cost")
    asset.warranty_months = months or None
    asset.warranty_expiry = expiry
    if details.get("expected_life_months"):
        asset.expected_life_months = details["expected_life_months"]
    if details.get("service_interval_days"):
        asset.service_interval_days = details["service_interval_days"]
    if details.get("annual_maintenance_cost") is not None:
        asset.annual_maintenance_cost = details["annual_maintenance_cost"]
    # A brand-new unit starts its service clock and its fault history today.
    asset.last_service_at = now
    asset.installed_at = now

    db.add(AssetReplacement(
        asset_id=asset.id, work_order_id=wo.id, replaced_by=actor.id, replaced_at=now,
        old_details=old, new_details=_unit_snapshot(asset),
    ))
    db.add(WorkOrderEvent(
        work_order_id=wo.id, from_status=wo.status, to_status=wo.status, actor_id=actor.id, created_at=now,
        note=f"New {asset.name} installed ({' '.join(x for x in [asset.manufacturer, asset.model] if x)}"
             f"{', serial ' + asset.serial_no if asset.serial_no else ''}) replacing the old unit.",
    ))


# Steps a technician may not take on a work order, with the verb used in the refusal.
MANAGER_ONLY_STEPS: dict[WorkOrderStatus, str] = {
    WorkOrderStatus.VERIFIED: "verify",
    WorkOrderStatus.CLOSED: "close",
    WorkOrderStatus.CANCELLED: "cancel",
}

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
    replacement: Optional[dict] = None,
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
    # Checking the work, and calling it off, are someone else's job: the person
    # doing it does not verify, close or cancel it.
    if actor.role == UserRole.TECHNICIAN and target in MANAGER_ONLY_STEPS:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"A facility manager or admin has to {MANAGER_ONLY_STEPS[target]} the work order.")

    if target == WorkOrderStatus.COMPLETED:
        after_photos = await db.scalar(
            select(func.count()).select_from(WorkOrderAttachment)
            .where(WorkOrderAttachment.work_order_id == wo.id, WorkOrderAttachment.purpose == "after"))
        if not after_photos:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Upload an After photo as proof of the repair before marking the work complete.")

    previous = wo.status
    wo.status = target
    now = _now()

    if target == WorkOrderStatus.IN_PROGRESS and wo.started_at is None:
        wo.started_at = now
    if target == WorkOrderStatus.COMPLETED:
        wo.completed_at = now
        if resolution_note:
            wo.resolution_note = resolution_note
        # Time taken is measured from when the technician accepted the job to
        # now, never typed in: a typed figure can simply be wrong. (A reopened
        # job counts from the first acceptance, so rework is included.) Any
        # actual_mins sent by a client is ignored.
        accepted_at = await db.scalar(
            select(func.min(WorkOrderEvent.created_at)).where(
                WorkOrderEvent.work_order_id == wo.id,
                WorkOrderEvent.to_status == WorkOrderStatus.ACCEPTED))
        began = accepted_at or wo.started_at
        if began:
            wo.actual_mins = max(0, int((now - began).total_seconds() // 60))
        if replacement:
            if not wo.asset_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                    "This work order has no asset to replace.")
            await replace_asset_unit(db, wo, actor, replacement, now)
            # The new unit's price is what the parts cost, unless stated otherwise.
            if parts_cost is None and replacement.get("cost") is not None:
                parts_cost = replacement["cost"]
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
    await sync_issue_with_work_order(db, wo, actor)
    return wo
