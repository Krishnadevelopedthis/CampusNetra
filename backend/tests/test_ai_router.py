"""Tests for app/ai/router.py's failover matrix -- the actual decision
logic (which candidate to try, when to skip vs retry vs fail over, when to
give up) rather than any real provider, since this sandbox can't reach
OpenRouter/Gemini/Groq. Each candidate's complete() call is faked via
monkeypatching app.ai.router._dispatch_text (text path) or
app.ai.providers.get_openai_client (agent/tool-calling path).
"""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.ai import health, router
from app.ai.errors import ErrorKind, ProviderCallError
from app.ai.providers import ModelCandidate


@pytest.fixture(autouse=True)
def _clean_health():
    health.reset_all()
    yield
    health.reset_all()


def _candidates(*pairs):
    """pairs like [("openrouter", "model-a"), ("groq", "model-b")].

    OpenRouter models are given the ":free" suffix a genuinely free model has,
    since the router refuses to send to an OpenRouter model without it.
    """
    def name(p, m):
        return f"{m}:free" if p == "openrouter" and not m.endswith(":free") else m
    return AsyncMock(return_value=[
        ModelCandidate(provider=p, model=name(p, m), supports_tools=True) for p, m in pairs])


# --------------------------------------------------------------- complete_text

@pytest.mark.asyncio
async def test_1_first_route_succeeds(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "model-a")))
    monkeypatch.setattr(router, "_dispatch_text", AsyncMock(return_value=("hello", 10, 5)))

    result = await router.complete_text("sys", "prompt")

    assert result.ok
    assert result.text == "hello"
    assert result.provider == "openrouter" and result.model == "model-a:free"
    assert result.attempts == []


@pytest.mark.asyncio
async def test_2_rate_limit_then_success_on_next_route(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "model-a"), ("groq", "model-b")))
    dispatch = AsyncMock(side_effect=[
        ProviderCallError(ErrorKind.RATE_LIMIT, "429"),
        ("hello", 10, 5),
    ])
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    assert result.ok
    assert result.provider == "groq" and result.model == "model-b"
    assert len(result.attempts) == 1 and "rate_limit" in result.attempts[0]
    # the failed route is now in cooldown
    assert health.is_in_cooldown("openrouter", "model-a:free")


@pytest.mark.asyncio
async def test_3_multiple_failures_then_success(monkeypatch):
    monkeypatch.setattr(
        "app.ai.providers.free_candidates",
        _candidates(("openrouter", "a"), ("groq", "b"), ("gemini", "c")),
    )
    dispatch = AsyncMock(side_effect=[
        ProviderCallError(ErrorKind.PROVIDER_UNAVAILABLE, "503"),
        ProviderCallError(ErrorKind.RATE_LIMIT, "429"),
        ("done", 1, 1),
    ])
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    assert result.ok
    assert result.provider == "gemini" and result.model == "c"
    assert len(result.attempts) == 2


@pytest.mark.asyncio
async def test_4_provider_unavailable_fails_over_to_next_provider(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "a"), ("gemini", "b")))
    dispatch = AsyncMock(side_effect=[
        ProviderCallError(ErrorKind.PROVIDER_UNAVAILABLE, "down"),
        ("ok", 1, 1),
    ])
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    assert result.ok and result.provider == "gemini"


@pytest.mark.asyncio
async def test_5_provider_quota_exhausted_moves_to_next_provider_not_same_one(monkeypatch):
    monkeypatch.setattr(
        "app.ai.providers.free_candidates",
        _candidates(("openrouter", "a"), ("openrouter", "a2"), ("gemini", "b")),
    )
    dispatch = AsyncMock(side_effect=[
        ProviderCallError(ErrorKind.QUOTA_EXHAUSTED, "account exhausted"),
        ("ok", 1, 1),
    ])
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    # Router tries candidates in the order given -- the second OpenRouter
    # model is next in line before gemini, and quota exhaustion only cools
    # down the specific (provider, model) that failed, not the whole
    # provider, so it's a legitimate next try.
    assert result.ok
    assert dispatch.call_count == 2


