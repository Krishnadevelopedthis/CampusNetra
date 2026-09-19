"""Thin wrapper over the configured AI provider.

Every AI feature in Campus Netra has a deterministic fallback, so the platform
stays fully functional with no API key configured. `call_json` returns None
whenever the model is unavailable or misbehaves, and the caller degrades.

Supported providers:
- OpenRouter
- Anthropic
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
    """Create the configured AI client only when AI is available."""
    global _client

    if _client is None and settings.ai_available:
        if settings.AI_PROVIDER == "openrouter":
            from openai import AsyncOpenAI

            _client = AsyncOpenAI(
                api_key=settings.OPENROUTER_API_KEY,
                base_url="https://openrouter.ai/api/v1",
            )

        elif settings.AI_PROVIDER == "anthropic":
            from anthropic import AsyncAnthropic

            _client = AsyncAnthropic(
                api_key=settings.ANTHROPIC_API_KEY
            )

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

    fence = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```",
        text,
        re.S,
    )

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
            data=None,
            model="fallback",
            latency_ms=0,
            used_fallback=True,
            error="ai_unavailable",
        )

    # Keep the existing content structure used by the application.
    content: list[dict[str, Any]] = []

    if images:
        content.extend(images)

    content.append(
        {
            "type": "text",
            "text": prompt,
        }
    )

    try:
        # ==============================================================
        # OpenRouter / OpenAI-compatible API
        # ==============================================================
        if settings.AI_PROVIDER == "openrouter":
            resp = await client.chat.completions.create(
                model=settings.AI_MODEL,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {
                        "role": "system",
                        "content": system,
                    },
                    {
                        "role": "user",
                        "content": content,
                    },
                ],
            )

            elapsed = int(
                (time.perf_counter() - started) * 1000
            )

            # OpenRouter/OpenAI-compatible response
            if not resp.choices:
                return AIResult(
                    data=None,
                    model=getattr(resp, "model", None)
                    or settings.AI_MODEL,
                    latency_ms=elapsed,
                    used_fallback=True,
                    error="empty_response",
                )

            message = resp.choices[0].message
            text = message.content or ""

            data = _extract_json(text)

            usage = getattr(resp, "usage", None)

            input_tokens = (
                getattr(usage, "prompt_tokens", 0) or 0
            )

            output_tokens = (
                getattr(usage, "completion_tokens", 0) or 0
            )

            actual_model = (
                getattr(resp, "model", None)
                or settings.AI_MODEL
            )

            return AIResult(
                data=data,
                model=actual_model,
                latency_ms=elapsed,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                error=None if data else "unparseable_response",
            )

        # ==============================================================
        # Existing Anthropic support
        # ==============================================================
        if settings.AI_PROVIDER == "anthropic":
            resp = await client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=[
                    {
                        "role": "user",
                        "content": content,
                    }
                ],
            )

            elapsed = int(
                (time.perf_counter() - started) * 1000
            )

            text = "".join(
                block.text
                for block in resp.content
                if getattr(block, "type", None) == "text"
            )

            data = _extract_json(text)

            return AIResult(
                data=data,
                model=settings.AI_MODEL,
                latency_ms=elapsed,
                input_tokens=resp.usage.input_tokens,
                output_tokens=resp.usage.output_tokens,
                error=None if data else "unparseable_response",
            )

        # ==============================================================
        # Unknown provider
        # ==============================================================
        return AIResult(
            data=None,
            model="fallback",
            latency_ms=int(
                (time.perf_counter() - started) * 1000
            ),
            used_fallback=True,
            error="unsupported_ai_provider",
        )

    except Exception as exc:
        # Network errors, authentication errors, rate limits, provider
        # errors, malformed responses, etc. all degrade to the existing
        # deterministic fallback behavior.
        log.warning(
            "AI call failed (%s); falling back to heuristics",
            exc,
        )

        return AIResult(
            data=None,
            model=settings.AI_MODEL,
            latency_ms=int(
                (time.perf_counter() - started) * 1000
            ),
            used_fallback=True,
            error=str(exc)[:200],
        )


async def call_text(
    system: str,
    prompt: str,
    *,
    max_tokens: int = 1024,
) -> Optional[str]:
    """Free-form completion, used by the campus assistant."""

    client = _get_client()

    if client is None:
        return None

    try:
        # ==============================================================
        # OpenRouter / OpenAI-compatible API
        # ==============================================================
        if settings.AI_PROVIDER == "openrouter":
            resp = await client.chat.completions.create(
                model=settings.AI_MODEL,
                max_tokens=max_tokens,
                messages=[
                    {
                        "role": "system",
                        "content": system,
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
            )

            if not resp.choices:
                return None

            return resp.choices[0].message.content or None

        # ==============================================================
        # Existing Anthropic support
        # ==============================================================
        if settings.AI_PROVIDER == "anthropic":
            resp = await client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=[
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
            )

            return "".join(
                block.text
                for block in resp.content
                if getattr(block, "type", None) == "text"
            )

        return None

    except Exception as exc:
        log.warning(
            "AI text call failed: %s",
            exc,
        )
        return None
