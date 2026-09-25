#!/usr/bin/env python3
"""Read-only: show every lf_items row's kind/status, to debug why the
"Found items" tab is empty despite items existing.

    ./scripts/check_lf_items.py
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
from app.models.lostfound import LFItem  # noqa: E402

DIM, RESET = "\033[2m", "\033[0m"


async def main() -> int:
    async with SessionLocal() as db:
        rows = (await db.scalars(
            select(LFItem).order_by(LFItem.created_at.desc()).limit(30)
        )).all()
        if not rows:
            print("No lf_items rows at all.")
            return 0
        for i in rows:
            print(f"{i.reference} | kind={i.kind.value} | status={i.status.value} | "
                  f"org={i.organization_id} | title={i.title!r}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
