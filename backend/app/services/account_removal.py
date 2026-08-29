"""Approving an account deletion.

The row cannot go. Issues, work orders, inspections and lost-property reports
all reference their author by id, and a campus's maintenance history is not the
requester's to erase — the fault they reported still happened, and the
technician who fixed it still needs the record to make sense.

So the person is removed from the account instead. Everything that identifies
them is cleared, the login stops working, and what they authored stays where it
is with nobody's name on it.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select, update

from app.core.enums import UserStatus
from app.models.identity import RefreshToken, User, VerificationCode
from app.models.platform import Notification


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def anonymise(db, user: User) -> dict:
    """Strip the person from the account, keeping the account.

    The email is replaced rather than emptied because it is unique and NOT
    NULL, and because leaving the real address behind would defeat the point of
    the request. It is replaced with something obviously not a mailbox, so
    nobody later mistakes it for a contactable address.
    """
    handle = f"deleted-{uuid.uuid4().hex[:12]}"

    user.email = f"{handle}@deleted.invalid"
    user.full_name = "Deleted account"
    user.phone = None
    user.avatar_url = None
    user.designation = None
    user.enrollment_no = None
    user.employee_id = None
    user.specialization = None
    user.preferences = {}
    user.programme_id = None
    user.academic_year = None
    user.department_id = None
    user.status = UserStatus.DEACTIVATED
    # A password hash is still a secret about a person; there is nothing left
    # to sign in to, so it goes with the rest.
    user.password_hash = "!"

    # Sessions, pending codes and the notification history are all personal and
    # nothing references them.
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    await db.execute(delete(VerificationCode).where(VerificationCode.user_id == user.id))
    notifications = await db.execute(
        delete(Notification).where(Notification.user_id == user.id)
    )

    return {
        "handle": handle,
        "notifications_removed": notifications.rowcount or 0,
    }


async def retained_counts(db, user_id: uuid.UUID) -> dict:
    """What survives anonymisation, so the decision is made knowing it."""
    from app.models.issues import Issue
    from app.models.lostfound import LFItem
    from app.models.work import WorkOrder

    from sqlalchemy import func

    async def count(model, column):
        return await db.scalar(
            select(func.count()).select_from(model).where(column == user_id)
        ) or 0

    return {
        "issues_reported": await count(Issue, Issue.reported_by),
        "work_orders_assigned": await count(WorkOrder, WorkOrder.assigned_to),
        "lost_found_reports": await count(LFItem, LFItem.reported_by),
    }
