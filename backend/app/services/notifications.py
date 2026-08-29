"""In-app notification fan-out."""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Iterable, Optional, Sequence

from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.models.identity import User
from app.models.platform import Notification
from app.services.realtime import users as user_hub

log = logging.getLogger(__name__)

# Pushes queued on a session, keyed by that session, and released only once it
# commits. Pushing at notify() time would deliver a notification for work that
# a later failure rolls back — the bell would show something the database
# never recorded, and it would survive until the page was reloaded.
_PENDING: dict[int, list[tuple[str, dict]]] = {}


def _queue_push(db: AsyncSession, user_id: uuid.UUID, payload: dict) -> None:
    key = id(db.sync_session)
    if key not in _PENDING:
        _PENDING[key] = []
        _arm(db)
    _PENDING[key].append((str(user_id), payload))


def _arm(db: AsyncSession) -> None:
    """Attach one-shot commit/rollback listeners to this session."""
    sync = db.sync_session
    key = id(sync)

    def on_commit(_session):
        queued = _PENDING.pop(key, [])
        for uid, payload in queued:
            if not user_hub.is_online(uid):
                continue
            # Fire and forget: a socket that has gone away must not fail the
            # request that is already committed.
            asyncio.create_task(_safe_send(uid, payload))

    def on_rollback(_session):
        _PENDING.pop(key, None)

    event.listen(sync, "after_commit", on_commit)
    event.listen(sync, "after_rollback", on_rollback)
    event.listen(sync, "after_soft_rollback", lambda s, c: _PENDING.pop(key, None))


async def _safe_send(user_id: str, payload: dict) -> None:
    try:
        await user_hub.send(user_id, payload)
    except Exception:
        log.debug("notification push failed for user=%s", user_id, exc_info=True)


async def notify(
    db: AsyncSession,
    user_ids: Iterable[uuid.UUID],
    *,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    kind: str = "info",
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
) -> int:
    seen: set[uuid.UUID] = set()
    for uid in user_ids:
        if uid is None or uid in seen:
            continue
        seen.add(uid)
        db.add(Notification(
            user_id=uid, title=title, body=body, link=link,
            kind=kind, entity_type=entity_type, entity_id=entity_id,
        ))
        _queue_push(db, uid, {
            "type": "notification",
            "title": title,
            "body": body,
            "link": link,
            "kind": kind,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id else None,
        })
    return len(seen)


async def department_members(
    db: AsyncSession, department_id: Optional[uuid.UUID]
) -> Sequence[uuid.UUID]:
    if department_id is None:
        return []
    return (await db.scalars(
        select(User.id).where(User.department_id == department_id, User.status == "active")
    )).all()


async def managers_of(db: AsyncSession, organization_id: uuid.UUID) -> Sequence[uuid.UUID]:
    return (await db.scalars(
        select(User.id).where(
            User.organization_id == organization_id,
            User.role.in_([UserRole.FACILITY_MANAGER, UserRole.ADMIN]),
            User.status == "active",
        )
    )).all()
