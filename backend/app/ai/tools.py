"""Read-only tool functions for the CampusNetra AI Agent.

Every tool here wraps an existing, already-authorized route handler
directly rather than re-querying the database from scratch — the exact
same RBAC/org-scoping the REST API enforces applies with zero duplicated
logic, and stays correct automatically if that underlying logic ever
changes. FastAPI route functions are just async Python functions; calling
one directly (outside the ASGI app) simply skips the framework's own
Depends()-based injection, so `user`/`db`/pagination are passed in exactly
as the endpoint already has them.

Security invariant, load-bearing: every tool takes `user: User` from the
assistant endpoint's own `CurrentUser` dependency (the authenticated
caller, derived from their JWT) and `db` from that same request's session.
NOTHING here accepts a caller/LLM-supplied user_id, organization_id, or
role — the model can choose *which* tool to call and *what* to ask it for
(a complaint reference, a search term, a campus id already visible to this
user), never *who* it executes as. A tool that doesn't scope a query to
`user` does so because the wrapped endpoint doesn't need to (e.g. a public
reference lookup already 404s for another org's record).

Mutating tools (create_complaint, create_lost_found) are gated behind an
explicit two-call confirm pattern rather than a separate "are you sure"
tool: the first call (confirm omitted/false) resolves the location and
returns a pending summary without touching the database; only a second
call with confirm=true, from a later turn after the user has actually
agreed, performs the write. update_complaint is intentionally still not
implemented — it needs its own authorization question (who is allowed to
update which fields, technician vs. reporter) that a location-only
resolver like the one below doesn't answer, and isn't worth guessing at.
"""
from __future__ import annotations

import uuid
from typing import Any, Callable, Coroutine

from app.api.deps import Pagination
from app.models.identity import User

log_prefix = "[ai.tools]"


class ToolError(Exception):
    """Raised for anything the model should be told about in plain text
    rather than a stack trace — a bad id, a not-found record, etc."""


