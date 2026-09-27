"""In-memory per-process health/cooldown tracking for AI routes.

Same limitation as app/ai/sessions.py's conversation store (documented
there): this doesn't survive multiple workers or a restart. That's fine
for what it's used for -- a cooldown is a "don't hammer a route that just
told us to back off" hint, not a durability requirement, and the router
re-derives a working route within one request either way if the in-memory
state is ever wrong or missing.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.ai.errors import DEFAULT_COOLDOWN_SECONDS, ErrorKind

# Provider-level auth failures don't reset on a timer -- the key is wrong
# until a human fixes it -- so this is a plain disable set, not a cooldown.
_disabled_providers: set[str] = set()

# (provider, model) -> cooldown_until (epoch seconds). Absent or in the
# past means eligible.
_cooldowns: dict[tuple[str, str], float] = {}

# (provider, model) -> recent failure count, for ranking healthy-but-flaky
# routes below never-yet-failed ones. Decays on success.
_failure_counts: dict[tuple[str, str], int] = {}


def disable_provider(provider: str) -> None:
    _disabled_providers.add(provider)


def provider_disabled(provider: str) -> bool:
    return provider in _disabled_providers


def mark_failure(provider: str, model: str, kind: ErrorKind, retry_after: float | None = None) -> None:
    key = (provider, model)
    _failure_counts[key] = _failure_counts.get(key, 0) + 1
    cooldown = retry_after if retry_after is not None else DEFAULT_COOLDOWN_SECONDS.get(kind, 30)
    _cooldowns[key] = time.monotonic() + cooldown


def mark_success(provider: str, model: str) -> None:
    key = (provider, model)
    _failure_counts[key] = 0
    _cooldowns.pop(key, None)


def is_in_cooldown(provider: str, model: str) -> bool:
    until = _cooldowns.get((provider, model))
    return until is not None and time.monotonic() < until


def failure_count(provider: str, model: str) -> int:
    return _failure_counts.get((provider, model), 0)


def reset_all() -> None:
    """Test-only escape hatch -- module-level state otherwise leaks
    between test cases that each expect a clean slate."""
    _disabled_providers.clear()
    _cooldowns.clear()
    _failure_counts.clear()
