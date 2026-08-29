"""Issue classification: free text (+ optional photo) -> category, department, priority.

Two paths, same output shape:
  1. LLM classification when an API key is configured.
  2. A keyword/weight heuristic otherwise — deterministic and dependency-free,
     so the platform demonstrates end-to-end routing with no external calls.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional, Sequence

from app.ai.client import call_json
from app.core.enums import Priority


@dataclass
class Classification:
    category_code: Optional[str]
    category_id: Optional[str]
    department_id: Optional[str]
    priority: Priority
    confidence: float
    reasoning: str
    model: str
    used_fallback: bool
    latency_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    # Ranked alternatives, shown in the "AI Issue Classification" review screen.
    alternatives: list[dict] = field(default_factory=list)


# Words that escalate priority regardless of category.
_URGENCY_MARKERS: dict[str, tuple[Priority, int]] = {
    "fire":         (Priority.CRITICAL, 10),
    "smoke":        (Priority.CRITICAL, 10),
    "spark":        (Priority.CRITICAL, 9),
    "shock":        (Priority.CRITICAL, 9),
    "electrocut":   (Priority.CRITICAL, 10),
    "gas leak":     (Priority.CRITICAL, 10),
    "flood":        (Priority.CRITICAL, 9),
    "collapse":     (Priority.CRITICAL, 10),
    "injury":       (Priority.CRITICAL, 10),
    "burning smell":(Priority.CRITICAL, 9),
    "exposed wire": (Priority.CRITICAL, 9),
    "short circuit":(Priority.HIGH, 7),
    "no power":     (Priority.HIGH, 6),
    "power cut":    (Priority.HIGH, 6),
    "overflow":     (Priority.HIGH, 6),
    "leak":         (Priority.HIGH, 5),
    "not working":  (Priority.MEDIUM, 3),
    "broken":       (Priority.MEDIUM, 3),
    "slow":         (Priority.LOW, 1),
    "flicker":      (Priority.MEDIUM, 2),
    "noise":        (Priority.LOW, 1),
    "dirty":        (Priority.LOW, 1),
}

_PRIORITY_ORDER = [Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL]


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


# A title is the reporter's own summary of what is wrong; a description also
# carries context — where it is, what they tried, what else is nearby. Weighting
# them equally lets incidental nouns decide the category: "socket sparking near
# the door" routed to Civil because 'door' and 'wall' outnumbered 'socket'.
_TITLE_WEIGHT = 3.0
_BODY_WEIGHT = 1.0


def _raw_hits(text: str, keywords: Sequence[str]) -> float:
    """Weighted count of keywords present, before any normalisation."""
    low = text.lower()
    tokens = set(_tokenize(text))
    hits = 0.0
    for kw in keywords:
        kw_low = kw.lower().strip()
        if not kw_low:
            continue
        if " " in kw_low:
            if kw_low in low:
                hits += 1.5          # multi-word phrases are stronger evidence
        elif kw_low in tokens:
            hits += 1.0
        elif len(kw_low) >= 5 and any(t.startswith(kw_low[:5]) for t in tokens):
            hits += 0.4              # tolerate "leaking" vs "leak", "sparked" vs "spark"
    return hits


def _keyword_score(title: str, description: str, keywords: Sequence[str]) -> float:
    """Score a category against the report, weighting the title far higher.

    Normalisation is by the square root of the vocabulary size rather than by
    the size itself. Dividing by the count rewards sparsely-defined categories:
    a category with four keywords beat one with fourteen on a single incidental
    match. The square root still discounts large vocabularies without handing
    small ones an advantage.
    """
    if not keywords:
        return 0.0

    hits = (_raw_hits(title, keywords) * _TITLE_WEIGHT
            + _raw_hits(description, keywords) * _BODY_WEIGHT)
    return hits / (len(keywords) ** 0.5)


def detect_priority(text: str, base: Priority = Priority.MEDIUM) -> tuple[Priority, str]:
    """Highest-weighted urgency marker wins; never downgrades below `base`."""
    low = text.lower()
    best: tuple[Priority, int, str] | None = None
    for marker, (prio, weight) in _URGENCY_MARKERS.items():
        if marker in low and (best is None or weight > best[1]):
            best = (prio, weight, marker)
    if best is None:
        return base, "no urgency markers detected"

    prio, _, marker = best
    if _PRIORITY_ORDER.index(prio) < _PRIORITY_ORDER.index(base):
        return base, f"category default retained (matched '{marker}')"
    return prio, f"escalated by keyword '{marker}'"


def classify_heuristic(
    title: str, description: str, categories: Sequence[dict]
) -> Classification:
    """Deterministic classifier. `categories` are dicts with id/code/name/keywords/
    department_id/default_priority."""
    text = f"{title} {description}"

    scored: list[tuple[float, dict]] = []
    for cat in categories:
        score = _keyword_score(title, description, cat.get("keywords") or [])
        # The category's own name is an implicit keyword, and naming it in the
        # title is about as explicit as a reporter can be.
        name = cat.get("name", "").lower()
        if name and name in title.lower():
            score += 1.5
        elif name and name in description.lower():
            score += 0.5
        scored.append((score, cat))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_score, top = scored[0] if scored else (0.0, None)

    if top is None or top_score <= 0:
        return Classification(
            category_code=None, category_id=None, department_id=None,
            priority=detect_priority(text)[0], confidence=0.0,
            reasoning="No category keywords matched; routed for manual triage.",
            model="heuristic-v1", used_fallback=True,
        )

    base_priority = top.get("default_priority") or Priority.MEDIUM
    if isinstance(base_priority, str):
        base_priority = Priority(base_priority)
    priority, why = detect_priority(text, base_priority)

    # Map the raw score onto a calibrated-looking confidence. Capped below 1.0
    # because a keyword heuristic is never certain, and scaled for the weighted
    # scoring above, where a strong title match lands around 1.5-3.0.
    confidence = round(min(0.88, 0.40 + top_score * 0.22), 3)
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    if top_score - runner_up < 0.15:
        confidence = round(confidence * 0.8, 3)   # ambiguous between two categories

    return Classification(
        category_code=top.get("code"),
        category_id=top.get("id"),
        department_id=top.get("department_id"),
        priority=priority,
        confidence=confidence,
        reasoning=f"Matched '{top.get('name')}' on keyword overlap; {why}.",
        model="heuristic-v1",
        used_fallback=True,
        alternatives=[
            {"code": c.get("code"), "name": c.get("name"), "score": round(s, 3)}
            for s, c in scored[1:4] if s > 0
        ],
    )


_SYSTEM = """You are the triage engine for Campus Netra, a campus facility \
management platform. Classify the reported issue into exactly one of the supplied \
categories and assign a priority.

