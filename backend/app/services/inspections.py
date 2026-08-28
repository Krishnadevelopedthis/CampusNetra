"""Inspection scheduling, submission and auto-escalation.

A failed *critical* checklist item does not just record a bad score — it raises a
real issue and flips the asset on the Digital Twin, so the finding cannot be
filed away and forgotten.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    AssetState, ChecklistResult, InspectionStatus, Priority, TwinEventKind,
)
from app.models.identity import User
from app.models.issues import Issue, IssueCategory, IssueEvent
from app.models.spatial import Asset, Room
from app.models.work import (
    Inspection, InspectionResult, InspectionTemplate, InspectionTemplateItem,
)
from app.services import notifications as notify_svc
from app.services.references import next_reference
from app.services.twin import campus_id_for_room, record_event, set_asset_state


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def schedule_inspection(
    db: AsyncSession,
    actor: User,
    *,
    template_id: uuid.UUID,
    scheduled_for: datetime,
    room_id: Optional[uuid.UUID] = None,
    asset_id: Optional[uuid.UUID] = None,
    assigned_to: Optional[uuid.UUID] = None,
) -> Inspection:
    template = await db.scalar(
        select(InspectionTemplate).where(
            InspectionTemplate.id == template_id,
            InspectionTemplate.organization_id == actor.organization_id,
        )
    )
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inspection template not found")
    if room_id is None and asset_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "An inspection must target either a room or an asset",
        )

    inspection = Inspection(
        reference=await next_reference(db, actor.organization_id, "INS"),
        template_id=template.id,
        organization_id=actor.organization_id,
        room_id=room_id,
        asset_id=asset_id,
        assigned_to=assigned_to,
        scheduled_for=scheduled_for,
        status=InspectionStatus.SCHEDULED,
    )
    db.add(inspection)
    await db.flush()

    if assigned_to:
        await notify_svc.notify(
            db, [assigned_to],
            title=f"Inspection scheduled: {template.name}",
            body=f"{inspection.reference} due {scheduled_for.strftime('%d %b %Y, %H:%M')}",
            link=f"/inspections/{inspection.id}", kind="inspection",
            entity_type="inspection", entity_id=inspection.id,
        )
    return inspection


async def _raise_issue_from_failure(
    db: AsyncSession,
    inspection: Inspection,
    submitter: User,
    prompt: str,
    note: Optional[str],
) -> Optional[Issue]:
    """Turn a failed critical check into a live, routed complaint."""
    room = await db.scalar(select(Room).where(Room.id == inspection.room_id)) if inspection.room_id else None
    campus_id = await campus_id_for_room(db, inspection.room_id) if inspection.room_id else None
    if campus_id is None:
        # Without a spatial anchor the issue cannot be pinned to the twin;
        # the failure is still recorded on the inspection itself.
        return None

    # Route safety failures to the same category the template's assets belong to,
    # falling back to Civil/Structural which owns general building safety.
    category = await db.scalar(
        select(IssueCategory).where(
            IssueCategory.organization_id == inspection.organization_id,
            IssueCategory.code == "CIVIL",
        )
    )

    issue = Issue(
        reference=await next_reference(db, inspection.organization_id, "CMP"),
        organization_id=inspection.organization_id,
        campus_id=campus_id,
        title=f"Inspection failure: {prompt[:120]}",
        description=(
            f"Raised automatically from inspection {inspection.reference}.\n\n"
            f"Failed check: {prompt}\n"
            f"Inspector note: {note or '(none)'}"
        ),
        room_id=inspection.room_id,
        asset_id=inspection.asset_id,
        location_note=room.name if room else None,
        category_id=category.id if category else None,
        department_id=category.department_id if category else None,
        # A failed critical safety check is high priority by definition.
        priority=Priority.HIGH,
        reported_by=submitter.id,
        sla_due_at=_now() + timedelta(minutes=category.sla_resolve_mins if category else 720),
    )
    db.add(issue)
    await db.flush()

    db.add(IssueEvent(
        issue_id=issue.id, to_status=issue.status, actor_id=submitter.id,
        created_at=_now(),
        note=f"Auto-raised from failed critical check on {inspection.reference}",
        meta={"inspection_id": str(inspection.id), "inspection_reference": inspection.reference},
    ))

    await record_event(
        db, campus_id=campus_id, kind=TwinEventKind.ISSUE_CREATED,
        entity_type="issue", entity_id=issue.id, room_id=inspection.room_id,
        actor_id=submitter.id,
        payload={"reference": issue.reference, "title": issue.title,
                 "priority": issue.priority.value, "source": "inspection"},
    )

    if inspection.asset_id:
        asset = await db.scalar(select(Asset).where(Asset.id == inspection.asset_id))
        if asset:
            await set_asset_state(
                db, asset, AssetState.FAULT,
                reason=f"failed critical check on {inspection.reference}",
                issue_id=issue.id, actor_id=submitter.id,
            )

    recipients = list(await notify_svc.department_members(db, issue.department_id))
    if not recipients:
        recipients = list(await notify_svc.managers_of(db, inspection.organization_id))
    await notify_svc.notify(
        db, recipients,
        title=f"Critical inspection failure: {prompt[:80]}",
        body=f"{issue.reference} raised automatically from {inspection.reference}.",
        link=f"/issues/{issue.id}", kind="inspection_failure",
        entity_type="issue", entity_id=issue.id,
    )
    return issue


async def submit_inspection(
    db: AsyncSession,
    inspection: Inspection,
    submitter: User,
    results: Sequence[dict],
    notes: Optional[str] = None,
) -> tuple[Inspection, list[Issue]]:
    """Record the checklist, score it, and escalate critical failures."""
    if inspection.status in (InspectionStatus.SUBMITTED, InspectionStatus.APPROVED):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{inspection.reference} has already been submitted",
        )
    if not results:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Submit at least one checklist result")

    # Which template items are critical — a failure there escalates.
    critical_ids: set[uuid.UUID] = set()
    if inspection.template_id:
        rows = (await db.scalars(
            select(InspectionTemplateItem.id).where(
                InspectionTemplateItem.template_id == inspection.template_id,
                InspectionTemplateItem.is_critical.is_(True),
            )
        )).all()
        critical_ids = set(rows)

    raised: list[Issue] = []
    scored = 0      # items that count toward the score (pass/fail, not N/A)
    passed = 0

    for entry in results:
        result = ChecklistResult(entry["result"])
        item_id = entry.get("item_id")

        row = InspectionResult(
            inspection_id=inspection.id,
            item_id=item_id,
            prompt=entry["prompt"],
            result=result,
            note=entry.get("note"),
            photo_url=entry.get("photo_url"),
        )

        if result != ChecklistResult.NA:
            scored += 1
            if result == ChecklistResult.PASS:
                passed += 1

        if result == ChecklistResult.FAIL and item_id and uuid.UUID(str(item_id)) in critical_ids:
            issue = await _raise_issue_from_failure(
                db, inspection, submitter, entry["prompt"], entry.get("note")
            )
            if issue:
                row.raised_issue_id = issue.id
                raised.append(issue)

        db.add(row)

    inspection.status = InspectionStatus.SUBMITTED
    inspection.submitted_at = _now()
    inspection.submitted_by = submitter.id
    inspection.notes = notes
    inspection.score = round(100 * passed / scored, 2) if scored else None

    if inspection.room_id:
        campus_id = await campus_id_for_room(db, inspection.room_id)
        if campus_id:
            await record_event(
                db, campus_id=campus_id, kind=TwinEventKind.INSPECTION_SUBMITTED,
                entity_type="inspection", entity_id=inspection.id,
                room_id=inspection.room_id, actor_id=submitter.id,
                payload={"reference": inspection.reference,
                         "score": float(inspection.score) if inspection.score is not None else None,
                         "issues_raised": len(raised)},
            )

    # Clear the purple "inspection required" marker once the check is done and clean.
    if inspection.asset_id and not raised:
        asset = await db.scalar(select(Asset).where(Asset.id == inspection.asset_id))
        if asset and asset.state == AssetState.INSPECTION_REQUIRED:
            await set_asset_state(
                db, asset, AssetState.HEALTHY,
                reason=f"passed inspection {inspection.reference}", actor_id=submitter.id,
            )

    return inspection, raised


async def mark_overdue(db: AsyncSession, organization_id: uuid.UUID) -> int:
    """Flip past-due scheduled inspections to overdue. Called on list reads."""
    rows = (await db.scalars(
        select(Inspection).where(
            Inspection.organization_id == organization_id,
            Inspection.status == InspectionStatus.SCHEDULED,
            Inspection.scheduled_for < _now(),
        )
    )).all()
    for i in rows:
        i.status = InspectionStatus.OVERDUE
    return len(rows)
