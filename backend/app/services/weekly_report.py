"""Weekly activity summary — what's changed for one person in the last 7 days.

Scoped the same way data_export is: what the requester reported or was
assigned, not an administrative dump of the whole organisation. Real
queries against real tables, not placeholder content — an empty week
still gets a real (empty) summary, never fabricated numbers.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import User
from app.models.issues import Issue, IssueStatus
from app.models.lostfound import LFClaim, LFItem

WINDOW = timedelta(days=7)


@dataclass
class WeeklySummary:
    period_start: datetime
    period_end: datetime
    issues_reported: list[Issue] = field(default_factory=list)
    issues_resolved: list[Issue] = field(default_factory=list)
    sla_breaches: list[Issue] = field(default_factory=list)
    lf_reported: list[LFItem] = field(default_factory=list)
    lf_claims: list[LFClaim] = field(default_factory=list)


async def collect(db: AsyncSession, user: User) -> WeeklySummary:
    now = datetime.now(timezone.utc)
    since = now - WINDOW

    issues_reported = (
        await db.scalars(
            select(Issue)
            .where(Issue.reported_by == user.id, Issue.created_at >= since)
            .order_by(Issue.created_at.desc())
        )
    ).all()

    issues_resolved = (
        await db.scalars(
            select(Issue)
            .where(
                Issue.reported_by == user.id,
                Issue.status == IssueStatus.RESOLVED,
                Issue.resolved_at >= since,
            )
            .order_by(Issue.resolved_at.desc())
        )
    ).all()

    sla_breaches = (
        await db.scalars(
            select(Issue)
            .where(
                Issue.reported_by == user.id,
                Issue.sla_breached.is_(True),
                Issue.created_at >= since,
            )
            .order_by(Issue.created_at.desc())
        )
    ).all()

    lf_reported = (
        await db.scalars(
            select(LFItem)
            .where(LFItem.reported_by == user.id, LFItem.created_at >= since)
            .order_by(LFItem.created_at.desc())
        )
    ).all()

    lf_claims = (
        await db.scalars(
            select(LFClaim)
            .join(LFItem, LFClaim.item_id == LFItem.id)
            .where(LFItem.reported_by == user.id, LFClaim.created_at >= since)
            .order_by(LFClaim.created_at.desc())
        )
    ).all()

    return WeeklySummary(
        period_start=since, period_end=now,
        issues_reported=list(issues_reported), issues_resolved=list(issues_resolved),
        sla_breaches=list(sla_breaches), lf_reported=list(lf_reported), lf_claims=list(lf_claims),
    )


def render(summary: WeeklySummary) -> tuple[str, str]:
    """Plain-text and HTML bodies for the email — never an empty/meaningless
    report even in a quiet week: the counts are always real, including zero."""
    period = f"{summary.period_start:%d %b} – {summary.period_end:%d %b %Y}"

    lines = [f"Your CampusNetra weekly summary — {period}", ""]
    lines.append(f"Issues reported: {len(summary.issues_reported)}")
    for i in summary.issues_reported[:10]:
        lines.append(f"  - {i.reference}: {i.title} ({i.status.value})")
    lines.append(f"Issues resolved: {len(summary.issues_resolved)}")
    for i in summary.issues_resolved[:10]:
        lines.append(f"  - {i.reference}: {i.title}")
    lines.append(f"SLA breaches: {len(summary.sla_breaches)}")
    for i in summary.sla_breaches[:10]:
        lines.append(f"  - {i.reference}: {i.title} (due {i.sla_due_at})")
    lines.append(f"Lost & Found reports: {len(summary.lf_reported)}")
    for it in summary.lf_reported[:10]:
        lines.append(f"  - {it.reference}: {it.title} ({it.kind.value})")
    lines.append(f"Lost & Found claims on your items: {len(summary.lf_claims)}")
    text = "\n".join(lines)

    def _rows(items, fmt):
        return "".join(f"<tr><td>{fmt(x)}</td></tr>" for x in items[:10]) or "<tr><td><em>None this week</em></td></tr>"

    html = f"""
    <h2>Your CampusNetra weekly summary</h2>
    <p>{period}</p>
    <h3>Issues reported ({len(summary.issues_reported)})</h3>
    <table>{_rows(summary.issues_reported, lambda i: f"{i.reference}: {i.title} ({i.status.value})")}</table>
    <h3>Issues resolved ({len(summary.issues_resolved)})</h3>
    <table>{_rows(summary.issues_resolved, lambda i: f"{i.reference}: {i.title}")}</table>
    <h3>SLA breaches ({len(summary.sla_breaches)})</h3>
    <table>{_rows(summary.sla_breaches, lambda i: f"{i.reference}: {i.title}")}</table>
    <h3>Lost &amp; Found reports ({len(summary.lf_reported)})</h3>
    <table>{_rows(summary.lf_reported, lambda it: f"{it.reference}: {it.title} ({it.kind.value})")}</table>
    <h3>Claims on your Lost &amp; Found items ({len(summary.lf_claims)})</h3>
    <p>{len(summary.lf_claims)} this week.</p>
    """
    return text, html
