#!/usr/bin/env python3
"""Add a realistic set of assets to every room of one or more named buildings
that doesn't already have any -- benches, digital boards, projectors, fans,
tube lights, computers, plumbing fixtures, fire extinguishers and more,
chosen per room category the same way a real college building is actually
fitted out.

Connects straight to the database (same pattern as scripts/create_iot_tables.py
in this repo) instead of going through the HTTP API, for two reasons:
  1. asset_categories are scoped per organization and there is no API
     endpoint to create one -- a freshly-registered college (self-service
     "enterprise" signup) starts with *zero* categories, only what the demo
     seed data ships for its own organization. This script creates whichever
     of its standard category set your organization is missing, then uses
     them -- existing categories with the same code are left untouched.
  2. No access token to expire mid-run, no Render cold-start flakiness.

--------------------------------------------------------------------------
SETUP
--------------------------------------------------------------------------
Needs backend/.env with a real DATABASE_URL (the same Neon connection string
your Render backend uses -- copy it from Render's dashboard environment
variables into a local backend/.env if you don't already have one). This is
exactly what every other maintenance script in scripts/ expects.

--------------------------------------------------------------------------
USAGE
--------------------------------------------------------------------------
    # Dry run (the default) -- prints what would be created, writes nothing:
    python scripts/bulk_seed_assets.py

    # Same, for specific buildings (default is "Main building" and
    # "ANNEX LAW building" -- use the *actual* building name from your
    # database, which can differ from the short label shown on the 3D map):
    python scripts/bulk_seed_assets.py --buildings "Main building" "ANNEX LAW building"

    # Actually write it:
    python scripts/bulk_seed_assets.py --apply

Idempotent: a room that already has any assets at all is left completely
untouched (so it will never duplicate assets you've placed by hand), and
re-running is always safe.
"""
from __future__ import annotations

import argparse
import asyncio
import math
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

GREEN, YELLOW, DIM, RED, RESET = "\033[32m", "\033[33m", "\033[2m", "\033[31m", "\033[0m"


# ---------------------------------------------------------------- categories
# (code, name, icon, is_electronic). Created for an organization only if
# missing -- ON CONFLICT (organization_id, code) DO NOTHING -- so this never
# touches or duplicates categories you already have, under any name.
CATEGORIES: list[tuple[str, str, str, bool]] = [
    ("FRN",  "Furniture",         "armchair",  False),
    ("PRJ",  "Projector",         "projector", True),
    ("DBD",  "Digital Board",     "monitor",   True),
    ("AC",   "AC Unit",           "snowflake", True),
    ("FAN",  "Ceiling Fan",       "fan",       True),
    ("LGT",  "Lighting",          "lightbulb", True),
    ("PC",   "Computer",          "monitor",   True),
    ("NET",  "Network",           "wifi",      True),
    ("PLB",  "Plumbing Fixture",  "wrench",    False),
    ("AV",   "Audio System",      "speaker",   True),
    ("FSF",  "Fire Safety",       "flame",     False),
    ("CCTV", "CCTV Camera",       "camera",    True),
]

