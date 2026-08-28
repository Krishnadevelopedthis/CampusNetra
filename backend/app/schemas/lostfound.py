"""Lost & Found payloads."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.core.enums import ClaimStatus, LFKind, LFStatus, MatchStatus
from app.schemas.common import ORMModel, UserBrief


class LFCategoryOut(ORMModel):
    id: uuid.UUID
    name: str
    code: str
    icon: Optional[str] = None


class LFAttachmentIn(BaseModel):
    url: str
    thumb_url: Optional[str] = None
    filename: Optional[str] = None
    phash: Optional[str] = None
    is_primary: bool = False


class LFAttachmentOut(ORMModel):
    id: uuid.UUID
    url: str
    thumb_url: Optional[str] = None
    filename: Optional[str] = None
    is_primary: bool


class LFItemCreate(BaseModel):
    kind: LFKind
    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=3000)
    category_id: Optional[uuid.UUID] = None
    colour: Optional[str] = Field(None, max_length=40)
    brand: Optional[str] = Field(None, max_length=80)
    distinguishing_marks: Optional[str] = Field(None, max_length=500)
    campus_id: Optional[uuid.UUID] = None
    building_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    location_note: Optional[str] = Field(None, max_length=300)
    zone_code: Optional[str] = None
    occurred_at: datetime
    contact_pref: str = Field("in_app", pattern="^(in_app|email|phone)$")
    # Where a found item is being held until collected.
    holding_location: Optional[str] = None
    attachments: list[LFAttachmentIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _not_in_the_future(self):
        # A small skew tolerance covers clock differences between client and server.
        if self.occurred_at.timestamp() > datetime.now(self.occurred_at.tzinfo).timestamp() + 300:
            raise ValueError("occurred_at cannot be in the future")
        return self


class MatchFactorsOut(BaseModel):
    """The five bars on the AI Match Analysis panel, as percentages."""
    image: int
    description: int
    location: int
    category: int
    time: int


class LFMatchOut(BaseModel):
    id: Optional[uuid.UUID] = None
    lost_item_id: uuid.UUID
    found_item_id: uuid.UUID
    score: float
    score_pct: int
    band: str
    factors: MatchFactorsOut
    reasoning: Optional[str] = None
    status: MatchStatus = MatchStatus.SUGGESTED
    # Compact previews for the side-by-side comparison.
    lost_preview: Optional[dict] = None
    found_preview: Optional[dict] = None
    created_at: Optional[datetime] = None


class LFItemListItem(BaseModel):
    id: uuid.UUID
    reference: str
    kind: LFKind
    status: LFStatus
    title: str
    category_name: Optional[str] = None
    category_icon: Optional[str] = None
    colour: Optional[str] = None
    brand: Optional[str] = None
    location_summary: Optional[str] = None
    occurred_at: datetime
    primary_image: Optional[str] = None
    reporter: Optional[UserBrief] = None
    match_count: int = 0
    best_match_score: Optional[int] = None
    created_at: datetime


class LFItemDetail(LFItemListItem):
    description: Optional[str] = None
    distinguishing_marks: Optional[str] = None
    zone_code: Optional[str] = None
    holding_location: Optional[str] = None
    contact_pref: str
    attachments: list[LFAttachmentOut] = Field(default_factory=list)
    matches: list[LFMatchOut] = Field(default_factory=list)
    ai_tags: list[str] = Field(default_factory=list)
    can_claim: bool = False


class LFItemCreateResponse(BaseModel):
    item: LFItemDetail
    matches: list[LFMatchOut] = Field(default_factory=list)
    message: Optional[str] = None


class MatchDecision(BaseModel):
    accept: bool
    note: Optional[str] = None


class ClaimCreate(BaseModel):
    item_id: uuid.UUID
    match_id: Optional[uuid.UUID] = None
    # Ownership proof: details only the true owner would know.
    proof_note: str = Field(min_length=10, max_length=2000)
    proof_urls: list[str] = Field(default_factory=list)


class ClaimOut(BaseModel):
    id: uuid.UUID
    reference: str
    item_id: uuid.UUID
    item_reference: Optional[str] = None
    item_title: Optional[str] = None
    status: ClaimStatus
    claimant: Optional[UserBrief] = None
    proof_note: Optional[str] = None
    proof_urls: list[str] = Field(default_factory=list)
    rejection_reason: Optional[str] = None
    verified_at: Optional[datetime] = None
    collected_at: Optional[datetime] = None
    created_at: datetime


class ClaimDecision(BaseModel):
    approve: bool
    reason: Optional[str] = Field(None, max_length=1000)


class LFDashboard(BaseModel):
    totals: dict
    recent_lost: list[LFItemListItem]
    recent_found: list[LFItemListItem]
    pending_matches: list[LFMatchOut]
    pending_claims: list[ClaimOut]
