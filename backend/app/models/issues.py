"""Complaints, their attachments, timeline and duplicate candidates."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    ARRAY, BigInteger, Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer,
    Numeric, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import IssueStatus, Priority
from app.models.base import TimestampMixin, UpdatedMixin, uuid_pk
from app.models.spatial import priority_enum

issue_status_enum = SAEnum(IssueStatus, name="issue_status", create_type=False, values_callable=lambda e: [m.value for m in e])


class IssueCategory(Base):
    __tablename__ = "issue_categories"
    __table_args__ = (UniqueConstraint("organization_id", "code"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(Text)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL")
    )
    default_priority: Mapped[Priority] = mapped_column(priority_enum, default=Priority.MEDIUM, nullable=False)
    # Fallback classifier vocabulary — also seeds the LLM prompt.
    keywords: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    sla_response_mins: Mapped[int] = mapped_column(Integer, default=240, nullable=False)
    sla_resolve_mins: Mapped[int] = mapped_column(Integer, default=1440, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Issue(UpdatedMixin, Base):
    __tablename__ = "issues"

    id: Mapped[uuid.UUID] = uuid_pk()
    reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    campus_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False
    )

    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Spatial anchor — this is what pins the complaint onto the digital twin.
    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("buildings.id", ondelete="SET NULL"))
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("floors.id", ondelete="SET NULL"))
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"))
    asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"))
    location_note: Mapped[Optional[str]] = mapped_column(Text)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7))

    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("issue_categories.id", ondelete="SET NULL"))
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"))
    priority: Mapped[Priority] = mapped_column(priority_enum, default=Priority.MEDIUM, nullable=False)
    status: Mapped[IssueStatus] = mapped_column(issue_status_enum, default=IssueStatus.REPORTED, nullable=False)

    reported_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # --- AI classification trace ---
    ai_category_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("issue_categories.id", ondelete="SET NULL"))
    ai_confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    ai_priority: Mapped[Optional[Priority]] = mapped_column(priority_enum)
    ai_reasoning: Mapped[Optional[str]] = mapped_column(Text)
    ai_model: Mapped[Optional[str]] = mapped_column(Text)
    ai_classified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    was_reclassified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    duplicate_of: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("issues.id", ondelete="SET NULL"))
    duplicate_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))

    sla_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    sla_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    upvote_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    attachments: Mapped[list["IssueAttachment"]] = relationship(
        back_populates="issue", cascade="all, delete-orphan"
    )
    events: Mapped[list["IssueEvent"]] = relationship(
        back_populates="issue", cascade="all, delete-orphan", order_by="IssueEvent.created_at"
    )

    @property
    def is_open(self) -> bool:
        return self.status not in {
            IssueStatus.CLOSED, IssueStatus.REJECTED, IssueStatus.DUPLICATE
        }


class IssueAttachment(TimestampMixin, Base):
    __tablename__ = "issue_attachments"

    id: Mapped[uuid.UUID] = uuid_pk()
    issue_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    thumb_url: Mapped[Optional[str]] = mapped_column(Text)
    filename: Mapped[Optional[str]] = mapped_column(Text)
    mime_type: Mapped[Optional[str]] = mapped_column(Text)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    purpose: Mapped[str] = mapped_column(Text, default="report", nullable=False)
    phash: Mapped[Optional[str]] = mapped_column(Text)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    issue: Mapped["Issue"] = relationship(back_populates="attachments")


class IssueEvent(Base):
    """One row per state change — renders the Issue Timeline."""
    __tablename__ = "issue_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    issue_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[Optional[IssueStatus]] = mapped_column(issue_status_enum)
    to_status: Mapped[Optional[IssueStatus]] = mapped_column(issue_status_enum)
    note: Mapped[Optional[str]] = mapped_column(Text)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    issue: Mapped["Issue"] = relationship(back_populates="events")


class IssueUpvote(Base):
    """Lets others confirm the same problem instead of filing a duplicate."""
    __tablename__ = "issue_upvotes"

    issue_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class IssueDuplicateCandidate(TimestampMixin, Base):
    __tablename__ = "issue_duplicate_candidates"
    __table_args__ = (UniqueConstraint("issue_id", "candidate_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    issue_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    # Per-signal breakdown so a reviewer can see *why* it was flagged.
    signals: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    resolution: Mapped[str] = mapped_column(Text, default="pending")
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