Priority guidance:
- critical: danger to life or safety (fire, smoke, exposed live wiring, gas leak, structural failure, flooding)
- high: blocks teaching/work for many people, or will worsen fast (no power in a block, burst pipe, server room AC down)
- medium: single-room degradation (one projector dead, one AC not cooling, broken furniture)
- low: cosmetic or convenience (scuff marks, slow drain, minor noise)

Respond with ONLY a JSON object:
{"category_code": "<code>", "priority": "low|medium|high|critical",
 "confidence": 0.0-1.0, "reasoning": "<one sentence>",
 "alternatives": [{"code": "<code>", "score": 0.0-1.0}]}"""


async def classify(
    title: str,
    description: str,
    categories: Sequence[dict],
    image_data: Optional[list[dict]] = None,
) -> Classification:
    """LLM-first with automatic heuristic fallback."""
    fallback = classify_heuristic(title, description, categories)
    if not categories:
        return fallback

    catalogue = "\n".join(
        f"- {c['code']}: {c['name']}"
        + (f" (typical: {', '.join((c.get('keywords') or [])[:6])})" if c.get("keywords") else "")
        for c in categories
    )
    prompt = (
        f"Available categories:\n{catalogue}\n\n"
        f"Reported issue:\nTitle: {title}\nDescription: {description}"
        + ("\n\nA photo of the issue is attached." if image_data else "")
    )

    result = await call_json(_SYSTEM, prompt, images=image_data, max_tokens=600)
    if not result.ok:
        fallback.latency_ms = result.latency_ms
        return fallback

    data = result.data or {}
    code = data.get("category_code")
    match = next((c for c in categories if c.get("code") == code), None)
    if match is None:
        # Model invented a code — trust the heuristic instead of guessing.
        fallback.reasoning += " (model returned an unknown category code)"
        fallback.latency_ms = result.latency_ms
        return fallback

    try:
        priority = Priority(str(data.get("priority", "medium")).lower())
    except ValueError:
        priority = Priority.MEDIUM

    confidence = data.get("confidence", 0.7)
    try:
        confidence = max(0.0, min(1.0, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.7

    return Classification(
        category_code=code,
        category_id=match.get("id"),
        department_id=match.get("department_id"),
        priority=priority,
        confidence=round(confidence, 3),
        reasoning=str(data.get("reasoning", ""))[:500],
        model=result.model,
        used_fallback=False,
        latency_ms=result.latency_ms,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        alternatives=data.get("alternatives") or [],
    )
