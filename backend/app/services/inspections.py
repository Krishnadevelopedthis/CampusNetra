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
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    AssetState, ChecklistResult, InspectionStatus, Priority, TwinEventKind, UserRole,
)
from app.models.identity import User
from app.models.issues import Issue, IssueCategory, IssueEvent
from app.models.spatial import Asset, Room
from app.models.work import (
    Inspection, InspectionResult, InspectionTemplate, InspectionTemplateItem,
)
from app.services import notifications as notify_svc
from app.services.references import next_public_id
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
    category_id: Optional[uuid.UUID] = None,
    slice_category_id: Optional[uuid.UUID] = None,
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

    if assigned_to is None:
        assigned_to = await _technician_for(db, actor.organization_id, category_id, asset_id, template)

    inspection = Inspection(
        reference=await next_public_id(db, Inspection, "INS"),
        template_id=template.id,
        organization_id=actor.organization_id,
        room_id=room_id,
        asset_id=asset_id,
        assigned_to=assigned_to,
        scheduled_for=scheduled_for,
        status=InspectionStatus.SCHEDULED,
        issue_category_id=slice_category_id,
    )
    db.add(inspection)
    await db.flush()

    if assigned_to:
        room_name = ""
        if room_id:
            room_name = await db.scalar(select(Room.name).where(Room.id == room_id)) or ""
        await notify_svc.notify(
            db, [assigned_to],
            title=f"Inspection scheduled: {template.name}",
            body=f"{inspection.reference} due {scheduled_for.strftime('%d %b %Y, %H:%M')}",
            link=f"/inspections/{inspection.id}", kind="inspection",
            entity_type="inspection", entity_id=inspection.id,
            code="inspection.due",
            context={
                "reference": inspection.reference, "template": template.name,
                "room": room_name,
                "due": scheduled_for.strftime("%d %b %Y, %H:%M"),
            },
        )
    return inspection


async def schedule_inspections(
    db: AsyncSession, actor: User, *, template_id: uuid.UUID, scheduled_for: datetime,
    room_id: Optional[uuid.UUID] = None, asset_id: Optional[uuid.UUID] = None,
    assigned_to: Optional[uuid.UUID] = None, category_id: Optional[uuid.UUID] = None,
) -> list[Inspection]:
    """Schedule a checklist, split by category.

    Each check belongs to a category (its own, else the checklist's). A
    checklist covering several categories becomes one inspection per category,
    each holding only that category's checks and assigned to a technician who
    services it. Choosing a technician by hand keeps it as one inspection with
    every check; choosing one category schedules just that slice.
    """
    template = await db.scalar(select(InspectionTemplate).where(
        InspectionTemplate.id == template_id, InspectionTemplate.organization_id == actor.organization_id))
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inspection template not found")
    items = (await db.scalars(select(InspectionTemplateItem).where(
        InspectionTemplateItem.template_id == template.id))).all()
    slices = sorted({i.issue_category_id or template.issue_category_id for i in items},
                    key=lambda c: (c is None, str(c)))

    common = dict(template_id=template_id, scheduled_for=scheduled_for, room_id=room_id, asset_id=asset_id)
    if assigned_to or len(slices) <= 1:
        only = category_id or (slices[0] if slices else None)
        return [await schedule_inspection(db, actor, **common, assigned_to=assigned_to,
                                          category_id=only, slice_category_id=None)]
    if category_id:
        targets = [category_id] if category_id in slices else slices
    else:
        targets = slices
    return [
        await schedule_inspection(db, actor, **common, category_id=cat, slice_category_id=cat)
        for cat in targets
    ]


def item_in_slice(item, template, slice_category_id) -> bool:
    """Does a checklist item belong to this inspection's category slice?"""
    if slice_category_id is None:
        return True
    return (item.issue_category_id or template.issue_category_id) == slice_category_id


