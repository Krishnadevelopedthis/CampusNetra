"""A flapping sensor must not open an event, an inspection and a round of
notifications every few minutes; a real recurrence after a repair still must."""
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.core.enums import HealthEventKind, SensorType
from app.services import iot_health as svc

ORG = uuid.uuid4()


class _Db:
    """`scalar` answers in order: first the open-event lookup, then the cooldown lookup."""

    def __init__(self, cooldown_hit):
        self.cooldown_hit = cooldown_hit
        self.calls = 0
        self.added = []

    async def scalar(self, _q):
        self.calls += 1
        if self.calls == 1:
            return None                              # no event currently open
        return uuid.uuid4() if self.cooldown_hit else None

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass

    async def get(self, *_a):
        return SimpleNamespace(name="Class303")


@pytest.fixture
def side_effects(monkeypatch):
    seen = {"notified": 0, "inspections": 0, "states": 0}

    async def notify(*_a, **_k):
        seen["notified"] += 1
        return 1

    async def admins(*_a):
        return [uuid.uuid4()]

    async def reference(*_a, **_k):
        return "HE-NEW"

    async def state(*_a, **_k):
        seen["states"] += 1

    async def suggest(*_a, **_k):
        return SimpleNamespace(id=uuid.uuid4(), full_name="Deepak")

    async def schedule(*_a, **_k):
        seen["inspections"] += 1
        return SimpleNamespace(id=uuid.uuid4())

    async def template(*_a, **_k):
        return SimpleNamespace(id=uuid.uuid4())

    monkeypatch.setattr(svc.notify_svc, "notify", notify)
    monkeypatch.setattr(svc.notify_svc, "admins_of", admins)
    monkeypatch.setattr(svc, "next_public_id", reference)
    monkeypatch.setattr(svc, "set_asset_state", state)
    monkeypatch.setattr(svc.wo_svc, "suggest_technician", suggest)
    monkeypatch.setattr(svc.inspections_svc, "schedule_inspection", schedule)
    monkeypatch.setattr(svc, "_iot_template", template)
    return seen


async def _confirm(db):
    asset = SimpleNamespace(id=uuid.uuid4(), room_id=uuid.uuid4(), name="Ceiling Fan 1")
    mapping = SimpleNamespace(id=uuid.uuid4(), device_id=uuid.uuid4(), sensor_type=SensorType.IR_PROXIMITY)
    return await svc._confirm_anomaly(
        db, mapping, asset, ORG, None, HealthEventKind.FAN_NOT_ROTATING, Decimal("0"), None, None)


async def test_repeat_of_a_self_cleared_fault_is_suppressed(side_effects):
    db = _Db(cooldown_hit=True)
    assert await _confirm(db) is None
    assert db.added == [] and side_effects == {"notified": 0, "inspections": 0, "states": 0}


async def test_a_fresh_fault_still_opens_an_event(side_effects):
    db = _Db(cooldown_hit=False)
    event = await _confirm(db)
    assert event is not None and event.reference == "HE-NEW"
    assert side_effects["inspections"] == 1 and side_effects["notified"] == 1 and side_effects["states"] == 1


async def test_cooldown_of_zero_turns_it_off(side_effects, monkeypatch):
    monkeypatch.setattr(settings, "IOT_EVENT_COOLDOWN_MINUTES", 0)
    db = _Db(cooldown_hit=True)                      # would have been suppressed
    assert await _confirm(db) is not None
    assert db.calls == 1                             # the cooldown query was never run
