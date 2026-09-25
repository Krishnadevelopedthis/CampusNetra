#!/usr/bin/env python3
"""Add the handover declaration columns to lf_claims.

There is no migration tool in this project (no alembic, no create_all on
startup) -- schema changes are applied by hand. This adds the columns
app/models/lostfound.py's LFClaim now expects (declared_name,
declared_id_number, declared_email, declared_address, declaration_text,
declared_at), all nullable so existing rows are unaffected and nothing
currently running breaks mid-deploy.

    ./scripts/add_handover_declaration_columns.py            # dry run, prints the SQL
    ./scripts/add_handover_declaration_columns.py --apply     # actually runs it

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

COLUMNS = [
    ("declared_name", "TEXT"),
    ("declared_id_number", "TEXT"),
    ("declared_email", "TEXT"),
    ("declared_address", "TEXT"),
    ("declaration_text", "TEXT"),
    ("declared_at", "TIMESTAMPTZ"),
]


async def main() -> int:
    apply = "--apply" in sys.argv[1:]
    print(f"{DIM}Mode: {'APPLYING CHANGES' if apply else 'dry run (pass --apply to write)'}{RESET}\n")

    async with engine.begin() as conn:
        existing = {
            row[0] for row in (await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'lf_claims'"
            ))).all()
        }

        todo = [(name, sqltype) for name, sqltype in COLUMNS if name not in existing]
        if not todo:
            print(f"{GREEN}Nothing to do -- all columns already present.{RESET}")
            return 0

        for name, sqltype in todo:
            stmt = f"ALTER TABLE lf_claims ADD COLUMN {name} {sqltype}"
            print(f"  {YELLOW}{stmt}{RESET}")
            if apply:
                await conn.execute(text(stmt))

        if apply:
            print(f"\n{GREEN}Added {len(todo)} column(s).{RESET}")
        else:
            print(f"\n{DIM}{len(todo)} column(s) would be added. Re-run with --apply to write them.{RESET}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
