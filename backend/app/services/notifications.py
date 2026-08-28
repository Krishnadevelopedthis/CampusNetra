"""In-app notification fan-out."""
from __future__ import annotations

import uuid
from typing import Iterable, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.models.identity import User
from app.models.platform import Notification


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
