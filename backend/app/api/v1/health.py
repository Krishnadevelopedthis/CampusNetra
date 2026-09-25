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

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, RequireAdmin
from app.core.enums import AssetState
from app.core.routing import CommitRoute
from app.models.iot import AssetSensorMapping, HealthEvent, IoTDevice
from app.models.spatial import Asset, AssetCategory, Building, Campus, Floor, Room
from app.models.work import Inspection, WorkOrder
from app.schemas.iot import HealthEventOut, SensorMappingOut

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

    def room_out(room: Room) -> dict:
        room_assets = assets_by_room.get(room.id, [])
        # "no_sensors" covers both a room with no electronic assets at all
        # and one with electronic assets that simply have no sensor mapped
        # yet -- neither can produce a real health reading, so neither
        # should silently read as "healthy".
        has_sensors = any(a.id in mapped_asset_ids for a in room_assets)
        return {
            "id": str(room.id), "name": room.name, "code": room.code, "kind": room.kind.value,
            "has_electronic_assets": bool(room_assets),
            "status": _room_status([a.state for a in room_assets]) if has_sensors else "no_sensors",
            "assets": [
                {
                    "id": str(a.id), "name": a.name, "tag": a.tag,
                    "category": a.category.name if a.category else None,
                    "state": a.state.value,
                    "has_sensor": a.id in mapped_asset_ids,
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
