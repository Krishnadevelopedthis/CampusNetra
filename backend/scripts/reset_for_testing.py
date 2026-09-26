"""One-off reset: wipe every table except Organization and User, so testing
can start from a clean slate without losing anyone's login.

Organization is kept alongside User (not just "the user profile") because
User.organization_id is a required, non-nullable foreign key -- a user row
cannot exist without the organization row it points at. Every other table
(campuses, buildings, floors, rooms, assets, issues, work orders,
inspections, lost & found, notifications, AI/audit/login logs, SLA
policies, categories, IoT devices, refresh tokens, everything) is deleted.
Deleting refresh tokens means everyone gets logged out and has to sign in
again -- expected, not a bug, for a full reset.

SAFE BY DEFAULT: running this with no flags only PRINTS how many rows would
be deleted from each table and changes nothing. Nothing is deleted until
you pass --apply.

Usage (from backend/):
    python scripts/reset_for_testing.py            # dry run, no changes
    python scripts/reset_for_testing.py --apply     # actually deletes
    python scripts/reset_for_testing.py --sql       # print copy-paste SQL
                                                      # instead (e.g. to run
                                                      # in Neon's own SQL
                                                      # Editor, no terminal
                                                      # needed) -- prints
                                                      # only, deletes nothing
                                                      # itself either way.

Deletion order is derived from SQLAlchemy's own FK-dependency graph
(Base.metadata.sorted_tables, reversed -- children before the parents they
reference), so this doesn't need to hardcode a table order by hand and
can't get it wrong as the schema changes.
"""
from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import delete, func, select

from app.core.database import Base, SessionLocal
# Import every model module so Base.metadata actually has every table
# registered on it -- SQLAlchemy only knows about a table once its model
# class has been imported somewhere.
import app.models.identity as identity  # noqa: F401
import app.models.issues  # noqa: F401
import app.models.work  # noqa: F401
import app.models.lostfound  # noqa: F401
import app.models.spatial  # noqa: F401
import app.models.platform  # noqa: F401
import app.models.iot  # noqa: F401

KEEP_TABLES = {"organizations", "users"}


def print_sql(tables) -> None:
    print("-- Paste this into Neon's SQL Editor and run it. Wrapped in one")
    print("-- transaction so it's all-or-nothing -- if any statement fails,")
    print("-- nothing above it is kept either.")
    print("BEGIN;")
    for table in tables:
        print(f"DELETE FROM {table.name};")
    print("COMMIT;")


async def main(apply: bool, as_sql: bool) -> None:
    tables = [t for t in reversed(Base.metadata.sorted_tables) if t.name not in KEEP_TABLES]

    if as_sql:
        print_sql(tables)
        return

    async with SessionLocal() as db:
        total = 0
        for table in tables:
            count = await db.scalar(select(func.count()).select_from(table)) or 0
            if count == 0:
                continue
            total += count
            if apply:
                await db.execute(delete(table))
                print(f"deleted {count:>6} rows from {table.name}")
            else:
                print(f"[dry run] would delete {count:>6} rows from {table.name}")

        if apply:
            await db.commit()
            print(f"\nDone -- {total} rows deleted across {len(tables)} tables. "
                  f"organizations and users were left untouched.")
        else:
            print(f"\nDry run only -- {total} rows would be deleted, nothing was changed. "
                  f"Re-run with --apply to actually delete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    parser.add_argument("--sql", action="store_true", help="print copy-paste SQL instead of running anything")
    args = parser.parse_args()
    asyncio.run(main(args.apply, args.sql))
