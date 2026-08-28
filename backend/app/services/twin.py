"""Digital Twin state management.

Everything that changes the physical picture of the campus funnels through
`record_event` / `set_asset_state`, so the live map, the event replay and the
audit trail can never drift apart.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AssetState, TwinEventKind
from app.models.spatial import Asset, AssetStateHistory, Building, Campus, Floor, Room, TwinEvent
from app.services.realtime import hub

# Marker colours the floor plan renders for each state. Kept server-side so the
# twin, the legend and any exported report agree on one palette.
STATE_COLOURS: dict[str, str] = {
    AssetState.HEALTHY.value:             "#10b981",  # green
    AssetState.WARNING.value:             "#f59e0b",  # amber
    AssetState.FAULT.value:               "#ef4444",  # red
    AssetState.UNDER_MAINTENANCE.value:   "#3b82f6",  # blue
    AssetState.INSPECTION_REQUIRED.value: "#8b5cf6",  # purple
    AssetState.DECOMMISSIONED.value:      "#94a3b8",  # grey
}

STATE_LABELS: dict[str, str] = {
    AssetState.HEALTHY.value:             "Healthy",
    AssetState.WARNING.value:             "Warning",
    AssetState.FAULT.value:               "Fault",
    AssetState.UNDER_MAINTENANCE.value:   "Under Maintenance",
    AssetState.INSPECTION_REQUIRED.value: "Inspection Required",
    AssetState.DECOMMISSIONED.value:      "Decommissioned",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def campus_id_for_room(db: AsyncSession, room_id: uuid.UUID) -> Optional[uuid.UUID]:
    """Walk room -> floor -> building -> campus."""
    return await db.scalar(
        select(Campus.id)
        .join(Building, Building.campus_id == Campus.id)
        .join(Floor, Floor.building_id == Building.id)
        .join(Room, Room.floor_id == Floor.id)
        .where(Room.id == room_id)
    )


async def record_event(
    db: AsyncSession,
    *,
    campus_id: uuid.UUID,
    kind: TwinEventKind,
    entity_type: str,
    entity_id: uuid.UUID,
    room_id: Optional[uuid.UUID] = None,
    payload: Optional[dict] = None,
    actor_id: Optional[uuid.UUID] = None,
    simulation_id: Optional[uuid.UUID] = None,
    broadcast: bool = True,
) -> TwinEvent:
    """Append to the event store and push to live subscribers."""
    event = TwinEvent(
        campus_id=campus_id, kind=kind, entity_type=entity_type, entity_id=entity_id,
        room_id=room_id, payload=payload or {}, actor_id=actor_id,
        simulation_id=simulation_id, occurred_at=_now(),
    )
    db.add(event)
    await db.flush()

    # Simulated events must never reach the live map.
    if broadcast and simulation_id is None:
        await hub.broadcast(str(campus_id), {
            "type": kind.value,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "room_id": str(room_id) if room_id else None,
            "payload": payload or {},
            "occurred_at": event.occurred_at.isoformat(),
        })
    return event


async def set_asset_state(
    db: AsyncSession,
    asset: Asset,
    new_state: AssetState,
    *,
    reason: Optional[str] = None,
    issue_id: Optional[uuid.UUID] = None,
    work_order_id: Optional[uuid.UUID] = None,
    actor_id: Optional[uuid.UUID] = None,
    simulation_id: Optional[uuid.UUID] = None,
) -> bool:
    """Transition an asset, writing history and emitting a twin event.

    Returns False when the state is unchanged, so callers can avoid emitting
    no-op events into the replay timeline.
    """
    if asset.state == new_state:
        return False

    previous = asset.state
    asset.state = new_state

    db.add(AssetStateHistory(
        asset_id=asset.id, from_state=previous, to_state=new_state, reason=reason,
        issue_id=issue_id, work_order_id=work_order_id, changed_by=actor_id, changed_at=_now(),
    ))

    campus_id = await campus_id_for_room(db, asset.room_id) if asset.room_id else None
    if campus_id:
        await record_event(
            db,
            campus_id=campus_id,
            kind=TwinEventKind.ASSET_STATE_CHANGED,
            entity_type="asset",
            entity_id=asset.id,
            room_id=asset.room_id,
            actor_id=actor_id,
            simulation_id=simulation_id,
            payload={
                "tag": asset.tag,
                "name": asset.name,
                "from": previous.value,
                "to": new_state.value,
                "colour": STATE_COLOURS[new_state.value],
                "reason": reason,
            },
        )
    return True


# Which asset state each issue status implies. Reporting a fault turns the marker
# red; a technician starting work turns it blue; resolution restores it to green.
ISSUE_STATUS_TO_ASSET_STATE: dict[str, AssetState] = {
    "reported":    AssetState.FAULT,
    "triaged":     AssetState.FAULT,
    "assigned":    AssetState.FAULT,
    "in_progress": AssetState.UNDER_MAINTENANCE,
    "on_hold":     AssetState.WARNING,
    "resolved":    AssetState.HEALTHY,
    "verified":    AssetState.HEALTHY,
    "closed":      AssetState.HEALTHY,
    "rejected":    AssetState.HEALTHY,
    "duplicate":   AssetState.HEALTHY,
}


async def sync_asset_to_issue_status(
    db: AsyncSession,
    asset_id: Optional[uuid.UUID],
    issue_status: str,
    *,
    issue_id: uuid.UUID,
    actor_id: Optional[uuid.UUID] = None,
) -> None:
    """Keep the twin marker in step with the complaint lifecycle.

    An asset is only returned to healthy once *no* other open issue references it,
    otherwise closing one of two faults would wrongly clear the marker.
    """
    if asset_id is None:
        return

    target = ISSUE_STATUS_TO_ASSET_STATE.get(issue_status)
    if target is None:
        return

    asset = await db.scalar(select(Asset).where(Asset.id == asset_id))
    if asset is None:
        return

    if target == AssetState.HEALTHY:
        from app.models.issues import Issue  # local import avoids a cycle

        remaining = await db.scalar(
            select(Issue.id).where(
                Issue.asset_id == asset_id,
                Issue.id != issue_id,
                Issue.status.notin_(["closed", "rejected", "duplicate", "resolved", "verified"]),
            ).limit(1)
        )
        if remaining is not None:
            return  # another live complaint still owns this asset

    await set_asset_state(
        db, asset, target,
        reason=f"issue {issue_status}", issue_id=issue_id, actor_id=actor_id,
    )
