"""Spatial hierarchy and Digital Twin endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.api.deps import DB, CurrentUser, Paging, RequireAdmin, RequireStaff
from app.core.enums import AssetState, IssueStatus, RoomKind
from app.models.identity import Organization
from app.models.issues import Issue
from app.models.spatial import (
    Asset, AssetCategory, AssetStateHistory, Building, Campus, Floor, Room, TwinEvent,
)
from app.models.work import WorkOrder
from app.schemas.campus import (
    AssetBulkCreate, AssetUpdate, CampusUpdate, FloorUpdate,
    AssetCategoryOut, AssetCreate, AssetMarker, AssetOut, AssetStateUpdate,
    BuildingCreate, BuildingOut, CampusOut, CampusOverviewOut, FloorCreate,
    FloorOut, FloorPlanOut, RoomCreate, RoomOut, RoomWithMarkers, TwinEventOut,
)
from app.schemas.common import Message, Page
from app.services.realtime import hub
from app.services.twin import STATE_COLOURS, STATE_LABELS, set_asset_state

router = APIRouter(prefix="/campus", tags=["Campus & Digital Twin"])

# Ranked worst-first: a room shows the most severe state among its assets.
_SEVERITY = [
    AssetState.FAULT, AssetState.WARNING, AssetState.INSPECTION_REQUIRED,
    AssetState.UNDER_MAINTENANCE, AssetState.HEALTHY, AssetState.DECOMMISSIONED,
]

OPEN_ISSUE_STATES = [
    IssueStatus.REPORTED, IssueStatus.TRIAGED, IssueStatus.ASSIGNED,
    IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD,
]


def _worst(states: list[AssetState]) -> AssetState:
    for s in _SEVERITY:
        if s in states:
            return s
    return AssetState.HEALTHY


LEGEND = {
    s.value: {"colour": STATE_COLOURS[s.value], "label": STATE_LABELS[s.value]}
    for s in AssetState
}


@router.get("/legend", response_model=dict)
async def twin_legend():
    """Single source of truth for twin marker colours."""
    return LEGEND


@router.get("/campuses", response_model=list[CampusOut])
async def list_campuses(user: CurrentUser, db: DB):
    rows = (await db.scalars(
        select(Campus).where(
            Campus.organization_id == user.organization_id, Campus.is_active.is_(True))
        .order_by(Campus.name)
    )).all()
    return [CampusOut.model_validate(c) for c in rows]


@router.get("/campuses/{campus_id}/overview", response_model=CampusOverviewOut)
async def campus_overview(campus_id: uuid.UUID, user: CurrentUser, db: DB):
    """Campus Overview: building cards plus live health counts."""
    campus = await db.scalar(
        select(Campus).where(
            Campus.id == campus_id, Campus.organization_id == user.organization_id)
    )
    if campus is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campus not found")

    # Per-building asset-state counts, resolved in one grouped query.
    rows = (await db.execute(
        select(Building.id, Building.name, Building.code, Building.map_x, Building.map_y,
               Asset.state, func.count(Asset.id))
        .select_from(Building)
        .join(Floor, Floor.building_id == Building.id, isouter=True)
        .join(Room, Room.floor_id == Floor.id, isouter=True)
        .join(Asset, Asset.room_id == Room.id, isouter=True)
        .where(Building.campus_id == campus_id)
        .group_by(Building.id, Building.name, Building.code,
                  Building.map_x, Building.map_y, Asset.state)
    )).all()

    buildings: dict[uuid.UUID, dict] = {}
    breakdown: dict[str, int] = {s.value: 0 for s in AssetState}
    for bid, name, code, mx, my, state, count in rows:
        b = buildings.setdefault(bid, {
            "id": str(bid), "name": name, "code": code,
            "map_x": float(mx) if mx is not None else None,
            "map_y": float(my) if my is not None else None,
            "asset_count": 0, "states": {}, "open_issues": 0,
        })
        if state is not None:
            b["asset_count"] += count
            b["states"][state.value] = b["states"].get(state.value, 0) + count
            breakdown[state.value] += count

    issue_rows = (await db.execute(
        select(Issue.building_id, func.count())
        .where(Issue.campus_id == campus_id, Issue.status.in_(OPEN_ISSUE_STATES))
        .group_by(Issue.building_id)
    )).all()
    for bid, count in issue_rows:
        if bid in buildings:
            buildings[bid]["open_issues"] = count

    # ---- What is actually inside each building ----
    #
    # A building card that only shows a colour says a building has a problem;
    # it does not say the problem is in the second-floor physics lab. The floors
    # and their rooms come back nested so the map can draw the contents inside
    # the building's own boundary, with each room carrying its own worst state
    # rather than inheriting the building's.
    room_rows = (await db.execute(
        select(Building.id, Floor.id, Floor.name, Floor.level,
               Room.id, Room.code, Room.name, Room.kind,
               Asset.state, func.count(Asset.id))
        .select_from(Building)
        .join(Floor, Floor.building_id == Building.id)
        .join(Room, Room.floor_id == Floor.id, isouter=True)
        .join(Asset, Asset.room_id == Room.id, isouter=True)
        .where(Building.campus_id == campus_id)
        .group_by(Building.id, Floor.id, Floor.name, Floor.level,
                  Room.id, Room.code, Room.name, Room.kind, Asset.state)
        .order_by(Floor.level.desc())
    )).all()

    # building -> floor -> room, built in one pass over the flattened rows.
    nested: dict[uuid.UUID, dict[uuid.UUID, dict]] = {}
    for bid, fid, fname, flevel, rid, rcode, rname, rkind, state, count in room_rows:
        floors = nested.setdefault(bid, {})
        floor = floors.setdefault(fid, {
            "id": str(fid), "name": fname, "level": flevel, "rooms": {},
        })
        if rid is None:
            continue
        room = floor["rooms"].setdefault(rid, {
            "id": str(rid), "code": rcode, "name": rname,
            "kind": rkind.value if hasattr(rkind, "value") else rkind,
            "asset_count": 0, "states": {},
        })
        if state is not None:
            room["asset_count"] += count
            room["states"][state.value] = room["states"].get(state.value, 0) + count

    open_by_room = dict((await db.execute(
        select(Issue.room_id, func.count())
        .where(Issue.campus_id == campus_id,
               Issue.status.in_(OPEN_ISSUE_STATES),
               Issue.room_id.is_not(None))
        .group_by(Issue.room_id)
    )).all())

    for b in buildings.values():
        present = [AssetState(s) for s in b["states"]]
        worst = _worst(present) if present else AssetState.HEALTHY
        b["aggregate_state"] = worst.value
        b["aggregate_colour"] = STATE_COLOURS[worst.value]

        floors = nested.get(uuid.UUID(b["id"]), {})
        out_floors = []
        for floor in sorted(floors.values(), key=lambda f: -f["level"]):
            rooms = []
            for room in sorted(floor["rooms"].values(), key=lambda r: r["code"]):
                states = [AssetState(x) for x in room["states"]]
                room_worst = _worst(states) if states else AssetState.HEALTHY
                rooms.append({
                    "id": room["id"], "code": room["code"], "name": room["name"],
                    "kind": room["kind"], "asset_count": room["asset_count"],
                    "state": room_worst.value,
                    "colour": STATE_COLOURS[room_worst.value],
                    "open_issues": open_by_room.get(uuid.UUID(room["id"]), 0),
                })
            out_floors.append({
                "id": floor["id"], "name": floor["name"],
                "level": floor["level"], "rooms": rooms,
            })
        b["floors"] = out_floors
        b["room_count"] = sum(len(f["rooms"]) for f in out_floors)

    totals = {
        "buildings": len(buildings),
        "rooms": await db.scalar(
            select(func.count(Room.id)).select_from(Room)
            .join(Floor, Floor.id == Room.floor_id)
            .join(Building, Building.id == Floor.building_id)
            .where(Building.campus_id == campus_id)) or 0,
        "assets": sum(breakdown.values()),
        "open_issues": await db.scalar(
            select(func.count()).select_from(Issue)
            .where(Issue.campus_id == campus_id, Issue.status.in_(OPEN_ISSUE_STATES))) or 0,
    }

    return CampusOverviewOut(
        campus=CampusOut.model_validate(campus),
        buildings=sorted(buildings.values(), key=lambda b: b["code"]),
        totals=totals,
        state_breakdown=breakdown,
    )


@router.get("/campuses/{campus_id}/buildings", response_model=list[BuildingOut])
async def list_buildings(campus_id: uuid.UUID, user: CurrentUser, db: DB):
    rows = (await db.scalars(
        select(Building).join(Campus, Campus.id == Building.campus_id)
        .where(Building.campus_id == campus_id,
               Campus.organization_id == user.organization_id)
        .order_by(Building.code)
    )).all()
    return [BuildingOut.model_validate(b) for b in rows]


@router.get("/buildings/{building_id}/floors", response_model=list[FloorOut])
async def list_floors(building_id: uuid.UUID, user: CurrentUser, db: DB):
    rows = (await db.scalars(
        select(Floor).where(Floor.building_id == building_id).order_by(Floor.level)
    )).all()
    return [FloorOut.model_validate(f) for f in rows]


@router.get("/floors/{floor_id}/plan", response_model=FloorPlanOut)
async def floor_plan(floor_id: uuid.UUID, user: CurrentUser, db: DB):
    """Everything the Floor Plan View renders: room polygons, asset markers,
    live colours and open-issue counts — in one request."""
    floor = await db.scalar(select(Floor).where(Floor.id == floor_id))
    if floor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Floor not found")

    building = await db.scalar(select(Building).where(Building.id == floor.building_id))
    campus_org = await db.scalar(
        select(Campus.organization_id).where(Campus.id == building.campus_id))
    if campus_org != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Floor not found")

    rooms = (await db.scalars(
        select(Room).where(Room.floor_id == floor_id).order_by(Room.code))).all()
    room_ids = [r.id for r in rooms]

    assets = (await db.scalars(
        select(Asset).where(Asset.room_id.in_(room_ids)))).all() if room_ids else []
    categories = {c.id: c for c in (await db.scalars(select(AssetCategory))).all()}

    # Open issues per asset, plus the reference to show in the tooltip.
    issue_rows = (await db.execute(
        select(Issue.asset_id, Issue.room_id, Issue.reference, func.count().over(
            partition_by=Issue.asset_id))
        .where(Issue.room_id.in_(room_ids), Issue.status.in_(OPEN_ISSUE_STATES))
        .order_by(Issue.created_at.desc())
    )).all() if room_ids else []

    asset_issue_count: dict[uuid.UUID, int] = {}
    asset_issue_ref: dict[uuid.UUID, str] = {}
    room_issue_count: dict[uuid.UUID, int] = {}
    for asset_id, rid, ref, cnt in issue_rows:
        room_issue_count[rid] = room_issue_count.get(rid, 0) + 1
        if asset_id:
            asset_issue_count[asset_id] = cnt
            asset_issue_ref.setdefault(asset_id, ref)

    wo_rows = (await db.execute(
        select(WorkOrder.asset_id, WorkOrder.reference)
        .where(WorkOrder.asset_id.in_([a.id for a in assets]),
               WorkOrder.status.notin_(["closed", "cancelled", "verified"]))
        .order_by(WorkOrder.created_at.desc())
    )).all() if assets else []
    asset_wo_ref = {}
    for aid, ref in wo_rows:
        asset_wo_ref.setdefault(aid, ref)

    by_room: dict[uuid.UUID, list[Asset]] = {}
    for a in assets:
        by_room.setdefault(a.room_id, []).append(a)

    out_rooms = []
    for room in rooms:
        room_assets = by_room.get(room.id, [])
        worst = _worst([a.state for a in room_assets])
        out_rooms.append(RoomWithMarkers(
            id=room.id, name=room.name, code=room.code, zone_id=room.zone_id,
            kind=room.kind.value, capacity=room.capacity,
            area_sqft=float(room.area_sqft) if room.area_sqft else None,
            boundary=room.boundary,
            aggregate_state=worst.value,
            aggregate_colour=STATE_COLOURS[worst.value],
            open_issue_count=room_issue_count.get(room.id, 0),
            assets=[
                AssetMarker(
                    id=a.id, tag=a.tag, name=a.name, state=a.state,
                    colour=STATE_COLOURS[a.state.value],
                    label=STATE_LABELS[a.state.value],
                    pos_x=float(a.pos_x) if a.pos_x is not None else None,
                    pos_y=float(a.pos_y) if a.pos_y is not None else None,
                    category_icon=categories[a.category_id].icon if a.category_id in categories else None,
                    open_issue_count=asset_issue_count.get(a.id, 0),
                    active_issue_reference=asset_issue_ref.get(a.id),
                    active_work_order_reference=asset_wo_ref.get(a.id),
                )
                for a in room_assets
            ],
        ))

    return FloorPlanOut(
        floor=FloorOut.model_validate(floor),
        building=BuildingOut.model_validate(building),
        rooms=out_rooms,
        legend=LEGEND,
        generated_at=datetime.now(timezone.utc),
    )


class CampusUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=20)
    address: Optional[str] = None


class BuildingUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=20)
    floors_count: int = Field(1, ge=1, le=100)
    map_x: Optional[float] = Field(None, ge=0, le=1)
    map_y: Optional[float] = Field(None, ge=0, le=1)


class FloorUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    level: int = Field(ge=-10, le=200)


@router.post("/campuses", response_model=CampusOut, status_code=201)
async def create_campus(payload: CampusUpsert, user: RequireAdmin, db: DB):
    clash = await db.scalar(
        select(Campus.id).where(
            Campus.organization_id == user.organization_id, Campus.code == payload.code))
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Campus code {payload.code} already exists.")

    campus = Campus(organization_id=user.organization_id, **payload.model_dump())
    db.add(campus)
    await db.flush()
    await db.refresh(campus)
    return CampusOut.model_validate(campus)


@router.patch("/campuses/{campus_id}", response_model=CampusOut)
async def update_campus(
    campus_id: uuid.UUID, payload: CampusUpdate, user: RequireAdmin, db: DB
):
    campus = await db.scalar(
        select(Campus).where(Campus.id == campus_id,
                             Campus.organization_id == user.organization_id))
    if campus is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campus not found")

    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"] != campus.code:
        clash = await db.scalar(select(Campus.id).where(
            Campus.organization_id == user.organization_id,
            Campus.code == data["code"], Campus.id != campus_id))
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Campus code {data['code']} already exists.")

    for field, value in data.items():
        setattr(campus, field, value)
    await db.flush()
    return CampusOut.model_validate(campus)


@router.delete("/campuses/{campus_id}", response_model=Message)
async def delete_campus(campus_id: uuid.UUID, user: RequireAdmin, db: DB):
    campus = await db.scalar(
        select(Campus).where(Campus.id == campus_id,
                             Campus.organization_id == user.organization_id))
    if campus is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campus not found")

    buildings = await db.scalar(
        select(func.count()).select_from(Building)
        .where(Building.campus_id == campus_id)) or 0
    if buildings:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{campus.code} still contains {buildings} building(s). Remove them first.")

    await db.delete(campus)
    return Message(detail=f"{campus.name} removed.")


@router.patch("/floors/{floor_id}", response_model=FloorOut)
async def update_floor(
    floor_id: uuid.UUID, payload: FloorUpdate, user: RequireStaff, db: DB
):
    floor = await db.scalar(select(Floor).where(Floor.id == floor_id))
    if floor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Floor not found")

    data = payload.model_dump(exclude_unset=True)
    if "level" in data and data["level"] != floor.level:
        clash = await db.scalar(select(Floor.id).where(
            Floor.building_id == floor.building_id,
            Floor.level == data["level"], Floor.id != floor_id))
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Level {data['level']} already exists in this building.")

    for field, value in data.items():
        setattr(floor, field, value)
    await db.flush()
    return FloorOut.model_validate(floor)


@router.post("/campuses/{campus_id}/buildings", response_model=BuildingOut, status_code=201)
async def create_building(
    campus_id: uuid.UUID, payload: BuildingUpsert, user: RequireStaff, db: DB
):
    """Create a building, and its floors along with it.

    A building with no floors cannot hold rooms, so creating them together
    avoids leaving the hierarchy in a state where nothing can be added to it.
    """
    campus = await db.scalar(
        select(Campus).where(Campus.id == campus_id,
                             Campus.organization_id == user.organization_id))
    if campus is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campus not found")

    clash = await db.scalar(
        select(Building.id).where(Building.campus_id == campus_id, Building.code == payload.code))
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Building code {payload.code} already exists on this campus.")

    building = Building(campus_id=campus_id, **payload.model_dump())
    db.add(building)
    await db.flush()

    for level in range(1, payload.floors_count + 1):
        db.add(Floor(building_id=building.id, name=f"Floor {level}", level=level))

    await db.flush()
    await db.refresh(building)
    return BuildingOut.model_validate(building)


@router.patch("/buildings/{building_id}", response_model=BuildingOut)
async def update_building(
    building_id: uuid.UUID, payload: BuildingUpsert, user: RequireStaff, db: DB
):
    building = await db.scalar(select(Building).where(Building.id == building_id))
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")

    if payload.code != building.code:
        clash = await db.scalar(
            select(Building.id).where(
                Building.campus_id == building.campus_id,
                Building.code == payload.code, Building.id != building_id))
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Building code {payload.code} already exists on this campus.")

    for field, value in payload.model_dump().items():
        setattr(building, field, value)
    await db.flush()
    return BuildingOut.model_validate(building)


@router.delete("/buildings/{building_id}", response_model=Message)
async def delete_building(building_id: uuid.UUID, user: RequireAdmin, db: DB):
    building = await db.scalar(select(Building).where(Building.id == building_id))
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")

    rooms = await db.scalar(
        select(func.count(Room.id))
        .select_from(Room).join(Floor, Floor.id == Room.floor_id)
        .where(Floor.building_id == building_id)) or 0
    if rooms:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{building.code} still contains {rooms} room(s). Remove them first.")

    await db.delete(building)
    return Message(detail=f"{building.name} removed.")


@router.post("/buildings/{building_id}/floors", response_model=FloorOut, status_code=201)
async def create_floor(
    building_id: uuid.UUID, payload: FloorUpsert, user: RequireStaff, db: DB
):
    building = await db.scalar(select(Building).where(Building.id == building_id))
    if building is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Building not found")

    clash = await db.scalar(
        select(Floor.id).where(Floor.building_id == building_id, Floor.level == payload.level))
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Level {payload.level} already exists in this building.")

    floor = Floor(building_id=building_id, **payload.model_dump())
    db.add(floor)
    await db.flush()
    await db.refresh(floor)

    building.floors_count = await db.scalar(
        select(func.count()).select_from(Floor).where(Floor.building_id == building_id)) or 1
    return FloorOut.model_validate(floor)


@router.delete("/floors/{floor_id}", response_model=Message)
async def delete_floor(floor_id: uuid.UUID, user: RequireAdmin, db: DB):
    floor = await db.scalar(select(Floor).where(Floor.id == floor_id))
    if floor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Floor not found")

    rooms = await db.scalar(
        select(func.count()).select_from(Room).where(Room.floor_id == floor_id)) or 0
    if rooms:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"{floor.name} still contains {rooms} room(s). Remove them first.")

    building_id = floor.building_id
    await db.delete(floor)
    await db.flush()

    building = await db.scalar(select(Building).where(Building.id == building_id))
    if building:
        building.floors_count = max(1, await db.scalar(
            select(func.count()).select_from(Floor).where(Floor.building_id == building_id)) or 1)
    return Message(detail=f"{floor.name} removed.")


# ---------------------------------------------------------------- editing
class FloorPlanImage(BaseModel):
    floor_plan_url: str
    plan_width: Optional[int] = None
    plan_height: Optional[int] = None


class RoomUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=30)
    kind: RoomKind = RoomKind.CLASSROOM
    capacity: Optional[int] = Field(None, ge=0)
    area_sqft: Optional[float] = Field(None, ge=0)
    # Polygon as [[x, y], …] normalised 0..1 against the floor plan.
    boundary: Optional[list] = None


class AssetPlacement(BaseModel):
    pos_x: float = Field(ge=0, le=1)
    pos_y: float = Field(ge=0, le=1)


def _validate_boundary(boundary: Optional[list]) -> Optional[list]:
    """A malformed polygon renders as an invisible or nonsensical room, so
    reject it here rather than letting it reach the twin."""
    if boundary is None:
        return None
    if not isinstance(boundary, list) or len(boundary) < 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "A room outline needs at least three points.")
    cleaned = []
    for point in boundary:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Each outline point must be a pair of coordinates.")
        x, y = point
        try:
            x, y = float(x), float(y)
        except (TypeError, ValueError):
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Outline coordinates must be numbers.")
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Outline coordinates are normalised and must fall between 0 and 1.")
        cleaned.append([round(x, 5), round(y, 5)])
    return cleaned


@router.patch("/floors/{floor_id}/plan-image", response_model=FloorOut)
async def set_floor_plan_image(
    floor_id: uuid.UUID, payload: FloorPlanImage, user: RequireStaff, db: DB
):
    """Attach an uploaded plan image to a floor. Upload via /uploads/image first."""
    floor = await db.scalar(select(Floor).where(Floor.id == floor_id))
    if floor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Floor not found")

    floor.floor_plan_url = payload.floor_plan_url
    floor.plan_width = payload.plan_width
    floor.plan_height = payload.plan_height
    await db.flush()
    return FloorOut.model_validate(floor)


@router.post("/floors/{floor_id}/rooms", response_model=RoomOut, status_code=201)
async def create_room(
    floor_id: uuid.UUID, payload: RoomUpsert, user: RequireStaff, db: DB
):
    floor = await db.scalar(select(Floor).where(Floor.id == floor_id))
    if floor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Floor not found")

    clash = await db.scalar(
        select(Room.id).where(Room.floor_id == floor_id, Room.code == payload.code))
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Room code {payload.code} already exists on this floor.")

    building = await db.scalar(select(Building).where(Building.id == floor.building_id))
    room = Room(
        floor_id=floor_id, name=payload.name, code=payload.code, kind=payload.kind,
        capacity=payload.capacity, area_sqft=payload.area_sqft,
        boundary=_validate_boundary(payload.boundary),
        # Deterministic zone id, matching the format used elsewhere.
        zone_id=f"ZN-BLD{building.code}-F{floor.level}-{payload.code.split('-')[-1]}"
        if building else None,
    )
    db.add(room)
    await db.flush()
    await db.refresh(room)
    return RoomOut.model_validate(room)


@router.patch("/rooms/{room_id}", response_model=RoomOut)
async def update_room(
    room_id: uuid.UUID, payload: RoomUpsert, user: RequireStaff, db: DB
):
    room = await db.scalar(select(Room).where(Room.id == room_id))
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")

    if payload.code != room.code:
        clash = await db.scalar(
            select(Room.id).where(
                Room.floor_id == room.floor_id, Room.code == payload.code,
                Room.id != room_id))
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Room code {payload.code} already exists on this floor.")

    room.name = payload.name
    room.code = payload.code
    room.kind = payload.kind
    room.capacity = payload.capacity
    room.area_sqft = payload.area_sqft
    if payload.boundary is not None:
        room.boundary = _validate_boundary(payload.boundary)
    await db.flush()
    return RoomOut.model_validate(room)


@router.delete("/rooms/{room_id}", response_model=Message)
async def delete_room(room_id: uuid.UUID, user: RequireAdmin, db: DB):
    room = await db.scalar(select(Room).where(Room.id == room_id))
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")

    assets = await db.scalar(
        select(func.count()).select_from(Asset).where(Asset.room_id == room_id)) or 0
    if assets:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{room.code} still holds {assets} asset(s). Move or remove them first.")

    await db.delete(room)
    return Message(detail=f"{room.code} removed.")


@router.patch("/assets/{asset_id}/position", response_model=Message)
async def place_asset(
    asset_id: uuid.UUID, payload: AssetPlacement, user: RequireStaff, db: DB
):
    """Position an asset on the floor plan, normalised within its room."""
    asset = await db.scalar(select(Asset).where(Asset.id == asset_id))
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")

    asset.pos_x = payload.pos_x
    asset.pos_y = payload.pos_y
    await db.flush()
    return Message(detail=f"{asset.tag} placed.")


@router.post("/rooms/{room_id}/assets", response_model=AssetOut, status_code=201)
async def create_asset(
    room_id: uuid.UUID, payload: AssetCreate, user: RequireStaff, db: DB
):
    room = await db.scalar(select(Room).where(Room.id == room_id))
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")

    clash = await db.scalar(select(Asset.id).where(Asset.tag == payload.tag))
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Asset tag {payload.tag} is already in use.")

    data = payload.model_dump(exclude={"room_id"})
    asset = Asset(room_id=room_id, **data)
    db.add(asset)
    await db.flush()
    await db.refresh(asset)
    return AssetOut.model_validate(asset)


@router.post("/rooms/{room_id}/assets/bulk", response_model=list[AssetOut], status_code=201)
async def create_assets_bulk(
    room_id: uuid.UUID, payload: AssetBulkCreate, user: RequireStaff, db: DB
):
    """Register a run of identical units in one go.

    A lab with twelve identical tube lights is the normal case, and forcing
    twelve separate submissions with twelve hand-typed tags is why asset
    registers stop being maintained. Tags are suffixed from the given stem;
    every other field is shared.
    """
    room = await db.scalar(select(Room).where(Room.id == room_id))
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")

    quantity = payload.quantity
    stem = payload.tag.rstrip("-")
    tags = [payload.tag] if quantity == 1 else [f"{stem}-{i:02d}" for i in range(1, quantity + 1)]

    taken = set((await db.scalars(select(Asset.tag).where(Asset.tag.in_(tags)))).all())
    if taken:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Already in use: {', '.join(sorted(taken)[:5])}"
            + (" …" if len(taken) > 5 else ""),
        )

    data = payload.model_dump(exclude={"room_id", "quantity", "tag"})
    created = []
    for i, tag in enumerate(tags):
        asset = Asset(room_id=room_id, tag=tag, **data)
        # Spread the markers so a dozen units are not stacked on one pixel.
        if quantity > 1 and payload.pos_x is not None and payload.pos_y is not None:
            asset.pos_x = min(0.98, max(0.02, float(payload.pos_x) + (i % 5) * 0.03))
            asset.pos_y = min(0.98, max(0.02, float(payload.pos_y) + (i // 5) * 0.03))
        db.add(asset)
        created.append(asset)

    await db.flush()
    for a in created:
        await db.refresh(a)
    return [AssetOut.model_validate(a) for a in created]


@router.patch("/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: uuid.UUID, payload: AssetUpdate, user: RequireStaff, db: DB
):
    asset = await db.scalar(select(Asset).where(Asset.id == asset_id))
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")

    data = payload.model_dump(exclude_unset=True)
    if "tag" in data and data["tag"] != asset.tag:
        clash = await db.scalar(
            select(Asset.id).where(Asset.tag == data["tag"], Asset.id != asset_id))
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Asset tag {data['tag']} is already in use.")

    for field, value in data.items():
        setattr(asset, field, value)
    await db.flush()
    await db.refresh(asset)
    return AssetOut.model_validate(asset)


@router.delete("/assets/{asset_id}", response_model=Message)
async def delete_asset(asset_id: uuid.UUID, user: RequireAdmin, db: DB):
    """Removes the asset and its history.

    Work orders and issues that referenced it keep their own records; the
    foreign keys null out rather than cascading, so the maintenance spend
    already booked against it stays in the ledger.
    """
    asset = await db.scalar(select(Asset).where(Asset.id == asset_id))
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")

    tag = asset.tag
    await db.delete(asset)
    return Message(detail=f"Asset {tag} removed.")


@router.get("/rooms/{room_id}", response_model=RoomOut)
async def get_room(room_id: uuid.UUID, user: CurrentUser, db: DB):
    room = await db.scalar(select(Room).where(Room.id == room_id))
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    return RoomOut.model_validate(room)


@router.get("/rooms/{room_id}/assets", response_model=list[AssetOut])
async def room_assets(room_id: uuid.UUID, user: CurrentUser, db: DB):
    rows = (await db.scalars(
        select(Asset).where(Asset.room_id == room_id).order_by(Asset.tag))).all()
    return [AssetOut.model_validate(a) for a in rows]


@router.get("/asset-categories", response_model=list[AssetCategoryOut])
async def asset_categories(user: CurrentUser, db: DB):
    rows = (await db.scalars(
        select(AssetCategory)
        .where(AssetCategory.organization_id == user.organization_id)
        .order_by(AssetCategory.name)
    )).all()
    return [AssetCategoryOut.model_validate(c) for c in rows]


@router.get("/assets", response_model=Page[dict])
async def list_assets(
    user: CurrentUser, db: DB, paging: Paging,
    building_id: Optional[uuid.UUID] = None,
    floor_id: Optional[uuid.UUID] = None,
    room_id: Optional[uuid.UUID] = None,
    category_id: Optional[uuid.UUID] = None,
    state: Optional[list[AssetState]] = Query(None),
    q: Optional[str] = Query(None, description="Search tag, name, model or serial"),
    needs_attention: bool = Query(False, description="Anything not healthy"),
    sort: str = Query("tag", pattern="^(tag|name|state|room|warranty)$"),
):
    """Campus-wide asset registry.

    Joined up through the spatial hierarchy so a caller can filter at any level
    without first resolving the tree themselves.
    """
    query = (
        select(Asset, Room, Floor, Building, AssetCategory)
        .join(Room, Room.id == Asset.room_id, isouter=True)
        .join(Floor, Floor.id == Room.floor_id, isouter=True)
        .join(Building, Building.id == Floor.building_id, isouter=True)
        .join(Campus, Campus.id == Building.campus_id, isouter=True)
        .join(AssetCategory, AssetCategory.id == Asset.category_id)
        .where(AssetCategory.organization_id == user.organization_id)
    )

    if building_id:
        query = query.where(Building.id == building_id)
    if floor_id:
        query = query.where(Floor.id == floor_id)
    if room_id:
        query = query.where(Asset.room_id == room_id)
    if category_id:
        query = query.where(Asset.category_id == category_id)
    if state:
        query = query.where(Asset.state.in_(state))
    if needs_attention:
        query = query.where(Asset.state != AssetState.HEALTHY)
    if q:
        like = f"%{q}%"
        query = query.where(or_(
            Asset.tag.ilike(like), Asset.name.ilike(like),
            Asset.model.ilike(like), Asset.serial_no.ilike(like)))

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0

    order = {
        "tag": Asset.tag.asc(),
        "name": Asset.name.asc(),
        # Postgres orders enums by declaration order: healthy first, so reverse
        # it to surface the problems.
        "state": Asset.state.desc(),
        "room": Room.code.asc().nullslast(),
        "warranty": Asset.warranty_expiry.asc().nullslast(),
    }[sort]

    rows = (await db.execute(
        query.order_by(order).offset(paging.offset).limit(paging.limit))).all()

    asset_ids = [r[0].id for r in rows]

    # Open issue counts, in one grouped query rather than per row.
    counts = dict((await db.execute(
        select(Issue.asset_id, func.count())
        .where(Issue.asset_id.in_(asset_ids), Issue.status.in_(OPEN_ISSUE_STATES))
        .group_by(Issue.asset_id))).all()) if asset_ids else {}

    today = date.today()
    items = []
    for asset, room, floor, building, category in rows:
        expired = bool(asset.warranty_expiry and asset.warranty_expiry < today)
        items.append({
            "id": str(asset.id),
            "tag": asset.tag,
            "name": asset.name,
            "state": asset.state.value,
            "colour": STATE_COLOURS[asset.state.value],
            "state_label": STATE_LABELS[asset.state.value],
            "category": category.name if category else None,
            "category_icon": category.icon if category else None,
            "manufacturer": asset.manufacturer,
            "model": asset.model,
            "room": room.name if room else None,
            "room_code": room.code if room else None,
            "room_id": str(room.id) if room else None,
            "floor": floor.name if floor else None,
            "building": building.name if building else None,
            "building_code": building.code if building else None,
            "warranty_expiry": asset.warranty_expiry.isoformat() if asset.warranty_expiry else None,
            "warranty_expired": expired,
            "last_service_at": asset.last_service_at.isoformat() if asset.last_service_at else None,
            "open_issues": counts.get(asset.id, 0),
        })

    return Page[dict](items=items, total=total,
                      page=paging.page, page_size=paging.page_size)


@router.get("/assets/{asset_id}", response_model=dict)
async def asset_detail(asset_id: uuid.UUID, user: CurrentUser, db: DB):
    """Asset Details plus its condition and maintenance history."""
    asset = await db.scalar(select(Asset).where(Asset.id == asset_id))
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")

    history = (await db.scalars(
        select(AssetStateHistory)
        .where(AssetStateHistory.asset_id == asset_id)
        .order_by(AssetStateHistory.changed_at.desc()).limit(50)
    )).all()

    open_issues = (await db.scalars(
        select(Issue).where(Issue.asset_id == asset_id, Issue.status.in_(OPEN_ISSUE_STATES))
        .order_by(Issue.created_at.desc())
    )).all()

    work_orders = (await db.scalars(
        select(WorkOrder).where(WorkOrder.asset_id == asset_id)
        .order_by(WorkOrder.created_at.desc()).limit(20)
    )).all()

    room = await db.scalar(select(Room).where(Room.id == asset.room_id)) if asset.room_id else None

    return {
        "asset": AssetOut.model_validate(asset).model_dump(mode="json"),
        "state_colour": STATE_COLOURS[asset.state.value],
        "state_label": STATE_LABELS[asset.state.value],
        "room": {"id": str(room.id), "name": room.name, "code": room.code,
                 "zone_id": room.zone_id} if room else None,
        "condition_history": [
            {"from": h.from_state.value if h.from_state else None,
             "to": h.to_state.value, "reason": h.reason,
             "at": h.changed_at.isoformat()}
            for h in history
        ],
        "open_issues": [
            {"id": str(i.id), "reference": i.reference, "title": i.title,
             "status": i.status.value, "priority": i.priority.value}
            for i in open_issues
        ],
        "maintenance_history": [
            {"id": str(w.id), "reference": w.reference, "title": w.title,
             "status": w.status.value, "completed_at": w.completed_at.isoformat() if w.completed_at else None,
             "cost": float(w.labour_cost or 0) + float(w.parts_cost or 0)}
            for w in work_orders
        ],
    }


@router.patch("/assets/{asset_id}/state", response_model=Message)
async def update_asset_state(
    asset_id: uuid.UUID, payload: AssetStateUpdate, user: RequireStaff, db: DB
):
    """Manual state override — broadcasts to every live twin viewer."""
    asset = await db.scalar(select(Asset).where(Asset.id == asset_id))
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")

    changed = await set_asset_state(
        db, asset, payload.state,
        reason=payload.reason or f"Manually set by {user.full_name}", actor_id=user.id,
    )
    if not changed:
        return Message(detail=f"{asset.tag} is already {payload.state.value}.")
    return Message(detail=f"{asset.tag} set to {STATE_LABELS[payload.state.value]}.")


@router.get("/campuses/{campus_id}/events", response_model=list[TwinEventOut])
async def twin_events(
    campus_id: uuid.UUID, user: CurrentUser, db: DB,
    since: Optional[datetime] = Query(None, description="ISO timestamp lower bound"),
    until: Optional[datetime] = Query(None, description="ISO timestamp upper bound"),
    limit: int = Query(200, ge=1, le=1000),
):
    """Event Timeline / Event Replay feed. Simulation events are excluded."""
    query = select(TwinEvent).where(
        TwinEvent.campus_id == campus_id, TwinEvent.simulation_id.is_(None))
    if since:
        query = query.where(TwinEvent.occurred_at >= since)
    if until:
        query = query.where(TwinEvent.occurred_at <= until)

    rows = (await db.scalars(
        query.order_by(TwinEvent.occurred_at.desc()).limit(limit))).all()
    return [
        TwinEventOut(
            id=e.id, kind=e.kind.value, entity_type=e.entity_type, entity_id=e.entity_id,
            room_id=e.room_id, payload=e.payload, occurred_at=e.occurred_at,
        ) for e in rows
    ]


@router.get("/campuses/{campus_id}/replay-range", response_model=dict)
async def replay_range(campus_id: uuid.UUID, user: CurrentUser, db: DB):
    """Bounds for the replay scrubber: when history starts, and how much there is.

    Derived from asset_state_history rather than twin_events, because that is
    what state reconstruction actually replays — a range wider than the history
    would let the scrubber sit in a period with nothing to show.
    """
    asset_ids = (await db.scalars(
        select(Asset.id)
        .join(Room, Room.id == Asset.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id)
    )).all()

    earliest = latest = None
    transitions = 0
    if asset_ids:
        row = (await db.execute(
            select(func.min(AssetStateHistory.changed_at),
                   func.max(AssetStateHistory.changed_at),
                   func.count())
            .where(AssetStateHistory.asset_id.in_(asset_ids))
        )).first()
        earliest, latest, transitions = row

    now = datetime.now(timezone.utc)
    # With no history yet, offer the last 24 hours so the control still renders.
    start = earliest or (now - timedelta(hours=24))

    events = await db.scalar(
        select(func.count()).select_from(TwinEvent)
        .where(TwinEvent.campus_id == campus_id, TwinEvent.simulation_id.is_(None))) or 0

    return {
        "start": start.isoformat(),
        "end": now.isoformat(),
        "latest_change": latest.isoformat() if latest else None,
        "transitions": transitions,
        "events": events,
        "has_history": transitions > 0,
    }


@router.get("/campuses/{campus_id}/state-at", response_model=dict)
async def state_at(
    campus_id: uuid.UUID, user: CurrentUser, db: DB,
    at: datetime = Query(..., description="Reconstruct the twin at this instant"),
):
    """Event Replay: rebuild every asset's state as it was at `at`.

    Replays asset_state_history rather than trusting the current row, so the
    reconstruction is exact rather than approximate.
    """
    assets = (await db.scalars(
        select(Asset)
        .join(Room, Room.id == Asset.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id)
    )).all()
    asset_ids = [a.id for a in assets]

    # Latest transition at or before `at` for each asset.
    rows = (await db.execute(
        select(AssetStateHistory.asset_id, AssetStateHistory.to_state,
               AssetStateHistory.changed_at)
        .where(AssetStateHistory.asset_id.in_(asset_ids),
               AssetStateHistory.changed_at <= at)
        .order_by(AssetStateHistory.asset_id, AssetStateHistory.changed_at.desc())
    )).all() if asset_ids else []

    resolved: dict[uuid.UUID, str] = {}
    for aid, state, _ in rows:
        resolved.setdefault(aid, state.value)

    out, breakdown = [], {s.value: 0 for s in AssetState}
    for a in assets:
        # No transition before `at` means the asset was still in its initial state.
        state = resolved.get(a.id, AssetState.HEALTHY.value)
        breakdown[state] += 1
        out.append({
            "id": str(a.id), "tag": a.tag, "room_id": str(a.room_id) if a.room_id else None,
            "state": state, "colour": STATE_COLOURS[state],
        })

    return {"at": at.isoformat(), "assets": out, "state_breakdown": breakdown,
            "total": len(out)}


@router.websocket("/ws/{campus_id}")
async def twin_socket(websocket: WebSocket, campus_id: str):
    """Live Digital Twin feed. Pushes every asset/issue/work-order change."""
    await hub.connect(websocket, campus_id)
    try:
        await websocket.send_json({"type": "connected", "campus_id": campus_id, "legend": LEGEND})
        while True:
            # Client heartbeats keep the socket open; payload is ignored.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(websocket, campus_id)
