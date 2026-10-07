"""Thin wrapper around the already-provisioned, externally hosted InfluxDB
Cloud bucket that stores raw/high-frequency IoT telemetry.

Neon/Postgres remains the source of truth for current state (rooms, assets,
device registry, health events). This is the history of the `room_telemetry`
measurement: written on every reading, and read back (query_history) only for
the Health page's history chart -- nothing the current-state view or fault
detection depends on.

Fails soft: if INFLUXDB_URL/TOKEN aren't configured, or the Cloud bucket is
briefly unreachable, telemetry ingestion and health-state evaluation must
keep working regardless -- a write failure here is never allowed to break
the MQTT pipeline it's attached to.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import datetime
from typing import Optional

from app.core.config import settings

log = logging.getLogger(__name__)

_client = None
_write_api = None
_import_failed = False

# get_status() is called on every GET /health (the frontend's liveness
# probe, polled periodically) -- cached so that doesn't mean a real network
# round trip to InfluxDB Cloud on every poll.
_STATUS_CACHE_SECONDS = 30
_status_cache: tuple[float, str] | None = None


def _get_write_api():
    global _client, _write_api, _import_failed
    if _write_api is not None:
        return _write_api
    if _import_failed:
        return None
    if not (settings.INFLUXDB_URL and settings.INFLUXDB_TOKEN and settings.INFLUXDB_ORG):
        return None
    try:
        from influxdb_client import InfluxDBClient
        from influxdb_client.client.write_api import SYNCHRONOUS
    except ImportError:
        _import_failed = True
        log.warning("influxdb-client not installed; raw telemetry history will not be written")
        return None
    _client = InfluxDBClient(url=settings.INFLUXDB_URL, token=settings.INFLUXDB_TOKEN, org=settings.INFLUXDB_ORG)
    _write_api = _client.write_api(write_options=SYNCHRONOUS)
    return _write_api


def _write_sync(point) -> None:
    write_api = _get_write_api()
    if write_api is None:
        return
    write_api.write(bucket=settings.INFLUXDB_BUCKET, record=point)


def _ping_sync() -> bool:
    return _client.ping() if _client is not None else False


async def get_status() -> str:
    """Read by GET /health (app/main.py) so a deployment's InfluxDB wiring
    can be confirmed from the outside -- e.g. after setting INFLUXDB_* env
    vars on Render -- without needing log/dashboard access to that host.
    A real round trip (client.ping()), not just "credentials present" --
    cached for _STATUS_CACHE_SECONDS since /health is polled."""
    global _status_cache

    if not (settings.INFLUXDB_URL and settings.INFLUXDB_TOKEN and settings.INFLUXDB_ORG):
        return "disabled"
    if _get_write_api() is None:
        return "error: influxdb-client not installed"

    now = time.monotonic()
    if _status_cache is not None and now - _status_cache[0] < _STATUS_CACHE_SECONDS:
        return _status_cache[1]

    try:
        ok = await asyncio.to_thread(_ping_sync)
        result = "connected" if ok else "error: ping failed"
    except Exception as exc:  # noqa: BLE001
        result = f"error: {exc}"
    _status_cache = (now, result)
    return result


async def write_room_telemetry(
    *, device_id: str, room_id: Optional[str], main_current_a: float,
    fan_rotation: bool, light_brightness: int,
    temperature_c: Optional[float], humidity_pct: Optional[float],
    timestamp: datetime,
) -> None:
    """Best-effort write to the `room_telemetry` measurement. Never raises --
    a point that fails to write is lost history, not a broken health update,
    so the caller (services/mqtt_client.py) doesn't need to handle failure
    here at all."""
    write_api = _get_write_api()
    if write_api is None:
        return
    try:
        from influxdb_client import Point

        point = (
            Point(settings.INFLUXDB_MEASUREMENT)
            .tag("device_id", device_id)
            .tag("room_id", room_id or "unassigned")
            .field("main_current_a", float(main_current_a))
            .field("fan_rotation", bool(fan_rotation))
            .field("light_brightness", int(light_brightness))
            .time(timestamp)
        )
        if temperature_c is not None:
            point = point.field("temperature_c", float(temperature_c))
        if humidity_pct is not None:
            point = point.field("humidity_pct", float(humidity_pct))
        await asyncio.to_thread(_write_sync, point)
    except Exception:
        log.exception("InfluxDB write failed for device %s (telemetry still processed)", device_id)


# --- history (read) ---------------------------------------------------------

# range key -> (look-back window, bucket size). Telemetry arrives every ~5 s;
# averaging into buckets keeps every chart to at most ~170 points.
HISTORY_RANGES: dict[str, tuple[int, int]] = {
    "1h": (3600, 60),
    "6h": (6 * 3600, 300),
    "24h": (24 * 3600, 600),
    "7d": (7 * 86400, 3600),
}

_FIELDS = ("main_current_a", "temperature_c", "humidity_pct", "fan_rotation", "light_brightness")
_SAFE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,100}$")


class HistoryUnavailable(Exception):
    """Influx cannot answer right now. `reason` is safe to show an admin."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def build_history_query(device_id: str, window_s: int, bucket_s: int) -> str:
    """Flux for one device's bucketed readings, one row per bucket.

    `device_id` is interpolated into the query text, so it is restricted to the
    characters a device id can contain (it also comes from our own registry,
    never from the request body).
    """
    if not _SAFE_ID.match(device_id):
        raise ValueError("unsafe device id")
    bucket = settings.INFLUXDB_BUCKET.replace('"', "")
    measurement = settings.INFLUXDB_MEASUREMENT.replace('"', "")
    fields = " or ".join(f'r._field == "{f}"' for f in _FIELDS)
    # Booleans (fan_rotation) and ints become floats so every field can be
    # averaged: the fan then reads as the share of the bucket it was turning.
    steps = [
        f'from(bucket: "{bucket}")',
        f'  |> range(start: -{window_s}s)',
        f'  |> filter(fn: (r) => r._measurement == "{measurement}" and r.device_id == "{device_id}")',
        f'  |> filter(fn: (r) => {fields})',
        '  |> toFloat()',
        # timeSrc _start stamps each bucket with when it BEGAN. The default is the
        # window's end, which shifts every point late by one bucket (an hour on
        # the 7-day view) and would misplace it against the fault markers.
        f'  |> aggregateWindow(every: {bucket_s}s, fn: mean, timeSrc: "_start", createEmpty: false)',
        '  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")',
        '  |> sort(columns: ["_time"])',
    ]
    return chr(10).join(steps) + chr(10)


