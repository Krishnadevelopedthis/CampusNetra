"""Complaint lifecycle: intake, AI triage, routing, state transitions."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import duplicates as dup
from app.ai.classifier import classify
from app.core.enums import (
    ISSUE_TRANSITIONS, AssetState, IssueStatus, Priority, TwinEventKind, can_transition,
)
from app.models.identity import User
from app.models.issues import (
    Issue, IssueAttachment, IssueCategory, IssueDuplicateCandidate, IssueEvent,
)
from app.models.platform import AIInvocation
from app.models.spatial import Asset, Building, Campus, Floor, Room
from app.services import notifications as notify_svc
from app.services.references import next_reference
from app.services.twin import record_event, sync_asset_to_issue_status


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def load_categories(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    """Category catalogue in the shape the classifier expects."""
    rows = (await db.scalars(
        select(IssueCategory).where(
            IssueCategory.organization_id == org_id, IssueCategory.is_active.is_(True)
        )
    )).all()
    return [
        {
            "id": str(c.id), "code": c.code, "name": c.name,
            "keywords": c.keywords, "department_id": str(c.department_id) if c.department_id else None,
            "default_priority": c.default_priority,
            "sla_response_mins": c.sla_response_mins, "sla_resolve_mins": c.sla_resolve_mins,
        }
        for c in rows
    ]


async def find_duplicate_candidates(
    db: AsyncSession, issue: Issue, phash: Optional[str] = None
) -> list[dup.DuplicateCandidate]:
    """Compare against open issues in the same building over the last 30 days."""
    window_start = _now() - timedelta(days=30)
    query = select(Issue).where(
        Issue.organization_id == issue.organization_id,
        Issue.id != issue.id,
        Issue.status.notin_([IssueStatus.CLOSED, IssueStatus.REJECTED, IssueStatus.DUPLICATE]),
        Issue.created_at >= window_start,
    )
    if issue.building_id:
        query = query.where(Issue.building_id == issue.building_id)

    open_issues = (await db.scalars(query.limit(200))).all()

    def to_dict(i: Issue) -> dict:
        return {
            "id": i.id, "reference": i.reference, "title": i.title,
            "description": i.description, "asset_id": i.asset_id, "room_id": i.room_id,
            "floor_id": i.floor_id, "building_id": i.building_id, "created_at": i.created_at,
        }

    new_dict = to_dict(issue)
    new_dict["phash"] = phash
    return dup.find_duplicates(new_dict, [to_dict(i) for i in open_issues])


async def create_issue(
    db: AsyncSession,
    reporter: User,
    *,
    title: str,
    description: str,
    campus_id: uuid.UUID,
    building_id: Optional[uuid.UUID] = None,
    floor_id: Optional[uuid.UUID] = None,
    room_id: Optional[uuid.UUID] = None,
    asset_id: Optional[uuid.UUID] = None,
    location_note: Optional[str] = None,
    category_id: Optional[uuid.UUID] = None,
    priority: Optional[Priority] = None,
    is_anonymous: bool = False,
    attachments: Optional[Sequence[dict]] = None,
    run_ai: bool = True,
) -> tuple[Issue, list[dup.DuplicateCandidate]]:
    """Full intake: persist, classify, route, pin to the twin, notify the department."""
    org_id = reporter.organization_id
    if org_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your account is not linked to an organization")

    reference = await next_reference(db, org_id, "CMP")

    issue = Issue(
        reference=reference, organization_id=org_id, campus_id=campus_id,
        title=title, description=description,
        building_id=building_id, floor_id=floor_id, room_id=room_id, asset_id=asset_id,
        location_note=location_note, reported_by=reporter.id, is_anonymous=is_anonymous,
        category_id=category_id, priority=priority or Priority.MEDIUM,
        status=IssueStatus.REPORTED,
    )
    db.add(issue)
    await db.flush()

    for att in attachments or []:
        db.add(IssueAttachment(issue_id=issue.id, uploaded_by=reporter.id, **att))

    # ---- AI triage ----
    if run_ai:
        categories = await load_categories(db, org_id)
        result = await classify(title, description, categories)

        issue.ai_confidence = result.confidence
        issue.ai_reasoning = result.reasoning
        issue.ai_model = result.model
        issue.ai_priority = result.priority
        issue.ai_classified_at = _now()
        if result.category_id:
            issue.ai_category_id = uuid.UUID(result.category_id)

        # The reporter's explicit choice always wins over the model's.
        if category_id is None and result.category_id:
            issue.category_id = uuid.UUID(result.category_id)
        if priority is None:
            issue.priority = result.priority

        db.add(AIInvocation(
            organization_id=org_id, task="classify_issue", model=result.model,
            entity_type="issue", entity_id=issue.id, confidence=result.confidence,
            latency_ms=result.latency_ms, input_tokens=result.input_tokens,
            output_tokens=result.output_tokens, used_fallback=result.used_fallback,
        ))

    # ---- Department routing ----
    if issue.category_id:
        cat = await db.scalar(select(IssueCategory).where(IssueCategory.id == issue.category_id))
        if cat:
            issue.department_id = cat.department_id
            issue.sla_due_at = _now() + timedelta(minutes=cat.sla_resolve_mins)

    db.add(IssueEvent(
        issue_id=issue.id, from_status=None, to_status=IssueStatus.REPORTED,
        actor_id=reporter.id, created_at=_now(),
        note="Reported" + (f" — auto-classified as {issue.ai_model}" if run_ai else ""),
        meta={"ai_confidence": float(issue.ai_confidence) if issue.ai_confidence else None},
    ))

    # ---- Duplicate detection ----
    phash = next((a.get("phash") for a in (attachments or []) if a.get("phash")), None)
    candidates = await find_duplicate_candidates(db, issue, phash)
    for c in candidates:
        db.add(IssueDuplicateCandidate(
            issue_id=issue.id, candidate_id=uuid.UUID(c.issue_id),
            score=c.score, signals=c.signals,
        ))

    # ---- Pin onto the digital twin ----
    await sync_asset_to_issue_status(db, asset_id, IssueStatus.REPORTED.value,
                                     issue_id=issue.id, actor_id=reporter.id)
    await record_event(
        db, campus_id=campus_id, kind=TwinEventKind.ISSUE_CREATED,
        entity_type="issue", entity_id=issue.id, room_id=room_id, actor_id=reporter.id,
        payload={
            "reference": issue.reference, "title": title,
            "priority": issue.priority.value, "asset_id": str(asset_id) if asset_id else None,
        },
    )

    # ---- Notify the owning department ----
    recipients = list(await notify_svc.department_members(db, issue.department_id))
    if not recipients:
        recipients = list(await notify_svc.managers_of(db, org_id))
    await notify_svc.notify(
        db, recipients,
        title=f"New {issue.priority.value} priority issue: {title}",
        body=f"{issue.reference} reported at {location_note or 'campus'}",
        link=f"/issues/{issue.id}", kind="issue",
        entity_type="issue", entity_id=issue.id,
    )

    return issue, candidates


async def transition_issue(
    db: AsyncSession,
    issue: Issue,
    target: IssueStatus,
    actor: User,
    note: Optional[str] = None,
) -> Issue:
    """Apply a state change, enforcing the state machine and syncing the twin."""
    if issue.status == target:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Issue is already {target.value}")
    if not can_transition(issue.status, target, ISSUE_TRANSITIONS):
        allowed = sorted(s.value for s in ISSUE_TRANSITIONS.get(issue.status, set()))
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot move from {issue.status.value} to {target.value}. "
            f"Allowed: {', '.join(allowed) if allowed else 'none (terminal state)'}",
        )

    previous = issue.status
    issue.status = target
    now = _now()

    if target in {IssueStatus.ASSIGNED, IssueStatus.IN_PROGRESS} and issue.responded_at is None:
        issue.responded_at = now
    if target == IssueStatus.RESOLVED:
        issue.resolved_at = now
        if issue.sla_due_at and now > issue.sla_due_at:
            issue.sla_breached = True
    if target == IssueStatus.CLOSED:
        issue.closed_at = now

    db.add(IssueEvent(
        issue_id=issue.id, from_status=previous, to_status=target,
        actor_id=actor.id, note=note, created_at=now,
    ))

    await sync_asset_to_issue_status(db, issue.asset_id, target.value,
                                     issue_id=issue.id, actor_id=actor.id)
    await record_event(
        db, campus_id=issue.campus_id, kind=TwinEventKind.ISSUE_STATUS_CHANGED,
        entity_type="issue", entity_id=issue.id, room_id=issue.room_id, actor_id=actor.id,
        payload={"reference": issue.reference, "from": previous.value, "to": target.value},
    )

    # Keep the reporter informed unless they made the change themselves.
    if issue.reported_by != actor.id:
        await notify_svc.notify(
            db, [issue.reported_by],
            title=f"{issue.reference} is now {target.value.replace('_', ' ')}",
            body=note or f"Your report '{issue.title}' was updated.",
            link=f"/issues/{issue.id}", kind="issue_update",
            entity_type="issue", entity_id=issue.id,
        )

    return issue


async def mark_duplicate(
    db: AsyncSession, issue: Issue, master_id: uuid.UUID, actor: User
) -> Issue:
    """Fold an issue into an existing one, carrying its upvote across."""
    if master_id == issue.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An issue cannot duplicate itself")

    master = await db.scalar(select(Issue).where(Issue.id == master_id))
    if master is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Master issue not found")
    if master.duplicate_of is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{master.reference} is itself marked as a duplicate; link to the original instead",
        )

    issue.duplicate_of = master_id
    issue.status = IssueStatus.DUPLICATE
    master.upvote_count += 1

    db.add(IssueEvent(
        issue_id=issue.id, to_status=IssueStatus.DUPLICATE, actor_id=actor.id,
        note=f"Merged into {master.reference}", created_at=_now(),
        meta={"master_id": str(master_id), "master_reference": master.reference},
    ))
    await sync_asset_to_issue_status(db, issue.asset_id, IssueStatus.DUPLICATE.value,
                                     issue_id=issue.id, actor_id=actor.id)
    return issue
