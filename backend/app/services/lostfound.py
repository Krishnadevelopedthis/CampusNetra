"""Lost & Found intake, matching and claim verification."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import matching
from app.core.enums import ClaimStatus, LFKind, LFStatus, MatchStatus
from app.models.identity import User
from app.models.lostfound import LFAttachment, LFCategory, LFClaim, LFItem, LFMatch
from app.models.platform import AIInvocation
from app.services import notifications as notify_svc
from app.services.references import next_year_reference

# A found report is only compared against lost reports inside this window.
MATCH_WINDOW_DAYS = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _item_dict(item: LFItem, category_name: Optional[str] = None) -> dict:
    return {
        "id": item.id, "kind": item.kind.value, "title": item.title,
        "description": item.description, "category_id": item.category_id,
        "category_name": category_name, "colour": item.colour, "brand": item.brand,
        "distinguishing_marks": item.distinguishing_marks,
        "building_id": item.building_id, "room_id": item.room_id,
        "location_note": item.location_note, "zone_code": item.zone_code,
        "latitude": item.latitude, "longitude": item.longitude,
        "occurred_at": item.occurred_at, "image_phash": item.image_phash,
        "ai_tags": item.ai_tags or [],
    }


async def find_matches(db: AsyncSession, item: LFItem) -> list[matching.MatchResult]:
    """Score `item` against every open report of the opposite kind."""
    opposite = LFKind.FOUND if item.kind == LFKind.LOST else LFKind.LOST
    window_start = item.occurred_at - timedelta(days=MATCH_WINDOW_DAYS)
    window_end = item.occurred_at + timedelta(days=MATCH_WINDOW_DAYS)

    candidates = (await db.scalars(
        select(LFItem).where(
            LFItem.organization_id == item.organization_id,
            LFItem.kind == opposite,
            LFItem.status.in_([LFStatus.OPEN, LFStatus.MATCHED]),
            LFItem.occurred_at.between(window_start, window_end),
        ).limit(300)
    )).all()

    if not candidates:
        return []

    return matching.rank_matches(_item_dict(item), [_item_dict(c) for c in candidates])


async def persist_matches(
    db: AsyncSession, item: LFItem, results: Sequence[matching.MatchResult]
) -> list[LFMatch]:
    """Store scored pairs, notify on strong ones, and flag both sides as matched."""
    stored: list[LFMatch] = []
    for r in results:
        lost_id = uuid.UUID(r.lost_id) if isinstance(r.lost_id, str) else r.lost_id
        found_id = uuid.UUID(r.found_id) if isinstance(r.found_id, str) else r.found_id

        existing = await db.scalar(
            select(LFMatch).where(
                LFMatch.lost_item_id == lost_id, LFMatch.found_item_id == found_id)
        )
        if existing is not None:
            stored.append(existing)
            continue

        match = LFMatch(
            lost_item_id=lost_id, found_item_id=found_id, score=r.score,
            image_score=r.factors.image, description_score=r.factors.description,
            location_score=r.factors.location, category_score=r.factors.category,
            time_score=r.factors.time, reasoning=r.reasoning, ai_model=r.model,
            status=MatchStatus.SUGGESTED,
        )
        db.add(match)
        await db.flush()
        stored.append(match)

        db.add(AIInvocation(
            organization_id=item.organization_id, task="match_lost_found",
            model=r.model, entity_type="lf_match", entity_id=match.id,
            confidence=r.score, used_fallback=r.used_fallback,
        ))

        # Only high-confidence matches interrupt people.
        if r.score >= matching.NOTIFY_THRESHOLD:
            match.status = MatchStatus.NOTIFIED
            match.notified_at = _now()

            other_id = found_id if item.id == lost_id else lost_id
            other = await db.scalar(select(LFItem).where(LFItem.id == other_id))
            recipients = [item.reported_by] + ([other.reported_by] if other else [])
            await notify_svc.notify(
                db, recipients,
                title=f"Possible match found ({round(r.score * 100)}%)",
                body=f"'{item.title}' may match a report on the other side of the ledger.",
                link=f"/lost-found/matches/{match.id}", kind="lf_match",
                entity_type="lf_match", entity_id=match.id,
            )

    if stored:
        item.status = LFStatus.MATCHED
        for m in stored:
            other_id = m.found_item_id if item.id == m.lost_item_id else m.lost_item_id
            other = await db.scalar(select(LFItem).where(LFItem.id == other_id))
            if other and other.status == LFStatus.OPEN:
                other.status = LFStatus.MATCHED

    return stored


async def create_item(
    db: AsyncSession, reporter: User, payload: dict, attachments: Sequence[dict],
) -> tuple[LFItem, list[LFMatch]]:
    org_id = reporter.organization_id
    if org_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Your account is not linked to an organization")

    kind = LFKind(payload["kind"])
    prefix = "LR" if kind == LFKind.LOST else "LF"
    reference = await next_year_reference(db, org_id, prefix)

    category = None
    if payload.get("category_id"):
        category = await db.scalar(
            select(LFCategory).where(LFCategory.id == payload["category_id"]))

    item = LFItem(
        reference=reference, organization_id=org_id,
        campus_id=payload.get("campus_id"), kind=kind, status=LFStatus.OPEN,
        title=payload["title"], description=payload.get("description"),
        category_id=payload.get("category_id"), colour=payload.get("colour"),
        brand=payload.get("brand"),
        distinguishing_marks=payload.get("distinguishing_marks"),
        building_id=payload.get("building_id"), room_id=payload.get("room_id"),
        location_note=payload.get("location_note"), zone_code=payload.get("zone_code"),
        occurred_at=payload["occurred_at"], reported_by=reporter.id,
        contact_pref=payload.get("contact_pref", "in_app"),
        holding_location=payload.get("holding_location"),
        expires_at=_now() + timedelta(days=category.retention_days if category else 90),
        ai_tags=_derive_tags(payload),
    )

    primary = next((a for a in attachments if a.get("is_primary")), None) or (
        attachments[0] if attachments else None)
    if primary and primary.get("phash"):
        item.image_phash = primary["phash"]

    db.add(item)
    await db.flush()

    for att in attachments:
        db.add(LFAttachment(item_id=item.id, **att))

    results = await find_matches(db, item)
    matches = await persist_matches(db, item, results)
    return item, matches


def _derive_tags(payload: dict) -> list[str]:
    """Lightweight tag extraction so search and matching have something to work
    with even when no vision model has run."""
    import re
    text = " ".join(str(payload.get(k) or "") for k in
                    ("title", "description", "colour", "brand", "distinguishing_marks"))
    words = {w for w in re.findall(r"[a-z]{3,}", text.lower())}
    stop = {"the", "and", "was", "near", "with", "left", "lost", "found", "from", "that", "this"}
    return sorted(words - stop)[:12]


async def submit_claim(
    db: AsyncSession, claimant: User, item: LFItem,
    proof_note: str, proof_urls: list[str], match_id: Optional[uuid.UUID] = None,
) -> LFClaim:
    if item.kind != LFKind.FOUND:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Only found items can be claimed")
    if item.status in (LFStatus.CLAIMED, LFStatus.RETURNED):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This item has already been returned to its owner")

    existing = await db.scalar(
        select(LFClaim).where(
            LFClaim.item_id == item.id, LFClaim.claimant_id == claimant.id,
            LFClaim.status.in_([ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW]),
        )
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"You already have an open claim ({existing.reference})")

    reference = await next_year_reference(db, claimant.organization_id, "CLM")
    claim = LFClaim(
        reference=reference, item_id=item.id, match_id=match_id,
        claimant_id=claimant.id, status=ClaimStatus.SUBMITTED,
        proof_note=proof_note, proof_urls=proof_urls,
    )
    db.add(claim)
    item.status = LFStatus.CLAIM_PENDING
    await db.flush()

    await notify_svc.notify(
        db, [item.reported_by] + list(await notify_svc.managers_of(db, claimant.organization_id)),
        title=f"Ownership claim on {item.reference}",
        body=f"{claimant.full_name} has claimed '{item.title}'. Verification required.",
        link=f"/lost-found/claims/{claim.id}", kind="lf_claim",
        entity_type="lf_claim", entity_id=claim.id,
    )
    return claim


async def decide_claim(
    db: AsyncSession, claim: LFClaim, verifier: User, approve: bool,
    reason: Optional[str] = None,
) -> LFClaim:
    if claim.status not in (ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"This claim is already {claim.status.value}")

    item = await db.scalar(select(LFItem).where(LFItem.id == claim.item_id))
    claim.verified_by = verifier.id
    claim.verified_at = _now()

    if approve:
        claim.status = ClaimStatus.APPROVED
        if item:
            item.status = LFStatus.CLAIMED
        title = "Your claim was approved"
        body = f"Collect '{item.title if item else 'the item'}' from {item.holding_location or 'the security desk'}."
    else:
        claim.status = ClaimStatus.REJECTED
        claim.rejection_reason = reason
        if item:
            # Return the item to the pool so others can claim it.
            other_open = await db.scalar(
                select(LFClaim.id).where(
                    LFClaim.item_id == item.id, LFClaim.id != claim.id,
                    LFClaim.status.in_([ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW]),
                ).limit(1)
            )
            item.status = LFStatus.CLAIM_PENDING if other_open else LFStatus.OPEN
        title = "Your claim was not approved"
        body = reason or "The ownership evidence provided was not sufficient."

    await notify_svc.notify(
        db, [claim.claimant_id], title=title, body=body,
        link=f"/lost-found/claims/{claim.id}", kind="lf_claim",
        entity_type="lf_claim", entity_id=claim.id,
    )
    return claim
