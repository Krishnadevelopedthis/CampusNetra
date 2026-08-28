"""Duplicate complaint detection.

Three independent signals are combined. Text similarity alone is far too noisy
on a campus ("fan not working" describes hundreds of distinct faults), so
spatial and temporal proximity carry most of the weight.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

_STOPWORDS = {
    "the","a","an","is","are","was","were","in","on","at","to","of","and","or",
    "it","its","this","that","there","here","not","no","has","have","been","be",
    "for","with","from","by","please","kindly","sir","madam","very","really",
}


def _terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (text or "").lower())
            if w not in _STOPWORDS and len(w) > 2}


def jaccard(a: str, b: str) -> float:
    ta, tb = _terms(a), _terms(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def spatial_score(a: dict, b: dict) -> float:
    """Same asset is conclusive; same room strong; same floor weak."""
    if a.get("asset_id") and a["asset_id"] == b.get("asset_id"):
        return 1.0
    if a.get("room_id") and a["room_id"] == b.get("room_id"):
        return 0.85
    if a.get("floor_id") and a["floor_id"] == b.get("floor_id"):
        return 0.45
    if a.get("building_id") and a["building_id"] == b.get("building_id"):
        return 0.2
    return 0.0


def temporal_score(a: datetime, b: datetime, half_life_hours: float = 48.0) -> float:
    """Exponential decay — two reports days apart are probably separate faults."""
    if not a or not b:
        return 0.0
    hours = abs((a - b).total_seconds()) / 3600.0
    return math.exp(-hours / half_life_hours)


def hamming_similarity(h1: Optional[str], h2: Optional[str]) -> Optional[float]:
    """Perceptual-hash closeness for the attached photos, if both have one."""
    if not h1 or not h2 or len(h1) != len(h2):
        return None
    try:
        diff = bin(int(h1, 16) ^ int(h2, 16)).count("1")
    except ValueError:
        return None
    bits = len(h1) * 4
    return 1.0 - (diff / bits)


@dataclass
class DuplicateCandidate:
    issue_id: str
    reference: str
    title: str
    score: float
    signals: dict
    verdict: str          # 'likely' | 'possible'


# "What" the issue is (text + image) and "where" it is (spatial) are averaged
# into a base similarity. Weights are renormalised when no image is available.
_W_TEXT, _W_SPATIAL, _W_IMAGE = 0.45, 0.55, 0.20

# Time is deliberately NOT a weighted term. Two reports of the same fault on the
# same asset weeks apart describe a *recurring* problem — the first was resolved
# and it broke again — which is a separate complaint, not a duplicate. Treating
# time as a multiplicative gate collapses those scores instead of merely nudging
# them. Recurrence is surfaced by Recurring Problem Analysis, not by this module.
_TIME_GATE_FLOOR = 0.30

LIKELY_THRESHOLD = 0.75
POSSIBLE_THRESHOLD = 0.55


def score_pair(new: dict, existing: dict) -> tuple[float, dict]:
    text = jaccard(
        f"{new.get('title','')} {new.get('description','')}",
        f"{existing.get('title','')} {existing.get('description','')}",
    )
    spatial = spatial_score(new, existing)
    temporal = temporal_score(new.get("created_at"), existing.get("created_at"))
    image = hamming_similarity(new.get("phash"), existing.get("phash"))

    if image is None:
        base = (text * _W_TEXT + spatial * _W_SPATIAL) / (_W_TEXT + _W_SPATIAL)
    else:
        total_w = _W_TEXT + _W_SPATIAL + _W_IMAGE
        base = (text * _W_TEXT + spatial * _W_SPATIAL + image * _W_IMAGE) / total_w

    # Concurrent reports keep their full score; distant ones are damped toward the floor.
    gate = _TIME_GATE_FLOOR + (1.0 - _TIME_GATE_FLOOR) * temporal
    score = base * gate

    # A different asset in the same room is a common false positive: two separate
    # projectors in Lab 201 are not the same complaint.
    if (new.get("asset_id") and existing.get("asset_id")
            and new["asset_id"] != existing["asset_id"]):
        score *= 0.55

    signals = {
        "text": round(text, 3),
        "spatial": round(spatial, 3),
        "temporal": round(temporal, 3),
        "time_gate": round(gate, 3),
    }
    if image is not None:
        signals["image"] = round(image, 3)

    return round(min(score, 1.0), 3), signals


def find_duplicates(
    new_issue: dict, open_issues: Sequence[dict], limit: int = 5
) -> list[DuplicateCandidate]:
    """Rank open issues by likelihood of describing the same fault."""
    out: list[DuplicateCandidate] = []
    for existing in open_issues:
        if existing.get("id") == new_issue.get("id"):
            continue
        score, signals = score_pair(new_issue, existing)
        if score < POSSIBLE_THRESHOLD:
            continue
        out.append(DuplicateCandidate(
            issue_id=str(existing["id"]),
            reference=existing.get("reference", ""),
            title=existing.get("title", ""),
            score=score,
            signals=signals,
            verdict="likely" if score >= LIKELY_THRESHOLD else "possible",
        ))
    out.sort(key=lambda c: c.score, reverse=True)
    return out[:limit]
