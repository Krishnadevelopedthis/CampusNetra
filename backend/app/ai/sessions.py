"""Bounded in-process conversation state for the AI Agent.

Chat history for an in-progress assistant conversation lives here, keyed by
a server-issued conversation_id. In-memory only — this deployment already
runs a single worker (see render startup logs: `WEB_CONCURRENCY=1`), and
the SMS-Gateway cloud relay in this same codebase (cloud-gateway/main.py's
`pending_requests` dict) already establishes that pattern for short-lived
server-side state here. A session resetting on redeploy loses an open chat
window, not application data — an acceptable trade-off for "no new
infrastructure" versus a genuine loss.

Every lookup is scoped to the user_id that started the session: a
conversation_id from another user (or a stale/unknown one) never returns
someone else's history, it just starts a fresh session instead. This is
what "the session must not leak information between users" means in
practice here — conversation_id values are server-generated UUIDs handed
back to the caller, not guessable, but this check is cheap insurance
regardless.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

MAX_MESSAGES = 20                  # user+assistant turns kept per session
SESSION_TTL_SECONDS = 60 * 60      # idle sessions are dropped after an hour
MAX_SESSIONS = 2000                # hard cap independent of TTL eviction


@dataclass
class Session:
    user_id: uuid.UUID
    messages: list[dict] = field(default_factory=list)
    # Slot-filling state for an in-progress guided create flow. Unused for
    # now — read-only tools don't need it — reserved for the
    # create_complaint/create_lost_found conversational flow (see
    # AI_AGENT_PROGRESS.md for why that isn't built yet).
    pending_action: dict | None = None
    last_active: float = field(default_factory=time.monotonic)


_sessions: dict[uuid.UUID, Session] = {}


def _evict_stale() -> None:
    now = time.monotonic()
    stale = [sid for sid, s in _sessions.items() if now - s.last_active > SESSION_TTL_SECONDS]
    for sid in stale:
        _sessions.pop(sid, None)

    if len(_sessions) > MAX_SESSIONS:
        overflow = len(_sessions) - MAX_SESSIONS
        oldest = sorted(_sessions.items(), key=lambda kv: kv[1].last_active)[:overflow]
        for sid, _ in oldest:
            _sessions.pop(sid, None)


def get_or_create(conversation_id: "uuid.UUID | None", user_id: uuid.UUID) -> tuple[uuid.UUID, Session]:
    _evict_stale()

    if conversation_id is not None:
        existing = _sessions.get(conversation_id)
        if existing is not None and existing.user_id == user_id:
            existing.last_active = time.monotonic()
            return conversation_id, existing
        # Unknown, expired, or (defensively) another user's session id —
        # start fresh rather than failing the request.

    new_id = uuid.uuid4()
    session = Session(user_id=user_id)
    _sessions[new_id] = session
    return new_id, session


def append(session: Session, role: str, content: str) -> None:
    session.messages.append({"role": role, "content": content})
    session.last_active = time.monotonic()
    if len(session.messages) > MAX_MESSAGES:
        session.messages = session.messages[-MAX_MESSAGES:]