def _query_sync(flux: str) -> list[dict]:
    if _get_write_api() is None or _client is None:
        raise HistoryUnavailable("not_configured")
    tables = _client.query_api().query(flux)
    return [rec.values for table in tables for rec in table.records]


def _rows_to_points(rows: list[dict]) -> list[dict]:
    def num(v, nd):
        return None if v is None else round(float(v), nd)

    points = []
    for r in rows:
        t = r.get("_time")
        if t is None:
            continue
        fan = r.get("fan_rotation")
        points.append({
            "t": int(t.timestamp() * 1000),
            "current_a": num(r.get("main_current_a"), 3),
            "temperature_c": num(r.get("temperature_c"), 1),
            "humidity_pct": num(r.get("humidity_pct"), 1),
            "fan_pct": None if fan is None else round(float(fan) * 100),
            "light": num(r.get("light_brightness"), 0),
        })
    return points


async def query_history(device_id: str, range_key: str) -> dict:
    """Bucketed history for one device. Raises HistoryUnavailable (never anything
    else) so the endpoint can answer "history unavailable" instead of failing."""
    window_s, bucket_s = HISTORY_RANGES[range_key]
    if not (settings.INFLUXDB_URL and settings.INFLUXDB_TOKEN and settings.INFLUXDB_ORG):
        raise HistoryUnavailable("not_configured")
    try:
        flux = build_history_query(device_id, window_s, bucket_s)
        rows = await asyncio.wait_for(asyncio.to_thread(_query_sync, flux), timeout=12.0)
    except HistoryUnavailable:
        raise
    except asyncio.TimeoutError as exc:
        raise HistoryUnavailable("timeout") from exc
    except Exception as exc:  # noqa: BLE001 - Influx/network errors vary widely
        text = str(exc).lower()
        if "401" in text or "403" in text or "unauthorized" in text or "forbidden" in text:
            reason = "no_read_access"
        else:
            reason = "unreachable"
        log.warning("InfluxDB history query failed for %s: %s", device_id, exc)
        raise HistoryUnavailable(reason) from exc
    return {"bucket_seconds": bucket_s, "points": _rows_to_points(rows)}
