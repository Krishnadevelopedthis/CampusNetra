"""Notification wording: the codes, their placeholders, and rendering.

Every notification the platform sends is one of the codes below. The list lives
here rather than in the admin router because three things need to agree on it —
the screen that offers the codes, the endpoint that validates a submitted
template, and the services that send.

A template is optional. Without one the sender's own wording is used, which is
what keeps this safe to introduce: nothing changes until somebody writes a
template, and a template that goes missing degrades to the original text rather
than to an empty message.
"""
from __future__ import annotations

import re
import uuid
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import NotificationTemplate

# code -> the placeholders that code can offer.
#
# Only events something actually sends belong here. An event listed but never
# emitted is worse than a missing one: the screen accepts a template, marks the
# row as configured, and nothing is ever delivered from it. `issue.assigned`
# was exactly that — an issue is never assigned to a person in this system,
# only the work order raised from it is, which `workorder.assigned` covers.
NOTIFICATION_CODES: dict[str, list[str]] = {
    "issue.created":      ["reference", "title", "location", "priority", "reporter"],
    "issue.resolved":     ["reference", "title", "resolution"],
    "workorder.assigned": ["reference", "title", "priority", "due"],
    "inspection.due":     ["reference", "template", "room", "due"],
    "lf.match_found":     ["reference", "title", "score"],
    "lf.claim_decision":  ["reference", "title", "decision", "reason"],
    "sla.breached":       ["reference", "title", "department", "overdue_by"],
}

# Which switch on the Settings page governs each code. A code with no entry is
# not something anyone can turn off.
CODE_PREFERENCE: dict[str, str] = {
    "issue.created":      "work_assigned",
    "issue.resolved":     "issue_status",
    "workorder.assigned": "work_assigned",
    "inspection.due":     "work_assigned",
    "lf.match_found":     "lostfound_match",
    "lf.claim_decision":  "lostfound_match",
    "sla.breached":       "sla_breach",
}

# Codes that ignore the per-event switches. The Settings page tells people
# urgent notices are sent regardless, and that promise has to hold.
#
# sla.breached is kept although nothing emits it yet: unlike issue.assigned it
# describes a real event the system already tracks — sla_due_at is set and
# sla_breached exists — and only wants something running on a schedule to
# notice the clock has passed. Removing it would mean re-adding it then.
ALWAYS_DELIVER = {"sla.breached"}

_PLACEHOLDER = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def fill(text: str, context: dict) -> str:
    """Substitute {{placeholders}}, dropping any the context does not supply.

    A missing value renders as nothing rather than as a literal {{location}} —
    a template written for an issue that happens to have no room recorded
    should read a little short, not visibly broken.
    """
    return _PLACEHOLDER.sub(lambda m: str(context.get(m.group(1), "") or ""), text or "")


async def load(db: AsyncSession, organization_id: uuid.UUID) -> dict[tuple[str, str], NotificationTemplate]:
    """Every active template for an organisation, keyed by (code, channel)."""
    rows = (await db.scalars(
        select(NotificationTemplate).where(
            NotificationTemplate.organization_id == organization_id,
            NotificationTemplate.is_active.is_(True),
        )
    )).all()
    return {(t.code, str(t.channel)): t for t in rows}


def render(
    templates: dict,
    code: Optional[str],
    channel: str,
    context: dict,
    *,
    fallback_title: str,
    fallback_body: Optional[str] = None,
) -> tuple[str, Optional[str]]:
    """The wording to send, from a template if one exists."""
    template = templates.get((code, channel)) if code else None
    if template is None:
        return fallback_title, fallback_body

    title = fill(template.subject, context).strip() if template.subject else fallback_title
    body = fill(template.body, context).strip() if template.body else fallback_body
    # An author who saves an empty template should not silently mute the event.
    return (title or fallback_title), (body or fallback_body)


def wants(preferences: dict, code: Optional[str], channel: str) -> bool:
    """Whether this recipient wants this code on this channel."""
    notify = (preferences or {}).get("notify") or {}

    channel_key = "channel_email" if channel == "email" else "channel_inapp"
    if notify.get(channel_key, True) is False:
        # An urgent notice still reaches the bell; it must not reach an inbox
        # somebody has explicitly switched off.
        return channel != "email" and code in ALWAYS_DELIVER

    if code in ALWAYS_DELIVER:
        return True

    event_key = CODE_PREFERENCE.get(code)
    if event_key is None:
        return True
    return notify.get(event_key, True) is not False


# Codes a service currently sends. Kept explicit so the screen can say which
# rows are live rather than leaving an author to find out by nobody replying.
EMITTED = {
    "issue.created",
    "issue.resolved",
    "workorder.assigned",
    "inspection.due",
    "lf.match_found",
    "lf.claim_decision",
}


def codes_payload() -> list[dict]:
    return [
        {"code": code, "placeholders": fields, "live": code in EMITTED}
        for code, fields in NOTIFICATION_CODES.items()
    ]