async def _asset_in_scope(db, inspection, asset_id) -> Optional[uuid.UUID]:
    """An asset named on an answer must be the inspected asset or sit in the inspected room."""
    if not asset_id:
        return None
    asset_id = uuid.UUID(str(asset_id))
    if asset_id == inspection.asset_id:
        return asset_id
    room = await db.scalar(select(Asset.room_id).where(Asset.id == asset_id))
    if room is None or room != inspection.room_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That asset is not in the inspected room.")
    return asset_id


async def _technician_for(db, org_id, category_id, asset_id, template) -> Optional[uuid.UUID]:
    """Who should carry out an inspection: the least busy technician who
    services its category. The category is the one chosen, else the inspected
    asset's, else the template's. None when nobody services it."""
    from app.services.issues import issue_category_for_asset
    from app.services.work_orders import suggest_technician

    code = None
    # A category chosen when scheduling wins; then the checklist's own.
    if category_id is None and template.issue_category_id:
        category_id = template.issue_category_id
    if category_id:
        code = await db.scalar(select(IssueCategory.code).where(
            IssueCategory.id == category_id, IssueCategory.organization_id == org_id))
    if code is None and asset_id:
        cat = await issue_category_for_asset(db, org_id, asset_id)
        code = cat.code if cat else None
    if code is None and template.category_id:
        from app.models.spatial import AssetCategory
        code = await db.scalar(select(AssetCategory.code).where(AssetCategory.id == template.category_id))
    if code is None:
        return None
    tech = await suggest_technician(db, org_id, None, category_code=code)
    return tech.id if tech else None