def _uuid(value: Any, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise ToolError(f"'{field}' is not a valid id.")


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

async def get_my_profile(db, user: User, **_: Any) -> dict:
    from app.schemas.auth import UserOut

    return UserOut.model_validate(user).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Complaints / Issues
# ---------------------------------------------------------------------------

async def get_my_complaints(db, user: User, status: str | None = None, limit: int = 10, **_: Any) -> dict:
    from app.api.v1.issues import list_issues
    from app.core.enums import IssueStatus

    status_in = None
    if status:
        try:
            status_in = [IssueStatus(status)]
        except ValueError:
            raise ToolError(
                f"'{status}' is not a valid status. Use one of: "
                + ", ".join(s.value for s in IssueStatus)
            )

    page = await list_issues(
        user=user, db=db,
        paging=Pagination(page=1, page_size=min(max(limit, 1), 25)),
        mine=True, status_in=status_in,
    )
    return page.model_dump(mode="json")


async def get_complaint(db, user: User, reference_or_id: str, **_: Any) -> dict:
    """Accepts either the human-facing reference (e.g. CMP-1042) or the raw id."""
    from fastapi import HTTPException

    from app.api.v1.issues import get_issue
    from app.models.issues import Issue
    from sqlalchemy import select

    issue_id = None
    try:
        issue_id = uuid.UUID(str(reference_or_id))
    except (ValueError, AttributeError, TypeError):
        row = await db.scalar(
            select(Issue).where(
                Issue.organization_id == user.organization_id,
                Issue.reference == reference_or_id,
            )
        )
        if row is None:
            raise ToolError(f"No complaint found with reference '{reference_or_id}'.")
        issue_id = row.id

    try:
        detail = await get_issue(issue_id=issue_id, user=user, db=db)
    except HTTPException as exc:
        raise ToolError(exc.detail if isinstance(exc.detail, str) else "That complaint is not available.")

    return detail.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Lost & Found
# ---------------------------------------------------------------------------

async def get_my_lost_found(db, user: User, kind: str | None = None, limit: int = 10, **_: Any) -> dict:
    from app.api.v1.lostfound import list_items
    from app.core.enums import LFKind

    kind_val = None
    if kind:
        try:
            kind_val = LFKind(kind)
        except ValueError:
            raise ToolError(f"'{kind}' is not a valid kind. Use 'lost' or 'found'.")

    page = await list_items(
        user=user, db=db,
        paging=Pagination(page=1, page_size=min(max(limit, 1), 25)),
        mine=True, kind=kind_val, open_only=False,
    )
    return page.model_dump(mode="json")


async def get_lost_found_item(db, user: User, reference_or_id: str, **_: Any) -> dict:
    from fastapi import HTTPException

    from app.api.v1.lostfound import get_item
    from app.models.lostfound import LFItem
    from sqlalchemy import select

    item_id = None
    try:
        item_id = uuid.UUID(str(reference_or_id))
    except (ValueError, AttributeError, TypeError):
        row = await db.scalar(
            select(LFItem).where(
                LFItem.organization_id == user.organization_id,
                LFItem.reference == reference_or_id,
            )
        )
        if row is None:
            raise ToolError(f"No Lost & Found item found with reference '{reference_or_id}'.")
        item_id = row.id

    try:
        detail = await get_item(item_id=item_id, user=user, db=db)
    except HTTPException as exc:
        raise ToolError(exc.detail if isinstance(exc.detail, str) else "That item is not available.")

    return detail.model_dump(mode="json")


async def search_lost_found(db, user: User, query: str, kind: str | None = None, limit: int = 10, **_: Any) -> dict:
    from app.api.v1.lostfound import list_items
    from app.core.enums import LFKind

    kind_val = None
    if kind:
        try:
            kind_val = LFKind(kind)
        except ValueError:
            raise ToolError(f"'{kind}' is not a valid kind. Use 'lost' or 'found'.")

    page = await list_items(
        user=user, db=db,
        paging=Pagination(page=1, page_size=min(max(limit, 1), 25)),
        mine=False, kind=kind_val, q=query, open_only=True,
    )
    return page.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Campus / spatial
# ---------------------------------------------------------------------------

async def get_campuses(db, user: User, **_: Any) -> dict:
    from app.api.v1.campus import list_campuses

    rows = await list_campuses(user=user, db=db)
    return {"items": [r.model_dump(mode="json") for r in rows]}


async def get_buildings(db, user: User, campus_id: str, **_: Any) -> dict:
    from app.api.v1.campus import list_buildings

    rows = await list_buildings(campus_id=_uuid(campus_id, "campus_id"), user=user, db=db)
    return {"items": [r.model_dump(mode="json") for r in rows]}


async def get_floors(db, user: User, building_id: str, **_: Any) -> dict:
    from app.api.v1.campus import list_floors

    rows = await list_floors(building_id=_uuid(building_id, "building_id"), user=user, db=db)
    return {"items": [r.model_dump(mode="json") for r in rows]}


async def get_rooms(db, user: User, floor_id: str, **_: Any) -> dict:
    # No standalone "list rooms for a floor" endpoint exists (rooms are
    # otherwise only returned nested inside the heavier floor-plan payload,
    # or created via POST) — this is a small, org-scoped, read-only query
    # of its own rather than force-fitting a bigger endpoint's response.
    from sqlalchemy import select

    from app.models.spatial import Building, Campus, Floor, Room
    from app.schemas.campus import RoomOut

    fid = _uuid(floor_id, "floor_id")
    rows = (await db.scalars(
        select(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .join(Campus, Campus.id == Building.campus_id)
        .where(Room.floor_id == fid, Campus.organization_id == user.organization_id)
        .order_by(Room.code)
    )).all()
    return {"items": [RoomOut.model_validate(r).model_dump(mode="json") for r in rows]}


async def get_assets(db, user: User, room_id: str, **_: Any) -> dict:
    from app.api.v1.campus import room_assets

    rows = await room_assets(room_id=_uuid(room_id, "room_id"), user=user, db=db)
    return {"items": [r.model_dump(mode="json") for r in rows]}


# ---------------------------------------------------------------------------
# Notifications / dashboard
# ---------------------------------------------------------------------------

async def get_notifications(db, user: User, unread_only: bool = False, limit: int = 10, **_: Any) -> dict:
    from app.api.v1.notifications import list_notifications

    return await list_notifications(
        user=user, db=db, limit=min(max(limit, 1), 25), unread_only=unread_only,
    )


async def get_dashboard_summary(db, user: User, **_: Any) -> dict:
    from app.api.v1.dashboard import dashboard

    return await dashboard(user=user, db=db)


# ---------------------------------------------------------------------------
# Location resolution — shared by create_complaint / create_lost_found
# ---------------------------------------------------------------------------

async def _resolve_room(db, user: User, room_name: str | None, building_name: str | None):
    """Best-effort match of a spoken room/building name to a real, org-scoped
    room. Never guesses across an ambiguity — returns a structured "which one
    did you mean" result instead, per the location-resolution requirement:
    a wrong silent guess here means a complaint gets filed against the wrong
    physical room, which is worse than one extra question.

    Returns (room_or_none, ambiguous_options_or_none, campus_id_or_none).
    """
    from sqlalchemy import select

    from app.models.spatial import Building, Campus, Floor, Room

    if not room_name:
        return None, None, None

    q = (
        select(Room, Floor, Building)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .join(Campus, Campus.id == Building.campus_id)
        .where(
            Campus.organization_id == user.organization_id,
            Room.name.ilike(f"%{room_name}%") | Room.code.ilike(f"%{room_name}%"),
        )
    )
    if building_name:
        q = q.where(Building.name.ilike(f"%{building_name}%") | Building.code.ilike(f"%{building_name}%"))

    rows = (await db.execute(q.limit(6))).all()
    if not rows:
        return None, None, None
    if len(rows) == 1:
        room, floor, building = rows[0]
        return room, None, building.campus_id
    options = [
        {
            "room_id": str(room.id), "room_name": room.name,
            "path": f"{building.name} \u2192 {floor.name} \u2192 {room.name}",
        }
        for room, floor, building in rows
    ]
    return None, options, None


def _summarise_issue(title: str, description: str, room, building_name, room_name) -> dict:
    location = None
    if room is not None:
        location = room.name
    elif building_name or room_name:
        location = " / ".join(x for x in (building_name, room_name) if x)
    return {"title": title, "description": description, "location": location}


async def create_complaint(
    db, user: User, title: str, description: str,
    room_name: str | None = None, building_name: str | None = None,
    confirm: bool = False, **_: Any,
) -> dict:
    """Report a facility issue, gated behind an explicit confirmation.

    First call (confirm omitted or false): resolves the location and returns
    a pending summary — nothing is created yet. The agent must show this
    summary to the user and only call this tool again, with confirm=true and
    the SAME arguments, once the user has explicitly agreed. This mirrors the
    conversational-form + explicit-confirmation requirement: the model can
    describe an action, but only the backend, on a second, explicit call,
    ever actually performs it.
    """
    from app.core.enums import Priority
    from app.services import issues as issue_service

    room, options, campus_id = await _resolve_room(db, user, room_name, building_name)
    if options:
        return {"ambiguous": True, "options": options,
                "message": "Multiple rooms match that name. Ask the user which one they mean."}
    if room_name and room is None:
        return {"ok": False,
                "error": f"No room matching '{room_name}' was found on this campus."}
    if room is None and campus_id is None:
        # No location given at all — fall back to the user's default campus
        # rather than blocking creation outright; campus_id is genuinely
        # required by create_issue, everything else is optional there too.
        from sqlalchemy import select

        from app.models.spatial import Campus
        campus_id = await db.scalar(
            select(Campus.id).where(Campus.organization_id == user.organization_id).limit(1))
        if campus_id is None:
            return {"ok": False, "error": "No campus is configured for this organization yet."}

    if not confirm:
        return {"ok": True, "pending": True,
                "summary": _summarise_issue(title, description, room, building_name, room_name)}

    issue, candidates = await issue_service.create_issue(
        db, user, title=title, description=description, campus_id=campus_id,
        room_id=room.id if room else None,
    )
    await db.flush()
    likely = [c for c in candidates if c.verdict == "likely"]
    return {
        "ok": True, "created": True,
        "reference": issue.reference, "id": str(issue.id),
        "possible_duplicate_of": likely[0].reference if likely else None,
    }


async def create_lost_found(
    db, user: User, kind: str, title: str, description: str | None = None,
    colour: str | None = None, brand: str | None = None,
    room_name: str | None = None, building_name: str | None = None,
    confirm: bool = False, **_: Any,
) -> dict:
    """Report a lost or found item, gated behind the same explicit-confirm
    pattern as create_complaint — see its docstring."""
    from datetime import datetime, timezone

    from app.services import lostfound as lf_service

    if kind not in ("lost", "found"):
        raise ToolError("kind must be 'lost' or 'found'.")

    room, options, campus_id = await _resolve_room(db, user, room_name, building_name)
    if options:
        return {"ambiguous": True, "options": options,
                "message": "Multiple rooms match that name. Ask the user which one they mean."}
    if room_name and room is None:
        return {"ok": False,
                "error": f"No room matching '{room_name}' was found on this campus."}

    if not confirm:
        return {"ok": True, "pending": True, "summary": {
            "kind": kind, "title": title, "description": description,
            "colour": colour, "brand": brand,
            "location": room.name if room else (building_name or room_name),
        }}

    fields = {
        "kind": kind, "title": title, "description": description,
        "colour": colour, "brand": brand,
        "category_id": None, "campus_id": campus_id, "building_id": None,
        "room_id": room.id if room else None, "location_note": None, "zone_code": None,
        "occurred_at": datetime.now(timezone.utc), "contact_pref": "in_app",
        "holding_location": None,
    }
    item, matches = await lf_service.create_item(db, user, fields, [])
    await db.flush()
    strong = [m for m in matches if float(m.score) >= 0.8]
    return {
        "ok": True, "created": True,
        "reference": item.reference, "id": str(item.id),
        "match_count": len(matches), "strong_match_count": len(strong),
    }


# ---------------------------------------------------------------------------
# Registry — name -> (callable, OpenAI-style JSON schema)
# ---------------------------------------------------------------------------

ToolFn = Callable[..., Coroutine[Any, Any, dict]]

TOOLS: dict[str, ToolFn] = {
    "get_my_profile": get_my_profile,
    "get_my_complaints": get_my_complaints,
    "get_complaint": get_complaint,
    "create_complaint": create_complaint,
    "get_my_lost_found": get_my_lost_found,
    "get_lost_found_item": get_lost_found_item,
    "search_lost_found": search_lost_found,
    "create_lost_found": create_lost_found,
    "get_campuses": get_campuses,
    "get_buildings": get_buildings,
    "get_floors": get_floors,
    "get_rooms": get_rooms,
    "get_assets": get_assets,
    "get_notifications": get_notifications,
    "get_dashboard_summary": get_dashboard_summary,
}

TOOL_SCHEMAS: list[dict] = [
    {"type": "function", "function": {
        "name": "get_my_profile",
        "description": "Get the current authenticated user's own profile.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_my_complaints",
        "description": "List complaints/issues reported by the current user.",
        "parameters": {"type": "object", "properties": {
            "status": {"type": "string", "description": "Optional status filter, e.g. 'reported', 'in_progress', 'resolved'."},
            "limit": {"type": "integer", "description": "Max results, default 10."},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_complaint",
        "description": "Get full details of one complaint by its reference (e.g. CMP-1042) or id. Only returns it if the current user is allowed to view it.",
        "parameters": {"type": "object", "required": ["reference_or_id"], "properties": {
            "reference_or_id": {"type": "string"},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_my_lost_found",
        "description": "List Lost & Found items reported by the current user.",
        "parameters": {"type": "object", "properties": {
            "kind": {"type": "string", "enum": ["lost", "found"]},
            "limit": {"type": "integer"},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_lost_found_item",
        "description": "Get full details of one Lost & Found item by its reference (e.g. LF7K29A4X) or id.",
        "parameters": {"type": "object", "required": ["reference_or_id"], "properties": {
            "reference_or_id": {"type": "string"},
        }},
    }},
    {"type": "function", "function": {
        "name": "search_lost_found",
        "description": "Search all open Lost & Found items on the user's campus by keyword (not just the user's own).",
        "parameters": {"type": "object", "required": ["query"], "properties": {
            "query": {"type": "string"},
            "kind": {"type": "string", "enum": ["lost", "found"]},
            "limit": {"type": "integer"},
        }},
    }},
    {"type": "function", "function": {
        "name": "create_complaint",
        "description": (
            "Report a facility issue on the user's behalf. ALWAYS call this first with "
            "confirm omitted (or false) once title, description and location are known — "
            "it resolves the location and returns a summary WITHOUT creating anything. "
            "Show that summary to the user and ask them to confirm. Only call it again, "
            "with confirm=true and the exact same arguments, after the user explicitly "
            "agrees (e.g. 'yes', 'confirm', 'go ahead', 'submit'). If the result says "
            "ambiguous, ask the user to pick one of the listed options before proceeding."
        ),
        "parameters": {"type": "object", "required": ["title", "description"], "properties": {
            "title": {"type": "string", "description": "Short summary, e.g. 'AC not working'."},
            "description": {"type": "string", "description": "What's wrong, in the user's words."},
            "building_name": {"type": "string", "description": "Building name/code, if known."},
            "room_name": {"type": "string", "description": "Room name/code, if known, e.g. 'Lab 3', '204'."},
            "confirm": {"type": "boolean", "description": "true only after the user has explicitly confirmed. Defaults to false."},
        }},
    }},
    {"type": "function", "function": {
        "name": "create_lost_found",
        "description": (
            "Report a lost or found item on the user's behalf. Same two-step pattern as "
            "create_complaint: call with confirm=false first to get a summary, show it to "
            "the user, then call again with confirm=true only after they explicitly agree."
        ),
        "parameters": {"type": "object", "required": ["kind", "title"], "properties": {
            "kind": {"type": "string", "enum": ["lost", "found"]},
            "title": {"type": "string", "description": "What the item is, e.g. 'black wallet'."},
            "description": {"type": "string"},
            "colour": {"type": "string"},
            "brand": {"type": "string"},
            "building_name": {"type": "string"},
            "room_name": {"type": "string"},
            "confirm": {"type": "boolean", "description": "true only after the user has explicitly confirmed. Defaults to false."},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_campuses",
        "description": "List campuses in the user's organization.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_buildings",
        "description": "List buildings on a given campus.",
        "parameters": {"type": "object", "required": ["campus_id"], "properties": {
            "campus_id": {"type": "string"},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_floors",
        "description": "List floors in a given building.",
        "parameters": {"type": "object", "required": ["building_id"], "properties": {
            "building_id": {"type": "string"},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_rooms",
        "description": "List rooms on a given floor.",
        "parameters": {"type": "object", "required": ["floor_id"], "properties": {
            "floor_id": {"type": "string"},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_assets",
        "description": "List assets in a given room.",
        "parameters": {"type": "object", "required": ["room_id"], "properties": {
            "room_id": {"type": "string"},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_notifications",
        "description": "List the current user's recent notifications.",
        "parameters": {"type": "object", "properties": {
            "unread_only": {"type": "boolean"},
            "limit": {"type": "integer"},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_dashboard_summary",
        "description": "Get the role-appropriate dashboard summary (open issue counts, SLA breaches, asset faults, etc.) for the current user.",
        "parameters": {"type": "object", "properties": {}},
    }},
]


async def run_tool(name: str, arguments: dict, *, db, user: User) -> dict:
    """Execute one tool call by name. Never raises — the agent loop always
    gets a JSON-serializable result (or a structured error) to feed back to
    the model, so a bad argument or a 404 becomes a sentence the model can
    relay, not a crash."""
    fn = TOOLS.get(name)
    if fn is None:
        return {"error": f"Unknown tool '{name}'."}

    try:
        result = await fn(db=db, user=user, **(arguments or {}))
        return {"ok": True, "result": result}
    except ToolError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:  # noqa: BLE001 — deliberately broad, see docstring
        return {"ok": False, "error": "That request could not be completed."}
