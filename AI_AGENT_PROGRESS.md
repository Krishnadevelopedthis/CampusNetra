# CampusNetra AI Agent — Progress

Tracks upgrading `/api/v1/ai/assistant` from a plain-text Q&A endpoint into
a tool-using agent (real data lookups + eventually guided complaint/Lost &
Found creation). Separate initiative from `UX_OVERHAUL_PROGRESS.md` — this
one is backend-only. Same rule: **inspect the actual repo state fresh each
session** (`git fetch && git reset --hard origin/main`) before assuming a
prior session's notes are still accurate — several other tools/sessions
commit to this repo directly.

## Session 1 (this one)

### Done — read-only tool-calling
The assistant can now actually look up real data instead of only answering
from a pre-baked context paragraph, while keeping every existing safety
property (no API key → deterministic fallback; frontend response shape
unchanged, just extended).

**New files:**
- `backend/app/ai/tools.py` — 13 read-only tools (see list below), each a
  thin wrapper around an **existing, already-authorized route handler**
  (`list_issues`, `get_issue`, `list_items`, `get_item`, `list_campuses`,
  `list_buildings`, `list_floors`, `room_assets`, `list_notifications`,
  `dashboard`), called directly as plain async functions rather than
  through the ASGI layer. This means RBAC/org-scoping is 100% inherited
  from the real endpoint — zero duplicated authorization logic, and it
  stays correct if that endpoint's logic ever changes. The one genuinely
  new query is `get_rooms` (no standalone "list rooms for a floor"
  endpoint existed to wrap — added a small org-scoped read of its own).
  Every tool signature is `(db, user, **kwargs)`; **nothing accepts a
  caller-supplied user_id/organization_id/role** — this is the load-bearing
  security property the spec asked for, and it's structural (the LLM
  physically cannot pass those in) rather than a prompt instruction.
- `backend/app/ai/sessions.py` — bounded in-memory conversation store keyed
  by `conversation_id` (already an unused field on `AssistantRequest`
  before this session — now wired up). Isolated per `user_id`; a
  conversation_id from another user, or an expired/unknown one, silently
  starts a fresh session rather than ever handing back someone else's
  history. In-memory, matching the existing single-worker Render
  deployment and the precedent already set by the SMS-Gateway relay's
  `pending_requests` dict — no new infrastructure.
- `backend/tests/test_ai_sessions.py`, `backend/tests/test_ai_tools_registry.py`
  — see Testing section below.

**Modified:**
- `backend/app/ai/client.py` — added `call_agent()`: an OpenAI/OpenRouter
  tool-calling loop (up to 4 tool round-trips per turn, then stops rather
  than looping forever). Existing `call_json`/`call_text` untouched — the
  classifier and anything else using them is unaffected.
- `backend/app/api/v1/ai.py` — `/assistant` now: gets/creates a session,
  calls `call_agent` with the 13 tool schemas when `settings.ai_available`,
  logs full telemetry to `AIInvocation` (latency/tokens/success/fallback —
  the model/table already had all these columns, they just weren't being
  populated), and **only on any failure** (no key, provider error, tool
  loop limit, empty response) falls through to the **exact same
  deterministic keyword-routed reply as before** — that whole branch is
  untouched. Response gained `conversation_id`, `tool_used`, `tools_called`
  — additive fields; `reply`/`confidence`/`sources`/`model` (what
  `AssistantWidget.jsx` actually reads) are unchanged, so the frontend
  needs no changes for this session's work.
- `backend/requirements.txt` — added `pytest`/`pytest-asyncio` (testing
  only, not a runtime dependency — see Testing below, none of the
  application's own code imports them).

**Tools implemented:** `get_my_profile`, `get_my_complaints`, `get_complaint`,
`get_my_lost_found`, `get_lost_found_item`, `search_lost_found`,
`get_campuses`, `get_buildings`, `get_floors`, `get_rooms`, `get_assets`,
`get_notifications`, `get_dashboard_summary`.

### Explicitly NOT done this session — and why
- **`create_complaint`, `update_complaint`, `create_lost_found`** — the
  spec's "conversational form" flow (ask only for missing fields, remember
  what's already given, summarize, require explicit confirmation before
  actually creating anything) is a materially bigger, riskier piece of
  work than the read-only tools: it needs a slot-filling state machine
  living in `Session.pending_action` (the field is already there,
  unused, reserved for exactly this), the *actual* required fields read
  from `Issue`/`LFItem`'s creation schemas (not yet inspected this
  session), and — critically — this cannot be responsibly built and
  called "done" without actually exercising a live multi-turn
  conversation against a real model, which this sandbox can't do (no
  `OPENROUTER_API_KEY` configured here, no live DB). Committing this
  half-verified risked exactly the failure mode the spec explicitly warns
  about: a flow that *claims* a complaint was created when it wasn't.
  Next session should build this deliberately slower: inspect
  `IssueCreate`/`LFItemCreate` (or equivalent) schemas first, design the
  state machine, implement, then this needs to be tested against a real
  OpenRouter key before being trusted.