async def _raise_issue_from_failure(
    db: AsyncSession,
    inspection: Inspection,
    submitter: User,
    prompt: str,
    note: Optional[str],
    asset_id: Optional[uuid.UUID] = None,
) -> Optional[Issue]:
    """Turn a failed critical check into a live, routed complaint."""
    room = await db.scalar(select(Room).where(Room.id == inspection.room_id)) if inspection.room_id else None
    campus_id = await campus_id_for_room(db, inspection.room_id) if inspection.room_id else None
    if campus_id is None:
        # Without a spatial anchor the issue cannot be pinned to the twin;
        # the failure is still recorded on the inspection itself.
        return None

    # Route the failure like any other complaint: by the inspected asset if
    # there is one, else by what the failed check is about ("exposed wiring"
    # is Electrical), and only then to Civil/Structural, which owns general
    # building safety. Category codes differ in case between installs.
    from app.ai.classifier import classify_heuristic
    from app.services.issues import issue_category_for_asset, load_categories

    category = None
    if inspection.issue_category_id:
        category = await db.scalar(select(IssueCategory).where(IssueCategory.id == inspection.issue_category_id))
    if category is None and inspection.asset_id:
        category = await issue_category_for_asset(db, inspection.organization_id, inspection.asset_id)
    if category is None:
        guess = classify_heuristic(prompt, f"{prompt} {note or ''}",
                                   await load_categories(db, inspection.organization_id))
        if guess.category_id:
            category = await db.scalar(select(IssueCategory).where(IssueCategory.id == guess.category_id))
    if category is None:
        category = await db.scalar(
            select(IssueCategory).where(
                IssueCategory.organization_id == inspection.organization_id,
                func.lower(IssueCategory.code) == "civil",
            )
        )

    issue = Issue(
        reference=await next_public_id(db, Issue, "CMP"),
        organization_id=inspection.organization_id,
        campus_id=campus_id,
        title=f"Inspection failure: {prompt[:120]}",
        description=(
            f"Raised automatically from inspection {inspection.reference}.\n\n"
            f"Failed check: {prompt}\n"
            f"Inspector note: {note or '(none)'}"
        ),
        room_id=inspection.room_id,
        asset_id=asset_id or inspection.asset_id,
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
    if inspection.status != InspectionStatus.IN_PROGRESS:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Start the inspection before submitting it.")
    if submitter.role == UserRole.TECHNICIAN and inspection.assigned_to not in (None, submitter.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This inspection is assigned to someone else.")

    # Every check in this inspection must have an answer; nothing is assumed.
    if inspection.template_id:
        template = await db.scalar(select(InspectionTemplate).where(InspectionTemplate.id == inspection.template_id))
        items = (await db.scalars(select(InspectionTemplateItem).where(
            InspectionTemplateItem.template_id == inspection.template_id))).all()
        expected = {i.id for i in items if item_in_slice(i, template, inspection.issue_category_id)}
        answered = {uuid.UUID(str(r["item_id"])) for r in results if r.get("item_id") and r.get("result")}
        missing = len(expected - answered)
        if missing:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{missing} check{'s are' if missing > 1 else ' is'} still unanswered. "
                "Answer every check (Pass, Fail, Attention or N/A) before submitting.")
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
    attention: list[tuple] = []   # (check, note, asset_id) answered "Attention"
    scored = 0      # items that count toward the score (pass/fail, not N/A)
    passed = 0

    for entry in results:
        result = ChecklistResult(entry["result"])
        item_id = entry.get("item_id")

        # The asset the answer is about: the one named, else the inspected asset.
        about = await _asset_in_scope(db, inspection, entry.get("asset_id")) or inspection.asset_id
        row = InspectionResult(
            inspection_id=inspection.id,
            item_id=item_id,
            prompt=entry["prompt"],
            result=result,
            note=entry.get("note"),
            photo_url=entry.get("photo_url"),
            asset_id=about,
        )
        if result == ChecklistResult.NEEDS_ATTENTION:
            attention.append((entry["prompt"], entry.get("note"), about))

        if result != ChecklistResult.NA:
            scored += 1
            if result == ChecklistResult.PASS:
                passed += 1

        if result == ChecklistResult.FAIL and item_id and uuid.UUID(str(item_id)) in critical_ids:
            issue = await _raise_issue_from_failure(
                db, inspection, submitter, entry["prompt"], entry.get("note"), asset_id=about
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

    # "Attention": still working, but someone should look. The asset turns
    # Warning (so it shows under "Needs attention" in the Asset Registry and on
    # the map) and managers are told. No complaint is raised.
    flagged: set = set()
    for check, note, asset_id in attention:
        asset = await db.scalar(select(Asset).where(Asset.id == asset_id)) if asset_id else None
        if asset and asset.state == AssetState.HEALTHY and asset.id not in flagged:
            await set_asset_state(
                db, asset, AssetState.WARNING,
                reason=f"needs attention in inspection {inspection.reference}: {check}",
                actor_id=submitter.id,
            )
            flagged.add(asset.id)
    if attention:
        where = (await db.scalar(select(Room.name).where(Room.id == inspection.room_id))) if inspection.room_id else ""
        names = {a: n for a, n in (await db.execute(
            select(Asset.id, Asset.name).where(Asset.id.in_([a for *_, a in attention if a])))).all()} if any(a for *_, a in attention) else {}
        lines = [f"{names.get(a, 'Room')}: {c}" + (f" ({n})" if n else "") for c, n, a in attention]
        await notify_svc.notify(
            db, list(await notify_svc.managers_of(db, inspection.organization_id)),
            title=f"{len(attention)} item{'s' if len(attention) > 1 else ''} need attention"
                  + (f" in {where}" if where else ""),
            body=f"{inspection.reference}: " + "; ".join(lines)[:400],
            link=f"/inspections/{inspection.id}", kind="inspection",
            entity_type="inspection", entity_id=inspection.id,
        )

    # A clean result clears a marker this asset was carrying for want of a check
    # (purple "inspection required", or an earlier "Attention" warning), as long
    # as nothing else - an open complaint, work order or IoT alert - holds it.
    if inspection.asset_id and not raised and inspection.asset_id not in flagged:
        asset = await db.scalar(select(Asset).where(Asset.id == inspection.asset_id))
        if asset and asset.state in (AssetState.INSPECTION_REQUIRED, AssetState.WARNING):
            from app.services.removal import settle_asset_state
            await settle_asset_state(db, asset.id, submitter, f"passed inspection {inspection.reference}")

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
