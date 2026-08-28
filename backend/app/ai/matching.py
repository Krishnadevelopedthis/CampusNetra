"""Lost & Found matching.

Produces the five factor bars shown on the AI Match Analysis panel:
Image Similarity, Description Match, Location Proximity, Category, Time Window.

A found report can only match a lost report that predates it, which prunes most
of the search space before any scoring happens.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional, Sequence

from app.ai.client import call_json
from app.ai.duplicates import hamming_similarity, jaccard

# Colour and material words carry disproportionate signal for physical objects.
_SALIENT = {
    "black","white","red","blue","green","yellow","grey","gray","brown","pink",
    "purple","orange","silver","gold","navy","beige","maroon","leather","denim",
    "metal","plastic","canvas","nylon","steel","wooden",
}


@dataclass
class MatchFactors:
    image: float
    description: float
    location: float
    category: float
    time: float

    def as_percentages(self) -> dict[str, int]:
        return {k: round(v * 100) for k, v in asdict(self).items()}


@dataclass
class MatchResult:
    lost_id: str
    found_id: str
    score: float
    factors: MatchFactors
    reasoning: str
    model: str
    used_fallback: bool

    @property
    def band(self) -> str:
        if self.score >= 0.85:
            return "high"
        if self.score >= 0.65:
            return "medium"
        return "low"


# Location and category are hard gates in practice: a phone found in the library
# is not a backpack lost in the gym, however similar the prose.
_W = {"image": 0.30, "description": 0.25, "location": 0.20, "category": 0.15, "time": 0.10}

SUGGEST_THRESHOLD = 0.60
NOTIFY_THRESHOLD = 0.80


def _text_signature(item: dict) -> str:
    return " ".join(filter(None, [
        item.get("title"), item.get("description"), item.get("brand"),
        item.get("colour"), item.get("distinguishing_marks"),
        " ".join(item.get("ai_tags") or []),
    ]))


def description_score(lost: dict, found: dict) -> float:
    """Token overlap, boosted when both mention the same colour/material."""
    base = jaccard(_text_signature(lost), _text_signature(found))

    lost_salient = {w for w in re.findall(r"[a-z]+", _text_signature(lost).lower()) if w in _SALIENT}
    found_salient = {w for w in re.findall(r"[a-z]+", _text_signature(found).lower()) if w in _SALIENT}
    if lost_salient and found_salient:
        overlap = len(lost_salient & found_salient) / len(lost_salient | found_salient)
        base = base * 0.6 + overlap * 0.4

    # An exact brand match is strong corroboration.
    lb, fb = (lost.get("brand") or "").strip().lower(), (found.get("brand") or "").strip().lower()
    if lb and fb:
        base = min(1.0, base + 0.15) if lb == fb else base * 0.7

    return round(min(base, 1.0), 3)


def location_score(lost: dict, found: dict) -> float:
    """Exact room is near-certain; same building plausible; GPS as a fallback."""
    if lost.get("room_id") and lost["room_id"] == found.get("room_id"):
        return 1.0
    if lost.get("building_id") and lost["building_id"] == found.get("building_id"):
        return 0.75

    lz, fz = lost.get("zone_code"), found.get("zone_code")
    if lz and fz:
        if lz == fz:
            return 0.95
        # Zone codes are hierarchical (Z-L2-NW-04); a shared prefix means proximity.
        lp, fp = lz.split("-"), fz.split("-")
        shared = sum(1 for a, b in zip(lp, fp) if a == b)
        if shared >= 2:
            return 0.55

    la, lo = lost.get("latitude"), lost.get("longitude")
    fa, fo = found.get("latitude"), found.get("longitude")
    if None not in (la, lo, fa, fo):
        # Rough metres-per-degree at campus scale; decays over ~200 m.
        dm = math.hypot((float(la) - float(fa)) * 111_000, (float(lo) - float(fo)) * 96_000)
        return round(max(0.0, math.exp(-dm / 200.0)), 3)

    return 0.15  # unknown location — weak prior, not a disqualifier


def time_score(lost: dict, found: dict) -> float:
    """An item cannot be found before it was lost; after that, sooner is better."""
    lt, ft = lost.get("occurred_at"), found.get("occurred_at")
    if not lt or not ft:
        return 0.3

    delta_hours = (ft - lt).total_seconds() / 3600.0
    if delta_hours < -6:
        return 0.0        # found well before it was reported lost — impossible
    if delta_hours < 0:
        return 0.6        # small clock/recall slack
    return round(math.exp(-delta_hours / 96.0), 3)   # ~4-day half-life


def category_score(lost: dict, found: dict) -> float:
    lc, fc = lost.get("category_id"), found.get("category_id")
    if lc and fc:
        return 1.0 if lc == fc else 0.0
    return 0.5   # one side uncategorised


def score_pair(lost: dict, found: dict) -> tuple[float, MatchFactors]:
    image = hamming_similarity(lost.get("image_phash"), found.get("image_phash"))
    factors = MatchFactors(
        # No photo on one side: fall back to the description signal rather than
        # penalising the pair for missing data.
        image=image if image is not None else description_score(lost, found) * 0.8,
        description=description_score(lost, found),
        location=location_score(lost, found),
        category=category_score(lost, found),
        time=time_score(lost, found),
    )

    score = sum(getattr(factors, k) * w for k, w in _W.items())

    # Hard vetoes — these are not "low scores", they are impossibilities.
    if factors.time == 0.0:
        score = 0.0
    if factors.category == 0.0:
        score *= 0.35

    return round(min(score, 1.0), 3), factors


def match_heuristic(lost: dict, found: dict) -> MatchResult:
    score, factors = score_pair(lost, found)
    bits = []
    if factors.category == 1.0:
        bits.append("same category")
    if factors.location >= 0.75:
        bits.append("same location")
    if factors.description >= 0.5:
        bits.append("strong description overlap")
    if factors.time >= 0.7:
        bits.append("consistent timing")
    reasoning = ("Matched on " + ", ".join(bits) + ".") if bits else "Weak correspondence across all factors."

    return MatchResult(
        lost_id=str(lost.get("id")), found_id=str(found.get("id")),
        score=score, factors=factors, reasoning=reasoning,
        model="heuristic-v1", used_fallback=True,
    )


def rank_matches(
    target: dict, candidates: Sequence[dict], limit: int = 10
) -> list[MatchResult]:
    """`target` is one side of the ledger; `candidates` are the opposite kind."""
    is_lost = target.get("kind") == "lost"
    results = []
    for c in candidates:
        lost, found = (target, c) if is_lost else (c, target)
        r = match_heuristic(lost, found)
        if r.score >= SUGGEST_THRESHOLD:
            results.append(r)
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]


_SYSTEM = """You compare a lost-property report against a found-property report \
for a campus Lost & Found system and judge whether they describe the same physical object.

