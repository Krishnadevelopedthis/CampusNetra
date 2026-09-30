#!/usr/bin/env python3
"""Bulk-add a standard set of "normal college" rooms to every empty floor of
one or more named buildings, via the live Campus Netra API.

Why a script and not a migration: buildings you create yourself in the admin
Campus/Floor-Plan Editor (like "Main" and "ANNEX") live in *your* running
database, not in this repo's seed data — there's no file here that knows
their building/floor IDs. This talks to the same REST API the Floor Plan
Editor UI itself uses, so it works against whatever you've actually built,
on any deployment.

--------------------------------------------------------------------------
SETUP (one time)
--------------------------------------------------------------------------
    pip install requests

--------------------------------------------------------------------------
GET AN ACCESS TOKEN
--------------------------------------------------------------------------
/auth/login now requires solving a captcha, so this can't log in for you.
Instead, log into the app in your browser as an admin (or anyone with the
"assets:manage" and "admin:campus_config" permissions), open the browser
console on any page of the app, and run:

    JSON.parse(localStorage.getItem('cn.auth')).access_token

Copy the string it prints (no quotes). It's valid for ~30 minutes, so grab
it right before you run this.

--------------------------------------------------------------------------
USAGE
--------------------------------------------------------------------------
    # See what would be created, without creating anything:
    python scripts/bulk_seed_rooms.py \\
        --api-base https://campusnetra.onrender.com/api/v1 \\
        --token "<paste your access_token here>" \\
        --buildings Main ANNEX \\
        --dry-run

    # Then actually do it:
    python scripts/bulk_seed_rooms.py \\
        --api-base https://campusnetra.onrender.com/api/v1 \\
        --token "<paste your access_token here>" \\
        --buildings Main ANNEX

Idempotent: a floor that already has any rooms on it is left completely
untouched (so it will never duplicate rooms you've already placed by hand),
and a floor level that already exists is never recreated. Safe to re-run.
"""
from __future__ import annotations

import argparse
import sys

import requests


# ---------------------------------------------------------------- room plan
# A "normal college" floor, varied by position in the building so the whole
# building doesn't read as one room repeated — ground floor gets admin/
# reception, the top floor gets the library, everything in between
# alternates between two classroom-heavy layouts.

def _room(name: str, code_suffix: str, kind: str, capacity=None, area_sqft=None) -> dict:
    return {"name": name, "code_suffix": code_suffix, "kind": kind,
            "capacity": capacity, "area_sqft": area_sqft}


def rooms_for_floor(position: int, total_floors: int) -> list[dict]:
    """position is 0-indexed from the ground floor up; total_floors is the
    building's floor count. Returns room dicts (code_suffix still needs the
    building code + level prefixed on, done by the caller once it knows
    both)."""
    is_ground = position == 0
    is_top = position == total_floors - 1 and total_floors > 1

    if is_ground:
        return [
            _room("Reception & Admin Office", "01", "office", 10, 300),
            _room("Staff Room", "02", "office", 20, 400),
            _room("Seminar Hall", "03", "lecture_hall", 120, 1800),
            _room("Store Room", "04", "store", None, 150),
            _room("Washroom (Boys)", "W1", "washroom", None, 200),
            _room("Washroom (Girls)", "W2", "washroom", None, 200),
        ]

    if is_top:
        return [
            _room("Library / Reading Room", "01", "library", 80, 1800),
            _room("Computer Lab", "02", "laboratory", 40, 1200),
            _room("Classroom", "03", "classroom", 60, 900),
            _room("Classroom", "04", "classroom", 60, 900),
            _room("Washroom (Boys)", "W1", "washroom", None, 200),
            _room("Washroom (Girls)", "W2", "washroom", None, 200),
        ]

    if position % 2 == 1:
        return [
            _room("Classroom", "01", "classroom", 60, 900),
            _room("Classroom", "02", "classroom", 60, 900),
            _room("Classroom", "03", "classroom", 60, 900),
            _room("Science Laboratory", "04", "laboratory", 40, 1100),
            _room("Staff Room", "05", "office", 15, 350),
            _room("Washroom (Boys)", "W1", "washroom", None, 200),
            _room("Washroom (Girls)", "W2", "washroom", None, 200),
        ]

    return [
        _room("Classroom", "01", "classroom", 60, 900),
        _room("Classroom", "02", "classroom", 60, 900),
        _room("Lecture Hall", "03", "lecture_hall", 100, 1400),
        _room("Computer Lab", "04", "laboratory", 40, 1200),
        _room("Washroom (Boys)", "W1", "washroom", None, 200),
        _room("Washroom (Girls)", "W2", "washroom", None, 200),
    ]


