"""Work orders, SLA policies, part requests and inspections."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    ARRAY, BigInteger, Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer,
    Numeric, Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import ChecklistResult, InspectionStatus, Priority, UserRole, WorkOrderStatus
from app.models.base import TimestampMixin, UpdatedMixin, uuid_pk
from app.models.identity import user_role_enum
from app.models.spatial import priority_enum

wo_status_enum = SAEnum(WorkOrderStatus, name="work_order_status", create_type=False, values_callable=lambda e: [m.value for m in e])
inspection_status_enum = SAEnum(InspectionStatus, name="inspection_status", create_type=False, values_callable=lambda e: [m.value for m in e])
checklist_result_enum = SAEnum(ChecklistResult, name="checklist_result", create_type=False, values_callable=lambda e: [m.value for m in e])


class SLAPolicy(TimestampMixin, Base):
    __tablename__ = "sla_policies"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[Priority] = mapped_column(priority_enum, nullable=False)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE")
    )
    response_mins: Mapped[int] = mapped_column(Integer, nullable=False)
    resolve_mins: Mapped[int] = mapped_column(Integer, nullable=False)
    escalate_after_mins: Mapped[Optional[int]] = mapped_column(Integer)
    escalate_to_role: Mapped[Optional[UserRole]] = mapped_column(user_role_enum)
    business_hours_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class WorkOrder(UpdatedMixin, Base):
    __tablename__ = "work_orders"

    id: Mapped[uuid.UUID] = uuid_pk()
    reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    issue_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("issues.id", ondelete="SET NULL")
    )

    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"))
    asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"))

    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"))
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    assigned_by: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    priority: Mapped[Priority] = mapped_column(priority_enum, default=Priority.MEDIUM, nullable=False)
    status: Mapped[WorkOrderStatus] = mapped_column(wo_status_enum, default=WorkOrderStatus.OPEN, nullable=False)

    scheduled_for: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    verified_by: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    sla_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sla_policies.id", ondelete="SET NULL"))
    sla_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    sla_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    estimated_mins: Mapped[Optional[int]] = mapped_column(Integer)
    actual_mins: Mapped[Optional[int]] = mapped_column(Integer)
    labour_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    parts_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    resolution_note: Mapped[Optional[str]] = mapped_column(Text)
    blocked_reason: Mapped[Optional[str]] = mapped_column(Text)
    is_predictive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    events: Mapped[list["WorkOrderEvent"]] = relationship(
        back_populates="work_order", cascade="all, delete-orphan", order_by="WorkOrderEvent.created_at"
    )
    comments: Mapped[list["WorkOrderComment"]] = relationship(
        back_populates="work_order", cascade="all, delete-orphan"
    )
    attachments: Mapped[list["WorkOrderAttachment"]] = relationship(
        back_populates="work_order", cascade="all, delete-orphan"
    )

    @property
    def total_cost(self) -> Decimal:
        return (self.labour_cost or 0) + (self.parts_cost or 0)


class WorkOrderEvent(Base):
    __tablename__ = "work_order_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    work_order_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[Optional[WorkOrderStatus]] = mapped_column(wo_status_enum)
    to_status: Mapped[Optional[WorkOrderStatus]] = mapped_column(wo_status_enum)
    note: Mapped[Optional[str]] = mapped_column(Text)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    work_order: Mapped["WorkOrder"] = relationship(back_populates="events")


class WorkOrderComment(TimestampMixin, Base):
    __tablename__ = "work_order_comments"

    id: Mapped[uuid.UUID] = uuid_pk()
    work_order_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Internal notes stay hidden from the person who reported the issue.
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    work_order: Mapped["WorkOrder"] = relationship(back_populates="comments")


class WorkOrderAttachment(TimestampMixin, Base):
    __tablename__ = "work_order_attachments"

    id: Mapped[uuid.UUID] = uuid_pk()
    work_order_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    thumb_url: Mapped[Optional[str]] = mapped_column(Text)
    filename: Mapped[Optional[str]] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(Text, nullable=False)  # before | after | part | document
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    work_order: Mapped["WorkOrder"] = relationship(back_populates="attachments")


class PartRequest(TimestampMixin, Base):
    __tablename__ = "part_requests"

    id: Mapped[uuid.UUID] = uuid_pk()
    work_order_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False
    )
    requested_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    item_name: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    justification: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="pending", nullable=False)
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    unit_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))


# ---------- Inspections ----------
class InspectionTemplate(TimestampMixin, Base):
    __tablename__ = "inspection_templates"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("asset_categories.id", ondelete="SET NULL")
    )
    frequency_days: Mapped[Optional[int]] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    items: Mapped[list["InspectionTemplateItem"]] = relationship(
        back_populates="template", cascade="all, delete-orphan", order_by="InspectionTemplateItem.position"
    )


class InspectionTemplateItem(Base):
    __tablename__ = "inspection_template_items"

    id: Mapped[uuid.UUID] = uuid_pk()
    template_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("inspection_templates.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    help_text: Mapped[Optional[str]] = mapped_column(Text)
    requires_photo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Failing a critical item auto-raises an issue.
    is_critical: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    template: Mapped["InspectionTemplate"] = relationship(back_populates="items")


class Inspection(TimestampMixin, Base):
    __tablename__ = "inspections"

    id: Mapped[uuid.UUID] = uuid_pk()
    reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("inspection_templates.id", ondelete="SET NULL")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"))
    asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"))
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[InspectionStatus] = mapped_column(inspection_status_enum, default=InspectionStatus.SCHEDULED, nullable=False)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    submitted_by: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    results: Mapped[list["InspectionResult"]] = relationship(
        back_populates="inspection", cascade="all, delete-orphan"
    )


class InspectionResult(Base):
    __tablename__ = "inspection_results"

    id: Mapped[uuid.UUID] = uuid_pk()
    inspection_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("inspections.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("inspection_template_items.id", ondelete="SET NULL")
    )
    # Snapshot of the prompt — the template may be edited after submission.
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[ChecklistResult] = mapped_column(checklist_result_enum, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    photo_url: Mapped[Optional[str]] = mapped_column(Text)
    raised_issue_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("issues.id", ondelete="SET NULL")
    )

    inspection: Mapped["Inspection"] = relationship(back_populates="results")