# ---------------------------------------------------------------- room plans
# Each entry: (category_code, item name, quantity, surface). "surface"
# mirrors the 3D scene's own placement model -- see migration 013 --
# floor/ceiling are plan-position, wall_* are position-along-wall +
# height-up-wall.
ROOM_PLANS: dict[str, list[tuple[str, str, int, str]]] = {
    "classroom": [
        ("FRN", "Student Bench", 8, "floor"),
        ("FRN", "Teacher's Table", 1, "floor"),
        ("FRN", "Teacher's Chair", 1, "floor"),
        ("DBD", "Digital Board", 1, "wall_front"),
        ("PRJ", "Projector", 1, "ceiling"),
        ("FAN", "Ceiling Fan", 3, "ceiling"),
        ("LGT", "Tube Light", 4, "ceiling"),
        ("NET", "Wi-Fi Access Point", 1, "ceiling"),
    ],
    "lecture_hall": [
        ("FRN", "Lecture Bench", 20, "floor"),
        ("FRN", "Podium", 1, "floor"),
        ("DBD", "Digital Board", 1, "wall_front"),
        ("PRJ", "Projector", 1, "ceiling"),
        ("AV", "Speaker", 2, "wall_front"),
        ("AC", "AC Unit", 2, "wall_back"),
        ("FAN", "Ceiling Fan", 4, "ceiling"),
        ("LGT", "Tube Light", 6, "ceiling"),
        ("NET", "Wi-Fi Access Point", 1, "ceiling"),
    ],
    "laboratory": [
        ("FRN", "Lab Workbench", 10, "floor"),
        ("PC", "Computer", 10, "floor"),
        ("FRN", "Instructor Table", 1, "floor"),
        ("FAN", "Ceiling Fan", 2, "ceiling"),
        ("LGT", "Tube Light", 4, "ceiling"),
        ("NET", "Wi-Fi Access Point", 1, "ceiling"),
        ("FSF", "Fire Extinguisher", 1, "wall_back"),
    ],
    "office": [
        ("FRN", "Office Desk", 3, "floor"),
        ("FRN", "Office Chair", 3, "floor"),
        ("PC", "Computer", 2, "floor"),
        ("AC", "AC Unit", 1, "wall_back"),
        ("FAN", "Ceiling Fan", 1, "ceiling"),
        ("LGT", "Tube Light", 2, "ceiling"),
        ("NET", "Wi-Fi Access Point", 1, "ceiling"),
    ],
    "library": [
        ("FRN", "Bookshelf", 10, "floor"),
        ("FRN", "Reading Table", 4, "floor"),
        ("FRN", "Chair", 16, "floor"),
        ("PC", "Catalog Computer", 2, "floor"),
        ("FAN", "Ceiling Fan", 4, "ceiling"),
        ("LGT", "Tube Light", 6, "ceiling"),
        ("NET", "Wi-Fi Access Point", 1, "ceiling"),
        ("FSF", "Fire Extinguisher", 1, "wall_back"),
    ],
    "washroom": [
        ("PLB", "Wash Basin", 2, "floor"),
        ("PLB", "WC", 2, "floor"),
        ("PLB", "Water Geyser", 1, "wall_back"),
        ("FAN", "Exhaust Fan", 1, "wall_back"),
        ("LGT", "Light", 2, "ceiling"),
    ],
    "corridor": [
        ("LGT", "Tube Light", 4, "ceiling"),
        ("CCTV", "CCTV Camera", 1, "ceiling"),
        ("FSF", "Fire Extinguisher", 1, "wall_back"),
    ],
    "cafeteria": [
        ("FRN", "Dining Table", 8, "floor"),
        ("FRN", "Chair", 32, "floor"),
        ("PLB", "Wash Basin", 2, "floor"),
        ("FAN", "Ceiling Fan", 6, "ceiling"),
        ("LGT", "Tube Light", 6, "ceiling"),
    ],
    "auditorium": [
        ("FRN", "Auditorium Chair", 60, "floor"),
        ("PRJ", "Projector", 1, "ceiling"),
        ("DBD", "Digital Screen", 1, "wall_front"),
        ("AV", "Speaker", 4, "wall_front"),
        ("AC", "AC Unit", 2, "wall_back"),
        ("FAN", "Ceiling Fan", 6, "ceiling"),
        ("LGT", "Tube Light", 8, "ceiling"),
        ("FSF", "Fire Extinguisher", 2, "wall_back"),
    ],
    "hostel_room": [
        ("FRN", "Bed", 2, "floor"),
        ("FRN", "Study Table", 2, "floor"),
        ("FRN", "Cupboard", 2, "floor"),
        ("FAN", "Ceiling Fan", 1, "ceiling"),
        ("LGT", "Tube Light", 1, "ceiling"),
        ("NET", "Wi-Fi Access Point", 1, "ceiling"),
    ],
    "server_room": [
        ("PC", "Server Rack", 2, "floor"),
        ("AC", "Precision AC Unit", 1, "wall_back"),
        ("NET", "Network Switch", 2, "wall_back"),
        ("FSF", "Fire Extinguisher", 1, "wall_back"),
    ],
    "store": [
        ("FRN", "Storage Rack", 4, "floor"),
        ("LGT", "Light", 1, "ceiling"),
    ],
    "utility": [
        ("LGT", "Light", 1, "ceiling"),
        ("FSF", "Fire Extinguisher", 1, "wall_back"),
    ],
    "other": [
        ("LGT", "Light", 2, "ceiling"),
        ("FAN", "Ceiling Fan", 1, "ceiling"),
    ],
}


