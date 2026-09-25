"""IoT device registration, sensor mapping, and telemetry ingestion.

Two ways telemetry gets in:
  - POST /iot/telemetry -- a real device, authenticated by its own API key
    (never a user session; an ESP32 doesn't log in).
  - POST /iot/telemetry/test -- admin-only simulator for development/demo
    when no physical hardware is connected (spec's own requirement: "ESP32
    hardware may not always be connected during development").
"""
from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, Header, HTTPException, status
from sqlalchemy import select

from app.api.deps import DB, RequireAdmin
from app.core.routing import CommitRoute
from app.core.security import hash_password, verify_password
from app.models.iot import AssetSensorMapping, IoTDevice
from app.schemas.common import Message
from app.schemas.iot import (
    DeviceIn, DeviceOut, HealthEventOut, SensorMappingIn, SensorMappingOut, TelemetryIn,
)
from app.services import iot_health as svc

router = APIRouter(route_class=CommitRoute, prefix="/iot", tags=["IoT Health"])


@router.post("/devices", response_model=DeviceOut, status_code=201)
async def register_device(payload: DeviceIn, user: RequireAdmin, db: DB):
    existing = await db.scalar(select(IoTDevice).where(IoTDevice.device_id == payload.device_id))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "A device with this device_id is already registered")

    api_key = secrets.token_urlsafe(24)
    device = IoTDevice(
        organization_id=user.organization_id, device_id=payload.device_id,
        room_id=payload.room_id, label=payload.label,
        api_key_hash=hash_password(api_key),
    )
    db.add(device)
    await db.flush()
    out = DeviceOut.model_validate(device, from_attributes=True)
    out.api_key = api_key  # only ever returned this once
    return out


@router.get("/devices", response_model=list[DeviceOut])
async def list_devices(user: RequireAdmin, db: DB):
    rows = (await db.scalars(
        select(IoTDevice).where(IoTDevice.organization_id == user.organization_id)
        .order_by(IoTDevice.created_at.desc())
    )).all()
    return [DeviceOut.model_validate(d, from_attributes=True) for d in rows]


@router.delete("/devices/{device_id}", response_model=Message)
async def delete_device(device_id: uuid.UUID, user: RequireAdmin, db: DB):
    device = await db.scalar(
        select(IoTDevice).where(IoTDevice.id == device_id, IoTDevice.organization_id == user.organization_id))
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    await db.delete(device)
    return Message(detail="Device removed.")


@router.post("/sensors", response_model=SensorMappingOut, status_code=201)
async def map_sensor(payload: SensorMappingIn, user: RequireAdmin, db: DB):
    device = await db.scalar(
        select(IoTDevice).where(IoTDevice.id == payload.device_id, IoTDevice.organization_id == user.organization_id))
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")

    mapping = AssetSensorMapping(**payload.model_dump())
    db.add(mapping)
    await db.flush()
    return SensorMappingOut.model_validate(mapping, from_attributes=True)


@router.delete("/sensors/{mapping_id}", response_model=Message)
async def unmap_sensor(mapping_id: uuid.UUID, user: RequireAdmin, db: DB):
    mapping = await db.scalar(
        select(AssetSensorMapping).join(IoTDevice, IoTDevice.id == AssetSensorMapping.device_id)
        .where(AssetSensorMapping.id == mapping_id, IoTDevice.organization_id == user.organization_id)
    )
    if mapping is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sensor mapping not found")
    await db.delete(mapping)
    return Message(detail="Sensor mapping removed.")


async def _authenticate_device(db: DB, device_id: str, api_key: str | None) -> IoTDevice:
    if not api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing device API key")
    device = await db.scalar(select(IoTDevice).where(IoTDevice.device_id == device_id))
    if device is None or not verify_password(api_key, device.api_key_hash):
        # Same message either way -- confirming a device_id exists to an
        # unauthenticated caller is its own small information leak.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown device or invalid key")
    return device


@router.post("/telemetry", response_model=list[HealthEventOut])
async def ingest_telemetry(
    payload: TelemetryIn, db: DB,
    x_device_key: str | None = Header(None),
):
    """The real ingestion path -- also what the (optional) MQTT bridge in
    services/mqtt_client.py calls for each message it receives, so both
    paths share identical validation and health-event logic."""
    device = await _authenticate_device(db, payload.device_id, x_device_key)
    try:
        events = await svc.process_telemetry(db, device, payload.model_dump())
    except svc.TelemetryError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return [HealthEventOut.model_validate(e, from_attributes=True) for e in events]


@router.post("/telemetry/test", response_model=list[HealthEventOut])
async def simulate_telemetry(payload: TelemetryIn, user: RequireAdmin, db: DB):
    """Development-only simulator (spec #29). Admin-authenticated instead
    of device-keyed, and only reachable by an admin of the device's own
    organisation -- there is no unauthenticated path to this endpoint in
    any environment."""
    device = await db.scalar(select(IoTDevice).where(IoTDevice.device_id == payload.device_id))
    if device is None or device.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    try:
        events = await svc.process_telemetry(db, device, payload.model_dump())
    except svc.TelemetryError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return [HealthEventOut.model_validate(e, from_attributes=True) for e in events]
