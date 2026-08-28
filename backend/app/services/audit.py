"""Audit trail and login-activity helpers."""
from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import AuditLog, LoginActivity


async def record_audit(
    db: AsyncSession,
    *,
    action: str,
    actor_id: Optional[uuid.UUID] = None,
    organization_id: Optional[uuid.UUID] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    before: Optional[dict[str, Any]] = None,
    after: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    db.add(AuditLog(
        action=action, actor_id=actor_id, organization_id=organization_id,
        entity_type=entity_type, entity_id=entity_id, before=before, after=after,
        ip_address=ip_address, user_agent=user_agent,
    ))


async def record_login(
    db: AsyncSession,
    *,
    email: str,
    succeeded: bool,
    user_id: Optional[uuid.UUID] = None,
    failure_reason: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    db.add(LoginActivity(
        user_id=user_id, email=email, succeeded=succeeded,
        failure_reason=failure_reason, ip_address=ip_address, user_agent=user_agent,
    ))
