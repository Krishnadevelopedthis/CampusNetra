"""Lost & Found ledger, AI match suggestions and ownership claims."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    ARRAY, Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, Integer,
    Numeric, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import ClaimStatus, LFKind, LFStatus, MatchStatus
from app.models.base import TimestampMixin, UpdatedMixin, uuid_pk

lf_kind_enum = SAEnum(LFKind, name="lf_kind", create_type=False, values_callable=lambda e: [m.value for m in e])
lf_status_enum = SAEnum(LFStatus, name="lf_status", create_type=False, values_callable=lambda e: [m.value for m in e])
claim_status_enum = SAEnum(ClaimStatus, name="claim_status", create_type=False, values_callable=lambda e: [m.value for m in e])
match_status_enum = SAEnum(MatchStatus, name="match_status", create_type=False, values_callable=lambda e: [m.value for m in e])


class LFCategory(Base):
    __tablename__ = "lf_categories"
    __table_args__ = (UniqueConstraint("organization_id", "code"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(Text)
    retention_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)


class LFItem(UpdatedMixin, Base):
    """Both sides of the ledger live here; `kind` separates lost from found.

    Keeping them in one table makes the matcher a straight self-join.
    """
    __tablename__ = "lf_items"

    id: Mapped[uuid.UUID] = uuid_pk()
    reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    campus_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("campuses.id", ondelete="SET NULL")
    )
    kind: Mapped[LFKind] = mapped_column(lf_kind_enum, nullable=False)
    status: Mapped[LFStatus] = mapped_column(lf_status_enum, default=LFStatus.OPEN, nullable=False)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lf_categories.id", ondelete="SET NULL")
    )
    colour: Mapped[Optional[str]] = mapped_column(Text)
    brand: Mapped[Optional[str]] = mapped_column(Text)
    # Free-text detail that only the true owner would know — used at claim time.
    distinguishing_marks: Mapped[Optional[str]] = mapped_column(Text)

    building_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("buildings.id", ondelete="SET NULL"))
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"))
    location_note: Mapped[Optional[str]] = mapped_column(Text)
    zone_code: Mapped[Optional[str]] = mapped_column(Text)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    reported_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    contact_pref: Mapped[str] = mapped_column(Text, default="in_app", nullable=False)
    holding_location: Mapped[Optional[str]] = mapped_column(Text)

    image_phash: Mapped[Optional[str]] = mapped_column(Text)
    image_embedding: Mapped[Optional[list[float]]] = mapped_column(ARRAY(Float))
    ai_tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)

    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    attachments: Mapped[list["LFAttachment"]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )

    @property
    def is_open(self) -> bool:
        return self.status in {LFStatus.OPEN, LFStatus.MATCHED, LFStatus.CLAIM_PENDING}


class LFAttachment(TimestampMixin, Base):
    __tablename__ = "lf_attachments"

    id: Mapped[uuid.UUID] = uuid_pk()
    item_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lf_items.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    thumb_url: Mapped[Optional[str]] = mapped_column(Text)
    filename: Mapped[Optional[str]] = mapped_column(Text)
    phash: Mapped[Optional[str]] = mapped_column(Text)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    item: Mapped["LFItem"] = relationship(back_populates="attachments")


class LFMatch(TimestampMixin, Base):
    """One row per plausible (lost, found) pair, with the per-signal breakdown
    the AI Match Analysis panel renders as bars."""
    __tablename__ = "lf_matches"
    __table_args__ = (UniqueConstraint("lost_item_id", "found_item_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    lost_item_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lf_items.id", ondelete="CASCADE"), nullable=False
    )
    found_item_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lf_items.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    image_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    description_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    location_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    category_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    time_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    reasoning: Mapped[Optional[str]] = mapped_column(Text)
    ai_model: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[MatchStatus] = mapped_column(match_status_enum, default=MatchStatus.SUGGESTED, nullable=False)
    notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    lost_item: Mapped["LFItem"] = relationship(foreign_keys=[lost_item_id])
    found_item: Mapped["LFItem"] = relationship(foreign_keys=[found_item_id])

    @property
    def confidence_band(self) -> str:
        """Drives the badge wording on the match panel."""
        s = float(self.score)
        if s >= 0.85:
            return "high"
        if s >= 0.65:
            return "medium"
        return "low"


class LFClaim(TimestampMixin, Base):
    __tablename__ = "lf_claims"

    id: Mapped[uuid.UUID] = uuid_pk()
    reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lf_items.id", ondelete="CASCADE"), nullable=False
    )
    match_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lf_matches.id", ondelete="SET NULL")
    )
    claimant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[ClaimStatus] = mapped_column(claim_status_enum, default=ClaimStatus.SUBMITTED, nullable=False)
    proof_note: Mapped[Optional[str]] = mapped_column(Text)
    proof_urls: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    verified_by: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text)
    collected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    handover_proof_url: Mapped[Optional[str]] = mapped_column(Text)

    item: Mapped["LFItem"] = relationship()
