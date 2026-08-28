"""Work order and inspection payloads."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.core.enums import ChecklistResult, InspectionStatus, Priority, WorkOrderStatus
from app.schemas.common import ORMModel, UserBrief


class WorkOrderCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=4000)
    issue_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    asset_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None
    priority: Priority = Priority.MEDIUM
    scheduled_for: Optional[datetime] = None
    estimated_mins: Optional[int] = Field(None, ge=1)


class WorkOrderAssign(BaseModel):
    technician_id: uuid.UUID
    note: Optional[str] = None
    scheduled_for: Optional[datetime] = None


class WorkOrderTransition(BaseModel):
    status: WorkOrderStatus
    note: Optional[str] = Field(None, max_length=2000)
    # Supplied when completing.
    resolution_note: Optional[str] = None
    actual_mins: Optional[int] = Field(None, ge=0)
    labour_cost: Optional[float] = Field(None, ge=0)
    parts_cost: Optional[float] = Field(None, ge=0)
    blocked_reason: Optional[str] = None


class WorkOrderCommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    is_internal: bool = False


class WorkOrderCommentOut(ORMModel):
    id: uuid.UUID
    body: str
    is_internal: bool
    author: Optional[UserBrief] = None
    created_at: datetime


class WOAttachmentIn(BaseModel):
    url: str
    thumb_url: Optional[str] = None
    filename: Optional[str] = None
    purpose: str = Field(pattern="^(before|after|part|document)$")


class WOAttachmentOut(ORMModel):
    id: uuid.UUID
    url: str
    thumb_url: Optional[str] = None
    filename: Optional[str] = None
    purpose: str
    created_at: datetime


class PartRequestIn(BaseModel):
    item_name: str = Field(min_length=1, max_length=200)
    quantity: int = Field(1, ge=1)
    justification: Optional[str] = None
    unit_cost: Optional[float] = Field(None, ge=0)


class PartRequestOut(ORMModel):
    id: uuid.UUID
    item_name: str
    quantity: int
    justification: Optional[str] = None
    status: str
    unit_cost: Optional[float] = None
    created_at: datetime


class WorkOrderListItem(BaseModel):
    id: uuid.UUID
    reference: str
    title: str
    status: WorkOrderStatus
    priority: Priority
    issue_reference: Optional[str] = None
    department_name: Optional[str] = None
    assignee: Optional[UserBrief] = None
    location_summary: Optional[str] = None
    asset_tag: Optional[str] = None
    scheduled_for: Optional[datetime] = None
    sla_due_at: Optional[datetime] = None
    sla_breached: bool = False
    sla_minutes_remaining: Optional[int] = None
    is_predictive: bool = False
    total_cost: float = 0
    created_at: datetime
    updated_at: datetime


class WorkOrderEventOut(BaseModel):
    id: int
    from_status: Optional[WorkOrderStatus] = None
    to_status: Optional[WorkOrderStatus] = None
    note: Optional[str] = None
    actor: Optional[UserBrief] = None
    created_at: datetime


class WorkOrderDetail(WorkOrderListItem):
    description: Optional[str] = None
    resolution_note: Optional[str] = None
    blocked_reason: Optional[str] = None
    estimated_mins: Optional[int] = None
    actual_mins: Optional[int] = None
    labour_cost: float = 0
    parts_cost: float = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    timeline: list[WorkOrderEventOut] = Field(default_factory=list)
    comments: list[WorkOrderCommentOut] = Field(default_factory=list)
    before_photos: list[WOAttachmentOut] = Field(default_factory=list)
    after_photos: list[WOAttachmentOut] = Field(default_factory=list)
    part_requests: list[PartRequestOut] = Field(default_factory=list)
    allowed_transitions: list[WorkOrderStatus] = Field(default_factory=list)


class WorkOrderBoard(BaseModel):
    """Kanban view: work orders bucketed by status."""
    columns: list[dict]
    total: int


# ---------- Inspections ----------
class InspectionTemplateItemOut(ORMModel):
    id: uuid.UUID
    position: int
    prompt: str
    help_text: Optional[str] = None
    requires_photo: bool
    is_critical: bool


class InspectionTemplateOut(ORMModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    frequency_days: Optional[int] = None
    items: list[InspectionTemplateItemOut] = Field(default_factory=list)


class InspectionSchedule(BaseModel):
    template_id: uuid.UUID
    room_id: Optional[uuid.UUID] = None
    asset_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None
    scheduled_for: datetime


class InspectionResultIn(BaseModel):
    item_id: Optional[uuid.UUID] = None
    prompt: str
    result: ChecklistResult
    note: Optional[str] = None
    photo_url: Optional[str] = None


class InspectionSubmit(BaseModel):
    results: list[InspectionResultIn]
    notes: Optional[str] = None


class InspectionOut(BaseModel):
    id: uuid.UUID
    reference: str
    template_name: Optional[str] = None
    status: InspectionStatus
    room_name: Optional[str] = None
    asset_tag: Optional[str] = None
    assignee: Optional[UserBrief] = None
    scheduled_for: datetime
    submitted_at: Optional[datetime] = None
    score: Optional[float] = None
    notes: Optional[str] = None
    is_overdue: bool = False
    items: list[InspectionTemplateItemOut] = Field(default_factory=list)
    results: list[dict] = Field(default_factory=list)
    # Issues auto-raised by failed critical checks.
    raised_issues: list[dict] = Field(default_factory=list)
