#!/usr/bin/env python3
"""Create the IoT health monitoring tables and mark which asset categories
are electronic (the IoT module only ever shows electronic assets).

There is no migration tool in this project -- schema changes are
hand-applied. This is additive only: three new tables, plus one new
nullable-with-default column on the existing asset_categories table.
Nothing existing is altered or dropped.

    ./scripts/create_iot_tables.py            # dry run, prints the SQL
    ./scripts/create_iot_tables.py --apply     # actually runs it

Reads backend/.env for DATABASE_URL, same as every other script here.
"""
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
VENV_PY = BACKEND / ".venv" / "bin" / "python"

VENV_DIR = BACKEND / ".venv"
if VENV_PY.exists() and Path(sys.prefix) != VENV_DIR:
    os.execv(str(VENV_PY), [str(VENV_PY), str(Path(__file__).resolve()), *sys.argv[1:]])

os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402

GREEN, YELLOW, DIM, RESET = "\033[32m", "\033[33m", "\033[2m", "\033[0m"

# Category codes that already exist in this deployment and are genuinely
# electronic per the app's own category taxonomy (see app/models/spatial.py
# AssetCategory / the icon map in ReportIssue.jsx) -- Furniture and Plumbing
# Fixture are deliberately excluded.
ELECTRONIC_CATEGORY_CODES = ["PRJ", "AC", "LGT", "NET", "FAN", "PC"]

STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS iot_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL UNIQUE,
        room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
        label TEXT,
        api_key_hash TEXT NOT NULL,
        is_online BOOLEAN NOT NULL DEFAULT false,
        last_seen_at TIMESTAMPTZ,
        last_environment JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    "ALTER TABLE iot_devices ADD COLUMN IF NOT EXISTS last_environment JSONB",
    "CREATE INDEX IF NOT EXISTS ix_iot_devices_room ON iot_devices(room_id)",
    """
    CREATE TABLE IF NOT EXISTS asset_sensor_mappings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        device_id UUID NOT NULL REFERENCES iot_devices(id) ON DELETE CASCADE,
        sensor_type TEXT NOT NULL,
        min_current_a NUMERIC(6,3),
        max_current_a NUMERIC(6,3),
        expected_on_current_min_a NUMERIC(6,3),
        expected_on_current_max_a NUMERIC(6,3),
        brightness_min INTEGER,
        temperature_min NUMERIC(5,2),
        temperature_max NUMERIC(5,2),
        debounce_seconds INTEGER NOT NULL DEFAULT 60,
        consecutive_abnormal INTEGER NOT NULL DEFAULT 0,
        first_abnormal_at TIMESTAMPTZ,
        last_value NUMERIC(10,3),
        last_reading_at TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_asset_sensor_mappings_asset ON asset_sensor_mappings(asset_id)",
    "CREATE INDEX IF NOT EXISTS ix_asset_sensor_mappings_device ON asset_sensor_mappings(device_id)",
    """
    CREATE TABLE IF NOT EXISTS health_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference TEXT NOT NULL UNIQUE,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
        device_id UUID REFERENCES iot_devices(id) ON DELETE SET NULL,
        sensor_mapping_id UUID REFERENCES asset_sensor_mappings(id) ON DELETE SET NULL,
        sensor_type TEXT NOT NULL,
        kind TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        detected_value NUMERIC(10,3),
        expected_min NUMERIC(10,3),
        expected_max NUMERIC(10,3),
        inspection_id UUID REFERENCES inspections(id) ON DELETE SET NULL,
        work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
        detected_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_health_events_asset ON health_events(asset_id)",
    "CREATE INDEX IF NOT EXISTS ix_health_events_room ON health_events(room_id)",
    "CREATE INDEX IF NOT EXISTS ix_health_events_status ON health_events(status)",
    "ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS is_electronic BOOLEAN NOT NULL DEFAULT false",
]


async def main() -> int:
    apply = "--apply" in sys.argv[1:]
    print(f"{DIM}Mode: {'APPLYING CHANGES' if apply else 'dry run (pass --apply to write)'}{RESET}\n")

    async with engine.begin() as conn:
        # Every statement is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT
        # EXISTS), so it's safe to just run them all in order every time.
        for stmt in STATEMENTS:
            first_line = " ".join(stmt.split())[:90]
            print(f"  {YELLOW}{first_line}...{RESET}")
            if apply:
                await conn.execute(text(stmt))

        if apply:
            codes = ",".join(f"'{c}'" for c in ELECTRONIC_CATEGORY_CODES)
            result = await conn.execute(text(
                f"UPDATE asset_categories SET is_electronic = true WHERE code IN ({codes})"
            ))
            print(f"\n{GREEN}Schema applied. Marked {result.rowcount} categor(y/ies) electronic "
                  f"({', '.join(ELECTRONIC_CATEGORY_CODES)}).{RESET}")
        else:
            print(f"\n{DIM}Would run {len(STATEMENTS)} statement(s) and mark categories "
                  f"{', '.join(ELECTRONIC_CATEGORY_CODES)} electronic. Re-run with --apply to write.{RESET}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
