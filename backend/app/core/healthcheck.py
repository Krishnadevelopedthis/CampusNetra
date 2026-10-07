"""Dependency probes behind GET /health.

/health is polled (the admin overview refreshes it every 30 seconds) and is
what an uptime monitor would hit, so it has three jobs: answer quickly, never
hang, and never open a connection per poll.

  * Bounded. The database sits on a serverless host that suspends when idle, so
    the first connection after a quiet spell can take several seconds. An
    unbounded probe makes the whole endpoint as slow as the slowest
    dependency, and the caller gives up and reports an outage that is not real.
    Each probe has its own deadline and reports "down" if it is exceeded.
  * Shared. Concurrent callers wait on one in-flight probe instead of each
    taking a pooled connection.
  * Cached. A good result is reused briefly. A bad one is kept only for a
    moment, so recovery shows up quickly.
"""
from __future__ import annotations

import asyncio
import time

from sqlalchemy import text

from app.core.database import engine

DB_PROBE_TIMEOUT = 12.0   # seconds; a cold serverless database can take 7s+ to wake
UP_CACHE_SECONDS = 10.0
DOWN_CACHE_SECONDS = 2.0

_cache: tuple[float, bool] | None = None
_lock = asyncio.Lock()


async def _ping_database() -> None:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


def _fresh(now: float) -> bool | None:
    if _cache is None:
        return None
    stamped, up = _cache
    ttl = UP_CACHE_SECONDS if up else DOWN_CACHE_SECONDS
    return up if now - stamped < ttl else None


async def database_up() -> bool:
    """True if a round trip to the database completes within the deadline."""
    global _cache

    cached = _fresh(time.monotonic())
    if cached is not None:
        return cached

    async with _lock:
        # Another caller may have finished the probe while this one waited.
        cached = _fresh(time.monotonic())
        if cached is not None:
            return cached
        try:
            await asyncio.wait_for(_ping_database(), timeout=DB_PROBE_TIMEOUT)
            up = True
        except Exception:  # noqa: BLE001 - any failure, including the timeout, means "not up"
            up = False
        _cache = (time.monotonic(), up)
        return up


def reset() -> None:
    """Forget the cached result (tests)."""
    global _cache
    _cache = None
