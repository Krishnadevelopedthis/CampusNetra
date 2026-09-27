"""Self-healing free-only AI router: picks the healthiest free candidate
across every configured provider, dispatches, classifies failures, and
fails over -- all invisibly to the caller. See app/ai/client.py for how
call_json/call_text/call_agent wrap this to keep their existing AIResult
contract (and every existing call site) unchanged.

Two entry points, because they have different safety requirements:
  - complete_text(): no side effects possible, so it retries freely across
    every candidate on any failure.
  - complete_agent(): can execute real, non-idempotent tools mid-loop
    (create_complaint, etc). Provider fail-over there is only ever
    attempted before the FIRST model response of this call arrives --
    once any exchange has happened, a tool may already have run, and
    restarting the whole conversation on a different model risks it
    re-issuing that same tool call with no memory it already executed
    (spec: no duplicate side effects). Past that point, a failure degrades
    straight to the existing heuristic fallback, exactly like any other
    AI failure today.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app.ai import health, providers
from app.ai.errors import ErrorKind, FATAL_FOR_THIS_CALL, ProviderCallError, classify_exception

log = logging.getLogger(__name__)

_RETRYABLE_SAME_ROUTE = {ErrorKind.TIMEOUT, ErrorKind.CONNECTION_ERROR, ErrorKind.TEMPORARY_SERVER_ERROR}


@dataclass
class RouterResult:
    text: Optional[str]
    tool_calls: Optional[list[dict]]
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    error: Optional[str]
    attempts: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.error is None


def _sorted_by_health(candidates: list[providers.ModelCandidate]) -> list[providers.ModelCandidate]:
    available = [c for c in candidates if not health.is_in_cooldown(c.provider, c.model)]
    return sorted(available, key=lambda c: health.failure_count(c.provider, c.model))


def _no_route_result(started: float, attempts: list[str]) -> RouterResult:
    return RouterResult(
        text=None, tool_calls=None, provider="none", model="none",
        input_tokens=0, output_tokens=0,
        latency_ms=int((time.perf_counter() - started) * 1000),
        error="all_free_routes_exhausted" if attempts else "no_free_route_configured",
        attempts=attempts,
    )


async def _dispatch_text(
    candidate: providers.ModelCandidate, system: str, prompt: str,
    images: Optional[list[dict]], max_tokens: int, temperature: float,
) -> tuple[str, int, int]:
    if candidate.provider == "gemini":
        return await providers.gemini_complete(
            candidate.model, system, prompt, max_tokens=max_tokens, temperature=temperature,
        )

    client = providers.get_openai_client(candidate.provider)
    if images:
        content: Any = [*images, {"type": "text", "text": prompt}]
    else:
        content = prompt
    try:
        resp = await client.chat.completions.create(
            model=candidate.model, max_tokens=max_tokens, temperature=temperature,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": content}],
        )
    except Exception as exc:  # noqa: BLE001
        raise ProviderCallError(classify_exception(exc), str(exc)) from exc

    if not resp.choices:
        raise ProviderCallError(ErrorKind.MODEL_UNAVAILABLE, "empty_response")
    text = resp.choices[0].message.content or ""
    usage = getattr(resp, "usage", None)
    return text, getattr(usage, "prompt_tokens", 0) or 0, getattr(usage, "completion_tokens", 0) or 0


async def complete_text(
    system: str, prompt: str, *,
    max_tokens: int = 1024, temperature: float = 0.0,
    images: Optional[list[dict]] = None,
) -> RouterResult:
    started = time.perf_counter()
    # Cross-provider multimodal support isn't verified for Groq/Gemini here
    # (varies by model, not worth guessing) -- images stay OpenRouter-only,
    # same provider the pre-router code always sent them to.
    candidates = await providers.free_candidates(require_tools=False, allow_images=not images)
    if images:
        candidates = [c for c in candidates if c.provider == "openrouter"]
    candidates = _sorted_by_health(candidates)

    attempts: list[str] = []
    if not candidates:
        return _no_route_result(started, attempts)

    for candidate in candidates:
        if health.provider_disabled(candidate.provider):
            # A candidate earlier in this same loop already proved this
            # provider's key is bad -- every other model on it will fail
            # identically, so skip straight past the rest of them instead
            # of spending real API calls (and, at scale, real per-request
            # latency) re-discovering that fact one model at a time.
            continue
        assert candidate.is_free, "cost guard: router must never dispatch a non-free candidate"
        log.info("AI_REQUEST_STARTED provider=%s model=%s", candidate.provider, candidate.model)

        last_kind: Optional[ErrorKind] = None
        for attempt_no in range(2):  # one bounded same-route retry for transient errors only
            try:
                text, in_tok, out_tok = await _dispatch_text(candidate, system, prompt, images, max_tokens, temperature)
                health.mark_success(candidate.provider, candidate.model)
                log.info("AI_REQUEST_SUCCESS provider=%s model=%s", candidate.provider, candidate.model)
                return RouterResult(
                    text=text, tool_calls=None, provider=candidate.provider, model=candidate.model,
                    input_tokens=in_tok, output_tokens=out_tok,
                    latency_ms=int((time.perf_counter() - started) * 1000), error=None, attempts=attempts,
                )
            except ProviderCallError as exc:
                last_kind = exc.kind
                if exc.kind in _RETRYABLE_SAME_ROUTE and attempt_no == 0:
                    await asyncio.sleep(0.3)
                    continue
                break

        attempts.append(f"{candidate.provider}/{candidate.model}: {last_kind.value}")
        log.warning("AI_ROUTE_FAILED provider=%s model=%s reason=%s", candidate.provider, candidate.model, last_kind.value)
        if last_kind == ErrorKind.AUTHENTICATION_ERROR:
            health.disable_provider(candidate.provider)
        else:
            health.mark_failure(candidate.provider, candidate.model, last_kind)
        if last_kind in FATAL_FOR_THIS_CALL:
            return RouterResult(
                text=None, tool_calls=None, provider=candidate.provider, model=candidate.model,
                input_tokens=0, output_tokens=0,
                latency_ms=int((time.perf_counter() - started) * 1000), error=last_kind.value, attempts=attempts,
            )
        log.info("AI_ROUTE_SWITCH from=%s/%s reason=%s", candidate.provider, candidate.model, last_kind.value)

    return _no_route_result(started, attempts)


async def complete_agent(
    system: str, messages: list[dict[str, Any]], tools: list[dict],
    run_tool: Callable[..., Any], *,
    max_tokens: int = 800, max_tool_hops: int = 4,
) -> RouterResult:
    started = time.perf_counter()
    candidates = _sorted_by_health(await providers.free_candidates(require_tools=True))

    attempts: list[str] = []
    if not candidates:
        return _no_route_result(started, attempts)

    for candidate in candidates:
        if health.provider_disabled(candidate.provider):
            continue
        assert candidate.is_free, "cost guard: router must never dispatch a non-free candidate"
        client = providers.get_openai_client(candidate.provider)
        convo: list[dict[str, Any]] = [{"role": "system", "content": system}, *messages]
        total_input = total_output = 0
        tool_calls_made: list[dict] = []
        log.info("AI_REQUEST_STARTED provider=%s model=%s", candidate.provider, candidate.model)

        try:
            for hop in range(max_tool_hops):
                try:
                    resp = await client.chat.completions.create(
                        model=candidate.model, max_tokens=max_tokens, temperature=0.2,
                        messages=convo, tools=tools, tool_choice="auto",
                    )
                except Exception as exc:  # noqa: BLE001
                    kind = classify_exception(exc)
                    if hop == 0:
                        # Nothing has executed yet -- safe to fail over to
                        # the next candidate with a completely fresh attempt.
                        attempts.append(f"{candidate.provider}/{candidate.model}: {kind.value}")
                        log.warning("AI_ROUTE_FAILED provider=%s model=%s reason=%s", candidate.provider, candidate.model, kind.value)
                        if kind == ErrorKind.AUTHENTICATION_ERROR:
                            health.disable_provider(candidate.provider)
                        else:
                            health.mark_failure(candidate.provider, candidate.model, kind)
                        raise _HopZeroFailure from exc
                    log.warning(
                        "AI agent call failed mid-tool-loop (hop %d, provider=%s model=%s): %s -- "
                        "not failing over mid-conversation, to avoid duplicate tool execution",
                        hop, candidate.provider, candidate.model, exc,
                    )
                    return RouterResult(
                        text=None, tool_calls=tool_calls_made, provider=candidate.provider, model=candidate.model,
                        input_tokens=total_input, output_tokens=total_output,
                        latency_ms=int((time.perf_counter() - started) * 1000),
                        error=kind.value, attempts=attempts,
                    )

                usage = getattr(resp, "usage", None)
                total_input += getattr(usage, "prompt_tokens", 0) or 0
                total_output += getattr(usage, "completion_tokens", 0) or 0

                if not resp.choices:
                    if hop == 0:
                        attempts.append(f"{candidate.provider}/{candidate.model}: model_unavailable")
                        health.mark_failure(candidate.provider, candidate.model, ErrorKind.MODEL_UNAVAILABLE)
                        raise _HopZeroFailure
                    return RouterResult(
                        text=None, tool_calls=tool_calls_made, provider=candidate.provider, model=candidate.model,
                        input_tokens=total_input, output_tokens=total_output,
                        latency_ms=int((time.perf_counter() - started) * 1000),
                        error="empty_response", attempts=attempts,
                    )

                message = resp.choices[0].message
                requested = getattr(message, "tool_calls", None)

                if not requested:
                    health.mark_success(candidate.provider, candidate.model)
                    log.info("AI_REQUEST_SUCCESS provider=%s model=%s", candidate.provider, candidate.model)
                    return RouterResult(
                        text=message.content or "", tool_calls=tool_calls_made,
                        provider=candidate.provider, model=candidate.model,
                        input_tokens=total_input, output_tokens=total_output,
                        latency_ms=int((time.perf_counter() - started) * 1000), error=None, attempts=attempts,
                    )

                convo.append({
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [
                        {"id": tc.id, "type": "function",
                         "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                        for tc in requested
                    ],
                })
                for tc in requested:
                    name = tc.function.name
                    try:
                        args = json.loads(tc.function.arguments or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    result = await run_tool(name, args)
                    tool_calls_made.append({"name": name, "ok": bool(result.get("ok"))})
                    convo.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result, default=str)[:4000]})
            else:
                return RouterResult(
                    text=None, tool_calls=tool_calls_made, provider=candidate.provider, model=candidate.model,
                    input_tokens=total_input, output_tokens=total_output,
                    latency_ms=int((time.perf_counter() - started) * 1000),
                    error="tool_loop_limit_reached", attempts=attempts,
                )
        except _HopZeroFailure:
            log.info("AI_ROUTE_SWITCH from=%s/%s", candidate.provider, candidate.model)
            continue
        except Exception:  # noqa: BLE001 -- never let an unexpected bug escape the router
            log.exception("Unexpected error in AI agent loop (provider=%s model=%s)", candidate.provider, candidate.model)
            attempts.append(f"{candidate.provider}/{candidate.model}: unknown_error")
            continue

    return _no_route_result(started, attempts)


class _HopZeroFailure(Exception):
    """Internal control-flow signal only -- never escapes complete_agent()."""