- **Knowledge-base/documentation grounding** — `AGENT_SYSTEM` (the new
  prompt) has a hand-written summary of how CampusNetra works, but the
  spec's "centralized CampusNetra knowledge source based on the actual
  implementation" (something more systematic — e.g. generated from actual
  route/feature inventory) wasn't built. The hand-written version is a
  reasonable stopgap, not the real thing.
- **RequireManager/RequireStaff-only tools** — all 13 tools work for any
  authenticated user at whatever their own role already permits (a
  student's `get_my_complaints` only ever sees their own; a manager's
  `get_dashboard_summary` gets the manager view) because they inherit
  scoping from the wrapped endpoint. No *admin-only* tool (e.g. a
  hypothetical "merge duplicate complaints" tool) exists yet, so there's
  nothing yet that specifically needs a `RequireManager`/`RequireAdmin`
  gate at the tool-dispatch layer beyond what each wrapped endpoint
  already enforces — worth a specific test once a privileged tool exists.

### Testing
**This repo had zero test infrastructure before this session** — no
`pytest` in `requirements.txt`, no `conftest.py`, no test files anywhere.
Setting up the full stack the spec's 16 scenarios need (async DB test
fixtures — likely a throwaway SQLite or a test Postgres schema, an
authenticated `httpx.AsyncClient` with `CurrentUser`/`DB` dependency
overrides, factory helpers for users/issues/LF items) is itself a
non-trivial, separate task. Rather than skip testing entirely **or**
claim scenarios were tested when they weren't, this session:

- Added `pytest` + `pytest-asyncio` + `backend/pytest.ini`
  (`asyncio_mode = auto`).
- Wrote and **ran** `backend/tests/test_ai_sessions.py` (6 tests) and
  `backend/tests/test_ai_tools_registry.py` (4 tests) — the parts of this
  session's work that genuinely need no database or authenticated
  request: session creation/resumption, **cross-user session isolation**
  (spec's test #15, directly), message-history bounding, stale-session
  eviction, the tool registry/schema consistency, and `run_tool`'s error
  containment (unknown tool name, a raised `ToolError`, an unexpected
  exception — none of them propagate or crash the caller).
- Ran `python -m compileall app` — clean.
- Actually imported every new/changed module (`app.ai.tools`,
  `app.ai.sessions`, `app.ai.client`, `app.api.v1.ai`) and the **full**
  `app.main` FastAPI app via `fastapi.testclient.TestClient`, and confirmed
  `/api/v1/ai/assistant` is correctly registered among all 131 routes in
  the live OpenAPI schema — this catches import-time and router-wiring
  errors that `compileall` alone (syntax-only) would miss.
- Manually verified `call_agent()` degrades to the fallback path cleanly
  with no provider configured (`ok=False, error="ai_unavailable",
  used_fallback=True`) — the core FALLBACK requirement.

**Result: 10/10 written tests pass.** The remaining ~10 of the spec's 16
scenarios (actual complaint/LF creation flows, cross-user *data* access
attempts through a live authenticated request, AI-provider-failure via a
real API call, tool/database-failure against a real DB) need the test
infrastructure described above and are correctly **not** claimed as done.

## How to resume
1. `git fetch origin && git reset --hard origin/main` — don't trust this
   file's "Done" list without re-confirming against the real repo first.
2. Read this file's "Explicitly NOT done" section — that's the actual
   backlog, in priority order.
3. Before building the create_complaint/create_lost_found conversational
   flow: inspect `backend/app/schemas/issues.py` and
   `backend/app/schemas/lostfound.py` for the real required-field list
   (don't guess), and the existing `POST /issues` / `POST /lostfound/items`
   route handlers to reuse their creation logic exactly like the read
   tools reuse the GET handlers.
4. Set up the async-DB + authenticated-TestClient test fixture as its own
   step before attempting the rest of the 16 scenarios — trying to write
   those tests without it will produce tests that don't actually run.
