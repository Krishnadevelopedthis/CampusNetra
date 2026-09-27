"""Free-tier AI provider discovery and the low-level call each one makes.

Two different ways "free" gets verified, because the providers don't expose
the same metadata:
  - OpenRouter publishes real per-model pricing over its own API -- free is
    verified dynamically, on every cache refresh, by checking pricing == 0
    for both prompt and completion. This is genuine dynamic discovery, not
    a hardcoded model list.
  - Gemini (AI Studio keys) and Groq's public API don't expose per-token
    pricing this way. Both are free-tier by construction for the specific
    models on GEMINI_MODELS/GROQ_MODELS (app/core/config.py) -- so
    free-ness there is a conservative, explicitly-configured allowlist,
    intersected at runtime against whichever of those models the
    provider's own /models endpoint confirms still exist. Never an
    assumption that "the key can reach it" means "it's free".

Gemini is never returned when require_tools=True: this module doesn't
implement Gemini's function-calling wire format (different shape from the
OpenAI-compatible one OpenRouter/Groq share), so per the capability-skip
rule, Gemini simply isn't a candidate for the tool-calling assistant. It's
still a full candidate for the non-tool paths (classification, matching,
plain-text completion).
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

import httpx

from app.ai import health
from app.ai.errors import ErrorKind, ProviderCallError, classify_exception, classify_http_status
from app.core.config import settings

log = logging.getLogger(__name__)

_MODEL_CACHE_TTL = 3600  # seconds


@dataclass(frozen=True)
class ModelCandidate:
    provider: str
    model: str
    supports_tools: bool
    is_free: bool = True  # every candidate this module returns has already been filtered free-only


# ---------------------------------------------------------------- OpenRouter

_or_cache: Optional[tuple[float, list[ModelCandidate]]] = None

# Only used if live discovery fails outright (network down) -- a small,
# known-good safety net so a transient discovery-endpoint outage doesn't
# lose OpenRouter entirely. Real filtering happens live whenever the
# discovery call succeeds; this is not the primary source of truth.
_OPENROUTER_FALLBACK_MODELS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "qwen/qwen-2.5-72b-instruct:free",
]


async def openrouter_models(require_tools: bool) -> list[ModelCandidate]:
    global _or_cache
    if not settings.OPENROUTER_API_KEY:
        return []
    now = time.monotonic()
    if _or_cache is None or now - _or_cache[0] > _MODEL_CACHE_TTL:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
                )
                resp.raise_for_status()
                rows = resp.json().get("data", [])
            candidates: list[ModelCandidate] = []
            for row in rows:
                pricing = row.get("pricing") or {}
                try:
                    prompt_price = float(pricing.get("prompt", "1") or "1")
                    completion_price = float(pricing.get("completion", "1") or "1")
                except (TypeError, ValueError):
                    continue  # ambiguous pricing -- never assume free
                if prompt_price != 0 or completion_price != 0:
                    continue
                params = row.get("supported_parameters") or []
                candidates.append(ModelCandidate(
                    provider="openrouter", model=row["id"], supports_tools="tools" in params,
                ))
            _or_cache = (now, candidates)
        except Exception:
            log.warning("OpenRouter model discovery failed; using static fallback list")
            _or_cache = (now, [
                ModelCandidate(provider="openrouter", model=m, supports_tools=True)
                for m in _OPENROUTER_FALLBACK_MODELS
            ])
    models = _or_cache[1]
    return [m for m in models if not require_tools or m.supports_tools]


# --------------------------------------------------------------------- Groq

_groq_cache: Optional[tuple[float, list[str]]] = None


async def groq_models(require_tools: bool) -> list[ModelCandidate]:
    global _groq_cache
    if not settings.GROQ_API_KEY:
        return []
    allowlist = [m.strip() for m in settings.GROQ_MODELS.split(",") if m.strip()]
    now = time.monotonic()
    if _groq_cache is None or now - _groq_cache[0] > _MODEL_CACHE_TTL:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                )
                resp.raise_for_status()
                live_ids = {row["id"] for row in resp.json().get("data", [])}
            _groq_cache = (now, [m for m in allowlist if m in live_ids])
        except Exception:
            log.warning("Groq model discovery failed; using the configured allowlist unverified")
            _groq_cache = (now, allowlist)
    # Every allowlisted Groq model supports tool calling; require_tools
    # doesn't need to filter anything out here.
    return [ModelCandidate(provider="groq", model=m, supports_tools=True) for m in _groq_cache[1]]


# ------------------------------------------------------------------ Gemini

_gemini_cache: Optional[tuple[float, list[str]]] = None


async def gemini_models() -> list[ModelCandidate]:
    global _gemini_cache
    if not settings.GEMINI_API_KEY:
        return []
    allowlist = [m.strip() for m in settings.GEMINI_MODELS.split(",") if m.strip()]
    now = time.monotonic()
    if _gemini_cache is None or now - _gemini_cache[0] > _MODEL_CACHE_TTL:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://generativelanguage.googleapis.com/v1beta/models",
                    params={"key": settings.GEMINI_API_KEY},
                )
                resp.raise_for_status()
                live_ids = {
                    row["name"].removeprefix("models/") for row in resp.json().get("models", [])
                }
            _gemini_cache = (now, [m for m in allowlist if m in live_ids])
        except Exception:
            log.warning("Gemini model discovery failed; using the configured allowlist unverified")
            _gemini_cache = (now, allowlist)
    return [ModelCandidate(provider="gemini", model=m, supports_tools=False) for m in _gemini_cache[1]]


# -------------------------------------------------------------- candidates

async def free_candidates(*, require_tools: bool, allow_images: bool = True) -> list[ModelCandidate]:
    """Every currently-eligible free candidate across every configured
    provider, cost-verified at discovery time. Order: OpenRouter first
    (deepest catalogue, real dynamic pricing verification), then Groq,
    then Gemini (only ever returned when require_tools is False)."""
    out: list[ModelCandidate] = []
    if not health.provider_disabled("openrouter"):
        out += await openrouter_models(require_tools)
    if not health.provider_disabled("groq"):
        out += await groq_models(require_tools)
    if not require_tools and allow_images is not False and not health.provider_disabled("gemini"):
        out += await gemini_models()
    return out


# --------------------------------------------------------- OpenAI-compatible
# OpenRouter and Groq are both OpenAI-compatible chat-completions APIs --
# one client implementation, different base_url/key.

_or_client = None
_groq_client = None


def get_openai_client(provider: str):
    global _or_client, _groq_client
    from openai import AsyncOpenAI

    if provider == "openrouter":
        if _or_client is None:
            _or_client = AsyncOpenAI(api_key=settings.OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
        return _or_client
    if provider == "groq":
        if _groq_client is None:
            _groq_client = AsyncOpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
        return _groq_client
    raise ValueError(f"no OpenAI-compatible client for provider {provider!r}")


# ------------------------------------------------------------------- Gemini

async def gemini_complete(
    model: str, system: str, prompt_text: str, *, max_tokens: int, temperature: float,
) -> tuple[str, int, int]:
    """Returns (text, input_tokens, output_tokens). Raises ProviderCallError
    (never a raw exception) on any failure, same contract as the
    OpenAI-compatible path."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt_text}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, params={"key": settings.GEMINI_API_KEY}, json=body)
        if resp.status_code >= 400:
            kind = classify_http_status(resp.status_code, resp.text)
            retry_after = None
            ra = resp.headers.get("retry-after")
            if ra:
                try:
                    retry_after = float(ra)
                except ValueError:
                    pass
            raise ProviderCallError(kind, f"Gemini {resp.status_code}: {resp.text[:200]}", retry_after)
        data = resp.json()
    except ProviderCallError:
        raise
    except httpx.TimeoutException as exc:
        raise ProviderCallError(ErrorKind.TIMEOUT, str(exc)) from exc
    except httpx.ConnectError as exc:
        raise ProviderCallError(ErrorKind.CONNECTION_ERROR, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise ProviderCallError(classify_exception(exc), str(exc)) from exc

    candidates = data.get("candidates") or []
    if not candidates:
        # Includes safety-blocked content (promptFeedback.blockReason) --
        # not a provider failure, just this model declining this request;
        # treated as unavailable-for-this-request rather than retryable.
        raise ProviderCallError(ErrorKind.MODEL_UNAVAILABLE, "Gemini returned no candidates")
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    usage = data.get("usageMetadata", {})
    return text, usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0)
