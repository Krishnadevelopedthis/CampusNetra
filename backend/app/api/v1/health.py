"""Admin IoT Health page: Campus -> Building -> Floor -> Room -> electronic
asset, with each asset's live health status rolled up to its room.

Reuses the existing Asset.state machine (HEALTHY/WARNING/FAULT/
UNDER_MAINTENANCE/INSPECTION_REQUIRED) rather than inventing a parallel
one -- see services/iot_health.py and services/twin.py's set_asset_state,
which is what actually drives these values now for IoT-sourced changes,
the same function work-order/inspection transitions already used before
this feature existed.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, RequireAdmin
from app.core.config import settings
from app.core.enums import AssetState
from app.core.routing import CommitRoute
from app.models.iot import AssetSensorMapping, HealthEvent, IoTDevice
from app.models.spatial import Asset, AssetCategory, Building, Campus, Floor, Room
from app.models.work import Inspection, WorkOrder
from app.schemas.iot import HealthEventOut, SensorMappingOut
from app.services import influx_client
from app.services import iot_health as svc


def _is_effectively_online(device: IoTDevice) -> bool:
    """Recomputes online/offline against the configured timeout at read
    time, on top of the is_online flag the background sweep (services/
    iot_health.offline_sweep_scheduler) already keeps current -- belt and
    suspenders for the up-to-60s gap between sweeps."""
    online = device.is_online
    if online and device.last_seen_at:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.IOT_DEVICE_OFFLINE_MINUTES)
        last_seen = device.last_seen_at
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        online = last_seen >= cutoff
    return online


def _device_out(device: IoTDevice) -> dict:
    online = _is_effectively_online(device)
    env = device.last_environment or {}
    return {
        "id": str(device.id), "device_id": device.device_id, "label": device.label,
        "is_online": online,
        "last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None,
        "main_power": env.get("main_power"),
        "main_current_a": env.get("main_current_a"),
        "fan_rotation": env.get("fan_rotation"),
        "light_brightness": env.get("light_brightness"),
        "temperature_c": env.get("temperature_c"),
        "humidity_pct": env.get("humidity_pct"),
    }

router = APIRouter(route_class=CommitRoute, prefix="/health", tags=["IoT Health"])

# CRITICAL > WARNING > OFFLINE/STALE > HEALTHY -- spec #18's deterministic
# room/asset priority order, expressed over the existing AssetState values.
_ASSET_PRIORITY = {
    AssetState.FAULT: 3,
    AssetState.WARNING: 2,
    AssetState.INSPECTION_REQUIRED: 2,
    AssetState.UNDER_MAINTENANCE: 1,
    AssetState.HEALTHY: 0,
}


def _room_status(asset_states: list[AssetState]) -> str:
    if not asset_states:
        return "no_sensors"
    worst = max(asset_states, key=lambda s: _ASSET_PRIORITY.get(s, 0))
    return worst.value


@router.get("/tree", response_model=dict)
async def health_tree(
    user: RequireAdmin, db: DB,
    campus_id: Optional[uuid.UUID] = None,
    building_id: Optional[uuid.UUID] = None,
    floor_id: Optional[uuid.UUID] = None,
    room_id: Optional[uuid.UUID] = None,
):
    """Everything needed for the default fully-scrolled view in one call,
    or narrowed by whichever of the four selectors is set -- the frontend
    passes only the ones actually chosen."""
    campus_q = select(Campus).where(Campus.organization_id == user.organization_id)
    if campus_id:
        campus_q = campus_q.where(Campus.id == campus_id)
    campuses = (await db.scalars(campus_q.order_by(Campus.name))).all()
    if not campuses:
        return {"campuses": []}

    building_q = select(Building).where(Building.campus_id.in_([c.id for c in campuses]))
    if building_id:
        building_q = building_q.where(Building.id == building_id)
    buildings = (await db.scalars(building_q.order_by(Building.name))).all()

    floor_q = select(Floor).where(Floor.building_id.in_([b.id for b in buildings])) if buildings else None
    if floor_id and floor_q is not None:
        floor_q = floor_q.where(Floor.id == floor_id)
    floors = (await db.scalars(floor_q.order_by(Floor.level))).all() if floor_q is not None else []

    room_q = select(Room).where(Room.floor_id.in_([f.id for f in floors])) if floors else None
    if room_id and room_q is not None:
        room_q = room_q.where(Room.id == room_id)
    rooms = (await db.scalars(room_q.order_by(Room.code))).all() if room_q is not None else []

    asset_rows = []
    if rooms:
        asset_rows = (await db.scalars(
            select(Asset).options(selectinload(Asset.category))
            .join(AssetCategory, AssetCategory.id == Asset.category_id)
            .where(Asset.room_id.in_([r.id for r in rooms]), AssetCategory.is_electronic.is_(True))
            .order_by(Asset.name)
        )).all()

    # One IoT device per room at most (a room's ESP32 assignment) -- used to
    # show Main Power / Fan / Light / Temperature / Humidity / Online
    # straight on the room card, per the Admin -> Health integration spec.
    devices_by_room: dict[uuid.UUID, IoTDevice] = {}
    if rooms:
        device_rows = (await db.scalars(
            select(IoTDevice).where(IoTDevice.room_id.in_([r.id for r in rooms]))
        )).all()
        devices_by_room = {d.room_id: d for d in device_rows if d.room_id}

    # Which assets have at least one sensor mapped, so a room with
    # electronic assets but zero configured sensors shows "no sensors"
    # (spec: explicit exception) rather than a silent healthy state.
    mapped_asset_ids: set[uuid.UUID] = set()
    if asset_rows:
        mapped_asset_ids = set((await db.scalars(
            select(AssetSensorMapping.asset_id).where(
                AssetSensorMapping.asset_id.in_([a.id for a in asset_rows]))
            .distinct()
        )).all())

    assets_by_room: dict[uuid.UUID, list[Asset]] = {}
    for a in asset_rows:
        assets_by_room.setdefault(a.room_id, []).append(a)

    rooms_by_floor: dict[uuid.UUID, list[Room]] = {}
    for r in rooms:
        rooms_by_floor.setdefault(r.floor_id, []).append(r)

    floors_by_building: dict[uuid.UUID, list[Floor]] = {}
    for f in floors:
        floors_by_building.setdefault(f.building_id, []).append(f)

    buildings_by_campus: dict[uuid.UUID, list[Building]] = {}
    for b in buildings:
        buildings_by_campus.setdefault(b.campus_id, []).append(b)

    def _iot_label(asset: Asset, device: Optional[IoTDevice]) -> Optional[str]:
        """Fan/Light-specific wording (WORKING / OFF-NO POWER / SUSPECTED
        FAULT) layered on top of the existing generic asset-state pill --
        every other asset keeps using that pill unchanged. Only applies to
        an asset this room's device actually has a sensor mapped to (i.e.
        its category name/code says fan or light); anything else falls
        back to None and the frontend shows the existing generic label."""
        if not asset.category or device is None or not device.last_environment:
            # No telemetry received yet -- nothing to base WORKING/OFF/
            # SUSPECTED FAULT wording on, so don't claim one. Falls back to
            # the existing generic asset-state pill.
            return None
        cat = asset.category.name.lower()
        is_fan = "fan" in cat or asset.category.code.lower() == "fan"
        is_light = "light" in cat or asset.category.code.lower() == "light"
        if not (is_fan or is_light):
            return None
        if asset.state == AssetState.FAULT:
            return "FAULT"
        if asset.state in (AssetState.WARNING, AssetState.INSPECTION_REQUIRED):
            # A confirmed anomaly only clears once a technician inspects it
            # (see services/iot_health.py's _recover_if_open -- deliberate:
            # a reading looking fine again isn't proof by itself). The raw
            # reading can look fine well before that happens, which reads
            # as a flat contradiction ("Rotating" next to "SUSPECTED
            # FAULT") without this -- the suffix says why they can coexist.
            env = device.last_environment or {}
            looks_fine_now = (
                bool(env.get("fan_rotation")) if is_fan
                else (env.get("light_brightness") or 0) > 0
            )
            return "SUSPECTED FAULT (awaiting inspection)" if looks_fine_now else "SUSPECTED FAULT"
        if asset.state == AssetState.UNDER_MAINTENANCE:
            return "Under maintenance"
        if asset.state == AssetState.DECOMMISSIONED:
            return "Decommissioned"
        # HEALTHY, but the device hasn't sent anything in a while -- WORKING
        # would claim the LAST reading is still true right now, which isn't
        # known. No fault is claimed either (offline is not itself evidence
        # of one); this is a distinct third state from both.
        if not _is_effectively_online(device):
            return "UNKNOWN (device offline)"
        # HEALTHY and online: WORKING unless this reading's main power was
        # confirmed off -- absence of current explains an idle Fan/Light,
        # it isn't evidence either is faulty (see services/iot_health.py).
        env = device.last_environment or {}
        if env.get("main_power") is False:
            return "OFF / NO POWER"
        if env.get("main_power") is True:
            # The asset's CONFIRMED state (still Healthy) can legitimately
            # lag the latest raw reading by design -- evaluate_fan_rotation/
            # evaluate_light_brightness in services/iot_health.py require
            # several consecutive abnormal readings over debounce_seconds
            # before flipping the asset to Suspected Fault, specifically so
            # one noisy reading doesn't false-alarm. Without this, a single
            # "Not rotating" reading shows next to a flat "WORKING" --
            # exactly as contradictory-looking as the reverse case above,
            # just before confirmation instead of after recovery.
            # brightness_min is per-mapping and not cheaply available here;
            # this reuses the same default auto-provisioning applies
            # (services/iot_health.DEFAULT_LDR_BRIGHTNESS_MIN) as a
            # reasonable approximation for this hint -- the actual
            # confirm/recover decision still uses each mapping's real
            # configured threshold, this only affects the wording shown.
            looks_bad_now = (
                env.get("fan_rotation") is False if is_fan
                else (env.get("light_brightness") or 0) < svc.DEFAULT_LDR_BRIGHTNESS_MIN
            )
            if looks_bad_now:
                return "WORKING (confirming — reading looks off)"
        return "WORKING"

    def room_out(room: Room) -> dict:
        room_assets = assets_by_room.get(room.id, [])
        device = devices_by_room.get(room.id)
        # "no_sensors" covers both a room with no electronic assets at all
        # and one with electronic assets that simply have no sensor mapped
        # yet -- neither can produce a real health reading, so neither
        # should silently read as "healthy".
        has_sensors = any(a.id in mapped_asset_ids for a in room_assets)
        return {
            "id": str(room.id), "name": room.name, "code": room.code, "kind": room.kind.value,
            "has_electronic_assets": bool(room_assets),
            "status": _room_status([a.state for a in room_assets]) if has_sensors else "no_sensors",
            "device": _device_out(device) if device else None,
            "assets": [
                {
                    "id": str(a.id), "name": a.name, "tag": a.tag,
                    "category": a.category.name if a.category else None,
                    "state": a.state.value,
                    "has_sensor": a.id in mapped_asset_ids,
                    "iot_label": _iot_label(a, device) if a.id in mapped_asset_ids else None,
                }
                for a in room_assets
            ],
        }

    return {
        "campuses": [
            {
                "id": str(c.id), "name": c.name,
                "buildings": [
                    {
                        "id": str(b.id), "name": b.name,
                        "floors": [
                            {
                                "id": str(f.id), "name": f.name, "level": f.level,
                                "rooms": [room_out(r) for r in rooms_by_floor.get(f.id, [])],
                            }
                            for f in floors_by_building.get(b.id, [])
                        ],
                    }
                    for b in buildings_by_campus.get(c.id, [])
                ],
            }
            for c in campuses
        ],
    }


@router.get("/assets/{asset_id}", response_model=dict)
async def asset_health(asset_id: uuid.UUID, user: RequireAdmin, db: DB):
    asset = await db.scalar(
        select(Asset).options(selectinload(Asset.category), selectinload(Asset.room))
        .where(Asset.id == asset_id)
    )
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")

    mappings = (await db.scalars(
        select(AssetSensorMapping).where(AssetSensorMapping.asset_id == asset_id)
    )).all()
    device_ids = {m.device_id for m in mappings}
    devices = {
        d.id: d for d in (await db.scalars(
            select(IoTDevice).where(IoTDevice.id.in_(device_ids)))).all()
    } if device_ids else {}

    events = (await db.scalars(
        select(HealthEvent).where(HealthEvent.asset_id == asset_id)
        .order_by(HealthEvent.detected_at.desc()).limit(50)
    )).all()

    inspection_ids = {e.inspection_id for e in events if e.inspection_id}
    work_order_ids = {e.work_order_id for e in events if e.work_order_id}
    inspections = {
        i.id: i for i in (await db.scalars(
            select(Inspection).where(Inspection.id.in_(inspection_ids)))).all()
    } if inspection_ids else {}
    work_orders = {
        w.id: w for w in (await db.scalars(
            select(WorkOrder).where(WorkOrder.id.in_(work_order_ids)))).all()
    } if work_order_ids else {}

    return {
        "asset": {
            "id": str(asset.id), "name": asset.name, "tag": asset.tag,
            "category": asset.category.name if asset.category else None,
            "state": asset.state.value,
            "room": {"id": str(asset.room.id), "name": asset.room.name} if asset.room else None,
        },
        "sensors": [SensorMappingOut.model_validate(m, from_attributes=True).model_dump(mode="json")
                    for m in mappings],
        "devices": [
            {"id": str(d.id), "device_id": d.device_id, "is_online": d.is_online,
             "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
             "last_environment": d.last_environment}
            for d in devices.values()
        ],
        "events": [
            {
                **HealthEventOut.model_validate(e, from_attributes=True).model_dump(mode="json"),
                "inspection_reference": inspections[e.inspection_id].reference if e.inspection_id in inspections else None,
                "inspection_status": inspections[e.inspection_id].status.value if e.inspection_id in inspections else None,
                "work_order_reference": work_orders[e.work_order_id].reference if e.work_order_id in work_orders else None,
                "work_order_status": work_orders[e.work_order_id].status.value if e.work_order_id in work_orders else None,
            }
            for e in events
        ],
    }


# ---------------------------------------------------------------------------
# Device history (InfluxDB)
# ---------------------------------------------------------------------------

# The chart refreshes every ~30 s per open window; a short cache keeps several
# admins (or a refresh loop) from each running a time-series query.
_HISTORY_TTL_SECONDS = 20
_history_cache: dict[tuple[str, str], tuple[float, dict]] = {}


@router.get("/devices/{device_id}/history", response_model=dict)
async def device_history(
    device_id: uuid.UUID, user: RequireAdmin, db: DB,
    range: str = Query("24h", pattern="^(1h|6h|24h|7d)$"),
):
    """Bucketed telemetry history for one device, read from InfluxDB, plus the
    health events raised in the same window (for markers on the chart).

    Never fails because Influx is down: `available` is false and `reason` says
    why, so the Health page can say so and carry on.
    """
    device = await db.scalar(select(IoTDevice).where(IoTDevice.id == device_id))
    if device is None or device.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")

    window_s, _ = influx_client.HISTORY_RANGES[range]
    since = datetime.now(timezone.utc) - timedelta(seconds=window_s)

    events = (await db.scalars(
        select(HealthEvent)
        .where(HealthEvent.device_id == device.id, HealthEvent.detected_at >= since)
        .order_by(HealthEvent.detected_at)
    )).all()
    event_rows = [
        {
            "id": str(e.id), "reference": e.reference, "kind": e.kind.value,
            "severity": e.severity.value, "status": e.status.value,
            "at": int(e.detected_at.timestamp() * 1000),
            "detected_value": float(e.detected_value) if e.detected_value is not None else None,
        }
        for e in events
    ]

    base = {
        "device_id": device.device_id, "range": range, "since": int(since.timestamp() * 1000),
        "until": int(datetime.now(timezone.utc).timestamp() * 1000), "events": event_rows,
    }

    key = (device.device_id, range)
    cached = _history_cache.get(key)
    if cached and time.monotonic() - cached[0] < _HISTORY_TTL_SECONDS:
        return {**base, **cached[1]}

    try:
        result = await influx_client.query_history(device.device_id, range)
        payload = {"available": True, "reason": None, **result}
        _history_cache[key] = (time.monotonic(), payload)
        if len(_history_cache) > 200:
            _history_cache.clear()
    except influx_client.HistoryUnavailable as exc:
        payload = {"available": False, "reason": exc.reason, "bucket_seconds": None, "points": []}
    return {**base, **payload}
