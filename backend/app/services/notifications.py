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
from app.services import templates as tmpl
from app.services.realtime import users as user_hub

log = logging.getLogger(__name__)

# Pushes queued on a session, keyed by that session, and released only once it
# commits. Pushing at notify() time would deliver a notification for work that
# a later failure rolls back — the bell would show something the database
# never recorded, and it would survive until the page was reloaded.
_PENDING: dict[int, list[tuple[str, dict]]] = {}

# Emails are held to the same rule, and more strictly: a socket push for work
# that rolled back is corrected by a reload, whereas an email cannot be recalled.
_PENDING_MAIL: dict[int, list[tuple[str, str, str, Optional[str]]]] = {}


def _queue_push(db: AsyncSession, user_id: uuid.UUID, payload: dict) -> None:
    key = id(db.sync_session)
    if key not in _PENDING:
        _PENDING[key] = []
        _arm(db)
    _PENDING[key].append((str(user_id), payload))


def _queue_email(
    db: AsyncSession, to: str, subject: str, text: str, link: Optional[str]
) -> None:
    key = id(db.sync_session)
    if key not in _PENDING_MAIL:
        _PENDING_MAIL[key] = []
        _arm(db)
    _PENDING_MAIL[key].append((to, subject, text, link))


def _arm(db: AsyncSession) -> None:
    """Attach one-shot commit/rollback listeners to this session."""
    sync = db.sync_session
    key = id(sync)

    def on_commit(_session):
        for uid, payload in _PENDING.pop(key, []):
            if not user_hub.is_online(uid):
                continue
            # Fire and forget: a socket that has gone away must not fail the
            # request that is already committed.
            asyncio.create_task(_safe_send(uid, payload))

        for to, subject, text, link in _PENDING_MAIL.pop(key, []):
            asyncio.create_task(_safe_mail(to, subject, text, link))

    def on_rollback(_session):
        _PENDING.pop(key, None)
        _PENDING_MAIL.pop(key, None)

    def _discard(*_args):
        _PENDING.pop(key, None)
        _PENDING_MAIL.pop(key, None)

    event.listen(sync, "after_commit", on_commit)
    event.listen(sync, "after_rollback", on_rollback)
    event.listen(sync, "after_soft_rollback", _discard)


async def _safe_send(user_id: str, payload: dict) -> None:
    try:
        await user_hub.send(user_id, payload)
    except Exception:
        log.debug("notification push failed for user=%s", user_id, exc_info=True)


async def _safe_mail(to: str, subject: str, text: str, link: Optional[str]) -> None:
    """A failed notification email is logged, never raised.

    The work it describes has already been committed; failing here would only
    turn a missing email into a failed request for something that succeeded.
    """
    from app.services.email import send_email

    if link and not link.startswith("http"):
        text = f"{text}\n\nOpen it in Campus Netra: {link}"
    try:
        result = await send_email(to, subject=subject, text=text)
        if not result.delivered:
            log.warning("notification email to %s failed: %s", to, result.error)
    except Exception:
        log.warning("notification email to %s raised", to, exc_info=True)


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
    code: Optional[str] = None,
    context: Optional[dict] = None,
) -> int:
    """Fan a notification out, honouring each recipient's own settings.

    `title`/`body` are the sender's own wording and remain the fallback. When
    `code` names an event an administrator has written a template for, that
    template is rendered instead — so introducing templates changes nothing
    until somebody actually writes one.

    Recipients are looked up in one query rather than per-user: this runs inside
    the request that created the issue, and a fan-out to a whole department
    should not cost a round trip each.
    """
    ids = [uid for uid in dict.fromkeys(user_ids) if uid is not None]
    if not ids:
        return 0

    recipients = (await db.execute(
        select(User.id, User.email, User.full_name, User.preferences, User.organization_id)
        .where(User.id.in_(ids))
    )).all()
    if not recipients:
        return 0

    templates = await tmpl.load(db, recipients[0].organization_id)
    ctx = context or {}
    sent = 0

    for r in recipients:
        prefs = r.preferences or {}

        if tmpl.wants(prefs, code, "in_app"):
            in_title, in_body = tmpl.render(
                templates, code, "in_app", ctx,
                fallback_title=title, fallback_body=body,
            )
            db.add(Notification(
                user_id=r.id, title=in_title, body=in_body, link=link,
                kind=kind, entity_type=entity_type, entity_id=entity_id,
            ))
            _queue_push(db, r.id, {
                "type": "notification",
                "title": in_title,
                "body": in_body,
                "link": link,
                "kind": kind,
                "entity_type": entity_type,
                "entity_id": str(entity_id) if entity_id else None,
            })
            sent += 1

        # Email only goes out for events an administrator has written email
        # wording for. Mirroring every in-app notification to an inbox by
        # default is how a system teaches people to filter it away.
        if (code, "email") in templates and tmpl.wants(prefs, code, "email") and r.email:
            subject, text = tmpl.render(
                templates, code, "email", ctx,
                fallback_title=title, fallback_body=body,
            )
            _queue_email(db, r.email, subject, text or title, link)

    return sent


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
