"""IoT device registration, sensor mapping and telemetry payloads."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.core.enums import HealthEventKind, HealthEventSeverity, HealthEventStatus, SensorType


class DeviceIn(BaseModel):
    device_id: str = Field(min_length=2, max_length=100)
    room_id: Optional[uuid.UUID] = None
    label: Optional[str] = Field(None, max_length=120)


class DeviceOut(BaseModel):
    id: uuid.UUID
    device_id: str
    room_id: Optional[uuid.UUID] = None
    label: Optional[str] = None
    is_online: bool
    last_seen_at: Optional[datetime] = None
    last_environment: Optional[dict] = None
    # Only ever present in the response to the registration call itself --
    # this is the one and only time the plaintext key exists anywhere but
    # the device's own flash memory.
    api_key: Optional[str] = None


class SensorMappingIn(BaseModel):
    asset_id: uuid.UUID
    device_id: uuid.UUID
    sensor_type: SensorType = SensorType.ACS712
    min_current_a: Optional[float] = None
    max_current_a: Optional[float] = None
    expected_on_current_min_a: Optional[float] = None
    expected_on_current_max_a: Optional[float] = None
    brightness_min: Optional[int] = None
    temperature_min: Optional[float] = None
    temperature_max: Optional[float] = None
    debounce_seconds: int = Field(60, ge=5, le=3600)


class SensorMappingOut(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID
    device_id: uuid.UUID
    sensor_type: SensorType
    min_current_a: Optional[float] = None
    max_current_a: Optional[float] = None
    expected_on_current_min_a: Optional[float] = None
    expected_on_current_max_a: Optional[float] = None
    brightness_min: Optional[int] = None
    temperature_min: Optional[float] = None
    temperature_max: Optional[float] = None
    debounce_seconds: int
    last_value: Optional[float] = None
    last_reading_at: Optional[datetime] = None


class AssetTelemetry(BaseModel):
    asset_id: str = Field(min_length=1, max_length=100)
    asset_type: Optional[str] = None
    current_a: Optional[float] = Field(None, ge=0, le=100)


class EnvironmentTelemetry(BaseModel):
    temperature_c: Optional[float] = Field(None, ge=-40, le=100)
    humidity_pct: Optional[float] = Field(None, ge=0, le=100)
    ldr_value: Optional[int] = Field(None, ge=0, le=100000)


class TelemetryIn(BaseModel):
    version: int = 1
    device_id: str = Field(min_length=2, max_length=100)
    timestamp: Optional[str] = None
    assets: list[AssetTelemetry] = Field(default_factory=list)
    environment: Optional[EnvironmentTelemetry] = None


class HealthEventOut(BaseModel):
    id: uuid.UUID
    reference: str
    asset_id: uuid.UUID
    room_id: Optional[uuid.UUID] = None
    sensor_type: SensorType
    kind: HealthEventKind
    severity: HealthEventSeverity
    status: HealthEventStatus
    detected_value: Optional[float] = None
    expected_min: Optional[float] = None
    expected_max: Optional[float] = None
    inspection_id: Optional[uuid.UUID] = None
    work_order_id: Optional[uuid.UUID] = None
    detected_at: datetime
    resolved_at: Optional[datetime] = None
