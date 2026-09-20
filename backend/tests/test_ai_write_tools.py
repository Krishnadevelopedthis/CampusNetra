"""Tests for the write tools (create_complaint, create_lost_found).

No real database is available in this environment (see
test_ai_tools_registry.py's own note), so these use a minimal fake DB
session for _resolve_room's branching and monkeypatch the underlying
services for the create-path tests. What's covered here is exactly what
doesn't need a real Postgres to verify: the confirm-gate itself, the
ambiguous-location branch, and the load-bearing security invariant that
these tools cannot accept an identity from the caller.
"""
import inspect
import uuid
from unittest.mock import AsyncMock

import pytest

from app.ai.tools import TOOL_SCHEMAS, TOOLS, create_complaint, create_lost_found


# ---------------------------------------------------------------------------
# Security invariants (spec items: backend never trusts user_id/role/org
# from the model) — provable by signature alone, no DB needed.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("fn", [create_complaint, create_lost_found])
def test_write_tools_cannot_accept_an_identity_from_the_caller(fn):
    params = set(inspect.signature(fn).parameters)
    assert "user_id" not in params
    assert "organization_id" not in params
    assert "role" not in params


@pytest.mark.parametrize("fn", [create_complaint, create_lost_found])
def test_confirm_defaults_to_false(fn):
    assert inspect.signature(fn).parameters["confirm"].default is False


def test_new_tools_are_registered_and_schema_matches():
    assert TOOLS["create_complaint"] is create_complaint
    assert TOOLS["create_lost_found"] is create_lost_found
    schema_names = {s["function"]["name"] for s in TOOL_SCHEMAS}
    assert "create_complaint" in schema_names
    assert "create_lost_found" in schema_names


# ---------------------------------------------------------------------------
# Fake DB session — just enough for _resolve_room's query shape
# ---------------------------------------------------------------------------

class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeDB:
    """Returns whatever row list is queued next, regardless of the actual
    query — fine here since the only thing under test is what _resolve_room
    and the tools DO with a given row count, not the SQL itself."""
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _query):
        return _FakeResult(self._rows)

    async def scalar(self, _query):
        return self._rows[0] if self._rows else None

    async def flush(self):
        pass


class _Room:
    def __init__(self, name="Lab 3"):
        self.id = uuid.uuid4()
        self.name = name


class _Floor:
    def __init__(self):
        self.name = "2nd Floor"


class _Building:
    def __init__(self, name="Science Building"):
        self.name = name
        self.campus_id = uuid.uuid4()


class _User:
    def __init__(self):
        self.id = uuid.uuid4()
        self.organization_id = uuid.uuid4()


# ---------------------------------------------------------------------------
# create_complaint: confirm gate + ambiguous location
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_complaint_without_confirm_returns_pending_and_creates_nothing(monkeypatch):
    room, floor, building = _Room(), _Floor(), _Building()
    db = _FakeDB([(room, floor, building)])
    create_issue = AsyncMock()
    monkeypatch.setattr("app.services.issues.create_issue", create_issue)

    result = await create_complaint(
        db, _User(), title="AC not working", description="Blowing hot air",
        room_name="Lab 3", confirm=False,
    )

    assert result["ok"] is True
    assert result["pending"] is True
    assert result["summary"]["location"] == "Lab 3"
    create_issue.assert_not_called()  # the whole point of the gate


@pytest.mark.asyncio
async def test_create_complaint_with_confirm_true_actually_creates(monkeypatch):
    room, floor, building = _Room(), _Floor(), _Building()
    db = _FakeDB([(room, floor, building)])

    class _Issue:
        reference = "CMP-1042"
        id = uuid.uuid4()

    create_issue = AsyncMock(return_value=(_Issue(), []))
    monkeypatch.setattr("app.services.issues.create_issue", create_issue)

    result = await create_complaint(
        db, _User(), title="AC not working", description="Blowing hot air",
        room_name="Lab 3", confirm=True,
    )

    assert result["ok"] is True
    assert result["created"] is True
    assert result["reference"] == "CMP-1042"
    create_issue.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_complaint_ambiguous_room_asks_instead_of_guessing(monkeypatch):
    rows = [
        (_Room("Lab 3"), _Floor(), _Building("Science Building")),
        (_Room("Lab 3"), _Floor(), _Building("Engineering Building")),
    ]
    db = _FakeDB(rows)
    create_issue = AsyncMock()
    monkeypatch.setattr("app.services.issues.create_issue", create_issue)

    result = await create_complaint(
        db, _User(), title="Broken projector", description="Won't turn on",
        room_name="Lab 3", confirm=True,  # even with confirm=true — ambiguity wins
    )

    assert result.get("ambiguous") is True
    assert len(result["options"]) == 2
    create_issue.assert_not_called()


# ---------------------------------------------------------------------------
# create_lost_found: same confirm gate
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_lost_found_without_confirm_returns_pending_and_creates_nothing(monkeypatch):
    db = _FakeDB([])
    create_item = AsyncMock()
    monkeypatch.setattr("app.services.lostfound.create_item", create_item)

    result = await create_lost_found(
        db, _User(), kind="found", title="Black wallet", confirm=False,
    )

    assert result["ok"] is True
    assert result["pending"] is True
    create_item.assert_not_called()


@pytest.mark.asyncio
async def test_create_lost_found_with_confirm_true_actually_creates(monkeypatch):
    db = _FakeDB([])

    class _Item:
        reference = "LF7K29A4X"
        id = uuid.uuid4()

    create_item = AsyncMock(return_value=(_Item(), []))
    monkeypatch.setattr("app.services.lostfound.create_item", create_item)

    result = await create_lost_found(
        db, _User(), kind="found", title="Black wallet", confirm=True,
    )

    assert result["ok"] is True
    assert result["created"] is True
    assert result["reference"] == "LF7K29A4X"
    create_item.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_lost_found_rejects_invalid_kind():
    from app.ai.tools import ToolError

    with pytest.raises(ToolError):
        await create_lost_found(_FakeDB([]), _User(), kind="misplaced", title="A thing")
