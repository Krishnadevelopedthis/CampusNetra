"""Campus > Building > Floor > Room > Asset, plus the twin event store."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, Enum as SAEnum, ForeignKey, Integer,
    Numeric, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import AssetState, Priority, RoomKind, TwinEventKind
from app.models.base import TimestampMixin, UpdatedMixin, uuid_pk

asset_state_enum = SAEnum(AssetState, name="asset_state", create_type=False, values_callable=lambda e: [m.value for m in e])
room_kind_enum = SAEnum(RoomKind, name="room_kind", create_type=False, values_callable=lambda e: [m.value for m in e])
priority_enum = SAEnum(Priority, name="priority_level", create_type=False, values_callable=lambda e: [m.value for m in e])
twin_event_kind_enum = SAEnum(TwinEventKind, name="twin_event_kind", create_type=False, values_callable=lambda e: [m.value for m in e])


class Campus(TimestampMixin, Base):
    __tablename__ = "campuses"
    __table_args__ = (UniqueConstraint("organization_id", "code"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    buildings: Mapped[list["Building"]] = relationship(back_populates="campus", cascade="all, delete-orphan")


class Building(TimestampMixin, Base):
    __tablename__ = "buildings"
    __table_args__ = (UniqueConstraint("campus_id", "code"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    campus_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    floors_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Normalised 0..1 so the campus map scales to any viewport.
    map_x: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 5))
    map_y: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 5))
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7))

    campus: Mapped["Campus"] = relationship(back_populates="buildings")
    floors: Mapped[list["Floor"]] = relationship(
        back_populates="building", cascade="all, delete-orphan", order_by="Floor.level"
    )


class Floor(TimestampMixin, Base):
    __tablename__ = "floors"
    __table_args__ = (UniqueConstraint("building_id", "level"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    building_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    floor_plan_url: Mapped[Optional[str]] = mapped_column(Text)
    plan_width: Mapped[Optional[int]] = mapped_column(Integer)
    plan_height: Mapped[Optional[int]] = mapped_column(Integer)

    building: Mapped["Building"] = relationship(back_populates="floors")
    rooms: Mapped[list["Room"]] = relationship(
        back_populates="floor", cascade="all, delete-orphan", order_by="Room.code"
    )


class Room(TimestampMixin, Base):
    __tablename__ = "rooms"
    __table_args__ = (UniqueConstraint("floor_id", "code"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    floor_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("floors.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    zone_id: Mapped[Optional[str]] = mapped_column(Text)
    kind: Mapped[RoomKind] = mapped_column(room_kind_enum, default=RoomKind.CLASSROOM, nullable=False)
    capacity: Mapped[Optional[int]] = mapped_column(Integer)
    area_sqft: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    # Polygon outline drawn on the floor plan, normalised 0..1.
    boundary: Mapped[Optional[list]] = mapped_column(JSONB)

    floor: Mapped["Floor"] = relationship(back_populates="rooms")
    assets: Mapped[list["Asset"]] = relationship(back_populates="room")


class AssetCategory(Base):
    __tablename__ = "asset_categories"
    __table_args__ = (UniqueConstraint("organization_id", "code"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(Text)
    default_department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL")
    )
    default_priority: Mapped[Priority] = mapped_column(priority_enum, default=Priority.MEDIUM, nullable=False)

    assets: Mapped[list["Asset"]] = relationship(back_populates="category")


class Asset(UpdatedMixin, Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = uuid_pk()
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL")
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("asset_categories.id", ondelete="RESTRICT"), nullable=False
    )
    tag: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    manufacturer: Mapped[Optional[str]] = mapped_column(Text)
    model: Mapped[Optional[str]] = mapped_column(Text)
    serial_no: Mapped[Optional[str]] = mapped_column(Text)

    state: Mapped[AssetState] = mapped_column(asset_state_enum, default=AssetState.HEALTHY, nullable=False)
    pos_x: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 5))
    pos_y: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 5))

    purchase_date: Mapped[Optional[date]] = mapped_column(Date)
    warranty_expiry: Mapped[Optional[date]] = mapped_column(Date)
    cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    last_service_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    service_interval_days: Mapped[Optional[int]] = mapped_column(Integer)
    expected_life_months: Mapped[Optional[int]] = mapped_column(Integer)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    room: Mapped[Optional["Room"]] = relationship(back_populates="assets")
    category: Mapped["AssetCategory"] = relationship(back_populates="assets")


class AssetStateHistory(Base):
    __tablename__ = "asset_state_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    from_state: Mapped[Optional[AssetState]] = mapped_column(asset_state_enum)
    to_state: Mapped[AssetState] = mapped_column(asset_state_enum, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    issue_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True))
    work_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True))
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TwinEvent(Base):
    """Append-only log that Live State, Event Replay and Comparison all read from."""
    __tablename__ = "twin_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    campus_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[TwinEventKind] = mapped_column(twin_event_kind_enum, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL")
    )
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # Non-null only for events produced by a scenario run, so they can be filtered out.
    simulation_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
