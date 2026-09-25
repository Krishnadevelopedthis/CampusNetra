#!/usr/bin/env python3
"""Backfill old sequential reference codes to the short random public-ID format.

Lost & Found items and work orders both went through a format change at
different times: LFItem and LFClaim moved to CN-style random codes (e.g.
LF7K29A4X) in an earlier pass, and WorkOrder moved the same way in this one.
Neither pass touched rows already in the database -- new records got the new
format, but anything created before the change kept its old-style reference
(LF-2026-1007, WO-1024) forever, since `reference` is only ever set once at
creation. This finds those old-format rows and regenerates their reference
using the same next_public_id() the create path uses now, so every row in
the table ends up on the same scheme.

    ./scripts/backfill_reference_codes.py            # dry run, prints what would change
    ./scripts/backfill_reference_codes.py --apply     # actually writes the changes

Old-format detection: the new codes are a bare prefix + random alphabet with
no separators (LF7K29A4X), so any reference containing a "-" after its
prefix is unambiguously old-format (LF-2026-1007, WO-1024) -- there's no
false-positive risk of matching a new-format code by accident.

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

from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.lostfound import LFClaim, LFItem  # noqa: E402
from app.models.work import WorkOrder  # noqa: E402
from app.services.references import next_public_id  # noqa: E402

GREEN, YELLOW, DIM, RESET = "\033[32m", "\033[33m", "\033[2m", "\033[0m"

# (model, prefix, human label)
TARGETS = [
    (LFItem, "LF", "Lost & Found items"),
    (LFClaim, "CLM", "Lost & Found claims"),
    (WorkOrder, "WO", "Work orders"),
]


def _is_old_format(reference: str, prefix: str) -> bool:
    return reference.startswith(prefix) and "-" in reference


async def main() -> int:
    apply = "--apply" in sys.argv[1:]
    print(f"{DIM}Mode: {'APPLYING CHANGES' if apply else 'dry run (pass --apply to write)'}{RESET}\n")

    total_changed = 0
    async with SessionLocal() as db:
        for model, prefix, label in TARGETS:
            rows = (await db.scalars(select(model))).all()
            old_format = [r for r in rows if _is_old_format(r.reference, prefix)]
            if not old_format:
                print(f"{label}: none, all already on the new format")
                continue

            print(f"{label}: {len(old_format)} old-format row(s)")
            for row in old_format:
                new_ref = await next_public_id(db, model, prefix)
                print(f"  {YELLOW}{row.reference}{RESET} -> {GREEN}{new_ref}{RESET}")
                if apply:
                    row.reference = new_ref
                total_changed += 1

        if apply and total_changed:
            await db.commit()
            print(f"\n{GREEN}Committed {total_changed} change(s).{RESET}")
        elif total_changed:
            print(f"\n{DIM}{total_changed} row(s) would change. Re-run with --apply to write them.{RESET}")
        else:
            print(f"\n{GREEN}Nothing to do.{RESET}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
