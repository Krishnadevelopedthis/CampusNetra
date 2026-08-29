"""Lost & Found endpoints, including AI match review and claim verification."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, CurrentUser, Paging, RequireManager, RequireStaff
from app.core.routing import CommitRoute
from app.core.enums import ClaimStatus, LFKind, LFStatus, MatchStatus, UserRole
from app.models.identity import User
from app.models.lostfound import LFAttachment, LFCategory, LFClaim, LFItem, LFMatch
from app.models.spatial import Building, Room
from app.schemas.common import Message, Page, UserBrief
from app.schemas.lostfound import (
    ClaimCreate, ClaimDecision, ClaimOut, LFAttachmentOut, LFCategoryOut, LFDashboard,
    LFItemCreate, LFItemCreateResponse, LFItemDetail, LFItemListItem, LFMatchOut,
    MatchDecision, MatchFactorsOut,
)
from app.services import lostfound as lf_service

router = APIRouter(route_class=CommitRoute, prefix="/lost-found", tags=["Lost & Found"])

OPEN_STATES = [LFStatus.OPEN, LFStatus.MATCHED, LFStatus.CLAIM_PENDING]


def _band(score: float) -> str:
    return "high" if score >= 0.85 else "medium" if score >= 0.65 else "low"


def _match_out(m: LFMatch, previews: Optional[dict] = None) -> LFMatchOut:
    def pct(v) -> int:
        return round(float(v) * 100) if v is not None else 0

    return LFMatchOut(
        id=m.id, lost_item_id=m.lost_item_id, found_item_id=m.found_item_id,
        score=float(m.score), score_pct=round(float(m.score) * 100),
        band=_band(float(m.score)),
        factors=MatchFactorsOut(
            image=pct(m.image_score), description=pct(m.description_score),
            location=pct(m.location_score), category=pct(m.category_score),
            time=pct(m.time_score),
        ),
        reasoning=m.reasoning, status=m.status,
        lost_preview=(previews or {}).get(m.lost_item_id),
        found_preview=(previews or {}).get(m.found_item_id),
        created_at=m.created_at,
    )


async def _previews(db, item_ids: set[uuid.UUID]) -> dict:
    """Compact card data for the side-by-side match comparison."""
    if not item_ids:
        return {}
    items = (await db.scalars(
        select(LFItem).options(selectinload(LFItem.attachments))
        .where(LFItem.id.in_(item_ids)))).all()
    out = {}
    for i in items:
        primary = next((a for a in i.attachments if a.is_primary), None) or (
            i.attachments[0] if i.attachments else None)
        out[i.id] = {
            "id": str(i.id), "reference": i.reference, "kind": i.kind.value,
            "title": i.title, "colour": i.colour, "brand": i.brand,
            "location_note": i.location_note,
            "occurred_at": i.occurred_at.isoformat(),
            "image": primary.thumb_url or primary.url if primary else None,
        }
    return out


async def _lookups(db, items: list[LFItem]) -> dict:
    if not items:
        return {"categories": {}, "rooms": {}, "buildings": {}, "users": {},
                "matches": {}, "images": {}}

    cat_ids = {i.category_id for i in items if i.category_id}
    room_ids = {i.room_id for i in items if i.room_id}
    bldg_ids = {i.building_id for i in items if i.building_id}
    user_ids = {i.reported_by for i in items}
    item_ids = [i.id for i in items]

    categories = {c.id: c for c in (await db.scalars(
        select(LFCategory).where(LFCategory.id.in_(cat_ids)))).all()} if cat_ids else {}
    rooms = {r.id: r for r in (await db.scalars(
        select(Room).where(Room.id.in_(room_ids)))).all()} if room_ids else {}
    buildings = {b.id: b for b in (await db.scalars(
        select(Building).where(Building.id.in_(bldg_ids)))).all()} if bldg_ids else {}
    users = {u.id: u for u in (await db.scalars(
        select(User).where(User.id.in_(user_ids)))).all()}

    # Match count + best score per item, from either side of the pair.
    match_rows = (await db.execute(
        select(LFMatch.lost_item_id, LFMatch.found_item_id, LFMatch.score)
        .where(or_(LFMatch.lost_item_id.in_(item_ids), LFMatch.found_item_id.in_(item_ids)),
               LFMatch.status != MatchStatus.REJECTED)
    )).all()
    matches: dict[uuid.UUID, list[float]] = {}
    for lost_id, found_id, score in match_rows:
        for iid in (lost_id, found_id):
            matches.setdefault(iid, []).append(float(score))

    img_rows = (await db.scalars(
        select(LFAttachment).where(LFAttachment.item_id.in_(item_ids)))).all()
    images: dict[uuid.UUID, str] = {}
    for a in img_rows:
        if a.item_id not in images or a.is_primary:
            images[a.item_id] = a.thumb_url or a.url

    return {"categories": categories, "rooms": rooms, "buildings": buildings,
            "users": users, "matches": matches, "images": images}


def _to_item(i: LFItem, m: dict) -> LFItemListItem:
    cat = m["categories"].get(i.category_id)
    room = m["rooms"].get(i.room_id)
    bldg = m["buildings"].get(i.building_id)
    reporter = m["users"].get(i.reported_by)
    scores = m["matches"].get(i.id, [])

    loc = " · ".join(p for p in [
        bldg.name if bldg else None, room.name if room else None, i.location_note] if p)

    return LFItemListItem(
        id=i.id, reference=i.reference, kind=i.kind, status=i.status, title=i.title,
        category_name=cat.name if cat else None, category_icon=cat.icon if cat else None,
        colour=i.colour, brand=i.brand, location_summary=loc or None,
        occurred_at=i.occurred_at, primary_image=m["images"].get(i.id),
        reporter=UserBrief.model_validate(reporter) if reporter else None,
        match_count=len(scores),
        best_match_score=round(max(scores) * 100) if scores else None,
        created_at=i.created_at,
    )


async def _to_detail(db, item: LFItem, viewer: User) -> LFItemDetail:
    m = await _lookups(db, [item])
    base = _to_item(item, m)

    match_rows = (await db.scalars(
        select(LFMatch).where(
            or_(LFMatch.lost_item_id == item.id, LFMatch.found_item_id == item.id))
        .order_by(LFMatch.score.desc()))).all()
    ids = {x for m_ in match_rows for x in (m_.lost_item_id, m_.found_item_id)}
    previews = await _previews(db, ids)

    return LFItemDetail(
        **base.model_dump(),
        description=item.description, distinguishing_marks=item.distinguishing_marks,
        zone_code=item.zone_code, holding_location=item.holding_location,
        contact_pref=item.contact_pref,
        attachments=[LFAttachmentOut.model_validate(a) for a in item.attachments],
        matches=[_match_out(x, previews) for x in match_rows],
        ai_tags=item.ai_tags or [],
        # You cannot claim an item you yourself handed in.
        can_claim=(item.kind == LFKind.FOUND
                   and item.status in (LFStatus.OPEN, LFStatus.MATCHED)
                   and item.reported_by != viewer.id),
    )


@router.get("/categories", response_model=list[LFCategoryOut])
async def categories(user: CurrentUser, db: DB):
    rows = (await db.scalars(
        select(LFCategory).where(LFCategory.organization_id == user.organization_id)
        .order_by(LFCategory.name))).all()
    return [LFCategoryOut.model_validate(c) for c in rows]


@router.post("/items", response_model=LFItemCreateResponse, status_code=201)
async def report_item(payload: LFItemCreate, user: CurrentUser, db: DB):
    """Report a lost or found item. Matching runs immediately against the
    opposite side of the ledger."""
    item, matches = await lf_service.create_item(
        db, user,
        payload.model_dump(exclude={"attachments"}),
        [a.model_dump() for a in payload.attachments],
    )
    await db.flush()
    item = await db.scalar(
        select(LFItem).options(selectinload(LFItem.attachments)).where(LFItem.id == item.id))

    detail = await _to_detail(db, item, user)
    ids = {x for m in matches for x in (m.lost_item_id, m.found_item_id)}
    previews = await _previews(db, ids)

    strong = [m for m in matches if float(m.score) >= 0.8]
    message = None
    if strong:
        message = (f"{len(strong)} strong match" + ("es" if len(strong) > 1 else "")
                   + f" found — best {round(float(strong[0].score) * 100)}%.")
    elif matches:
        message = f"{len(matches)} possible match(es) found for review."

    return LFItemCreateResponse(
        item=detail, matches=[_match_out(m, previews) for m in matches], message=message,
    )


@router.get("/items", response_model=Page[LFItemListItem])
async def list_items(
    user: CurrentUser, db: DB, paging: Paging,
    kind: Optional[LFKind] = None,
    status_in: Optional[list[LFStatus]] = Query(None, alias="status"),
    category_id: Optional[uuid.UUID] = None,
    mine: bool = Query(False),
    q: Optional[str] = None,
    open_only: bool = Query(True),
):
    query = select(LFItem).where(LFItem.organization_id == user.organization_id)
    if kind:
        query = query.where(LFItem.kind == kind)
    if mine:
        query = query.where(LFItem.reported_by == user.id)
    if status_in:
        query = query.where(LFItem.status.in_(status_in))
    elif open_only:
        query = query.where(LFItem.status.in_(OPEN_STATES))
    if category_id:
        query = query.where(LFItem.category_id == category_id)
    if q:
        like = f"%{q}%"
        query = query.where(or_(
            LFItem.title.ilike(like), LFItem.description.ilike(like),
            LFItem.brand.ilike(like), LFItem.reference.ilike(like)))

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = list((await db.scalars(
        query.order_by(LFItem.occurred_at.desc()).offset(paging.offset).limit(paging.limit))).all())
    m = await _lookups(db, rows)
    return Page[LFItemListItem](
        items=[_to_item(i, m) for i in rows], total=total,
        page=paging.page, page_size=paging.page_size)


@router.get("/items/{item_id}", response_model=LFItemDetail)
async def get_item(item_id: uuid.UUID, user: CurrentUser, db: DB):
    item = await db.scalar(
        select(LFItem).options(selectinload(LFItem.attachments)).where(LFItem.id == item_id))
    if item is None or item.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return await _to_detail(db, item, user)


@router.get("/matches", response_model=list[LFMatchOut])
async def list_matches(
    user: RequireStaff, db: DB,
    min_score: float = Query(0.6, ge=0, le=1),
    status_filter: Optional[MatchStatus] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
):
    """AI Match Review queue for the Lost & Found desk."""
    query = (
        select(LFMatch)
        .join(LFItem, LFItem.id == LFMatch.found_item_id)
        .where(LFItem.organization_id == user.organization_id, LFMatch.score >= min_score)
    )
    if status_filter:
        query = query.where(LFMatch.status == status_filter)

    rows = list((await db.scalars(query.order_by(LFMatch.score.desc()).limit(limit))).all())
    ids = {x for m in rows for x in (m.lost_item_id, m.found_item_id)}
    previews = await _previews(db, ids)
    return [_match_out(m, previews) for m in rows]


@router.get("/matches/{match_id}", response_model=LFMatchOut)
async def get_match(match_id: uuid.UUID, user: CurrentUser, db: DB):
    m = await db.scalar(select(LFMatch).where(LFMatch.id == match_id))
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match not found")
    previews = await _previews(db, {m.lost_item_id, m.found_item_id})
    return _match_out(m, previews)


@router.post("/matches/{match_id}/decide", response_model=Message)
async def decide_match(
    match_id: uuid.UUID, payload: MatchDecision, user: RequireStaff, db: DB
):
    m = await db.scalar(select(LFMatch).where(LFMatch.id == match_id))
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match not found")
    if m.status in (MatchStatus.ACCEPTED, MatchStatus.REJECTED):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {m.status.value}")

    m.status = MatchStatus.ACCEPTED if payload.accept else MatchStatus.REJECTED
    m.reviewed_by = user.id
    m.reviewed_at = datetime.now(timezone.utc)

    # Record the human verdict as ground truth for the AI accuracy dashboard.
    from app.models.platform import AIFeedback
    db.add(AIFeedback(
        task="match_lost_found", entity_type="lf_match", entity_id=m.id,
        was_correct=payload.accept, actor_id=user.id,
    ))

    if not payload.accept:
        # If nothing else links them, put both items back in the open pool.
        for item_id in (m.lost_item_id, m.found_item_id):
            other = await db.scalar(
                select(LFMatch.id).where(
                    or_(LFMatch.lost_item_id == item_id, LFMatch.found_item_id == item_id),
                    LFMatch.id != m.id,
                    LFMatch.status.notin_([MatchStatus.REJECTED, MatchStatus.EXPIRED]),
                ).limit(1))
            if other is None:
                item = await db.scalar(select(LFItem).where(LFItem.id == item_id))
                if item and item.status == LFStatus.MATCHED:
                    item.status = LFStatus.OPEN

    return Message(detail=f"Match {m.status.value}.")


@router.post("/claims", response_model=ClaimOut, status_code=201)
async def create_claim(payload: ClaimCreate, user: CurrentUser, db: DB):
    item = await db.scalar(select(LFItem).where(LFItem.id == payload.item_id))
    if item is None or item.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")

    claim = await lf_service.submit_claim(
        db, user, item, payload.proof_note, payload.proof_urls, payload.match_id)
    await db.flush()
    await db.refresh(claim)
    return ClaimOut(
        id=claim.id, reference=claim.reference, item_id=item.id,
        item_reference=item.reference, item_title=item.title, status=claim.status,
        claimant=UserBrief.model_validate(user), proof_note=claim.proof_note,
        proof_urls=claim.proof_urls, created_at=claim.created_at)


@router.get("/claims", response_model=list[ClaimOut])
async def list_claims(
    user: CurrentUser, db: DB,
    status_filter: Optional[ClaimStatus] = Query(None, alias="status"),
    mine: bool = Query(False),
):
    query = (
        select(LFClaim, LFItem, User)
        .join(LFItem, LFItem.id == LFClaim.item_id)
        .join(User, User.id == LFClaim.claimant_id)
        .where(LFItem.organization_id == user.organization_id)
    )
    # Students and teachers only ever see their own claims.
    if mine or user.role in (UserRole.STUDENT, UserRole.TEACHER):
        query = query.where(LFClaim.claimant_id == user.id)
    if status_filter:
        query = query.where(LFClaim.status == status_filter)

    rows = (await db.execute(query.order_by(LFClaim.created_at.desc()).limit(100))).all()
    return [
        ClaimOut(
            id=c.id, reference=c.reference, item_id=i.id, item_reference=i.reference,
            item_title=i.title, status=c.status,
            claimant=UserBrief.model_validate(u), proof_note=c.proof_note,
            proof_urls=c.proof_urls, rejection_reason=c.rejection_reason,
            verified_at=c.verified_at, collected_at=c.collected_at, created_at=c.created_at)
        for c, i, u in rows
    ]


@router.post("/claims/{claim_id}/decide", response_model=Message)
async def decide_claim(
    claim_id: uuid.UUID, payload: ClaimDecision, user: RequireStaff, db: DB
):
    """Claim Verification — release the item only on sufficient ownership proof."""
    claim = await db.scalar(select(LFClaim).where(LFClaim.id == claim_id))
    if claim is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
    if not payload.approve and not payload.reason:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "A reason is required when rejecting a claim")

    await lf_service.decide_claim(db, claim, user, payload.approve, payload.reason)
    return Message(detail=f"Claim {claim.status.value}.")


@router.post("/claims/{claim_id}/collected", response_model=Message)
async def mark_collected(claim_id: uuid.UUID, user: RequireStaff, db: DB):
    claim = await db.scalar(select(LFClaim).where(LFClaim.id == claim_id))
    if claim is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
    if claim.status != ClaimStatus.APPROVED:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Only an approved claim can be marked collected")

    claim.status = ClaimStatus.COLLECTED
    claim.collected_at = datetime.now(timezone.utc)
    item = await db.scalar(select(LFItem).where(LFItem.id == claim.item_id))
    if item:
        item.status = LFStatus.RETURNED
        item.resolved_at = datetime.now(timezone.utc)
    return Message(detail="Item marked as collected and returned to its owner.")


@router.get("/dashboard", response_model=LFDashboard)
async def dashboard(user: CurrentUser, db: DB):
    org = user.organization_id

    async def count(*conditions) -> int:
        return await db.scalar(
            select(func.count()).select_from(LFItem)
            .where(LFItem.organization_id == org, *conditions)) or 0

    totals = {
        "lost_open": await count(LFItem.kind == LFKind.LOST, LFItem.status.in_(OPEN_STATES)),
        "found_open": await count(LFItem.kind == LFKind.FOUND, LFItem.status.in_(OPEN_STATES)),
        "returned": await count(LFItem.status == LFStatus.RETURNED),
        "pending_matches": await db.scalar(
            select(func.count()).select_from(LFMatch)
            .join(LFItem, LFItem.id == LFMatch.found_item_id)
            .where(LFItem.organization_id == org,
                   LFMatch.status.in_([MatchStatus.SUGGESTED, MatchStatus.NOTIFIED]))) or 0,
        "pending_claims": await db.scalar(
            select(func.count()).select_from(LFClaim)
            .join(LFItem, LFItem.id == LFClaim.item_id)
            .where(LFItem.organization_id == org,
                   LFClaim.status.in_([ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW]))) or 0,
    }

    async def recent(kind: LFKind) -> list[LFItemListItem]:
        rows = list((await db.scalars(
            select(LFItem).where(
                LFItem.organization_id == org, LFItem.kind == kind,
                LFItem.status.in_(OPEN_STATES))
            .order_by(LFItem.occurred_at.desc()).limit(6))).all())
        return [_to_item(i, await _lookups(db, rows)) for i in rows]

    match_rows = list((await db.scalars(
        select(LFMatch).join(LFItem, LFItem.id == LFMatch.found_item_id)
        .where(LFItem.organization_id == org,
               LFMatch.status.in_([MatchStatus.SUGGESTED, MatchStatus.NOTIFIED]))
        .order_by(LFMatch.score.desc()).limit(5))).all())
    previews = await _previews(db, {x for m in match_rows for x in (m.lost_item_id, m.found_item_id)})

    claim_rows = (await db.execute(
        select(LFClaim, LFItem, User)
        .join(LFItem, LFItem.id == LFClaim.item_id)
        .join(User, User.id == LFClaim.claimant_id)
        .where(LFItem.organization_id == org,
               LFClaim.status.in_([ClaimStatus.SUBMITTED, ClaimStatus.UNDER_REVIEW]))
        .order_by(LFClaim.created_at.desc()).limit(5))).all()

    return LFDashboard(
        totals=totals,
        recent_lost=await recent(LFKind.LOST),
        recent_found=await recent(LFKind.FOUND),
        pending_matches=[_match_out(m, previews) for m in match_rows],
        pending_claims=[
            ClaimOut(id=c.id, reference=c.reference, item_id=i.id, item_reference=i.reference,
                     item_title=i.title, status=c.status, claimant=UserBrief.model_validate(u),
                     proof_note=c.proof_note, proof_urls=c.proof_urls, created_at=c.created_at)
            for c, i, u in claim_rows
        ],
    )
