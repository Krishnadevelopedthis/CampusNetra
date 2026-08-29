"""Find work that has passed its SLA, flag it, and tell someone.

A breach is not something a person does, so nothing in the request path can
notice it. Until now `sla_breached` was only set if someone happened to open
the issue and move it along — which means the tickets nobody touched, the exact
ones worth chasing, were the ones that never got flagged.

This sweeps for them on a schedule. It is deliberately idempotent: only records
that are past due and not already flagged are picked up, so running it twice in
a minute costs one query and notifies nobody twice.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import IssueStatus, WorkOrderStatus
from app.models.identity import Department
from app.models.issues import Issue
from app.models.work import WorkOrder
from app.services import notifications as notify_svc

log = logging.getLogger(__name__)

# Interval between sweeps. Read from the environment rather than the settings
# object so a deployment can slow it down without a code change.
SWEEP_MINUTES = max(1, int(os.environ.get("SLA_SWEEP_MINUTES", "10")))

# A breach is only meaningful while the work is still outstanding.
OPEN_ISSUES = [
    IssueStatus.REPORTED, IssueStatus.TRIAGED, IssueStatus.ASSIGNED,
    IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD,
]
OPEN_WORK = [
    WorkOrderStatus.OPEN, WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.AWAITING_PARTS,
]

# Postgres advisory lock. Two web workers running the same sweep would each
# flag and notify; the lock means only one does, and the other moves on rather
# than waiting for it.
_LOCK_KEY = 0x5C1A_B12A


def _overdue_by(due: datetime, now: datetime) -> str:
    minutes = int((now - due).total_seconds() // 60)
    if minutes < 60:
        return f"{minutes} min"
    hours, minutes = divmod(minutes, 60)
    if hours < 24:
        return f"{hours}h {minutes:02d}m"
    days, hours = divmod(hours, 24)
    return f"{days}d {hours}h"


async def sweep(db: AsyncSession) -> dict:
    """Flag everything now past its SLA and notify who owns it."""
    now = datetime.now(timezone.utc)

    issues = (await db.scalars(
        select(Issue).where(
            Issue.sla_due_at.is_not(None),
            Issue.sla_due_at < now,
            Issue.sla_breached.is_(False),
            Issue.status.in_(OPEN_ISSUES),
        )
    )).all()

    orders = (await db.scalars(
        select(WorkOrder).where(
            WorkOrder.sla_due_at.is_not(None),
            WorkOrder.sla_due_at < now,
            WorkOrder.sla_breached.is_(False),
            WorkOrder.status.in_(OPEN_WORK),
        )
    )).all()

    if not issues and not orders:
        return {"issues": 0, "work_orders": 0, "notified": 0}

    # Department names are only needed for the message, and there are few of
    # them; one lookup beats one per record.
    dept_names = dict(
        (await db.execute(select(Department.id, Department.name))).all()
    )
    notified = 0

    for issue in issues:
        issue.sla_breached = True
        recipients = list(await notify_svc.department_members(db, issue.department_id))
        recipients += list(await notify_svc.managers_of(db, issue.organization_id))
        notified += await notify_svc.notify(
            db, recipients,
            title=f"SLA breached: {issue.reference}",
            body=f"'{issue.title}' is {_overdue_by(issue.sla_due_at, now)} past its deadline.",
            link=f"/issues/{issue.id}", kind="sla",
            entity_type="issue", entity_id=issue.id,
            code="sla.breached",
            context={
                "reference": issue.reference,
                "title": issue.title,
                "department": dept_names.get(issue.department_id, "Unassigned"),
                "overdue_by": _overdue_by(issue.sla_due_at, now),
            },
        )

    for wo in orders:
        wo.sla_breached = True
        # The technician holding it first, then the people who can reassign it.
        recipients = [wo.assigned_to] if wo.assigned_to else []
        recipients += list(await notify_svc.department_members(db, wo.department_id))
        recipients += list(await notify_svc.managers_of(db, wo.organization_id))
        notified += await notify_svc.notify(
            db, recipients,
            title=f"SLA breached: {wo.reference}",
            body=f"'{wo.title}' is {_overdue_by(wo.sla_due_at, now)} past its deadline.",
            link=f"/work-orders/{wo.id}", kind="sla",
            entity_type="work_order", entity_id=wo.id,
            code="sla.breached",
            context={
                "reference": wo.reference,
                "title": wo.title,
                "department": dept_names.get(wo.department_id, "Unassigned"),
                "overdue_by": _overdue_by(wo.sla_due_at, now),
            },
        )

    log.info("SLA sweep: %d issue(s), %d work order(s), %d notification(s)",
             len(issues), len(orders), notified)
    return {"issues": len(issues), "work_orders": len(orders), "notified": notified}


async def _run_once(session_factory) -> None:
    async with session_factory() as db:
        locked = await db.scalar(
            text("SELECT pg_try_advisory_lock(:k)").bindparams(k=_LOCK_KEY))
        if not locked:
            return
        try:
            await sweep(db)
            await db.commit()
        finally:
            await db.execute(
                text("SELECT pg_advisory_unlock(:k)").bindparams(k=_LOCK_KEY))
            await db.commit()


async def scheduler(session_factory) -> None:
    """Sweep forever, surviving its own failures.

    A sweep that raises must not end the loop: the next one is the retry, and a
    database that was briefly unreachable should not leave breaches unnoticed
    until someone restarts the service.
    """
    log.info("SLA sweep scheduled every %d minute(s)", SWEEP_MINUTES)
    while True:
        try:
            await _run_once(session_factory)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("SLA sweep failed; retrying at the next interval")
        await asyncio.sleep(SWEEP_MINUTES * 60)
