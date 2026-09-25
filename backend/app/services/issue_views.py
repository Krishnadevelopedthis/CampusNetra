"""Assemble Issue ORM rows into the API's list/detail shapes.

Kept out of the router so the same projection can be reused by exports,
the AI assistant and the analytics endpoints.
"""
from __future__ import annotations
import asyncio
import uuid
import time
from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import SessionLocal
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


def _minutes_remaining(due: Optional[datetime], as_of: Optional[datetime] = None) -> Optional[int]:
    """Minutes until `due`, as of `as_of` (defaults to now).

    An open issue's SLA clock is still running, so "now" is the right
    reference -- that's the live countdown a reporter watches. A
    resolved/closed issue's clock stopped at resolved_at; computing
    against "now" instead means an old ticket that was closed well
    before its deadline keeps counting further into "overdue" forever
    as real time passes, directly contradicting its own sla_breached
    flag (set once, at resolution) and the dashboard's SLA compliance
    number, which is derived from that same flag. Callers pass
    issue.resolved_at as as_of once it's set, freezing the number at
    the moment the clock actually stopped.
    """
    if due is None:
        return None
    reference = as_of or datetime.now(timezone.utc)
    return int((due - reference).total_seconds() // 60)


async def _lookup_maps(db: AsyncSession, issues: Sequence[Issue]) -> dict:
    """Batch-load related labels for issue list/detail responses.

    These 9 lookups are all independent reads of already-committed data —
    none depends on another's result, and none needs to see this request's
    own uncommitted writes. They used to run one after another on the
    request's own session; measured against the real (Neon) database that
    was costing 6-8 seconds for a single dashboard render, because each
    lookup pays the full network round trip on its own, serially. A
    session can't run concurrent queries on one connection, so each lookup
    below gets its own short-lived connection from the pool and they all
    run at once — wall-clock cost drops to roughly the slowest single
    lookup instead of the sum of all nine.
    """
    started = time.perf_counter()

    def ids(attr: str) -> set:
        return {getattr(i, attr) for i in issues if getattr(i, attr)}

    cat_ids, dept_ids = ids("category_id"), ids("department_id")
    room_ids, asset_ids = ids("room_id"), ids("asset_id")
    bldg_ids, floor_ids = ids("building_id"), ids("floor_id")
    user_ids = ids("reported_by")
    issue_ids = [i.id for i in issues]

    from app.models.issues import IssueAttachment

    async def by_id(model, id_set):
        if not id_set:
            return {}
        async with SessionLocal() as s:
            rows = (await s.scalars(select(model).where(model.id.in_(id_set)))).all()
        return {r.id: r for r in rows}

    async def work_order_map():
        if not issue_ids:
            return {}
        async with SessionLocal() as s:
            rows = (await s.execute(
                select(WorkOrder.issue_id, WorkOrder.reference, User.full_name)
                .join(User, User.id == WorkOrder.assigned_to, isouter=True)
                .where(WorkOrder.issue_id.in_(issue_ids))
                .order_by(WorkOrder.created_at.desc())
            )).all()
        out: dict[uuid.UUID, tuple[str, Optional[str]]] = {}
        for issue_id, ref, name in rows:
            out.setdefault(issue_id, (ref, name))
        return out

    async def attachment_count_map():
        if not issue_ids:
            return {}
        async with SessionLocal() as s:
            rows = (await s.execute(
                select(IssueAttachment.issue_id, func.count())
                .where(IssueAttachment.issue_id.in_(issue_ids))
                .group_by(IssueAttachment.issue_id)
            )).all()
        return dict(rows)

    (
        categories, departments, rooms, assets, buildings, floors, users,
        work_orders, attachment_counts,
    ) = await asyncio.gather(
        by_id(IssueCategory, cat_ids),
        by_id(Department, dept_ids),
        by_id(Room, room_ids),
        by_id(Asset, asset_ids),
        by_id(Building, bldg_ids),
        by_id(Floor, floor_ids),
        by_id(User, user_ids),
        work_order_map(),
        attachment_count_map(),
    )

    print(f"[ISSUE_MAPS] COMPLETE elapsed={time.perf_counter() - started:.2f}s", flush=True)

    return dict(
        categories=categories,
        departments=departments,
        rooms=rooms,
        assets=assets,
        buildings=buildings,
        floors=floors,
        users=users,
        work_orders=work_orders,
        attachment_counts=attachment_counts,
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
        sla_minutes_remaining=_minutes_remaining(issue.sla_due_at, issue.resolved_at),
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
    started = time.perf_counter()
    print(
        f"[ISSUE_DETAIL_SERVICE] START issue={issue.id}",
        flush=True,
    )

    print("[ISSUE_DETAIL_SERVICE] lookup_maps START", flush=True)
    
    m = await _lookup_maps(db, [issue])
    print(
        f"[ISSUE_DETAIL_SERVICE] lookup_maps DONE "
        f"elapsed={time.perf_counter() - started:.2f}s",
        flush=True,
    )
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
    print("[ISSUE_DETAIL_SERVICE] events START", flush=True)
    events = (await db.scalars(
        select(IssueEvent).where(IssueEvent.issue_id == issue.id)
        .order_by(IssueEvent.created_at.asc())
    )).all()
    print(
    f"[ISSUE_DETAIL_SERVICE] events DONE count={len(events)}",
    flush=True,
        )
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

    print(
    "[ISSUE_DETAIL_SERVICE] duplicate_candidates START",
    flush=True,
    )
    cand_rows = (await db.scalars(
        select(IssueDuplicateCandidate)
        .where(IssueDuplicateCandidate.issue_id == issue.id,
               IssueDuplicateCandidate.resolution == "pending")
        .order_by(IssueDuplicateCandidate.score.desc())
    )).all()
    print(
    f"[ISSUE_DETAIL_SERVICE] duplicate_candidates DONE "
    f"count={len(cand_rows)}",
    flush=True,
    )
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

    print(
    f"[ISSUE_DETAIL_SERVICE] RETURN elapsed="
    f"{time.perf_counter() - started:.2f}s",
    flush=True,
    )
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
