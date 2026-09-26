"""Thin wrapper around the already-provisioned, externally hosted InfluxDB
Cloud bucket that stores raw/high-frequency IoT telemetry.

Neon/Postgres remains the source of truth for current state (rooms, assets,
device registry, health events) -- this is write-only history for the
`room_telemetry` measurement, used for later time-series queries, not for
anything the Health page's current-state view depends on.

Fails soft: if INFLUXDB_URL/TOKEN aren't configured, or the Cloud bucket is
briefly unreachable, telemetry ingestion and health-state evaluation must
keep working regardless -- a write failure here is never allowed to break
the MQTT pipeline it's attached to.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

from app.core.config import settings

log = logging.getLogger(__name__)

_client = None
_write_api = None
_import_failed = False


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
