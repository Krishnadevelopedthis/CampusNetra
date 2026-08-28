"""Human-readable reference generation (CMP-1042, WO-1024, LF-2026-0082)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def next_reference(db: AsyncSession, org_id: uuid.UUID, prefix: str) -> str:
    """Atomic counter per (organization, prefix) — see next_reference() in 007."""
    result = await db.execute(
        text("SELECT next_reference(:org, :prefix)"),
        {"org": str(org_id), "prefix": prefix},
    )
    return result.scalar_one()


async def next_year_reference(db: AsyncSession, org_id: uuid.UUID, prefix: str) -> str:
    """Year-scoped variant used by Lost & Found: LF-2026-0082."""
    year = datetime.now(timezone.utc).year
    raw = await next_reference(db, org_id, f"{prefix}{year}")
    # next_reference returns "LF2026-1001"; reshape to "LF-2026-1001".
    _, seq = raw.rsplit("-", 1)
    return f"{prefix}-{year}-{int(seq):04d}"