# ------------------------------------------------------------------ HTTP
def call(session: requests.Session, base: str, method: str, path: str, **kw):
    resp = session.request(method, f"{base}{path}", timeout=30, **kw)
    if not resp.ok:
        print(f"  ! {method} {path} -> {resp.status_code}: {resp.text[:300]}")
        resp.raise_for_status()
    return resp.json() if resp.text else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                      formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-base", required=True,
                         help="e.g. https://campusnetra.onrender.com/api/v1")
    parser.add_argument("--token", required=True,
                         help="Bearer access_token from a logged-in admin session")
    parser.add_argument("--buildings", nargs="+", default=["Main", "ANNEX"],
                         help="Building names to fill in (case-insensitive, default: Main ANNEX)")
    parser.add_argument("--dry-run", action="store_true",
                         help="Print what would be created without creating anything")
    args = parser.parse_args()

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {args.token}"
    base = args.api_base.rstrip("/")

    campuses = call(session, base, "GET", "/campus/campuses")
    wanted = {b.strip().lower() for b in args.buildings}
    targets = []
    for campus in campuses:
        for b in call(session, base, "GET", f"/campus/campuses/{campus['id']}/buildings"):
            if b["name"].strip().lower() in wanted:
                targets.append((campus, b))

    missing = wanted - {b["name"].strip().lower() for _, b in targets}
    if missing:
        print(f"Could not find building(s): {', '.join(sorted(missing))} "
              f"-- check the exact name shown on the campus map.")
    if not targets:
        print("Nothing to do.")
        return 1

    for campus, building in targets:
        print(f"\n=== {building['name']} ({building['code']}) — {campus['name']} ===")
        floors = call(session, base, "GET", f"/campus/buildings/{building['id']}/floors")
        existing_levels = {f["level"] for f in floors}
        floors_count = building["floors_count"]

        # This project's own seed data (database/seeds/001_reference_data.sql)
        # numbers floors 1..N with 1 as the ground floor, so this matches it.
        for level in range(1, floors_count + 1):
            if level in existing_levels:
                continue
            label = "Ground Floor" if level == 1 else f"Floor {level}"
            print(f"  + creating {label} (level {level})")
            if args.dry_run:
                floors.append({"id": None, "name": label, "level": level})
                continue
            floors.append(call(session, base, "POST",
                                f"/campus/buildings/{building['id']}/floors",
                                json={"name": label, "level": level}))

        floors.sort(key=lambda f: f["level"])
        total = len(floors)
        for position, floor in enumerate(floors):
            if floor["id"] is None:  # dry-run placeholder from above
                plan_rooms = []
            else:
                plan_rooms = call(session, base, "GET",
                                   f"/campus/floors/{floor['id']}/plan")["rooms"]

            if plan_rooms:
                print(f"  - {floor['name']}: already has {len(plan_rooms)} room(s), skipping")
                continue

            new_rooms = rooms_for_floor(position, total)
            print(f"  + {floor['name']}: adding {len(new_rooms)} rooms")
            for r in new_rooms:
                code = f"{building['code']}-{floor['level']}{r['code_suffix']}"
                body = {"name": r["name"], "code": code, "kind": r["kind"],
                        "capacity": r["capacity"], "area_sqft": r["area_sqft"]}
                if args.dry_run:
                    print(f"      · {r['name']} [{r['kind']}] ({code})")
                    continue
                call(session, base, "POST", f"/campus/floors/{floor['id']}/rooms", json=body)

    print("\nDone." + (" (dry run -- nothing was actually created)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
