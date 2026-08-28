"""Assemble Issue ORM rows into the API's list/detail shapes.

Kept out of the router so the same projection can be reused by exports,
the AI assistant and the analytics endpoints.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import ISSUE_TRANSITIONS, IssueStatus
from app.models.identity import Department, User
from app.models.issues import Issue, IssueCategory, IssueDuplicateCandidate, IssueEvent
from app.models.spatial import Asset, Building, Floor, Room
from app.models.work import WorkOrder
from app.schemas.common import UserBrief
from app.schemas.issues import (
    AIClassificationOut, AttachmentOut, DuplicateCandidateOut, IssueDetail,
    IssueEventOut, IssueListItem, LocationOut,
)


def _minutes_remaining(due: Optional[datetime]) -> Optional[int]:
    if due is None:
        return None
    return int((due - datetime.now(timezone.utc)).total_seconds() // 60)


async def _lookup_maps(db: AsyncSession, issues: Sequence[Issue]) -> dict:
    """Batch-load every related label in one round trip per table.

    Building these maps up front is what keeps the list endpoint free of
    N+1 queries as the issue count grows.
    """
    def ids(attr: str) -> set:
        return {getattr(i, attr) for i in issues if getattr(i, attr)}

    cat_ids, dept_ids = ids("category_id"), ids("department_id")
    room_ids, asset_ids = ids("room_id"), ids("asset_id")
    bldg_ids, floor_ids = ids("building_id"), ids("floor_id")
    user_ids = ids("reported_by")
    issue_ids = [i.id for i in issues]

    categories = {c.id: c for c in (await db.scalars(
        select(IssueCategory).where(IssueCategory.id.in_(cat_ids)))).all()} if cat_ids else {}
    departments = {d.id: d for d in (await db.scalars(
        select(Department).where(Department.id.in_(dept_ids)))).all()} if dept_ids else {}
    rooms = {r.id: r for r in (await db.scalars(
        select(Room).where(Room.id.in_(room_ids)))).all()} if room_ids else {}
    assets = {a.id: a for a in (await db.scalars(
        select(Asset).where(Asset.id.in_(asset_ids)))).all()} if asset_ids else {}
    buildings = {b.id: b for b in (await db.scalars(
        select(Building).where(Building.id.in_(bldg_ids)))).all()} if bldg_ids else {}
    floors = {f.id: f for f in (await db.scalars(
        select(Floor).where(Floor.id.in_(floor_ids)))).all()} if floor_ids else {}
    users = {u.id: u for u in (await db.scalars(
        select(User).where(User.id.in_(user_ids)))).all()} if user_ids else {}

    # Most recent work order per issue, plus its assignee's name.
    work_orders: dict[uuid.UUID, tuple[str, Optional[str]]] = {}
    if issue_ids:
        rows = (await db.execute(
            select(WorkOrder.issue_id, WorkOrder.reference, User.full_name)
            .join(User, User.id == WorkOrder.assigned_to, isouter=True)
            .where(WorkOrder.issue_id.in_(issue_ids))
            .order_by(WorkOrder.created_at.desc())
        )).all()
        for issue_id, ref, name in rows:
            work_orders.setdefault(issue_id, (ref, name))

    attachment_counts: dict[uuid.UUID, int] = {}
    if issue_ids:
        from app.models.issues import IssueAttachment
        rows = (await db.execute(
            select(IssueAttachment.issue_id, func.count())
            .where(IssueAttachment.issue_id.in_(issue_ids))
            .group_by(IssueAttachment.issue_id)
        )).all()
        attachment_counts = dict(rows)

    return dict(
        categories=categories, departments=departments, rooms=rooms, assets=assets,
        buildings=buildings, floors=floors, users=users,
        work_orders=work_orders, attachment_counts=attachment_counts,
    )


def _location_summary(m: dict, issue: Issue) -> Optional[str]:
    bits = []
    if issue.building_id and issue.building_id in m["buildings"]:
        bits.append(m["buildings"][issue.building_id].code)
    if issue.room_id and issue.room_id in m["rooms"]:
        bits.append(m["rooms"][issue.room_id].code)
    if issue.asset_id and issue.asset_id in m["assets"]:
        bits.append(m["assets"][issue.asset_id].tag)
    if not bits:
        return issue.location_note
    return " · ".join(bits)


def _to_list_item(issue: Issue, m: dict) -> IssueListItem:
    cat = m["categories"].get(issue.category_id)
    dept = m["departments"].get(issue.department_id)
    reporter = m["users"].get(issue.reported_by)
    wo = m["work_orders"].get(issue.id)

    return IssueListItem(
        id=issue.id, reference=issue.reference, title=issue.title,
        status=issue.status, priority=issue.priority,
        category_name=cat.name if cat else None,
        category_icon=cat.icon if cat else None,
        department_name=dept.name if dept else None,
        location_summary=_location_summary(m, issue),
        # An anonymous report must not expose who filed it.
        reporter=None if issue.is_anonymous or reporter is None
                 else UserBrief.model_validate(reporter),
        assignee_name=wo[1] if wo else None,
        work_order_reference=wo[0] if wo else None,
        upvote_count=issue.upvote_count,
        sla_due_at=issue.sla_due_at,
        sla_breached=issue.sla_breached,
        sla_minutes_remaining=_minutes_remaining(issue.sla_due_at),
        attachment_count=m["attachment_counts"].get(issue.id, 0),
        created_at=issue.created_at, updated_at=issue.updated_at,
    )


async def reload_issue(db: AsyncSession, issue_id: uuid.UUID) -> Issue:
    """Re-fetch an issue with its attachments eagerly loaded.

    Routes that mutate an issue must call this before serialising: after a
    flush, server-side columns (updated_at, maintained by a DB trigger) are
    expired, and touching one during serialisation would attempt lazy IO
    outside the async context.
    """
    return await db.scalar(
        select(Issue).options(selectinload(Issue.attachments)).where(Issue.id == issue_id)
    )


async def to_list_items(db: AsyncSession, issues: Sequence[Issue]) -> list[IssueListItem]:
    if not issues:
        return []
    m = await _lookup_maps(db, issues)
    return [_to_list_item(i, m) for i in issues]


async def to_detail(db: AsyncSession, issue: Issue) -> IssueDetail:
    m = await _lookup_maps(db, [issue])
    base = _to_list_item(issue, m)

    building = m["buildings"].get(issue.building_id)
    floor = m["floors"].get(issue.floor_id)
    room = m["rooms"].get(issue.room_id)
    asset = m["assets"].get(issue.asset_id)

    location = LocationOut(
        building_id=issue.building_id, building_name=building.name if building else None,
        floor_id=issue.floor_id, floor_name=floor.name if floor else None,
        room_id=issue.room_id, room_name=room.name if room else None,
        room_code=room.code if room else None, zone_id=room.zone_id if room else None,
        asset_id=issue.asset_id, asset_tag=asset.tag if asset else None,
        asset_name=asset.name if asset else None, note=issue.location_note,
    )

    ai = None
    if issue.ai_classified_at:
        ai_cat = m["categories"].get(issue.ai_category_id)
        if issue.ai_category_id and ai_cat is None:
            ai_cat = await db.scalar(
                select(IssueCategory).where(IssueCategory.id == issue.ai_category_id))
        ai = AIClassificationOut(
            category_id=issue.ai_category_id,
            category_name=ai_cat.name if ai_cat else None,
            confidence=float(issue.ai_confidence) if issue.ai_confidence is not None else None,
            priority=issue.ai_priority, reasoning=issue.ai_reasoning,
            model=issue.ai_model, classified_at=issue.ai_classified_at,
            was_overridden=issue.was_reclassified,
        )

    events = (await db.scalars(
        select(IssueEvent).where(IssueEvent.issue_id == issue.id)
        .order_by(IssueEvent.created_at.asc())
    )).all()
    actor_ids = {e.actor_id for e in events if e.actor_id}
    actors = {u.id: u for u in (await db.scalars(
        select(User).where(User.id.in_(actor_ids)))).all()} if actor_ids else {}

    timeline = [
        IssueEventOut(
            id=e.id, from_status=e.from_status, to_status=e.to_status, note=e.note,
            actor=UserBrief.model_validate(actors[e.actor_id]) if e.actor_id in actors else None,
            meta=e.meta or {}, created_at=e.created_at,
        )
        for e in events
    ]

    cand_rows = (await db.scalars(
        select(IssueDuplicateCandidate)
        .where(IssueDuplicateCandidate.issue_id == issue.id,
               IssueDuplicateCandidate.resolution == "pending")
        .order_by(IssueDuplicateCandidate.score.desc())
    )).all()
    cand_issue_ids = [c.candidate_id for c in cand_rows]
    cand_issues = {i.id: i for i in (await db.scalars(
        select(Issue).where(Issue.id.in_(cand_issue_ids)))).all()} if cand_issue_ids else {}

    candidates = [
        DuplicateCandidateOut(
            issue_id=c.candidate_id,
            reference=cand_issues[c.candidate_id].reference,
            title=cand_issues[c.candidate_id].title,
            score=float(c.score),
            verdict="likely" if float(c.score) >= 0.75 else "possible",
            signals=c.signals or {},
        )
        for c in cand_rows if c.candidate_id in cand_issues
    ]

    master_ref = None
    if issue.duplicate_of:
        master_ref = await db.scalar(
            select(Issue.reference).where(Issue.id == issue.duplicate_of))

    attachments = [AttachmentOut.model_validate(a) for a in issue.attachments]

    return IssueDetail(
        **base.model_dump(),
        description=issue.description,
        is_anonymous=issue.is_anonymous,
        location=location,
        ai=ai,
        duplicate_of=issue.duplicate_of,
        duplicate_of_reference=master_ref,
        duplicate_candidates=candidates,
        attachments=attachments,
        timeline=timeline,
        allowed_transitions=sorted(ISSUE_TRANSITIONS.get(issue.status, set()), key=lambda s: s.value),
        responded_at=issue.responded_at,
        resolved_at=issue.resolved_at,
        closed_at=issue.closed_at,
    )
