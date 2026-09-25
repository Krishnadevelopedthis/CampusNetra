"""Deterministic threshold/debounce engine that turns validated ESP32
telemetry into Health Events, and feeds confirmed ones into the existing
Inspection pipeline (app.services.inspections) rather than a parallel one.

Deliberately rule-based, not ML -- see the spec this was built against:
"DO NOT introduce unnecessary AI/ML." Thresholds are per-asset
(AssetSensorMapping), never a universal constant.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import (
    AssetState, HealthEventKind, HealthEventSeverity, HealthEventStatus, SensorType,
)
from app.models.identity import User
from app.models.iot import AssetSensorMapping, HealthEvent, IoTDevice
from app.models.spatial import Asset
from app.models.work import InspectionTemplate, InspectionTemplateItem
from app.services import inspections as inspections_svc
from app.services import notifications as notify_svc
from app.services import work_orders as wo_svc
from app.services.references import next_public_id
from app.services.twin import set_asset_state

IOT_TEMPLATE_NAME = "IoT Sensor Anomaly Check"

# A reading older than this is rejected outright rather than processed --
# spec #7's "reject stale timestamps".
MAX_TELEMETRY_AGE = timedelta(minutes=15)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TelemetryError(Exception):
    """Malformed/unauthenticated/stale telemetry -- the caller turns this
    into an HTTP 400/401/404, never a 500; a bad ESP32 payload is routine,
    not a server bug."""


async def _iot_template(db: AsyncSession, org_id: uuid.UUID) -> InspectionTemplate:
    """Get-or-create the one checklist item IoT-triggered inspections use.
    A single critical item keeps this on the *existing* Inspection/
    submit_inspection machinery (critical FAIL -> raises Issue -> asset
    FAULT -> this module then adds the Work Order on top) instead of a
    parallel outcome model."""
    tpl = await db.scalar(
        select(InspectionTemplate).where(
            InspectionTemplate.organization_id == org_id,
            InspectionTemplate.name == IOT_TEMPLATE_NAME,
        )
    )
    if tpl:
        return tpl

    tpl = InspectionTemplate(
        organization_id=org_id, name=IOT_TEMPLATE_NAME,
        description="Auto-created for IoT sensor anomalies. One critical check: "
                     "does the asset actually have the problem the sensor reported?",
        is_active=True,
    )
    db.add(tpl)
    await db.flush()
    db.add(InspectionTemplateItem(
        template_id=tpl.id, position=1,
        prompt="Physically confirmed the reported anomaly on this asset",
        help_text="Fail this if the sensor reading reflects a real fault; pass it "
                  "if the asset is actually fine (false positive / sensor glitch).",
        is_critical=True,
    ))
    return tpl


def _severity_for(kind: HealthEventKind) -> HealthEventSeverity:
    return HealthEventSeverity.CRITICAL if kind in (
        HealthEventKind.NO_CURRENT, HealthEventKind.HIGH_TEMPERATURE, HealthEventKind.DEVICE_OFFLINE,
    ) else HealthEventSeverity.WARNING


async def _confirm_anomaly(
    db: AsyncSession, mapping: AssetSensorMapping, asset: Asset,
    organization_id: uuid.UUID, department_id: Optional[uuid.UUID],
    kind: HealthEventKind, value: Decimal, expected_min, expected_max,
) -> HealthEvent:
    """Debounce satisfied -- open (or reuse) the HealthEvent and schedule the
    automatic inspection. Never touches WorkOrder directly: that only
    happens once a technician confirms via the normal inspection submit
    flow (see the hook in api/v1/inspections.py)."""
    existing = await db.scalar(
        select(HealthEvent).where(
            HealthEvent.asset_id == asset.id,
            HealthEvent.kind == kind,
            HealthEvent.status.in_([HealthEventStatus.OPEN, HealthEventStatus.INSPECTING]),
        )
    )
    if existing:
        # Already open and already being inspected -- just record the
        # latest reading, don't spam a second inspection for the same fault.
        existing.detected_value = value
        return existing

    event = HealthEvent(
        reference=await next_public_id(db, HealthEvent, "HE"),
        organization_id=organization_id,
        asset_id=asset.id, room_id=asset.room_id, device_id=mapping.device_id,
        sensor_mapping_id=mapping.id, sensor_type=mapping.sensor_type,
        kind=kind, severity=_severity_for(kind), status=HealthEventStatus.OPEN,
        detected_value=value, expected_min=expected_min, expected_max=expected_max,
        detected_at=_now(),
    )
    db.add(event)
    await db.flush()

    # Purple "inspection required" marker on the Digital Twin -- exactly
    # the existing meaning of that state, just reached from a sensor
    # instead of a person.
    await set_asset_state(
        db, asset, AssetState.INSPECTION_REQUIRED,
        reason=f"IoT health event {event.reference}: {kind.value}",
    )

    if asset.room_id:
        tech = await wo_svc.suggest_technician(db, organization_id, department_id)
        actor = tech if tech else await _fallback_actor(db, organization_id)

        if actor:
            template = await _iot_template(db, organization_id)
            inspection = await inspections_svc.schedule_inspection(
                db, actor,
                template_id=template.id, scheduled_for=_now(),
                room_id=asset.room_id, asset_id=asset.id,
                assigned_to=tech.id if tech else None,
            )
            event.inspection_id = inspection.id
            event.status = HealthEventStatus.INSPECTING

        if not tech:
            managers = await notify_svc.managers_of(db, organization_id)
            await notify_svc.notify(
                db, list(managers),
                title=f"IoT health event needs a technician: {asset.name}",
                body=f"{event.reference} — no technician available to auto-assign.",
                link="/admin/health", kind="health_event",
                entity_type="health_event", entity_id=event.id,
            )

    return event


async def _fallback_actor(db: AsyncSession, org_id: uuid.UUID) -> Optional[User]:
    """schedule_inspection() needs a real, persisted User to attribute the
    scheduling action to. When no technician is available to assign, fall
    back to an active admin in the org (there's always meant to be at
    least one) rather than inventing an unpersisted stand-in user, which
    would break the actor_id foreign key on the audit trail."""
    return await db.scalar(
        select(User).where(
            User.organization_id == org_id,
            User.role.in_(["admin", "super_admin"]),
            User.status == "active",
        ).limit(1)
    )


async def evaluate_current(
    db: AsyncSession, mapping: AssetSensorMapping, asset: Asset, current_a: Decimal,
    organization_id: uuid.UUID, department_id: Optional[uuid.UUID],
) -> Optional[HealthEvent]:
    """ACS712: on/off + abnormal-current detection. Never claims the asset
    is mechanically working -- only that current is or isn't flowing in
    the expected range."""
    now = _now()
    mapping.last_value = current_a
    mapping.last_reading_at = now

    lo, hi = mapping.expected_on_current_min_a, mapping.expected_on_current_max_a
    if lo is None and hi is None:
        lo, hi = mapping.min_current_a, mapping.max_current_a
    if lo is None and hi is None:
        return None  # no threshold configured for this asset -- reading is stored, not judged

    abnormal = (lo is not None and current_a < lo) or (hi is not None and current_a > hi)
    if not abnormal:
        if mapping.consecutive_abnormal:
            mapping.consecutive_abnormal = 0
            mapping.first_abnormal_at = None
            await _recover_if_open(db, asset, HealthEventKind.ABNORMAL_CURRENT)
            await _recover_if_open(db, asset, HealthEventKind.NO_CURRENT)
        return None

    if mapping.consecutive_abnormal == 0:
        mapping.first_abnormal_at = now
    mapping.consecutive_abnormal += 1

    elapsed = (now - mapping.first_abnormal_at).total_seconds() if mapping.first_abnormal_at else 0
    if elapsed < mapping.debounce_seconds:
        return None  # noisy single reading -- not persisted for long enough yet

    kind = HealthEventKind.NO_CURRENT if current_a <= Decimal("0.02") else HealthEventKind.ABNORMAL_CURRENT
    return await _confirm_anomaly(
        db, mapping, asset, organization_id, department_id, kind, current_a, lo, hi,
    )


async def _recover_if_open(db: AsyncSession, asset: Asset, kind: HealthEventKind) -> None:
    """Sensor back in range. Per spec #23, this alone does NOT close a
    health event that already has a work order open -- only marks the
    HealthEvent itself as no-longer-actively-anomalous if it hadn't yet
    reached an inspection/work-order stage. Resolution after a confirmed
    fault still requires the technician's verified repair, handled where
    the work order transitions to VERIFIED."""
    event = await db.scalar(
        select(HealthEvent).where(
            HealthEvent.asset_id == asset.id, HealthEvent.kind == kind,
            HealthEvent.status == HealthEventStatus.OPEN,  # not yet even inspecting
        )
    )
    if event:
        event.status = HealthEventStatus.RESOLVED
        event.resolved_at = _now()
        if asset.state == AssetState.INSPECTION_REQUIRED:
            await set_asset_state(db, asset, AssetState.HEALTHY, reason=f"{event.reference} cleared before inspection")


async def process_telemetry(
    db: AsyncSession, device: IoTDevice, payload: dict,
) -> list[HealthEvent]:
    """Validate + evaluate one telemetry payload. Raises TelemetryError for
    anything malformed; returns whichever HealthEvents this reading newly
    confirmed (usually empty -- most readings are just noted, not anomalous)."""
    ts = payload.get("timestamp")
    if ts:
        try:
            reading_time = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except ValueError:
            raise TelemetryError("timestamp is not valid ISO-8601")
        if reading_time.tzinfo is None:
            reading_time = reading_time.replace(tzinfo=timezone.utc)
        if _now() - reading_time > MAX_TELEMETRY_AGE:
            raise TelemetryError("telemetry timestamp is too old (stale)")

    device.is_online = True
    device.last_seen_at = _now()

    env = payload.get("environment") or {}
    if env:
        device.last_environment = {
            "temperature_c": env.get("temperature_c"), "humidity_pct": env.get("humidity_pct"),
            "ldr_value": env.get("ldr_value"), "recorded_at": _now().isoformat(),
        }

    confirmed: list[HealthEvent] = []
    for entry in payload.get("assets") or []:
        asset_ref = entry.get("asset_id")
        if not asset_ref:
            continue

        mapping = await db.scalar(
            select(AssetSensorMapping)
            .join(Asset, Asset.id == AssetSensorMapping.asset_id)
            .where(
                AssetSensorMapping.device_id == device.id,
                AssetSensorMapping.sensor_type == SensorType.ACS712,
                Asset.tag == asset_ref,
            )
        )
        if mapping is None:
            raise TelemetryError(f"unknown asset '{asset_ref}' for device {device.device_id}")

        current = entry.get("current_a")
        if current is None:
            continue
        try:
            current_a = Decimal(str(current))
        except Exception as exc:  # noqa: BLE001
            raise TelemetryError(f"invalid current_a for '{asset_ref}'") from exc
        if current_a < 0 or current_a > 100:
            raise TelemetryError(f"current_a out of plausible range for '{asset_ref}'")

        asset = await db.scalar(
            select(Asset).options(selectinload(Asset.category)).where(Asset.id == mapping.asset_id)
        )
        department_id = asset.category.default_department_id if asset.category else None
        event = await evaluate_current(
            db, mapping, asset, current_a, device.organization_id, department_id,
        )
        if event:
            confirmed.append(event)

    return confirmed