def grid_positions(n: int) -> list[tuple[float, float]]:
    """Same square-grid idea the backend's own bulk-asset "fill_room" pattern
    uses (see app/api/v1/campus.py _bulk_positions), so a room full of
    benches reads as a room, not a single stacked pin."""
    cols = max(1, math.ceil(math.sqrt(n)))
    rows = max(1, math.ceil(n / cols))
    margin, span = 0.1, 0.8
    return [
        (round(margin + span * ((i % cols) + 0.5) / cols, 5),
         round(margin + span * ((i // cols) + 0.5) / rows, 5))
        for i in range(n)
    ]


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                      formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--buildings", nargs="+",
                         default=["Main building", "ANNEX LAW building"],
                         help="Exact building names (not the short map label) to fill in")
    parser.add_argument("--apply", action="store_true",
                         help="Actually write changes (default is dry run)")
    args = parser.parse_args()
    apply = args.apply

    print(f"{DIM}Mode: {'APPLYING CHANGES' if apply else 'dry run (pass --apply to write)'}{RESET}\n")

    async with engine.begin() as conn:
        buildings = (await conn.execute(text(
            "SELECT b.id, b.name, b.code, b.organization_id "
            "FROM (SELECT bu.*, c.organization_id FROM buildings bu "
            "      JOIN campuses c ON c.id = bu.campus_id) b "
            "WHERE b.name = ANY(:names)"
        ), {"names": args.buildings})).mappings().all()

        found = {b["name"] for b in buildings}
        missing = set(args.buildings) - found
        if missing:
            print(f"{RED}Could not find building(s): {', '.join(sorted(missing))}{RESET}")
            print("  (this matches on the exact `name` column, not the short label shown on the map)")
        if not buildings:
            print("Nothing to do.")
            return 1

        # ---- 1. make sure each org has the full category set ----
        org_ids = {b["organization_id"] for b in buildings}
        for org_id in org_ids:
            existing_codes = set((await conn.execute(text(
                "SELECT code FROM asset_categories WHERE organization_id = :org"
            ), {"org": org_id})).scalars().all())
            to_create = [c for c in CATEGORIES if c[0] not in existing_codes]
            if not to_create:
                continue
            print(f"Organization {org_id}: {'creating' if apply else 'would create'} "
                  f"{len(to_create)} missing categor(y/ies): "
                  f"{', '.join(c[0] for c in to_create)}")
            if apply:
                for code, name, icon, is_electronic in to_create:
                    await conn.execute(text(
                        "INSERT INTO asset_categories (id, organization_id, name, code, icon, is_electronic) "
                        "VALUES (gen_random_uuid(), :org, :name, :code, :icon, :elec) "
                        "ON CONFLICT (organization_id, code) DO NOTHING"
                    ), {"org": org_id, "name": name, "code": code, "icon": icon, "elec": is_electronic})

        # category_id lookup per org (reflects what now exists, post-create)
        cat_lookup: dict = {}
        for org_id in org_ids:
            rows = (await conn.execute(text(
                "SELECT id, code FROM asset_categories WHERE organization_id = :org"
            ), {"org": org_id})).mappings().all()
            cat_lookup[org_id] = {r["code"]: r["id"] for r in rows}

        # ---- 2. walk every room, add assets to the empty ones ----
        total = 0
        for b in buildings:
            print(f"\n=== {b['name']} ({b['code']}) ===")
            floors = (await conn.execute(text(
                "SELECT id, name, level FROM floors WHERE building_id = :bid ORDER BY level"
            ), {"bid": b["id"]})).mappings().all()

            for floor in floors:
                rooms = (await conn.execute(text(
                    "SELECT id, name, code, kind FROM rooms WHERE floor_id = :fid ORDER BY code"
                ), {"fid": floor["id"]})).mappings().all()

                for room in rooms:
                    existing = (await conn.execute(text(
                        "SELECT count(*) FROM assets WHERE room_id = :rid"
                    ), {"rid": room["id"]})).scalar()
                    if existing:
                        print(f"  - {room['name']} ({room['code']}): "
                              f"already has {existing} asset(s), skipping")
                        continue

                    plan = ROOM_PLANS.get(room["kind"], ROOM_PLANS["other"])
                    cats = cat_lookup.get(b["organization_id"], {})
                    added = 0
                    # entry_no is this item's position in the room's plan --
                    # NOT just its category code -- because a plan can list
                    # the same category twice (Office Desk and Office Chair
                    # are both "Furniture"; Wash Basin and WC are both
                    # "Plumbing Fixture"). Tagging by category code alone
                    # made two different entries collide on the exact same
                    # tag, and the DB's ON CONFLICT (tag) DO NOTHING then
                    # silently dropped every row of whichever one inserted
                    # second -- caught by checking actual row counts after a
                    # test run, not by trusting this loop's own tally.
                    for entry_no, (code, name, qty, surface) in enumerate(plan, start=1):
                        category_id = cats.get(code)
                        if apply and category_id is None:
                            continue  # shouldn't happen -- categories are created in step 1 above
                        for i, (px, py) in enumerate(grid_positions(qty), start=1):
                            tag = (f"{room['code']}-{code}{entry_no}-{i:02d}" if qty > 1
                                   else f"{room['code']}-{code}{entry_no}")
                            label = f"{name} ({room['code']})" if qty == 1 else f"{name} {i}"
                            if apply:
                                await conn.execute(text(
                                    "INSERT INTO assets "
                                    "(id, room_id, category_id, tag, name, state, pos_x, pos_y, surface) "
                                    "VALUES (gen_random_uuid(), :rid, :cat, :tag, :name, "
                                    "        'healthy', :px, :py, :surface) "
                                    "ON CONFLICT (tag) DO NOTHING"
                                ), {"rid": room["id"], "cat": category_id, "tag": tag,
                                    "name": label, "px": px, "py": py, "surface": surface})
                            added += 1
                    verb = "adding" if apply else "would add"
                    print(f"  + {room['name']} ({room['code']}, {room['kind']}): {verb} {added} assets")
                    total += added

        print(f"\n{GREEN if apply else DIM}"
              f"{'Added' if apply else 'Would add'} {total} asset(s) total."
              f"{'' if apply else ' Re-run with --apply to write.'}{RESET}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
