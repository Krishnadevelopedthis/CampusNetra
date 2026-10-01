"""Keeps asset categories in step with the issue categories admins manage.

Issue Configuration is the one place admins define categories. Assets still
need a row in `asset_categories` (Asset.category_id points there), so every
active issue category gets a matching asset category with the same code.
Codes are the link because Issue Configuration never lets a code change.
Asset categories that predate this (e.g. "Fan", "Light", which the IoT
auto-mapping looks up by code) are left untouched.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.issues import IssueCategory
from app.models.spatial import AssetCategory


async def sync_asset_categories(db: AsyncSession, organization_id: uuid.UUID) -> None:
    issue_categories = (await db.scalars(
        select(IssueCategory).where(
            IssueCategory.organization_id == organization_id,
            IssueCategory.is_active.is_(True),
        )
    )).all()
    if not issue_categories:
        return

    existing = {
        c.code: c for c in (await db.scalars(
            select(AssetCategory).where(AssetCategory.organization_id == organization_id)
        )).all()
    }

    for ic in issue_categories:
        match = existing.get(ic.code)
        if match is None:
            # ON CONFLICT: two requests syncing at once must not trip the
            # (organization_id, code) unique constraint.
            await db.execute(
                insert(AssetCategory)
                .values(
                    id=uuid.uuid4(), organization_id=organization_id,
                    name=ic.name, code=ic.code, icon=ic.icon,
                    default_department_id=ic.department_id,
                    default_priority=ic.default_priority,
                )
                .on_conflict_do_nothing(index_elements=["organization_id", "code"])
            )
        elif match.name != ic.name:
            match.name = ic.name
    await db.flush()
