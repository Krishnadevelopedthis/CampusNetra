"""Inspection endpoints: templates, scheduling, checklist submission."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, Paging, RequireManager, RequireStaff
from app.core.enums import InspectionStatus, UserRole
from app.models.identity import User
from app.models.spatial import Asset, Room
from app.models.work import (
    Inspection, InspectionResult, InspectionTemplate, InspectionTemplateItem,
)
from app.schemas.common import Message, Page, UserBrief
from app.schemas.work import (
    InspectionOut, InspectionSchedule, InspectionSubmit, InspectionTemplateItemOut,
    InspectionTemplateOut,
)
from app.services import inspections as svc

router = APIRouter(prefix="/inspections", tags=["Inspections"])

ACTIVE = [InspectionStatus.SCHEDULED, InspectionStatus.IN_PROGRESS, InspectionStatus.OVERDUE]


async def _to_out(db, i: Inspection, *, with_items: bool = False) -> InspectionOut:
    template = await db.scalar(
        select(InspectionTemplate).where(InspectionTemplate.id == i.template_id)
    ) if i.template_id else None
    room = await db.scalar(select(Room).where(Room.id == i.room_id)) if i.room_id else None
    asset = await db.scalar(select(Asset).where(Asset.id == i.asset_id)) if i.asset_id else None
    assignee = await db.scalar(select(User).where(User.id == i.assigned_to)) if i.assigned_to else None

    items = []
    if with_items and i.template_id:
        rows = (await db.scalars(
            select(InspectionTemplateItem)
            .where(InspectionTemplateItem.template_id == i.template_id)
            .order_by(InspectionTemplateItem.position)
        )).all()
        items = [InspectionTemplateItemOut.model_validate(r) for r in rows]

    results = (await db.scalars(
        select(InspectionResult).where(InspectionResult.inspection_id == i.id)
    )).all()

    raised = []
    for r in results:
        if r.raised_issue_id:
            from app.models.issues import Issue
            issue = await db.scalar(select(Issue).where(Issue.id == r.raised_issue_id))
            if issue:
                raised.append({"id": str(issue.id), "reference": issue.reference,
                               "title": issue.title, "status": issue.status.value})

    return InspectionOut(
        id=i.id, reference=i.reference,
        template_name=template.name if template else None,
        status=i.status,
        room_name=room.name if room else None,
        asset_tag=asset.tag if asset else None,
        assignee=UserBrief.model_validate(assignee) if assignee else None,
        scheduled_for=i.scheduled_for, submitted_at=i.submitted_at,
        score=float(i.score) if i.score is not None else None,
        notes=i.notes,
        is_overdue=i.status == InspectionStatus.OVERDUE,
        items=items,
        results=[
            {"id": str(r.id), "prompt": r.prompt, "result": r.result.value,
             "note": r.note, "photo_url": r.photo_url,
             "raised_issue_id": str(r.raised_issue_id) if r.raised_issue_id else None}
            for r in results
        ],
        raised_issues=raised,
    )


@router.get("/templates", response_model=list[InspectionTemplateOut])
async def list_templates(user: CurrentUser, db: DB):
    rows = (await db.scalars(
        select(InspectionTemplate)
        .options(selectinload(InspectionTemplate.items))
        .where(InspectionTemplate.organization_id == user.organization_id,
               InspectionTemplate.is_active.is_(True))
        .order_by(InspectionTemplate.name)
    )).all()
    return [InspectionTemplateOut.model_validate(t) for t in rows]


@router.get("/dashboard", response_model=dict)
async def dashboard(user: RequireStaff, db: DB):
    org = user.organization_id
    await svc.mark_overdue(db, org)

    async def count(*conditions) -> int:
        return await db.scalar(
            select(func.count()).select_from(Inspection)
            .where(Inspection.organization_id == org, *conditions)) or 0

    avg_score = await db.scalar(
        select(func.avg(Inspection.score)).where(
            Inspection.organization_id == org, Inspection.score.isnot(None)))

    upcoming = (await db.scalars(
        select(Inspection).where(
            Inspection.organization_id == org, Inspection.status.in_(ACTIVE))
        .order_by(Inspection.scheduled_for.asc()).limit(8)
    )).all()

    return {
        "totals": {
            "scheduled": await count(Inspection.status == InspectionStatus.SCHEDULED),
            "overdue": await count(Inspection.status == InspectionStatus.OVERDUE),
            "submitted": await count(Inspection.status == InspectionStatus.SUBMITTED),
            "average_score": round(float(avg_score), 1) if avg_score else None,
        },
        "upcoming": [(await _to_out(db, i)).model_dump(mode="json") for i in upcoming],
    }


@router.post("", response_model=InspectionOut, status_code=status.HTTP_201_CREATED)
async def schedule(payload: InspectionSchedule, user: RequireManager, db: DB):
    inspection = await svc.schedule_inspection(
        db, user,
        template_id=payload.template_id, scheduled_for=payload.scheduled_for,
        room_id=payload.room_id, asset_id=payload.asset_id,
        assigned_to=payload.assigned_to,
    )
    await db.flush()
    await db.refresh(inspection)
    return await _to_out(db, inspection, with_items=True)


@router.get("", response_model=Page[InspectionOut])
async def list_inspections(
    user: CurrentUser, db: DB, paging: Paging,
    mine: bool = Query(False),
    status_in: Optional[list[InspectionStatus]] = Query(None, alias="status"),
):
    await svc.mark_overdue(db, user.organization_id)

    query = select(Inspection).where(Inspection.organization_id == user.organization_id)
    # Technicians default to their own assignments.
    if mine or user.role == UserRole.TECHNICIAN:
        query = query.where(Inspection.assigned_to == user.id)
    if status_in:
        query = query.where(Inspection.status.in_(status_in))

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = (await db.scalars(
        query.order_by(Inspection.scheduled_for.asc())
        .offset(paging.offset).limit(paging.limit)
    )).all()

    return Page[InspectionOut](
        items=[await _to_out(db, i) for i in rows],
        total=total, page=paging.page, page_size=paging.page_size,
    )


@router.get("/{inspection_id}", response_model=InspectionOut)
async def get_inspection(inspection_id: uuid.UUID, user: CurrentUser, db: DB):
    i = await db.scalar(select(Inspection).where(Inspection.id == inspection_id))
    if i is None or i.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inspection not found")
    return await _to_out(db, i, with_items=True)


@router.post("/{inspection_id}/start", response_model=InspectionOut)
async def start(inspection_id: uuid.UUID, user: RequireStaff, db: DB):
    i = await db.scalar(select(Inspection).where(Inspection.id == inspection_id))
    if i is None or i.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inspection not found")
    if i.status not in (InspectionStatus.SCHEDULED, InspectionStatus.OVERDUE):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {i.status.value}")

    i.status = InspectionStatus.IN_PROGRESS
    if i.assigned_to is None:
        i.assigned_to = user.id
    await db.flush()
    return await _to_out(db, i, with_items=True)


@router.post("/{inspection_id}/submit", response_model=dict)
async def submit(
    inspection_id: uuid.UUID, payload: InspectionSubmit, user: RequireStaff, db: DB
):
    """Submit the checklist. Failed critical items raise issues automatically."""
    i = await db.scalar(select(Inspection).where(Inspection.id == inspection_id))
    if i is None or i.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inspection not found")

    inspection, raised = await svc.submit_inspection(
        db, i, user, [r.model_dump() for r in payload.results], payload.notes
    )
    await db.flush()
    await db.refresh(inspection)

    out = await _to_out(db, inspection, with_items=True)
    message = f"{inspection.reference} submitted."
    if raised:
        refs = ", ".join(x.reference for x in raised)
        message += (f" {len(raised)} critical failure"
                    f"{'s' if len(raised) > 1 else ''} escalated: {refs}.")

    return {"inspection": out.model_dump(mode="json"), "message": message,
            "raised_issues": [{"id": str(x.id), "reference": x.reference} for x in raised]}
