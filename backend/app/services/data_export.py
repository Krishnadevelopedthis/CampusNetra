"""Assemble everything held about one person, for them to keep.

Deliberately scoped to what the requester owns or authored. It is not an
administrative dump of the estate: an asset a technician happened to service is
the campus's record, whereas the work order assigned to them is theirs.

The result is only ever sent to the address on the account. A self-service
export that accepts a destination is a way to read somebody else's data by
asking nicely.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import AcademicProgramme, Department, User
from app.models.issues import Issue
from app.models.lostfound import LFClaim, LFItem
from app.models.platform import LoginActivity, Notification
from app.models.work import Inspection, WorkOrder


def _when(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


async def collect(db: AsyncSession, user: User) -> dict:
    """Everything stored against this account."""
    department = await db.scalar(
        select(Department.name).where(Department.id == user.department_id)
    ) if user.department_id else None
    programme = await db.scalar(
        select(AcademicProgramme.name).where(AcademicProgramme.id == user.programme_id)
    ) if user.programme_id else None

    issues = (await db.scalars(
        select(Issue).where(Issue.reported_by == user.id).order_by(Issue.created_at)
    )).all()
    work = (await db.scalars(
        select(WorkOrder).where(WorkOrder.assigned_to == user.id).order_by(WorkOrder.created_at)
    )).all()
    lf_items = (await db.scalars(
        select(LFItem).where(LFItem.reported_by == user.id).order_by(LFItem.created_at)
    )).all()
    claims = (await db.scalars(
        select(LFClaim).where(LFClaim.claimant_id == user.id).order_by(LFClaim.created_at)
    )).all()
    inspections = (await db.scalars(
        select(Inspection).where(Inspection.assigned_to == user.id).order_by(Inspection.created_at)
    )).all()
    notes = (await db.scalars(
        select(Notification).where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc()).limit(200)
    )).all()
    # Sign-ins are the record most worth having: it is how somebody notices an
    # account being used from somewhere they do not recognise.
    logins = (await db.scalars(
        select(LoginActivity).where(LoginActivity.user_id == user.id)
        .order_by(LoginActivity.created_at.desc()).limit(100)
    )).all()

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "account": {
            "name": user.full_name,
            "email": user.email,
            "role": user.role.value,
            "status": user.status.value if hasattr(user.status, "value") else str(user.status),
            "phone": user.phone,
            "designation": user.designation,
            "employee_id": user.employee_id,
            "enrollment_no": user.enrollment_no,
            "department": department,
            "programme": programme,
            "academic_year": user.academic_year,
            "email_verified_at": _when(user.email_verified_at),
            "created_at": _when(user.created_at),
            "last_login_at": _when(user.last_login_at),
            "preferences": user.preferences or {},
        },
        "issues_reported": [
            {"reference": i.reference, "title": i.title, "description": i.description,
             "status": i.status.value, "priority": i.priority.value,
             "location": i.location_note, "created_at": _when(i.created_at)}
            for i in issues
        ],
        "work_orders_assigned": [
            {"reference": w.reference, "title": w.title, "status": w.status.value,
             "priority": w.priority.value, "created_at": _when(w.created_at),
             "completed_at": _when(w.completed_at)}
            for w in work
        ],
        "lost_found_reports": [
            {"reference": x.reference, "title": x.title, "kind": x.kind.value,
             "status": x.status.value, "created_at": _when(x.created_at)}
            for x in lf_items
        ],
        "ownership_claims": [
            {"status": c.status.value if hasattr(c.status, "value") else str(c.status),
             "created_at": _when(c.created_at)}
            for c in claims
        ],
        "inspections_assigned": [
            {"reference": i.reference, "status": i.status.value,
             "scheduled_for": _when(i.scheduled_for)}
            for i in inspections
        ],
        "notifications": [
            {"title": n.title, "body": n.body, "created_at": _when(n.created_at),
             "read": n.read_at is not None}
            for n in notes
        ],
        "sign_ins": [
            {"at": _when(l.created_at), "ip": str(l.ip_address) if l.ip_address else None,
             "user_agent": l.user_agent, "succeeded": l.succeeded,
             "failure_reason": l.failure_reason}
            for l in logins
        ],
    }


def summarise(data: dict) -> list[tuple[str, int]]:
    """Section names and counts, for the covering note."""
    return [
        (key.replace("_", " ").title(), len(value))
        for key, value in data.items()
        if isinstance(value, list)
    ]


def render(data: dict) -> tuple[str, str]:
    """The covering note as plain text and HTML.

    The records travel as JSON in the body rather than as an attachment: the
    HTTP mail APIs this runs on take base64 attachments, and an export nobody
    can read without decoding it is not much of an export.
    """
    counts = summarise(data)
    name = data["account"]["name"]
    lines = [f"  {label}: {n}" for label, n in counts]
    blob = json.dumps(data, indent=2, ensure_ascii=False)

    text = (
        f"Hello {name},\n\n"
        "Here is a copy of everything Campus Netra holds against your account, "
        f"generated on {data['generated_at'][:10]}.\n\n"
        "Summary\n" + "\n".join(lines) + "\n\n"
        "The full record follows as JSON.\n\n"
        f"{blob}\n"
    )

    rows = "".join(
        f"<tr><td style='padding:4px 12px 4px 0'>{label}</td>"
        f"<td style='padding:4px 0;text-align:right'><b>{n}</b></td></tr>"
        for label, n in counts
    )
    html = (
        f"<p>Hello {name},</p>"
        "<p>Here is a copy of everything Campus Netra holds against your "
        f"account, generated on {data['generated_at'][:10]}.</p>"
        f"<table style='border-collapse:collapse'>{rows}</table>"
        "<p>The full record follows as JSON.</p>"
        f"<pre style='background:#f6f8fa;padding:12px;overflow:auto;"
        f"font-size:12px'>{blob}</pre>"
    )
    return text, html
