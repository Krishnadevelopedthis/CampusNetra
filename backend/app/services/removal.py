"""Deleting operational records without leaving anything dangling.

What goes with what, in one place:

  Issue        -> its work orders (and, through the database, their comments,
                  attachments, parts and event timelines), its attachments,
                  timeline, upvotes and duplicate-detection rows, and every
                  notification pointing at any of them.
  Work order   -> its comments, attachments, parts and timeline.
  Inspection   -> its checklist results; an IoT alert that was waiting on it
                  is dismissed rather than left "inspecting" forever.
  Lost & Found -> its photos, claims and AI matches.

The database does the cascading (ON DELETE CASCADE / SET NULL — see migration
019 for the notification triggers); this module adds what a foreign key cannot
express: settling the affected asset's condition, dismissing orphaned IoT
alerts, and writing the audit entry. Condition history and the twin event log
are deliberately kept: they record that something happened, not the thing.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    AssetState, HealthEventStatus, InspectionStatus, IssueStatus, WorkOrderStatus,
)
from app.models.identity import User
from app.models.iot import HealthEvent
from app.models.issues import Issue, IssueAttachment, IssueDuplicateCandidate, IssueEvent, IssueUpvote
from app.models.lostfound import LFAttachment, LFClaim, LFItem, LFMatch
from app.models.spatial import Asset
from app.models.work import (
    Inspection, InspectionResult, PartRequest, WorkOrder, WorkOrderAttachment,
    WorkOrderComment, WorkOrderEvent,
)
from app.services.audit import record_audit
from app.services.twin import set_asset_state

_OPEN_ISSUES = [IssueStatus.REPORTED, IssueStatus.TRIAGED, IssueStatus.ASSIGNED,
                IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD]
_OPEN_WOS = [s for s in WorkOrderStatus
             if s not in (WorkOrderStatus.COMPLETED, WorkOrderStatus.VERIFIED,
                          WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELLED)]
_OPEN_INSPECTIONS = [InspectionStatus.SCHEDULED, InspectionStatus.IN_PROGRESS, InspectionStatus.OVERDUE]
_ACTIVE_EVENTS = [HealthEventStatus.OPEN, HealthEventStatus.INSPECTING, HealthEventStatus.CONFIRMED]
_SETTLEABLE = (AssetState.FAULT, AssetState.WARNING, AssetState.UNDER_MAINTENANCE,
               AssetState.INSPECTION_REQUIRED)


async def _count(db: AsyncSession, model, *conditions) -> int:
    return await db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0


async def settle_asset_state(
    db: AsyncSession, asset_id: Optional[uuid.UUID], actor: User, reason: str,
) -> None:
    """After a record that was holding an asset in Fault/Warning/Maintenance/
    Inspection-required is removed, return the asset to Healthy — but only if
    nothing else still justifies that state."""
    if asset_id is None:
        return
    asset = await db.get(Asset, asset_id)
    if asset is None or asset.state not in _SETTLEABLE:
        return
    still_open = (
        await _count(db, Issue, Issue.asset_id == asset_id, Issue.status.in_(_OPEN_ISSUES))
        or await _count(db, WorkOrder, WorkOrder.asset_id == asset_id, WorkOrder.status.in_(_OPEN_WOS))
        or await _count(db, Inspection, Inspection.asset_id == asset_id, Inspection.status.in_(_OPEN_INSPECTIONS))
        or await _count(db, HealthEvent, HealthEvent.asset_id == asset_id, HealthEvent.status.in_(_ACTIVE_EVENTS))
    )
    if not still_open:
        await set_asset_state(db, asset, AssetState.HEALTHY, reason=reason, actor_id=actor.id)


async def delete_issue(db: AsyncSession, issue: Issue, actor: User) -> dict:
    asset_id = issue.asset_id
    counts = {
        "work_orders": await _count(db, WorkOrder, WorkOrder.issue_id == issue.id),
        "attachments": await _count(db, IssueAttachment, IssueAttachment.issue_id == issue.id),
        "timeline_entries": await _count(db, IssueEvent, IssueEvent.issue_id == issue.id),
        "upvotes": await _count(db, IssueUpvote, IssueUpvote.issue_id == issue.id),
        "duplicate_links": await _count(
            db, IssueDuplicateCandidate,
            (IssueDuplicateCandidate.issue_id == issue.id) | (IssueDuplicateCandidate.candidate_id == issue.id)),
        "marked_duplicates": await _count(db, Issue, Issue.duplicate_of == issue.id),
    }
    before = {"reference": issue.reference, "title": issue.title, "status": issue.status.value, **counts}

    # An issue's work orders exist only to resolve it; they go with it.
    await db.execute(delete(WorkOrder).where(WorkOrder.issue_id == issue.id))
    await db.execute(delete(Issue).where(Issue.id == issue.id))
    db.expunge_all()

    await record_audit(
        db, action="issue.delete", actor_id=actor.id, organization_id=actor.organization_id,
        entity_type="issue", entity_id=issue.id, before=before,
    )
    await settle_asset_state(db, asset_id, actor, f"issue {before['reference']} deleted")
    return counts


async def delete_work_order(db: AsyncSession, wo: WorkOrder, actor: User) -> dict:
    asset_id = wo.asset_id
    counts = {
        "comments": await _count(db, WorkOrderComment, WorkOrderComment.work_order_id == wo.id),
        "attachments": await _count(db, WorkOrderAttachment, WorkOrderAttachment.work_order_id == wo.id),
        "part_requests": await _count(db, PartRequest, PartRequest.work_order_id == wo.id),
        "timeline_entries": await _count(db, WorkOrderEvent, WorkOrderEvent.work_order_id == wo.id),
    }
    before = {"reference": wo.reference, "title": wo.title, "status": wo.status.value, **counts}

    await db.execute(delete(WorkOrder).where(WorkOrder.id == wo.id))
    db.expunge_all()

    await record_audit(
        db, action="work_order.delete", actor_id=actor.id, organization_id=actor.organization_id,
        entity_type="work_order", entity_id=wo.id, before=before,
    )
    await settle_asset_state(db, asset_id, actor, f"work order {before['reference']} deleted")
    return counts


async def delete_inspection(db: AsyncSession, inspection: Inspection, actor: User) -> dict:
    asset_id = inspection.asset_id
    # Assets named on its answers (e.g. one marked Warning by an "Attention").
    named = set((await db.scalars(select(InspectionResult.asset_id).where(
        InspectionResult.inspection_id == inspection.id, InspectionResult.asset_id.is_not(None)))).all())
    counts = {"checklist_results": await _count(db, InspectionResult, InspectionResult.inspection_id == inspection.id)}
    before = {"reference": inspection.reference, "status": inspection.status.value, **counts}

    # An IoT alert waiting on this inspection would otherwise sit "inspecting"
    # for ever once the foreign key is nulled; deleting the inspection
    # dismisses it.
    dismissed = (await db.execute(
        update(HealthEvent)
        .where(HealthEvent.inspection_id == inspection.id,
               HealthEvent.status.in_([HealthEventStatus.OPEN, HealthEventStatus.INSPECTING]))
        .values(status=HealthEventStatus.NO_ISSUE_FOUND, resolved_at=datetime.now(timezone.utc))
    )).rowcount
    counts["iot_alerts_dismissed"] = dismissed or 0

    await db.execute(delete(Inspection).where(Inspection.id == inspection.id))
    db.expunge_all()

    await record_audit(
        db, action="inspection.delete", actor_id=actor.id, organization_id=actor.organization_id,
        entity_type="inspection", entity_id=inspection.id, before=before,
    )
    for a in {asset_id, *named} - {None}:
        await settle_asset_state(db, a, actor, f"inspection {before['reference']} deleted")
    return counts


async def delete_lf_item(db: AsyncSession, item: LFItem, actor: User) -> dict:
    counts = {
        "photos": await _count(db, LFAttachment, LFAttachment.item_id == item.id),
        "claims": await _count(db, LFClaim, LFClaim.item_id == item.id),
        "matches": await _count(
            db, LFMatch, (LFMatch.lost_item_id == item.id) | (LFMatch.found_item_id == item.id)),
    }
    before = {"title": item.title, "kind": item.kind.value, "status": item.status.value, **counts}

    await db.execute(delete(LFItem).where(LFItem.id == item.id))
    db.expunge_all()

    await record_audit(
        db, action="lost_found.delete", actor_id=actor.id, organization_id=actor.organization_id,
        entity_type="lostfound_item", entity_id=item.id, before=before,
    )
    return counts


def _noun(name: str, n: int) -> str:
    words = name.replace("_", " ")
    if n == 1:
        words = words[:-3] + "y" if words.endswith("ies") else words.rstrip("s") if words.endswith("s") else words
    return words


def describe(counts: dict) -> str:
    """'2 work orders, 1 attachment' — only the non-zero parts."""
    return ", ".join(f"{n} {_noun(k, n)}" for k, n in counts.items() if n)
