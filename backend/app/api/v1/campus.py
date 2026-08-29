"""Spatial hierarchy and Digital Twin endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser, RequireAdmin, RequireStaff
from app.core.enums import AssetState, IssueStatus
from app.models.identity import Organization
from app.models.issues import Issue
from app.models.spatial import (
    Asset, AssetCategory, AssetStateHistory, Building, Campus, Floor, Room, TwinEvent,
)
from app.models.work import WorkOrder
from app.schemas.campus import (
    AssetCategoryOut, AssetCreate, AssetMarker, AssetOut, AssetStateUpdate,
    BuildingCreate, BuildingOut, CampusOut, CampusOverviewOut, FloorCreate,
    FloorOut, FloorPlanOut, RoomCreate, RoomOut, RoomWithMarkers, TwinEventOut,
)
from app.schemas.common import Message
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

    for b in buildings.values():
        present = [AssetState(s) for s in b["states"]]
        worst = _worst(present) if present else AssetState.HEALTHY
        b["aggregate_state"] = worst.value
        b["aggregate_colour"] = STATE_COLOURS[worst.value]

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
