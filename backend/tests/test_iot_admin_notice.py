"""When a sensor fault is confirmed, administrators are told as well as the
technician, so the Health page is not the only place an admin learns of it."""
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.core.enums import HealthEventKind, SensorType
from app.services import iot_health as svc

ORG = uuid.uuid4()
ADMIN, SUPER, MANAGER, TECH = (uuid.uuid4() for _ in range(4))


class _Db:
    def __init__(self):
        self.added = []

    async def scalar(self, _q):
        return None                      # no existing open event for this fault

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass

    async def get(self, _model, _id):
        return SimpleNamespace(name="Class303")


@pytest.fixture
def sent(monkeypatch):
    calls = []

    async def notify(_db, ids, **kw):
        calls.append({"ids": set(ids), **kw})
        return len(set(ids))

    async def reference(*_a, **_k):
        return "HE-TEST1"

    async def noop(*_a, **_k):
        return None

    async def admins(_db, _org):
        return [ADMIN, SUPER]

    async def managers(_db, _org):
        return [MANAGER, ADMIN]          # managers_of includes admin but not super_admin

    monkeypatch.setattr(svc.notify_svc, "notify", notify)
    monkeypatch.setattr(svc.notify_svc, "admins_of", admins)
    monkeypatch.setattr(svc.notify_svc, "managers_of", managers)
    monkeypatch.setattr(svc, "next_public_id", reference)
    monkeypatch.setattr(svc, "set_asset_state", noop)
    monkeypatch.setattr(svc, "_iot_template", lambda *_a, **_k: _async(SimpleNamespace(id=uuid.uuid4())))
    monkeypatch.setattr(svc.inspections_svc, "schedule_inspection",
                        lambda *_a, **_k: _async(SimpleNamespace(id=uuid.uuid4())))
    monkeypatch.setattr(svc, "_fallback_actor", lambda *_a, **_k: _async(SimpleNamespace(id=ADMIN)))
    return calls


async def _async(value):
    return value


async def _confirm(technician, monkeypatch):
    async def suggest(*_a, **_k):
        return technician

    monkeypatch.setattr(svc.wo_svc, "suggest_technician", suggest)
    asset = SimpleNamespace(id=uuid.uuid4(), room_id=uuid.uuid4(), name="Ceiling Fan 1")
    mapping = SimpleNamespace(id=uuid.uuid4(), device_id=uuid.uuid4(), sensor_type=SensorType.IR_PROXIMITY)
    return await svc._confirm_anomaly(
        _Db(), mapping, asset, ORG, None, HealthEventKind.FAN_NOT_ROTATING, Decimal("0"), None, None)


async def test_admins_are_told_when_a_technician_gets_the_inspection(sent, monkeypatch):
    await _confirm(SimpleNamespace(id=TECH, full_name="Deepak"), monkeypatch)
    admin_notes = [c for c in sent if c["title"].startswith("IoT fault detected")]
    assert len(admin_notes) == 1
    note = admin_notes[0]
    assert note["ids"] == {ADMIN, SUPER}
    assert "HE-TEST1" in note["body"] and "fan not rotating" in note["body"]
    assert "Class303" in note["body"] and "Deepak" in note["body"]
    assert note["link"] == "/admin/health"


async def test_with_no_technician_managers_and_all_admins_get_one_notice_each(sent, monkeypatch):
    await _confirm(None, monkeypatch)
    assert len(sent) == 1
    assert sent[0]["title"].startswith("IoT health event needs a technician")
    assert sent[0]["ids"] == {MANAGER, ADMIN, SUPER}      # super admin included, admin once
