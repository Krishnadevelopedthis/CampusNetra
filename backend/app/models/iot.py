"""IoT health monitoring: ESP32 devices, their sensor -> asset mappings, and
the health events those readings produce.

Deliberately thin. The actual state machine (inspection scheduled ->
technician confirms/clears -> work order -> verified -> healthy) is the
existing Inspection/Issue/WorkOrder pipeline in app.services.inspections
and app.services.work_orders -- this module only has to get a validated
anomaly into that pipeline and keep an audit trail of the sensor side of
the story alongside it.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import HealthEventKind, HealthEventSeverity, HealthEventStatus, SensorType
from app.models.base import TimestampMixin, uuid_pk

# native_enum=False: stored as plain TEXT (matching the migration script,
# which creates a TEXT column -- there's no migration tool in this project
# to also emit a Postgres CREATE TYPE, unlike the older enums elsewhere in
# the codebase that do have native types from before that gap existed).
# create_constraint=False skips a CHECK constraint the migration doesn't
# add either; validation lives in the pydantic schemas at the API layer.
def _text_enum(enum_cls):
    return SAEnum(enum_cls, native_enum=False, create_constraint=False,
                 values_callable=lambda e: [m.value for m in e])


sensor_type_enum = _text_enum(SensorType)
health_event_kind_enum = _text_enum(HealthEventKind)
health_event_severity_enum = _text_enum(HealthEventSeverity)
health_event_status_enum = _text_enum(HealthEventStatus)


class IoTDevice(TimestampMixin, Base):
    """One physical ESP32. `device_id` is what the unit itself sends (and
    what the MQTT topic and the API key are scoped to) -- never the row's
    own uuid, since that's not something you can flash onto hardware before
    the row exists."""
    __tablename__ = "iot_devices"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL")
    )
    label: Mapped[Optional[str]] = mapped_column(Text)
    # Hashed the same way a password would be -- this is what authenticates
    # a telemetry POST as genuinely coming from this device, not just
    # whoever knows its device_id (which appears in the MQTT topic, so it
    # isn't itself a secret).
    api_key_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Room-level environment (DHT11 temperature_c/humidity_pct, LDR
    # ldr_value) from the most recent telemetry -- a display value per
    # spec #4 ("Show: Temperature: 27.4°C"), not itself a threshold/anomaly
    # signal the way ACS712 current readings are.
    last_environment: Mapped[Optional[dict]] = mapped_column(JSONB)

    sensors: Mapped[list["AssetSensorMapping"]] = relationship(back_populates="device")


class AssetSensorMapping(Base):
    """One sensor reading path: a device's sensor feeding one asset's
    health, with the thresholds that decide what "abnormal" means for that
    specific asset (a projector's ACS712 baseline is nothing like a
    fan's) and the running debounce state for it."""
    __tablename__ = "asset_sensor_mappings"

    id: Mapped[uuid.UUID] = uuid_pk()
    asset_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("iot_devices.id", ondelete="CASCADE"), nullable=False
    )
    sensor_type: Mapped[SensorType] = mapped_column(sensor_type_enum, nullable=False)

    # Thresholds -- all optional; only the ones relevant to sensor_type are
    # used. None on both ends of a pair means "not configured", not "any
    # value is fine": see iot_health.py, which skips the check entirely
    # rather than treating an unset threshold as 0.
    min_current_a: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 3))
    max_current_a: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 3))
    expected_on_current_min_a: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 3))
    expected_on_current_max_a: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 3))
    brightness_min: Mapped[Optional[int]] = mapped_column(Integer)
    temperature_min: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    temperature_max: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    debounce_seconds: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # Debounce bookkeeping -- one active streak per mapping. A confirmed
    # HealthEvent already exists once this actually fires, so this is
    # intentionally not itself a history table.
    consecutive_abnormal: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    first_abnormal_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3))
    last_reading_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    asset: Mapped["Asset"] = relationship()  # noqa: F821
    device: Mapped["IoTDevice"] = relationship(back_populates="sensors")


class HealthEvent(TimestampMixin, Base):
    """A confirmed (debounced) anomaly, and everything that happened to it
    afterwards -- the audit trail spec #11 asks for, and the join between
    the sensor side of the story and the existing Inspection/WorkOrder it
    triggered."""
    __tablename__ = "health_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"))
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("iot_devices.id", ondelete="SET NULL"))
    sensor_mapping_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("asset_sensor_mappings.id", ondelete="SET NULL")
    )
    sensor_type: Mapped[SensorType] = mapped_column(sensor_type_enum, nullable=False)
    kind: Mapped[HealthEventKind] = mapped_column(health_event_kind_enum, nullable=False)
    severity: Mapped[HealthEventSeverity] = mapped_column(health_event_severity_enum, nullable=False)
    status: Mapped[HealthEventStatus] = mapped_column(
        health_event_status_enum, default=HealthEventStatus.OPEN, nullable=False
    )

    detected_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3))
    expected_min: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3))
    expected_max: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3))

    inspection_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("inspections.id", ondelete="SET NULL"))
    work_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="SET NULL"))

    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
