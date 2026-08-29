"""Work order endpoints, including the technician panel and Kanban board."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, Paging, RequireManager, RequireStaff
from app.core.routing import CommitRoute
from app.core.enums import WORK_ORDER_TRANSITIONS, Priority, UserRole, WorkOrderStatus
from app.models.identity import Department, User
from app.models.issues import Issue
from app.models.spatial import Asset, Room
from app.models.work import (
    PartRequest, WorkOrder, WorkOrderAttachment, WorkOrderComment, WorkOrderEvent,
)
from app.schemas.common import Message, Page, UserBrief
from app.schemas.work import (
    PartRequestIn, PartRequestOut, WOAttachmentIn, WOAttachmentOut, WorkOrderAssign,
    WorkOrderBoard, WorkOrderCommentIn, WorkOrderCommentOut, WorkOrderCreate,
    WorkOrderDetail, WorkOrderEventOut, WorkOrderListItem, WorkOrderTransition,
)
from app.services import work_orders as wo_service

router = APIRouter(route_class=CommitRoute, prefix="/work-orders", tags=["Work Orders"])

BOARD_COLUMNS = [
    WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.AWAITING_PARTS, WorkOrderStatus.COMPLETED, WorkOrderStatus.VERIFIED,
]


def _minutes_remaining(due: Optional[datetime]) -> Optional[int]:
    return None if due is None else int((due - datetime.now(timezone.utc)).total_seconds() // 60)


async def _get_or_404(db, wo_id: uuid.UUID, user) -> WorkOrder:
    wo = await db.scalar(select(WorkOrder).where(WorkOrder.id == wo_id))
    if wo is None or wo.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work order not found")
    return wo


async def _lookups(db, wos: list[WorkOrder]) -> dict:
    """Batch-load labels once for the whole page."""
    if not wos:
        return {"users": {}, "departments": {}, "rooms": {}, "assets": {}, "issues": {}}

    def ids(attr):
        return {getattr(w, attr) for w in wos if getattr(w, attr)}

    users = {u.id: u for u in (await db.scalars(
        select(User).where(User.id.in_(ids("assigned_to"))))).all()} if ids("assigned_to") else {}
    depts = {d.id: d for d in (await db.scalars(
        select(Department).where(Department.id.in_(ids("department_id"))))).all()} if ids("department_id") else {}
    rooms = {r.id: r for r in (await db.scalars(
        select(Room).where(Room.id.in_(ids("room_id"))))).all()} if ids("room_id") else {}
    assets = {a.id: a for a in (await db.scalars(
        select(Asset).where(Asset.id.in_(ids("asset_id"))))).all()} if ids("asset_id") else {}
    issues = dict((await db.execute(
        select(Issue.id, Issue.reference).where(Issue.id.in_(ids("issue_id"))))).all()) if ids("issue_id") else {}
    return {"users": users, "departments": depts, "rooms": rooms, "assets": assets, "issues": issues}


def _to_item(wo: WorkOrder, m: dict) -> WorkOrderListItem:
    room = m["rooms"].get(wo.room_id)
    asset = m["assets"].get(wo.asset_id)
    tech = m["users"].get(wo.assigned_to)
    dept = m["departments"].get(wo.department_id)
    loc = " · ".join(p for p in [room.code if room else None, asset.tag if asset else None] if p)

    return WorkOrderListItem(
        id=wo.id, reference=wo.reference, title=wo.title, status=wo.status, priority=wo.priority,
        issue_reference=m["issues"].get(wo.issue_id),
        department_name=dept.name if dept else None,
        assignee=UserBrief.model_validate(tech) if tech else None,
        location_summary=loc or None, asset_tag=asset.tag if asset else None,
        scheduled_for=wo.scheduled_for, sla_due_at=wo.sla_due_at,
        sla_breached=wo.sla_breached, sla_minutes_remaining=_minutes_remaining(wo.sla_due_at),
        is_predictive=wo.is_predictive,
        total_cost=float(wo.labour_cost or 0) + float(wo.parts_cost or 0),
        created_at=wo.created_at, updated_at=wo.updated_at,
    )


async def _to_detail(db, wo: WorkOrder) -> WorkOrderDetail:
    m = await _lookups(db, [wo])
    base = _to_item(wo, m)

    events = (await db.scalars(
        select(WorkOrderEvent).where(WorkOrderEvent.work_order_id == wo.id)
        .order_by(WorkOrderEvent.created_at))).all()
    comments = (await db.scalars(
        select(WorkOrderComment).where(WorkOrderComment.work_order_id == wo.id)
        .order_by(WorkOrderComment.created_at))).all()
    attachments = (await db.scalars(
        select(WorkOrderAttachment).where(WorkOrderAttachment.work_order_id == wo.id))).all()
    parts = (await db.scalars(
        select(PartRequest).where(PartRequest.work_order_id == wo.id)
        .order_by(PartRequest.created_at))).all()

    actor_ids = {e.actor_id for e in events if e.actor_id} | {c.author_id for c in comments}
    actors = {u.id: u for u in (await db.scalars(
        select(User).where(User.id.in_(actor_ids)))).all()} if actor_ids else {}

    return WorkOrderDetail(
        **base.model_dump(),
        description=wo.description, resolution_note=wo.resolution_note,
        blocked_reason=wo.blocked_reason, estimated_mins=wo.estimated_mins,
        actual_mins=wo.actual_mins,
        labour_cost=float(wo.labour_cost or 0), parts_cost=float(wo.parts_cost or 0),
        started_at=wo.started_at, completed_at=wo.completed_at, verified_at=wo.verified_at,
        timeline=[
            WorkOrderEventOut(
                id=e.id, from_status=e.from_status, to_status=e.to_status, note=e.note,
                actor=UserBrief.model_validate(actors[e.actor_id]) if e.actor_id in actors else None,
                created_at=e.created_at)
            for e in events
        ],
        comments=[
            WorkOrderCommentOut(
                id=c.id, body=c.body, is_internal=c.is_internal, created_at=c.created_at,
                author=UserBrief.model_validate(actors[c.author_id]) if c.author_id in actors else None)
            for c in comments
        ],
        before_photos=[WOAttachmentOut.model_validate(a) for a in attachments if a.purpose == "before"],
        after_photos=[WOAttachmentOut.model_validate(a) for a in attachments if a.purpose == "after"],
        part_requests=[PartRequestOut.model_validate(p) for p in parts],
        allowed_transitions=sorted(WORK_ORDER_TRANSITIONS.get(wo.status, set()), key=lambda s: s.value),
    )


@router.post("", response_model=WorkOrderDetail, status_code=status.HTTP_201_CREATED)
async def create(payload: WorkOrderCreate, user: RequireStaff, db: DB):
    wo = await wo_service.create_work_order(
        db, user, **payload.model_dump(exclude_unset=False))
    await db.flush()
    await db.refresh(wo)
    return await _to_detail(db, wo)


@router.get("", response_model=Page[WorkOrderListItem])
async def list_work_orders(
    user: CurrentUser, db: DB, paging: Paging,
    mine: bool = Query(False, description="Only work orders assigned to me"),
    status_in: Optional[list[WorkOrderStatus]] = Query(None, alias="status"),
    priority_in: Optional[list[Priority]] = Query(None, alias="priority"),
    department_id: Optional[uuid.UUID] = None,
    assigned_to: Optional[uuid.UUID] = None,
    breached: Optional[bool] = None,
    q: Optional[str] = None,
    sort: str = Query("newest", pattern="^(newest|oldest|priority|sla)$"),
):
    query = select(WorkOrder).where(WorkOrder.organization_id == user.organization_id)

    # Technicians see only their own queue unless they ask for a specific person.
    if mine or (user.role == UserRole.TECHNICIAN and assigned_to is None):
        query = query.where(WorkOrder.assigned_to == user.id)
    elif assigned_to:
        query = query.where(WorkOrder.assigned_to == assigned_to)

    if status_in:
        query = query.where(WorkOrder.status.in_(status_in))
    if priority_in:
        query = query.where(WorkOrder.priority.in_(priority_in))
    if department_id:
        query = query.where(WorkOrder.department_id == department_id)
    if breached is not None:
        query = query.where(WorkOrder.sla_breached.is_(breached))
    if q:
        like = f"%{q}%"
        query = query.where(or_(WorkOrder.title.ilike(like), WorkOrder.reference.ilike(like)))

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    order = {
        "newest": WorkOrder.created_at.desc(), "oldest": WorkOrder.created_at.asc(),
        "priority": WorkOrder.priority.desc(), "sla": WorkOrder.sla_due_at.asc().nullslast(),
    }[sort]

    rows = (await db.scalars(query.order_by(order).offset(paging.offset).limit(paging.limit))).all()
    m = await _lookups(db, list(rows))
    return Page[WorkOrderListItem](
        items=[_to_item(w, m) for w in rows], total=total,
        page=paging.page, page_size=paging.page_size,
    )


@router.get("/board", response_model=WorkOrderBoard)
async def board(user: RequireStaff, db: DB,
                department_id: Optional[uuid.UUID] = None,
                mine: bool = Query(False)):
    """Kanban board — work orders bucketed by status."""
    query = select(WorkOrder).where(
        WorkOrder.organization_id == user.organization_id,
        WorkOrder.status.in_(BOARD_COLUMNS),
    )
    if department_id:
        query = query.where(WorkOrder.department_id == department_id)
    if mine or user.role == UserRole.TECHNICIAN:
        query = query.where(WorkOrder.assigned_to == user.id)

    rows = list((await db.scalars(query.order_by(WorkOrder.priority.desc(),
                                                 WorkOrder.created_at.asc()))).all())
    m = await _lookups(db, rows)

    buckets: dict[str, list] = {c.value: [] for c in BOARD_COLUMNS}
    for w in rows:
        buckets[w.status.value].append(_to_item(w, m).model_dump(mode="json"))

    return WorkOrderBoard(
        columns=[
            {"status": c.value,
             "title": c.value.replace("_", " ").title(),
             "count": len(buckets[c.value]),
             "items": buckets[c.value]}
            for c in BOARD_COLUMNS
        ],
        total=len(rows),
    )


@router.get("/{wo_id}", response_model=WorkOrderDetail)
async def get_work_order(wo_id: uuid.UUID, user: CurrentUser, db: DB):
    wo = await _get_or_404(db, wo_id, user)
    return await _to_detail(db, wo)


@router.post("/{wo_id}/assign", response_model=WorkOrderDetail)
async def assign(wo_id: uuid.UUID, payload: WorkOrderAssign, user: RequireManager, db: DB):
    wo = await _get_or_404(db, wo_id, user)
    await wo_service.assign_work_order(
        db, wo, payload.technician_id, user, payload.note, payload.scheduled_for)
    await db.flush()
    await db.refresh(wo)
    return await _to_detail(db, wo)


@router.get("/{wo_id}/suggest-technician", response_model=dict)
async def suggest(wo_id: uuid.UUID, user: RequireManager, db: DB):
    """Least-loaded technician in the owning department."""
    wo = await _get_or_404(db, wo_id, user)
    tech = await wo_service.suggest_technician(db, user.organization_id, wo.department_id)
    if tech is None:
        return {"suggestion": None, "reason": "No active technician in this department"}

    load = await db.scalar(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.assigned_to == tech.id,
            WorkOrder.status.notin_([WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED,
                                     WorkOrderStatus.VERIFIED]))) or 0
    return {
        "suggestion": UserBrief.model_validate(tech).model_dump(mode="json"),
        "current_load": load,
        "reason": f"{tech.full_name} has the lightest queue ({load} open)",
    }


@router.post("/{wo_id}/transition", response_model=WorkOrderDetail)
async def transition(wo_id: uuid.UUID, payload: WorkOrderTransition, user: RequireStaff, db: DB):
    wo = await _get_or_404(db, wo_id, user)
    await wo_service.transition_work_order(
        db, wo, payload.status, user,
        note=payload.note, resolution_note=payload.resolution_note,
        actual_mins=payload.actual_mins, labour_cost=payload.labour_cost,
        parts_cost=payload.parts_cost, blocked_reason=payload.blocked_reason,
    )
    await db.flush()
    await db.refresh(wo)
    return await _to_detail(db, wo)


@router.post("/{wo_id}/comments", response_model=WorkOrderCommentOut, status_code=201)
async def add_comment(wo_id: uuid.UUID, payload: WorkOrderCommentIn, user: RequireStaff, db: DB):
    wo = await _get_or_404(db, wo_id, user)
    comment = WorkOrderComment(
        work_order_id=wo.id, author_id=user.id,
        body=payload.body, is_internal=payload.is_internal)
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    return WorkOrderCommentOut(
        id=comment.id, body=comment.body, is_internal=comment.is_internal,
        author=UserBrief.model_validate(user), created_at=comment.created_at)


@router.post("/{wo_id}/attachments", response_model=WOAttachmentOut, status_code=201)
async def add_attachment(wo_id: uuid.UUID, payload: WOAttachmentIn, user: RequireStaff, db: DB):
    """Before / after evidence photos."""
    wo = await _get_or_404(db, wo_id, user)
    att = WorkOrderAttachment(work_order_id=wo.id, uploaded_by=user.id, **payload.model_dump())
    db.add(att)
    await db.flush()
    await db.refresh(att)
    return WOAttachmentOut.model_validate(att)


@router.post("/{wo_id}/parts", response_model=PartRequestOut, status_code=201)
async def request_parts(wo_id: uuid.UUID, payload: PartRequestIn, user: RequireStaff, db: DB):
    """Technician 'Request Parts / Resources' flow."""
    wo = await _get_or_404(db, wo_id, user)
    pr = PartRequest(work_order_id=wo.id, requested_by=user.id, **payload.model_dump())
    db.add(pr)
    await db.flush()
    await db.refresh(pr)

    from app.services.notifications import managers_of, notify
    await notify(
        db, await managers_of(db, user.organization_id),
        title=f"Parts requested for {wo.reference}",
        body=f"{payload.quantity} x {payload.item_name} — {user.full_name}",
        link=f"/work-orders/{wo.id}", kind="part_request",
        entity_type="work_order", entity_id=wo.id,
    )
    return PartRequestOut.model_validate(pr)


@router.post("/parts/{part_id}/decision", response_model=Message)
async def decide_part_request(
    part_id: uuid.UUID, user: RequireManager, db: DB,
    approve: bool = Query(..., description="true to approve, false to reject"),
):
    pr = await db.scalar(select(PartRequest).where(PartRequest.id == part_id))
    if pr is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Part request not found")
    if pr.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {pr.status}")

    pr.status = "approved" if approve else "rejected"
    pr.approved_by = user.id

    from app.services.notifications import notify
    await notify(db, [pr.requested_by],
                 title=f"Parts request {pr.status}",
                 body=f"{pr.quantity} x {pr.item_name}",
                 link=f"/work-orders/{pr.work_order_id}", kind="part_request")
    return Message(detail=f"Request {pr.status}.")
