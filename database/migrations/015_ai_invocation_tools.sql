-- ============================================================
-- Campus Netra — Migration 015: AI invocation tool telemetry
--
-- ai_invocations tracked whether the AI CALL as a whole succeeded, but not
-- whether any TOOL it called along the way succeeded — those two things
-- were computed separately (run_tool's own "ok" field) and the tool-level
-- result was discarded before ever reaching this table. A create_complaint
-- that silently failed inside an otherwise-successful AI reply was
-- invisible to telemetry. `tools` is a JSONB list of
-- {"name": "create_complaint", "ok": true} entries, one per tool call made
-- during that invocation — NULL for invocations that called no tools
-- (a plain informational question) or ran through the deterministic
-- fallback instead of the AI agent loop.
-- ============================================================

ALTER TABLE ai_invocations
    ADD COLUMN tools JSONB NULL;