Be conservative: a wrong match sends someone else's property to the wrong person. \
Generic descriptions that merely share a category ("black bag") are NOT a match \
without corroborating detail such as a brand, a distinguishing mark, or a precise location.

Respond with ONLY JSON:
{"is_match": true|false, "confidence": 0.0-1.0, "reasoning": "<one sentence>",
 "key_evidence": ["<detail>"], "contradictions": ["<detail>"]}"""


async def match_with_ai(lost: dict, found: dict) -> MatchResult:
    """LLM adjudication layered on top of the numeric factors."""
    base = match_heuristic(lost, found)

    def describe(item: dict, label: str) -> str:
        return (
            f"{label}:\n"
            f"  Title: {item.get('title')}\n"
            f"  Category: {item.get('category_name') or 'unspecified'}\n"
            f"  Colour: {item.get('colour') or '-'}   Brand: {item.get('brand') or '-'}\n"
            f"  Distinguishing marks: {item.get('distinguishing_marks') or '-'}\n"
            f"  Description: {item.get('description') or '-'}\n"
            f"  Location: {item.get('location_note') or '-'}\n"
            f"  When: {item.get('occurred_at')}\n"
        )

    prompt = (
        describe(lost, "LOST REPORT") + "\n" + describe(found, "FOUND REPORT")
        + f"\nComputed factors (0-1): {base.factors.as_percentages()}"
    )

    result = await call_json(_SYSTEM, prompt, max_tokens=500)
    if not result.ok:
        return base

    data = result.data or {}
    try:
        conf = max(0.0, min(1.0, float(data.get("confidence", base.score))))
    except (TypeError, ValueError):
        conf = base.score

    # A model "no" caps the score even when the numbers looked good, and vice
    # versa the model cannot rescue a pair the hard vetoes already killed.
    if not data.get("is_match", False):
        conf = min(conf, 0.45)
    if base.factors.time == 0.0:
        conf = 0.0

    return MatchResult(
        lost_id=base.lost_id, found_id=base.found_id,
        score=round((conf * 0.6) + (base.score * 0.4), 3),
        factors=base.factors,
        reasoning=str(data.get("reasoning", base.reasoning))[:500],
        model=result.model, used_fallback=False,
    )
