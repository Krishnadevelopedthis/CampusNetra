"""Thin wrapper over the Anthropic API.

Every AI feature in Campus Netra has a deterministic fallback, so the platform
stays fully functional with no API key configured. `call_json` returns None
whenever the model is unavailable or misbehaves, and the caller degrades.
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Optional

from app.core.config import settings

log = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None and settings.ai_available:
        from anthropic import AsyncAnthropic

        _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


@dataclass
class AIResult:
    """Carries the payload plus the telemetry we persist to ai_invocations."""
    data: Optional[dict]
    model: str
    latency_ms: int
    input_tokens: int = 0
    output_tokens: int = 0
    used_fallback: bool = False
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.data is not None and self.error is None


def _extract_json(text: str) -> Optional[dict]:
    """Models sometimes wrap JSON in prose or a code fence — dig it out."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if fence:
        text = fence.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            return None
        text = text[start : end + 1]
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


async def call_json(
    system: str,
    prompt: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.0,
    images: list[dict[str, Any]] | None = None,
) -> AIResult:
    """Ask the model for a JSON object. Never raises — inspect `.ok`."""
    started = time.perf_counter()

    client = _get_client()
    if client is None:
        return AIResult(
            data=None, model="fallback", latency_ms=0,
            used_fallback=True, error="ai_unavailable",
        )

    content: list[dict[str, Any]] = []
    if images:
        content.extend(images)
    content.append({"type": "text", "text": prompt})

    try:
        resp = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
        elapsed = int((time.perf_counter() - started) * 1000)
        text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        data = _extract_json(text)
        return AIResult(
            data=data,
            model=settings.AI_MODEL,
            latency_ms=elapsed,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
            error=None if data else "unparseable_response",
        )
    except Exception as exc:  # network, rate limit, auth — all degrade the same way
        log.warning("AI call failed (%s); falling back to heuristics", exc)
        return AIResult(
            data=None,
            model=settings.AI_MODEL,
            latency_ms=int((time.perf_counter() - started) * 1000),
            used_fallback=True,
            error=str(exc)[:200],
        )


async def call_text(system: str, prompt: str, *, max_tokens: int = 1024) -> Optional[str]:
    """Free-form completion, used by the campus assistant."""
    client = _get_client()
    if client is None:
        return None
    try:
        resp = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    except Exception as exc:
        log.warning("AI text call failed: %s", exc)
        return None
