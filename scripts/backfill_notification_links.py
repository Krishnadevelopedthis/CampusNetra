#!/usr/bin/env python3
"""Repoint existing Lost & Found notifications at a route that actually exists.

lf_match and lf_claim notifications were created with link=/lost-found/
matches/{id} or /lost-found/claims/{id} -- neither was ever a real frontend
route (see the fix in app/services/lostfound.py), so clicking one 404'd.
The create path is fixed for new notifications; this repoints existing rows
at the one page that does exist and does show the match/claim: the item's
own detail page, /lost-found/items/{item_id}.

    ./scripts/backfill_notification_links.py            # dry run, prints what would change
    ./scripts/backfill_notification_links.py --apply     # actually writes the changes

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
from app.models.lostfound import LFClaim, LFItem, LFMatch  # noqa: E402
from app.models.platform import Notification  # noqa: E402

GREEN, YELLOW, DIM, RESET = "\033[32m", "\033[33m", "\033[2m", "\033[0m"


async def main() -> int:
    apply = "--apply" in sys.argv[1:]
    print(f"{DIM}Mode: {'APPLYING CHANGES' if apply else 'dry run (pass --apply to write)'}{RESET}\n")

    total_changed = 0
    async with SessionLocal() as db:
        broken = (await db.scalars(
            select(Notification).where(
                Notification.kind.in_(["lf_match", "lf_claim"]),
                Notification.link.like("/lost-found/matches/%")
                | Notification.link.like("/lost-found/claims/%"),
            )
        )).all()

        if not broken:
            print(f"{GREEN}Nothing to do -- no notifications on the old links.{RESET}")
            return 0

        print(f"{len(broken)} notification(s) on a dead link\n")
        for n in broken:
            item_id = None
            if n.kind == "lf_match":
                match = await db.get(LFMatch, n.entity_id) if n.entity_id else None
                item_id = match.found_item_id if match else None
            elif n.kind == "lf_claim":
                claim = await db.get(LFClaim, n.entity_id) if n.entity_id else None
                item_id = claim.item_id if claim else None

            if item_id is not None:
                item = await db.get(LFItem, item_id)
            new_link = f"/lost-found/items/{item_id}" if item_id and item else "/lost-found"

            print(f"  {YELLOW}{n.link}{RESET} -> {GREEN}{new_link}{RESET}  ({n.title})")
            if apply:
                n.link = new_link
            total_changed += 1

        if apply:
            await db.commit()
            print(f"\n{GREEN}Committed {total_changed} change(s).{RESET}")
        else:
            print(f"\n{DIM}{total_changed} row(s) would change. Re-run with --apply to write them.{RESET}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
