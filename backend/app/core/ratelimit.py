"""A small in-memory sliding-window limiter.

Used for the few public endpoints that send something to a third party on
request (an email, an SMS). The key is the *target* (the address or number),
not the caller's IP: a whole class sharing one college connection must not
lock each other out, but nobody should be able to make a single inbox or phone
receive a stream of codes.

State lives in this process, which is right for a single web instance. With
several instances each would keep its own count (limits become per instance).
"""
from __future__ import annotations

import time
from collections import deque
from threading import Lock

_hits: dict[str, deque[float]] = {}
_lock = Lock()
_MAX_KEYS = 20_000   # stop a flood of distinct keys from growing memory without bound


def allow(key: str, limit: int, window_seconds: int) -> bool:
    """Record an attempt and say whether it is within `limit` per `window_seconds`."""
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        if len(_hits) > _MAX_KEYS:
            for k in [k for k, q in _hits.items() if not q or q[-1] < cutoff]:
                _hits.pop(k, None)
        q = _hits.setdefault(key, deque())
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True


def reset() -> None:
    """Clear all counters (tests)."""
    with _lock:
        _hits.clear()
