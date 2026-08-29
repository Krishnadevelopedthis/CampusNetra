"""Issue / complaint endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, Paging, RequireManager, RequireStaff
from app.core.enums import IssueStatus, Priority, UserRole
from app.models.issues import Issue, IssueCategory, IssueDuplicateCandidate, IssueEvent, IssueUpvote
from app.models.platform import AIFeedback
from app.schemas.common import Message, Page
from app.schemas.issues import (
    DuplicateCandidateOut, IssueCategoryOut, IssueCreate, IssueCreateResponse,
    IssueDetail, IssueListItem, IssueReclassify, IssueTransition, MarkDuplicateRequest,
)
from app.services import issue_views
from app.services import issues as issue_service

router = APIRouter(prefix="/issues", tags=["Issues"])


async def _get_issue_or_404(db, issue_id: uuid.UUID, user) -> Issue:
    issue = await db.scalar(
        select(Issue).options(selectinload(Issue.attachments)).where(Issue.id == issue_id)
    )
    if issue is None or issue.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Issue not found")
    return issue


@router.get("/categories", response_model=list[IssueCategoryOut])
async def list_categories(user: CurrentUser, db: DB):
    rows = (await db.scalars(
        select(IssueCategory).where(
            IssueCategory.organization_id == user.organization_id,
            IssueCategory.is_active.is_(True),
        ).order_by(IssueCategory.name)
    )).all()
    return [IssueCategoryOut.model_validate(c) for c in rows]


@router.post("", response_model=IssueCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_issue(payload: IssueCreate, user: CurrentUser, db: DB):
    """Report an issue. The AI classifies it, routes it to a department and pins
    it onto the Digital Twin in a single transaction."""
    issue, candidates = await issue_service.create_issue(
        db, user,
        title=payload.title, description=payload.description, campus_id=payload.campus_id,
        building_id=payload.building_id, floor_id=payload.floor_id,
        room_id=payload.room_id, asset_id=payload.asset_id,
        location_note=payload.location_note, category_id=payload.category_id,
        priority=payload.priority, is_anonymous=payload.is_anonymous,
        attachments=[a.model_dump() for a in payload.attachments],
    )
    await db.flush()
    detail = await issue_views.to_detail(db, await issue_views.reload_issue(db, issue.id))
    warning = None
    likely = [c for c in candidates if c.verdict == "likely"]
    if likely:
        warning = (
            f"This looks like a duplicate of {likely[0].reference} "
            f"({round(likely[0].score * 100)}% match). Consider upvoting it instead."
        )

    return IssueCreateResponse(
        issue=detail,
        duplicate_candidates=[
            DuplicateCandidateOut(
                issue_id=uuid.UUID(c.issue_id), reference=c.reference, title=c.title,
                score=c.score, verdict=c.verdict, signals=c.signals,
            ) for c in candidates
        ],
        duplicate_warning=warning,
    )


@router.get("", response_model=Page[IssueListItem])
async def list_issues(
    user: CurrentUser, db: DB, paging: Paging,
    mine: bool = Query(False, description="Only issues I reported"),
    status_in: Optional[list[IssueStatus]] = Query(None, alias="status"),
    priority_in: Optional[list[Priority]] = Query(None, alias="priority"),
    category_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    building_id: Optional[uuid.UUID] = None,
    room_id: Optional[uuid.UUID] = None,
    asset_id: Optional[uuid.UUID] = None,
    q: Optional[str] = Query(None, description="Free-text search"),
    breached: Optional[bool] = Query(None, description="Only SLA-breached issues"),
    sort: str = Query("newest", pattern="^(newest|oldest|priority|sla)$"),
):
    query = select(Issue).where(Issue.organization_id == user.organization_id)

    # Students and teachers only ever see their own reports.
    if mine or user.role in (UserRole.STUDENT, UserRole.TEACHER):
        query = query.where(Issue.reported_by == user.id)

    if status_in:
        query = query.where(Issue.status.in_(status_in))
    if priority_in:
        query = query.where(Issue.priority.in_(priority_in))
    if category_id:
        query = query.where(Issue.category_id == category_id)
    if department_id:
        query = query.where(Issue.department_id == department_id)
    if building_id:
        query = query.where(Issue.building_id == building_id)
    if room_id:
        query = query.where(Issue.room_id == room_id)
    if asset_id:
        query = query.where(Issue.asset_id == asset_id)
    if breached is not None:
        query = query.where(Issue.sla_breached.is_(breached))
    if q:
        like = f"%{q}%"
        query = query.where(or_(
            Issue.title.ilike(like), Issue.description.ilike(like), Issue.reference.ilike(like),
        ))

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0

    order = {
        "newest": Issue.created_at.desc(),
        "oldest": Issue.created_at.asc(),
        # Postgres orders enums by declaration order, which runs low -> critical.
        "priority": Issue.priority.desc(),
        "sla": Issue.sla_due_at.asc().nullslast(),
    }[sort]

    rows = (await db.scalars(
        query.order_by(order).offset(paging.offset).limit(paging.limit)
    )).all()

    return Page[IssueListItem](
        items=await issue_views.to_list_items(db, rows),
        total=total, page=paging.page, page_size=paging.page_size,
    )


@router.get("/map", response_model=dict)
async def issue_map(
    user: CurrentUser, db: DB,
    floor_id: Optional[uuid.UUID] = None,
    status_in: Optional[list[IssueStatus]] = Query(None, alias="status"),
    priority_in: Optional[list[Priority]] = Query(None, alias="priority"),
    days: int = Query(30, ge=1, le=365),
):
    """Issues grouped by where they are, for plotting on a floor plan.

    Declared before /{issue_id} so "map" is not captured as a UUID path segment.
    """
    from datetime import datetime, timedelta, timezone
    from app.models.spatial import Asset, Building, Floor, Room

    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(Issue, Room.id, Room.code, Room.name, Asset.id, Asset.tag)
        .join(Room, Room.id == Issue.room_id, isouter=True)
        .join(Asset, Asset.id == Issue.asset_id, isouter=True)
        .where(Issue.organization_id == user.organization_id, Issue.created_at >= since)
    )

    # Students and teachers only ever see their own reports, here as elsewhere.
    if user.role in (UserRole.STUDENT, UserRole.TEACHER):
        query = query.where(Issue.reported_by == user.id)
    if floor_id:
        query = query.where(Issue.floor_id == floor_id)
    if status_in:
        query = query.where(Issue.status.in_(status_in))
    else:
        query = query.where(Issue.status.notin_(
            [IssueStatus.CLOSED, IssueStatus.REJECTED, IssueStatus.DUPLICATE]))
    if priority_in:
        query = query.where(Issue.priority.in_(priority_in))

    rows = (await db.execute(query.order_by(Issue.created_at.desc()).limit(500))).all()

    PRIORITY_COLOUR = {
        "critical": "#ef4444", "high": "#f59e0b",
        "medium": "#3b82f6", "low": "#94a3b8",
    }

    by_room: dict = {}
    unplaced = []
    for issue, room_id, room_code, room_name, asset_id, asset_tag in rows:
        entry = {
            "id": str(issue.id), "reference": issue.reference, "title": issue.title,
            "status": issue.status.value, "priority": issue.priority.value,
            "colour": PRIORITY_COLOUR[issue.priority.value],
            "asset_id": str(asset_id) if asset_id else None,
            "asset_tag": asset_tag,
            "sla_breached": issue.sla_breached,
            "created_at": issue.created_at.isoformat(),
        }
        if room_id is None:
            # Reported without a room: it cannot be drawn, so surface it
            # separately rather than dropping it silently.
            unplaced.append(entry)
            continue
        bucket = by_room.setdefault(str(room_id), {
            "room_id": str(room_id), "room_code": room_code, "room_name": room_name,
            "issues": [], "worst_priority": "low",
        })
        bucket["issues"].append(entry)

    order = ["low", "medium", "high", "critical"]
    for bucket in by_room.values():
        bucket["worst_priority"] = max(
            (i["priority"] for i in bucket["issues"]), key=order.index)
        bucket["colour"] = PRIORITY_COLOUR[bucket["worst_priority"]]
        bucket["count"] = len(bucket["issues"])

    return {
        "window_days": days,
        "total": len(rows),
        "rooms": sorted(by_room.values(), key=lambda b: -b["count"]),
        "unplaced": unplaced,
        "legend": [{"priority": p, "colour": c} for p, c in PRIORITY_COLOUR.items()],
    }


@router.get("/{issue_id}", response_model=IssueDetail)
async def get_issue(issue_id: uuid.UUID, user: CurrentUser, db: DB):
    issue = await _get_issue_or_404(db, issue_id, user)
    # A reporter may always read their own issue; others need staff rights.
    if user.role in (UserRole.STUDENT, UserRole.TEACHER) and issue.reported_by != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view issues you reported")
    return await issue_views.to_detail(db, issue)


@router.post("/{issue_id}/transition", response_model=IssueDetail)
async def transition(issue_id: uuid.UUID, payload: IssueTransition, user: RequireStaff, db: DB):
    issue = await _get_issue_or_404(db, issue_id, user)
    await issue_service.transition_issue(db, issue, payload.status, user, payload.note)
    await db.flush()
    return await issue_views.to_detail(db, await issue_views.reload_issue(db, issue.id))


@router.post("/{issue_id}/upvote", response_model=Message)
async def upvote(issue_id: uuid.UUID, user: CurrentUser, db: DB):
    """Confirm you are affected by an existing issue instead of filing a duplicate."""
    issue = await _get_issue_or_404(db, issue_id, user)
    existing = await db.scalar(
        select(IssueUpvote).where(
            IssueUpvote.issue_id == issue_id, IssueUpvote.user_id == user.id)
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already confirmed this issue")

    db.add(IssueUpvote(issue_id=issue_id, user_id=user.id, created_at=datetime.now(timezone.utc)))
    issue.upvote_count += 1
    return Message(detail=f"Confirmed. {issue.upvote_count} people report this issue.")


@router.post("/{issue_id}/reclassify", response_model=IssueDetail)
async def reclassify(issue_id: uuid.UUID, payload: IssueReclassify, user: RequireStaff, db: DB):
    """Override the AI's category. The correction is stored as training signal."""
    issue = await _get_issue_or_404(db, issue_id, user)
    category = await db.scalar(
        select(IssueCategory).where(
            IssueCategory.id == payload.category_id,
            IssueCategory.organization_id == user.organization_id)
    )
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

    was_ai_correct = issue.ai_category_id == payload.category_id
    previous_id = issue.category_id

    issue.category_id = category.id
    issue.department_id = category.department_id
    if payload.priority:
        issue.priority = payload.priority
    issue.was_reclassified = True

    if issue.ai_classified_at:
        db.add(AIFeedback(
            task="classify_issue", entity_type="issue", entity_id=issue.id,
            was_correct=was_ai_correct,
            corrected_to={"category_id": str(category.id), "category_code": category.code},
            actor_id=user.id,
        ))

    db.add(IssueEvent(
        issue_id=issue.id, actor_id=user.id, created_at=datetime.now(timezone.utc),
        note=f"Reclassified to {category.name}" + (f" — {payload.reason}" if payload.reason else ""),
        meta={"from_category": str(previous_id) if previous_id else None,
              "to_category": str(category.id)},
    ))

    await db.flush()
    return await issue_views.to_detail(db, await issue_views.reload_issue(db, issue.id))


