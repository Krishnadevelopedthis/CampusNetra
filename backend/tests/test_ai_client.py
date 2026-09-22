"""Tests for app/ai/client.py's call_agent tool-tracking behaviour.

Mocks the OpenAI-SDK-shaped response objects directly (SimpleNamespace,
matching the exact attributes client.py reads: .choices[0].message.
tool_calls, .function.name/.arguments, .usage.prompt_tokens/
completion_tokens) rather than the real OpenRouter API, which this
sandbox can't reach — see AI_AGENT_PROGRESS.md for that limitation. What
this proves is real: that a tool call's success/failure (run_tool's own
"ok" field) survives all the way out to AIResult.data["tool_calls"]
instead of being discarded down to a bare name, which is the exact gap
Session 6 found and fixed.
"""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.ai.client import call_agent


def _tool_call(call_id, name, arguments):
    return SimpleNamespace(
        id=call_id, function=SimpleNamespace(name=name, arguments=json.dumps(arguments)))


def _response(*, tool_calls=None, content=None):
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)],
        usage=SimpleNamespace(prompt_tokens=42, completion_tokens=7),
        model="test-model",
    )


@pytest.fixture
def fake_client(monkeypatch):
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock())))
    monkeypatch.setattr("app.ai.client._get_client", lambda: client)
    monkeypatch.setattr("app.core.config.settings.AI_PROVIDER", "openrouter")
    monkeypatch.setattr("app.core.config.settings.AI_MODEL", "test-model")
    return client


@pytest.mark.asyncio
async def test_successful_tool_call_is_tracked_with_ok_true(fake_client):
    fake_client.chat.completions.create.side_effect = [
        _response(tool_calls=[_tool_call("c1", "get_my_profile", {})]),
        _response(content="Here's your profile."),
    ]
    run_tool = AsyncMock(return_value={"ok": True, "result": {"name": "Test User"}})

    result = await call_agent("system prompt", [], [], run_tool)

    assert result.ok
    assert result.data["tool_calls"] == [{"name": "get_my_profile", "ok": True}]


@pytest.mark.asyncio
async def test_failed_tool_call_is_tracked_with_ok_false_not_silently_true(fake_client):
    """The exact regression this session fixed: a tool that fails inside an
    otherwise-successful AI reply must show ok:false for that tool, not
    disappear into a bare name that looks identical to a success."""
    fake_client.chat.completions.create.side_effect = [
        _response(tool_calls=[_tool_call("c1", "create_complaint", {"title": "x"})]),
        _response(content="I couldn't create that complaint."),
    ]
    run_tool = AsyncMock(return_value={"ok": False, "error": "That request could not be completed."})

    result = await call_agent("system prompt", [], [], run_tool)

    assert result.ok  # the AI call itself succeeded — it replied coherently
    assert result.data["tool_calls"] == [{"name": "create_complaint", "ok": False}]


@pytest.mark.asyncio
async def test_multiple_tool_calls_in_one_turn_are_each_tracked_independently(fake_client):
    fake_client.chat.completions.create.side_effect = [
        _response(tool_calls=[
            _tool_call("c1", "get_campuses", {}),
            _tool_call("c2", "create_complaint", {"title": "x"}),
        ]),
        _response(content="Done."),
    ]
    run_tool = AsyncMock(side_effect=[
        {"ok": True, "result": []},
        {"ok": False, "error": "failed"},
    ])

    result = await call_agent("system prompt", [], [], run_tool)

    assert result.data["tool_calls"] == [
        {"name": "get_campuses", "ok": True},
        {"name": "create_complaint", "ok": False},
    ]


@pytest.mark.asyncio
async def test_no_tool_calls_means_an_empty_list_not_an_error(fake_client):
    fake_client.chat.completions.create.side_effect = [
        _response(content="CampusNetra is a facility management platform."),
    ]
    run_tool = AsyncMock()

    result = await call_agent("system prompt", [], [], run_tool)

    assert result.ok
    assert result.data["tool_calls"] == []
    run_tool.assert_not_called()
