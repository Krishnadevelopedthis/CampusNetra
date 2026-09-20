"""Unit tests for the app/ai/tools.py registry plumbing that don't require a
real database: unknown-tool handling and exception containment in run_tool.
The individual tool functions themselves (get_my_complaints, get_complaint,
...) each need a real async DB session and an authenticated user and are
NOT covered here — see AI_AGENT_PROGRESS.md.
"""
import pytest

from app.ai.tools import TOOL_SCHEMAS, TOOLS, ToolError, run_tool


def test_every_schema_has_a_matching_registered_tool():
    schema_names = {s["function"]["name"] for s in TOOL_SCHEMAS}
    assert schema_names == set(TOOLS.keys())


@pytest.mark.asyncio
async def test_unknown_tool_name_returns_an_error_not_an_exception():
    result = await run_tool("delete_everything", {}, db=None, user=None)

    assert result == {"error": "Unknown tool 'delete_everything'."}


@pytest.mark.asyncio
async def test_tool_error_is_reported_not_raised():
    async def _always_fails(db, user, **kwargs):
        raise ToolError("that reference does not exist")

    TOOLS["_test_fails"] = _always_fails
    try:
        result = await run_tool("_test_fails", {}, db=None, user=None)
    finally:
        del TOOLS["_test_fails"]

    assert result == {"ok": False, "error": "that reference does not exist"}


@pytest.mark.asyncio
async def test_unexpected_exception_is_contained_not_propagated():
    """A bug in a tool must degrade to a message the agent can relay, never
    crash the request — this is what keeps a single bad tool call from
    taking down the whole conversation."""
    async def _boom(db, user, **kwargs):
        raise RuntimeError("boom")

    TOOLS["_test_boom"] = _boom
    try:
        result = await run_tool("_test_boom", {}, db=None, user=None)
    finally:
        del TOOLS["_test_boom"]

    assert result["ok"] is False
    assert "error" in result
