"""Item #35/#36: "History" — what this person actually did, pulled from the
real tables that already record it, not a new activity-logging system.

Complaints and Lost & Found already have their own event trail
(IssueEvent, and item/claim creation timestamps); account changes already
go through AuditLog. This just reads those, scoped to the caller, and
normalises them into one shape the frontend can render as a single
timeline — each entry still points at the real record for #36's
click-through, not a summary that loses the link back to it.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import User
from app.models.issues import Issue, IssueEvent
from app.models.lostfound import LFClaim, LFItem
from app.models.platform import AuditLog

# Only the account-level actions relevant to *this person's own* history —
# not every AuditLog action exists (some are admin actions on other users'
# accounts, which would still pass actor_id == user.id if an admin looked
# at their own history, but aren't "things that happened to me").
PROFILE_ACTIONS = {
    "user.change_email": "Email address changed",
    "user.change_phone": "Phone number changed",
    "user.change_name": "Name changed",
    "user.change_password": "Password changed",
}


@dataclass
class HistoryEntry:
    id: str
    action: str
    description: str
    entity_type: Optional[str]
    entity_id: Optional[str]
    entity_reference: Optional[str]
    created_at: datetime


async def collect(db: AsyncSession, user: User, limit: int = 200) -> list[HistoryEntry]:
    entries: list[HistoryEntry] = []

    # Complaints this person reported.
    issues = (await db.scalars(
        select(Issue).where(Issue.reported_by == user.id)
        .order_by(Issue.created_at.desc()).limit(limit)
    )).all()
    for i in issues:
        entries.append(HistoryEntry(
            id=f"issue-created-{i.id}", action="issue.created",
            description=f"Reported \u201c{i.title}\u201d",
            entity_type="issue", entity_id=str(i.id), entity_reference=i.reference,
            created_at=i.created_at,
        ))

    # Status changes this person actually made (not every change to their
    # issue — only ones where they're the actor, e.g. withdrawing a report
    # a staff member later also touches is still two separate entries).
    events = (await db.scalars(
        select(IssueEvent).where(IssueEvent.actor_id == user.id)
        .order_by(IssueEvent.created_at.desc()).limit(limit)
    )).all()
    if events:
        issue_ids = {e.issue_id for e in events}
        issue_map = {
            i.id: i for i in (await db.scalars(
                select(Issue).where(Issue.id.in_(issue_ids))
            )).all()
        }
        for e in events:
            # The very first event on an issue (from_status is None, the
            # initial "Reported") is already covered above by the
            # issue.created entry. Showing it again here would both
            # duplicate that entry and leak the note's real audience —
            # e.note on this first event carries internal detail (which
            # classifier ran, at what confidence) meant for the issue's
            # own technical timeline, not a second appearance in a
            # student's plain-language activity feed.
            if e.from_status is None:
                continue
            issue = issue_map.get(e.issue_id)
            if issue is None:
                continue
            label = e.note or (f"Status changed to {e.to_status.value}" if e.to_status else "Updated")
            entries.append(HistoryEntry(
                id=f"issue-event-{e.id}", action="issue.updated",
                description=f"{label} — {issue.reference}",
                entity_type="issue", entity_id=str(issue.id), entity_reference=issue.reference,
                created_at=e.created_at,
            ))

    # Lost & Found items this person reported.
    lf_items = (await db.scalars(
        select(LFItem).where(LFItem.reported_by == user.id)
        .order_by(LFItem.created_at.desc()).limit(limit)
    )).all()
    for it in lf_items:
        verb = "Reported lost" if it.kind.value == "lost" else "Reported found"
        entries.append(HistoryEntry(
            id=f"lf-created-{it.id}", action="lostfound.created",
            description=f"{verb}: \u201c{it.title}\u201d",
            entity_type="lostfound_item", entity_id=str(it.id), entity_reference=it.reference,
            created_at=it.created_at,
        ))

    # Claims this person submitted.
    claims = (await db.scalars(
        select(LFClaim).where(LFClaim.claimant_id == user.id)
        .order_by(LFClaim.created_at.desc()).limit(limit)
    )).all()
    if claims:
        item_ids = {c.item_id for c in claims}
        item_map = {
            it.id: it for it in (await db.scalars(
                select(LFItem).where(LFItem.id.in_(item_ids))
            )).all()
        }
        for c in claims:
            item = item_map.get(c.item_id)
            entries.append(HistoryEntry(
                id=f"lf-claim-{c.id}", action="lostfound.claimed",
                description=f"Claimed \u201c{item.title if item else 'an item'}\u201d",
                entity_type="lostfound_item", entity_id=str(c.item_id),
                entity_reference=item.reference if item else None,
                created_at=c.created_at,
            ))

    # Profile/account changes.
    audit_rows = (await db.scalars(
        select(AuditLog).where(
            AuditLog.actor_id == user.id,
            AuditLog.action.in_(PROFILE_ACTIONS.keys()),
        ).order_by(AuditLog.created_at.desc()).limit(limit)
    )).all()
    for a in audit_rows:
        entries.append(HistoryEntry(
            id=f"audit-{a.id}", action=a.action,
            description=PROFILE_ACTIONS.get(a.action, a.action),
            entity_type=None, entity_id=None, entity_reference=None,
            created_at=a.created_at,
        ))

    entries.sort(key=lambda e: e.created_at, reverse=True)
    return entries[:limit]
