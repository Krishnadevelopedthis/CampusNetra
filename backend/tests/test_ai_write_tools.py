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


# ---------------------------------------------------------------------------
# update_complaint: RBAC boundary + confirm gate + legal-transition reuse
# ---------------------------------------------------------------------------

class _Issue:
    def __init__(self, status):
        self.id = uuid.uuid4()
        self.reference = "CMP-1042"
        self.status = status
        self.organization_id = uuid.uuid4()


def _staff_user(role="technician"):
    u = _User()
    u.role = role
    return u


def _student_user():
    u = _User()
    u.role = "student"
    return u


@pytest.mark.asyncio
async def test_update_complaint_rejects_non_staff_without_touching_anything(monkeypatch):
    from app.core.enums import IssueStatus
    from app.ai.tools import ToolError, update_complaint

    db = _FakeDB([])
    db.scalar = AsyncMock(return_value=_Issue(IssueStatus.REPORTED))
    transition_issue = AsyncMock()
    monkeypatch.setattr("app.services.issues.transition_issue", transition_issue)

    with pytest.raises(ToolError, match="staff"):
        await update_complaint(
            db, _student_user(), reference_or_id="CMP-1042",
            status="assigned", confirm=True,
        )
    transition_issue.assert_not_called()


@pytest.mark.asyncio
async def test_update_complaint_without_confirm_returns_pending_and_changes_nothing(monkeypatch):
    from app.core.enums import IssueStatus
    from app.ai.tools import update_complaint

    db = _FakeDB([])
    db.scalar = AsyncMock(return_value=_Issue(IssueStatus.REPORTED))
    transition_issue = AsyncMock()
    monkeypatch.setattr("app.services.issues.transition_issue", transition_issue)

    result = await update_complaint(
        db, _staff_user(), reference_or_id="CMP-1042",
        status="assigned", confirm=False,
    )

    assert result["ok"] is True
    assert result["pending"] is True
    assert result["summary"]["from_status"] == "reported"
    assert result["summary"]["to_status"] == "assigned"
    transition_issue.assert_not_called()


@pytest.mark.asyncio
async def test_update_complaint_with_confirm_true_actually_transitions(monkeypatch):
    from app.core.enums import IssueStatus
    from app.ai.tools import update_complaint

    db = _FakeDB([])
    db.scalar = AsyncMock(return_value=_Issue(IssueStatus.REPORTED))
    transition_issue = AsyncMock()
    monkeypatch.setattr("app.services.issues.transition_issue", transition_issue)

    result = await update_complaint(
        db, _staff_user(), reference_or_id="CMP-1042",
        status="assigned", confirm=True,
    )

    assert result["ok"] is True
    assert result["updated"] is True
    assert result["new_status"] == "assigned"
    transition_issue.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_complaint_rejects_invalid_status_string():
    from app.core.enums import IssueStatus
    from app.ai.tools import ToolError, update_complaint

    db = _FakeDB([])
    db.scalar = AsyncMock(return_value=_Issue(IssueStatus.REPORTED))

    with pytest.raises(ToolError, match="isn't a valid status"):
        await update_complaint(
            db, _staff_user(), reference_or_id="CMP-1042",
            status="halfway_done", confirm=True,
        )


@pytest.mark.asyncio
async def test_update_complaint_surfaces_the_real_transition_service_error(monkeypatch):
    """An illegal transition (e.g. closed -> reported) is rejected by the
    same transition_issue() the human staff UI uses — this proves that
    specific, useful message reaches the model instead of being swallowed
    into a generic failure string."""
    from fastapi import HTTPException, status as http_status

    from app.core.enums import IssueStatus
    from app.ai.tools import ToolError, update_complaint

    db = _FakeDB([])
    db.scalar = AsyncMock(return_value=_Issue(IssueStatus.CLOSED))
    transition_issue = AsyncMock(
        side_effect=HTTPException(http_status.HTTP_409_CONFLICT, "Cannot move from closed to reported."))
    monkeypatch.setattr("app.services.issues.transition_issue", transition_issue)

    with pytest.raises(ToolError, match="Cannot move from closed to reported"):
        await update_complaint(
            db, _staff_user(), reference_or_id="CMP-1042",
            status="reported", confirm=True,
        )


def test_update_complaint_cannot_accept_an_identity_from_the_caller():
    from app.ai.tools import update_complaint

    params = set(inspect.signature(update_complaint).parameters)
    assert "user_id" not in params
    assert "organization_id" not in params
    assert "role" not in params


def test_update_complaint_confirm_defaults_to_false():
    from app.ai.tools import update_complaint

    assert inspect.signature(update_complaint).parameters["confirm"].default is False


def test_update_complaint_is_registered_and_schema_matches():
    from app.ai.tools import update_complaint

    assert TOOLS["update_complaint"] is update_complaint
    schema_names = {s["function"]["name"] for s in TOOL_SCHEMAS}
    assert "update_complaint" in schema_names
