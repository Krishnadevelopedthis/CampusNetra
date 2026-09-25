#!/usr/bin/env python3
"""Read-only: show the most recent AI invocation attempts and their errors.

Diagnostic for "the assistant/classifier keeps falling back to the heuristic
even though OPENROUTER_API_KEY and AI_MODEL are set" -- every call (success
or failure) is logged to ai_invocations with the raw exception string, so
this reads that instead of needing access to Render's own logs.

    ./scripts/check_ai_invocations.py
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
from app.models.platform import AIInvocation  # noqa: E402

DIM, RESET, RED, GREEN = "\033[2m", "\033[0m", "\033[31m", "\033[32m"


async def main() -> int:
    async with SessionLocal() as db:
        rows = (await db.scalars(
            select(AIInvocation).order_by(AIInvocation.created_at.desc()).limit(15)
        )).all()

        if not rows:
            print("No AI invocations logged yet.")
            return 0

        for r in rows:
            status = f"{GREEN}ok{RESET}" if r.succeeded else f"{RED}FAILED{RESET}"
            print(f"{r.created_at} | task={r.task} | model={r.model} | "
                  f"fallback={r.used_fallback} | {status}")
            if r.error:
                print(f"  {DIM}error: {r.error}{RESET}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