@router.post("/{issue_id}/mark-duplicate", response_model=IssueDetail)
async def mark_duplicate(
    issue_id: uuid.UUID, payload: MarkDuplicateRequest, user: RequireStaff, db: DB
):
    issue = await _get_issue_or_404(db, issue_id, user)
    await issue_service.mark_duplicate(db, issue, payload.master_issue_id, user)

    await db.execute(
        IssueDuplicateCandidate.__table__.update()
        .where(IssueDuplicateCandidate.issue_id == issue.id)
        .values(resolution="confirmed", reviewed_by=user.id)
    )
    await db.flush()
    return await issue_views.to_detail(db, await issue_views.reload_issue(db, issue.id))


@router.post("/{issue_id}/dismiss-duplicates", response_model=Message)
async def dismiss_duplicates(issue_id: uuid.UUID, user: RequireStaff, db: DB):
    issue = await _get_issue_or_404(db, issue_id, user)
    result = await db.execute(
        IssueDuplicateCandidate.__table__.update()
        .where(IssueDuplicateCandidate.issue_id == issue.id,
               IssueDuplicateCandidate.resolution == "pending")
        .values(resolution="dismissed", reviewed_by=user.id)
    )
    return Message(detail=f"Dismissed {result.rowcount} duplicate suggestion(s).")
