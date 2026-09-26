"""MQTT bridge: ESP32 -> HiveMQ Cloud -> this -> the existing health
pipeline (app.services.iot_health), plus a best-effort raw write to
InfluxDB (app.services.influx_client).

The physical ESP32 fleet, the HiveMQ Cloud broker, and the InfluxDB Cloud
bucket already exist and are already configured outside this repo -- this
file is only the missing piece that connects this backend to them. It does
not touch, and does not need to know anything about, the ESP32 firmware.

Topic: campusnetra/device/{DEVICE_ID}/telemetry
Runs as a background asyncio task (see app/main.py's lifespan). paho-mqtt's
own network loop runs on its own thread (client.loop_start()); each message
callback hops back onto the FastAPI event loop via
asyncio.run_coroutine_threadsafe so the actual DB work stays async. A
broker outage or malformed message must never crash the API process --
every failure here is logged and swallowed, not raised.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from pydantic import ValidationError
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.iot import IoTDevice
from app.schemas.iot import DeviceTelemetryIn
from app.services import influx_client
from app.services import iot_health as svc

log = logging.getLogger(__name__)

TOPIC_FILTER = "campusnetra/device/+/telemetry"

# Read by GET /health (app/main.py) so a deployment's MQTT wiring can be
# confirmed from the outside -- e.g. after setting MQTT_* env vars on Render
# -- without needing log/dashboard access to that host.
_status = "disabled"


def get_status() -> str:
    return _status


def _device_id_from_topic(topic: str) -> str | None:
    # campusnetra/device/{DEVICE_ID}/telemetry
    parts = topic.split("/")
    if len(parts) == 4 and parts[0] == "campusnetra" and parts[1] == "device" and parts[3] == "telemetry":
        return parts[2]
    return None


async def _handle_message(topic: str, raw_payload: bytes) -> None:
    topic_device_id = _device_id_from_topic(topic)
    if not topic_device_id:
        log.warning("MQTT message on unexpected topic %r ignored", topic)
        return

    try:
        data = json.loads(raw_payload.decode("utf-8"))
        telemetry = DeviceTelemetryIn.model_validate(data)
    except (json.JSONDecodeError, UnicodeDecodeError, ValidationError) as exc:
        log.warning("Malformed MQTT telemetry on %s: %s", topic, exc)
        return

    async with SessionLocal() as db:
        device = await db.scalar(select(IoTDevice).where(IoTDevice.device_id == telemetry.device_id))
        if device is None:
            # Spec: an unregistered device is never guessed into a room --
            # nothing is written at all until an admin registers it.
            log.warning(
                "Telemetry from unregistered device %r -- register it in "
                "Admin > Health first", telemetry.device_id,
            )
            return

        try:
            result = await svc.process_device_telemetry(db, device, telemetry.model_dump())
            await db.commit()
        except svc.TelemetryError as exc:
            await db.rollback()
            log.warning("Rejected MQTT telemetry from %s: %s", telemetry.device_id, exc)
            return
        except Exception:
            await db.rollback()
            log.exception("Unhandled error processing MQTT telemetry from %s", telemetry.device_id)
            return

        room_id = str(device.room_id) if device.room_id else None

    ts = telemetry.timestamp
    try:
        reading_time = (
            datetime.fromisoformat(str(ts).replace("Z", "+00:00")) if ts else datetime.now(timezone.utc)
        )
        if reading_time.tzinfo is None:
            reading_time = reading_time.replace(tzinfo=timezone.utc)
    except ValueError:
        reading_time = datetime.now(timezone.utc)

    await influx_client.write_room_telemetry(
        device_id=telemetry.device_id,
        room_id=room_id,
        main_current_a=telemetry.main_current_a,
        fan_rotation=telemetry.fan.rotation,
        light_brightness=telemetry.light.brightness,
        temperature_c=telemetry.environment.temperature_c if telemetry.environment else None,
        humidity_pct=telemetry.environment.humidity_pct if telemetry.environment else None,
        timestamp=reading_time,
    )

    if result.get("unassigned"):
        log.info("Telemetry from %s stored, but device has no room assigned yet", telemetry.device_id)
    elif result.get("confirmed"):
        log.info("MQTT telemetry from %s confirmed %d health event(s)",
                  telemetry.device_id, len(result["confirmed"]))


async def run() -> None:
    """Connect to HiveMQ Cloud over TLS and subscribe forever, reconnecting
    on its own. A no-op (logs once, returns) if MQTT isn't configured --
    same "fails soft, app still boots without it" pattern as the email/SMS
    provider settings."""
    global _status

    if not (settings.MQTT_BROKER_HOST and settings.MQTT_USERNAME and settings.MQTT_PASSWORD):
        log.info("MQTT not configured (MQTT_BROKER_HOST/USERNAME/PASSWORD unset) -- telemetry bridge disabled")
        return

    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        log.warning("paho-mqtt not installed -- MQTT telemetry bridge disabled")
        _status = "error: paho-mqtt not installed"
        return

    _status = "connecting"
    loop = asyncio.get_running_loop()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
    client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
    client.tls_set()  # system CA bundle -- HiveMQ Cloud's cert is publicly trusted

    def on_connect(c, userdata, flags, reason_code, properties=None):
        global _status
        if reason_code == 0:
            log.info("MQTT connected to %s:%s", settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT)
            c.subscribe(TOPIC_FILTER, qos=1)
            _status = "connected"
        else:
            log.error("MQTT connect failed: %s", reason_code)
            _status = f"error: {reason_code}"

    def on_message(c, userdata, msg):
        asyncio.run_coroutine_threadsafe(_handle_message(msg.topic, msg.payload), loop)

    def on_disconnect(c, userdata, flags, reason_code, properties=None):
        global _status
        log.warning("MQTT disconnected (reason=%s) -- paho reconnects automatically", reason_code)
        _status = "reconnecting"

    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    client.connect(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, keepalive=60)
    client.loop_start()  # runs the network loop on its own thread

    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        raise
    finally:
        client.loop_stop()
        client.disconnect()
