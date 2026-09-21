"""Human-readable reference generation (CMP-1042, WO-1024, LF-2026-0082)."""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text
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


# Excludes 0/O and 1/I/L — the whole point of a short code is someone can read
# it back over a phone call or type it into a search box without a coin-flip
# on which character they actually saw.
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def _random_suffix(length: int = 9) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


async def next_public_id(db: AsyncSession, model, prefix: str, length: int = 9) -> str:
    """Public-facing ID like CN10A7K92Q / LF7K29A4X — a short random code,
    not a sequential counter, so it doesn't leak how many of something
    exist and isn't guessable by incrementing the last one seen.

    Collision-checked against the real table before handing it back
    rather than trusted blind: astronomically unlikely at this alphabet
    size, but "unlikely" isn't "unique," and `reference` has a real
    database uniqueness constraint that would just 500 on a collision
    instead of retrying if this didn't check first.
    """
    for _ in range(5):
        candidate = f"{prefix}{_random_suffix(length)}"
        exists = await db.scalar(select(model.id).where(model.reference == candidate))
        if not exists:
            return candidate
    # Astronomically unlikely to ever run, but never loop forever on it.
    raise RuntimeError(f"Could not generate a unique {prefix} reference after 5 attempts.")
