"""Complaint request/response bodies."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.core.enums import IssueStatus, Priority
from app.schemas.common import ORMModel, UserBrief


class IssueCategoryOut(ORMModel):
    id: uuid.UUID
    name: str
    code: str
    icon: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    default_priority: Priority


class AttachmentIn(BaseModel):
    url: str
    thumb_url: Optional[str] = None
    filename: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    phash: Optional[str] = None
    purpose: str = "report"


class AttachmentOut(ORMModel):
    id: uuid.UUID
    url: str
    thumb_url: Optional[str] = None
    filename: Optional[str] = None
    purpose: str
    created_at: datetime


class IssueCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=5, max_length=4000)
    campus_id: uuid.UUID
    building_id: Optional[uuid.UUID] = None
    floor_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    asset_id: Optional[uuid.UUID] = None
    location_note: Optional[str] = Field(None, max_length=300)
    # Optional overrides — when omitted the AI classifier decides.
    category_id: Optional[uuid.UUID] = None
    priority: Optional[Priority] = None
    is_anonymous: bool = False
    attachments: list[AttachmentIn] = Field(default_factory=list)


class AIClassificationOut(BaseModel):
    category_id: Optional[uuid.UUID] = None
    category_name: Optional[str] = None
    confidence: Optional[float] = None
    priority: Optional[Priority] = None
    reasoning: Optional[str] = None
    model: Optional[str] = None
    classified_at: Optional[datetime] = None
    was_overridden: bool = False


class DuplicateCandidateOut(BaseModel):
    issue_id: uuid.UUID
    reference: str
    title: str
    score: float
    verdict: str
    signals: dict


class IssueEventOut(ORMModel):
    id: int
    from_status: Optional[IssueStatus] = None
    to_status: Optional[IssueStatus] = None
    note: Optional[str] = None
    actor: Optional[UserBrief] = None
    meta: dict = Field(default_factory=dict)
    created_at: datetime


class LocationOut(BaseModel):
    """Flattened breadcrumb: Bldg A / Floor 2 / Class 202 / P-101."""
    building_id: Optional[uuid.UUID] = None
    building_name: Optional[str] = None
    floor_id: Optional[uuid.UUID] = None
    floor_name: Optional[str] = None
    room_id: Optional[uuid.UUID] = None
    room_name: Optional[str] = None
    room_code: Optional[str] = None
    zone_id: Optional[str] = None
    asset_id: Optional[uuid.UUID] = None
    asset_tag: Optional[str] = None
    asset_name: Optional[str] = None
    note: Optional[str] = None

    @property
    def breadcrumb(self) -> str:
        parts = [self.building_name, self.floor_name, self.room_name, self.asset_tag]
        return " / ".join(p for p in parts if p)


class IssueListItem(BaseModel):
    id: uuid.UUID
    reference: str
    title: str
    status: IssueStatus
    priority: Priority
    category_name: Optional[str] = None
    category_icon: Optional[str] = None
    department_name: Optional[str] = None
    location_summary: Optional[str] = None
    reporter: Optional[UserBrief] = None
    assignee_name: Optional[str] = None
    work_order_reference: Optional[str] = None
    upvote_count: int = 0
    sla_due_at: Optional[datetime] = None
    sla_breached: bool = False
    # Negative once overdue; the UI renders it as "2h overdue".
    sla_minutes_remaining: Optional[int] = None
    attachment_count: int = 0
    created_at: datetime
    updated_at: datetime


class IssueDetail(IssueListItem):
    description: str
    is_anonymous: bool
    location: LocationOut
    ai: Optional[AIClassificationOut] = None
    duplicate_of: Optional[uuid.UUID] = None
    duplicate_of_reference: Optional[str] = None
    duplicate_candidates: list[DuplicateCandidateOut] = Field(default_factory=list)
    attachments: list[AttachmentOut] = Field(default_factory=list)
    timeline: list[IssueEventOut] = Field(default_factory=list)
    allowed_transitions: list[IssueStatus] = Field(default_factory=list)
    responded_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None


class IssueCreateResponse(BaseModel):
    issue: IssueDetail
    duplicate_candidates: list[DuplicateCandidateOut] = Field(default_factory=list)
    # Set when a near-certain duplicate exists, so the UI can offer "upvote instead".
    duplicate_warning: Optional[str] = None


class IssueTransition(BaseModel):
    status: IssueStatus
    note: Optional[str] = Field(None, max_length=1000)


class IssueReclassify(BaseModel):
    """Human override of the AI's decision — recorded as training signal."""
    category_id: uuid.UUID
    priority: Optional[Priority] = None
    reason: Optional[str] = None


class MarkDuplicateRequest(BaseModel):
    master_issue_id: uuid.UUID
    note: Optional[str] = None


class IssueAssignRequest(BaseModel):
    department_id: Optional[uuid.UUID] = None
    technician_id: Optional[uuid.UUID] = None
    note: Optional[str] = None
    create_work_order: bool = True
