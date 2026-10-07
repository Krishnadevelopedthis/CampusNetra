"""InfluxDB-backed device history: safe queries, tidy points, and a graceful
"unavailable" instead of an error whenever Influx cannot answer."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import health as health_api
from app.core.config import settings
from app.services import influx_client as ic


# --- query construction -------------------------------------------------------

def test_query_targets_one_device_and_buckets_the_window():
    q = ic.build_history_query("ESP32-001", 86400, 600)
    assert 'r.device_id == "ESP32-001"' in q
    assert "range(start: -86400s)" in q
    assert "aggregateWindow(every: 600s" in q
    assert 'timeSrc: "_start"' in q            # bucket stamped when it began, not ended
    assert "toFloat()" in q and "pivot(" in q


@pytest.mark.parametrize("bad", ['x"', 'a") |> drop() //', "a b", "", "a" * 101, "id\nnext"])
def test_unsafe_device_ids_are_rejected(bad):
    with pytest.raises(ValueError):
        ic.build_history_query(bad, 60, 60)


def test_every_range_keeps_the_chart_light():
    for window, bucket in ic.HISTORY_RANGES.values():
        assert window / bucket <= 200


# --- rows -> points -----------------------------------------------------------

def test_rows_become_rounded_points_and_skip_rows_without_a_time():
    t = datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc)
    pts = ic._rows_to_points([
        {"_time": t, "main_current_a": 0.123456, "temperature_c": 28.46, "humidity_pct": 55.04,
         "fan_rotation": 0.5, "light_brightness": 312.4},
        {"main_current_a": 1},                       # no time -> dropped
        {"_time": t, "main_current_a": 0.0},         # sparse row keeps None for the rest
    ])
    assert len(pts) == 2
    assert pts[0] == {"t": int(t.timestamp() * 1000), "current_a": 0.123, "temperature_c": 28.5,
                      "humidity_pct": 55.0, "fan_pct": 50, "light": 312.0}
    assert pts[1]["temperature_c"] is None and pts[1]["fan_pct"] is None


# --- failure handling ---------------------------------------------------------

@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "INFLUXDB_URL", "https://influx.example", raising=False)
    monkeypatch.setattr(settings, "INFLUXDB_TOKEN", "token-token", raising=False)
    monkeypatch.setattr(settings, "INFLUXDB_ORG", "org", raising=False)


async def test_not_configured_is_reported_not_raised_as_a_crash(monkeypatch):
    monkeypatch.setattr(settings, "INFLUXDB_URL", "", raising=False)
    with pytest.raises(ic.HistoryUnavailable) as e:
        await ic.query_history("ESP32-001", "24h")
    assert e.value.reason == "not_configured"


@pytest.mark.parametrize("message, reason", [
    ("(401) Reason: Unauthorized", "no_read_access"),
    ("403 forbidden", "no_read_access"),
    ("connection refused", "unreachable"),
])
async def test_errors_are_mapped_to_a_reason(configured, monkeypatch, message, reason):
    def boom(_flux):
        raise RuntimeError(message)

    monkeypatch.setattr(ic, "_query_sync", boom)
    with pytest.raises(ic.HistoryUnavailable) as e:
        await ic.query_history("ESP32-001", "24h")
    assert e.value.reason == reason


async def test_a_good_query_returns_points(configured, monkeypatch):
    t = datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(ic, "_query_sync", lambda _f: [{"_time": t, "main_current_a": 0.5}])
    out = await ic.query_history("ESP32-001", "1h")
    assert out["bucket_seconds"] == 60 and out["points"][0]["current_a"] == 0.5


# --- endpoint -----------------------------------------------------------------

class _Result:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _Db:
    def __init__(self, device, events=()):
        self.device, self.events = device, list(events)

    async def scalar(self, _q):
        return self.device

    async def scalars(self, _q):
        return _Result(self.events)


def _device(org):
    return SimpleNamespace(id=uuid.uuid4(), device_id="ESP32-001", organization_id=org)


async def test_other_organizations_device_is_404():
    user = SimpleNamespace(organization_id=uuid.uuid4())
    with pytest.raises(HTTPException) as e:
        await health_api.device_history(uuid.uuid4(), user, _Db(_device(uuid.uuid4())), range="24h")
    assert e.value.status_code == 404


async def test_endpoint_returns_points_and_event_markers(monkeypatch):
    health_api._history_cache.clear()
    org = uuid.uuid4()
    ev = SimpleNamespace(
        id=uuid.uuid4(), reference="HE-1", kind=SimpleNamespace(value="fan_not_rotating"),
        severity=SimpleNamespace(value="high"), status=SimpleNamespace(value="open"),
        detected_at=datetime(2026, 10, 8, 9, 30, tzinfo=timezone.utc), detected_value=0)

    async def fake(device_id, range_key):
        return {"bucket_seconds": 600, "points": [{"t": 1, "current_a": 0.4}]}

    monkeypatch.setattr(health_api.influx_client, "query_history", fake)
    out = await health_api.device_history(
        uuid.uuid4(), SimpleNamespace(organization_id=org), _Db(_device(org), [ev]), range="24h")
    assert out["available"] is True and out["points"][0]["current_a"] == 0.4
    assert out["events"][0]["reference"] == "HE-1"
    assert out["events"][0]["at"] == int(ev.detected_at.timestamp() * 1000)


async def test_endpoint_degrades_when_influx_is_down(monkeypatch):
    health_api._history_cache.clear()
    org = uuid.uuid4()

    async def down(device_id, range_key):
        raise ic.HistoryUnavailable("unreachable")

    monkeypatch.setattr(health_api.influx_client, "query_history", down)
    out = await health_api.device_history(
        uuid.uuid4(), SimpleNamespace(organization_id=org), _Db(_device(org)), range="6h")
    assert out["available"] is False and out["reason"] == "unreachable" and out["points"] == []