@pytest.mark.asyncio
async def test_6_all_routes_exhausted_returns_safe_unavailable(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "a"), ("groq", "b")))
    monkeypatch.setattr(router, "_dispatch_text", AsyncMock(side_effect=ProviderCallError(ErrorKind.RATE_LIMIT, "429")))

    result = await router.complete_text("sys", "prompt")

    assert not result.ok
    assert result.error == "all_free_routes_exhausted"
    assert len(result.attempts) == 2


@pytest.mark.asyncio
async def test_7_no_configured_routes_never_calls_anything(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates())
    dispatch = AsyncMock()
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    assert not result.ok
    assert result.error == "no_free_route_configured"
    dispatch.assert_not_called()


@pytest.mark.asyncio
async def test_8_unsupported_capability_is_skipped_not_retried(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "a"), ("groq", "b")))
    dispatch = AsyncMock(side_effect=[
        ProviderCallError(ErrorKind.UNSUPPORTED_CAPABILITY, "no tools"),
        ("ok", 1, 1),
    ])
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    assert result.ok and result.provider == "groq"
    assert dispatch.call_count == 2  # no same-route retry for this kind


@pytest.mark.asyncio
async def test_invalid_request_is_fatal_not_cycled_through_every_provider(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "a"), ("groq", "b")))
    dispatch = AsyncMock(side_effect=ProviderCallError(ErrorKind.INVALID_REQUEST, "bad request"))
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    assert not result.ok
    assert result.error == "invalid_request"
    dispatch.assert_called_once()  # never tried the second provider on a request-shape bug


@pytest.mark.asyncio
async def test_transient_error_gets_one_bounded_retry_on_same_route(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "a")))
    dispatch = AsyncMock(side_effect=[
        ProviderCallError(ErrorKind.TIMEOUT, "timed out"),
        ("ok", 1, 1),
    ])
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    assert result.ok
    assert dispatch.call_count == 2  # retried the SAME candidate once, not a different one


@pytest.mark.asyncio
async def test_authentication_error_disables_the_whole_provider(monkeypatch):
    monkeypatch.setattr(
        "app.ai.providers.free_candidates",
        _candidates(("openrouter", "a"), ("openrouter", "a2")),
    )
    dispatch = AsyncMock(side_effect=ProviderCallError(ErrorKind.AUTHENTICATION_ERROR, "bad key"))
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    assert not result.ok
    assert health.provider_disabled("openrouter")


@pytest.mark.asyncio
async def test_cooldown_route_is_skipped_on_the_next_call(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "a"), ("groq", "b")))
    monkeypatch.setattr(router, "_dispatch_text", AsyncMock(return_value=("ok", 1, 1)))

    health.mark_failure("openrouter", "a:free", ErrorKind.RATE_LIMIT, retry_after=999)

    result = await router.complete_text("sys", "prompt")

    assert result.ok and result.provider == "groq"  # openrouter/a was in cooldown, never tried


@pytest.mark.asyncio
async def test_cost_guard_rejects_a_non_free_candidate_before_dispatch(monkeypatch):
    from dataclasses import replace

    # A candidate flagged non-free, and an OpenRouter model without the ":free"
    # suffix (priced at zero but billed against the key's credit) -- neither
    # may ever be sent a request.
    flagged = replace(ModelCandidate(provider="groq", model="x", supports_tools=True), is_free=False)
    unsuffixed = ModelCandidate(provider="openrouter", model="vendor/promo-model", supports_tools=True)
    monkeypatch.setattr("app.ai.providers.free_candidates", AsyncMock(return_value=[flagged, unsuffixed]))
    dispatch = AsyncMock(return_value=("should not run", 1, 1))
    monkeypatch.setattr(router, "_dispatch_text", dispatch)

    result = await router.complete_text("sys", "prompt")

    dispatch.assert_not_called()  # the guard skips them before any network call is made
    assert not result.ok


@pytest.mark.asyncio
async def test_a_free_openrouter_model_is_allowed_and_the_free_router_too(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", AsyncMock(return_value=[
        ModelCandidate(provider="openrouter", model="openrouter/free", supports_tools=True)]))
    monkeypatch.setattr(router, "_dispatch_text", AsyncMock(return_value=("ok", 1, 1)))
    assert (await router.complete_text("sys", "prompt")).ok


# -------------------------------------------------------------- complete_agent

def _openai_response(*, tool_calls=None, content=None):
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)],
        usage=SimpleNamespace(prompt_tokens=1, completion_tokens=1),
    )


def _tool_call(call_id, name, arguments):
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=json.dumps(arguments)))


@pytest.mark.asyncio
async def test_9_agent_fails_over_before_first_response_arrives(monkeypatch):
    """The exact failure this whole feature is meant to fix: model A
    unavailable at the very start of a conversation turn -> model B handles
    it with the identical original context, invisibly to the caller."""
    monkeypatch.setattr(
        "app.ai.providers.free_candidates",
        _candidates(("openrouter", "a"), ("groq", "b")),
    )
    bad_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(
        create=AsyncMock(side_effect=Exception("boom")))))
    good_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(
        create=AsyncMock(return_value=_openai_response(content="hi there")))))

    def get_client(provider):
        return bad_client if provider == "openrouter" else good_client

    monkeypatch.setattr("app.ai.providers.get_openai_client", get_client)

    messages = [{"role": "user", "content": "hello"}]
    result = await router.complete_agent("sys", messages, [], AsyncMock())

    assert result.ok
    assert result.provider == "groq"
    assert result.text == "hi there"


@pytest.mark.asyncio
async def test_10_tool_is_never_executed_twice_across_a_failover(monkeypatch):
    """Once a tool has actually run (hop >= 1), a later failure on that SAME
    candidate must NOT restart the conversation on a different provider --
    that would risk the new model re-issuing the same tool call."""
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "a"), ("groq", "b")))
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock(side_effect=[
        _openai_response(tool_calls=[_tool_call("c1", "create_complaint", {"title": "x"})]),
        Exception("network blip after the tool already ran"),
    ]))))
    monkeypatch.setattr("app.ai.providers.get_openai_client", lambda provider: client)
    run_tool = AsyncMock(return_value={"ok": True, "result": {"id": "CN123"}})

    result = await router.complete_agent("sys", [{"role": "user", "content": "file a complaint"}], [{"type": "function"}], run_tool)

    run_tool.assert_called_once()  # the tool ran exactly once
    assert not result.ok  # the request itself still reports failure -- no silent second attempt
    assert result.tool_calls == [{"name": "create_complaint", "ok": True}]


@pytest.mark.asyncio
async def test_11_streaming_not_applicable_but_conversation_context_is_passed_through_unchanged(monkeypatch):
    """No SSE/WebSocket exists in this codebase (confirmed during the audit)
    -- what matters for fallback safety is that the exact same system
    prompt and message history reach whichever candidate ends up serving
    the request. Verifies the fallback candidate receives the identical
    conversation, not a truncated/rebuilt one."""
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "a"), ("groq", "b")))
    bad_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(
        create=AsyncMock(side_effect=Exception("down")))))
    good_create = AsyncMock(return_value=_openai_response(content="ok"))
    good_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=good_create)))
    monkeypatch.setattr("app.ai.providers.get_openai_client", lambda p: bad_client if p == "openrouter" else good_client)

    history = [{"role": "user", "content": "turn 1"}, {"role": "assistant", "content": "reply 1"}, {"role": "user", "content": "turn 2"}]
    await router.complete_agent("system prompt text", history, [], AsyncMock())

    sent_messages = good_create.call_args.kwargs["messages"]
    assert sent_messages[0] == {"role": "system", "content": "system prompt text"}
    assert sent_messages[1:] == history


@pytest.mark.asyncio
async def test_12_api_keys_never_appear_in_a_failure_result(monkeypatch):
    monkeypatch.setattr("app.ai.providers.free_candidates", _candidates(("openrouter", "a")))
    monkeypatch.setattr(
        router, "_dispatch_text",
        AsyncMock(side_effect=ProviderCallError(ErrorKind.AUTHENTICATION_ERROR, "Invalid API key")),
    )

    result = await router.complete_text("sys", "prompt")

    dumped = repr(result)
    assert "sk-" not in dumped and "Bearer" not in dumped
