# Campus Netra — Backend

Python 3.11+ · FastAPI · SQLAlchemy 2 (async) · PostgreSQL · WebSockets

## Run

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload
```

Docs at http://localhost:8000/docs · health at `/health`.

## Layout

```
app/
├── main.py            FastAPI app, CORS, error shaping, /health
├── core/
│   ├── config.py      Settings; refuses to boot production on the dev SECRET_KEY
│   ├── database.py    Async engine, request-scoped session
│   ├── security.py    bcrypt hashing, JWT issue/verify, OTP
│   └── enums.py       Enum mirrors + the issue/work-order state machines
├── models/            SQLAlchemy models, one module per domain
├── schemas/           Pydantic request/response bodies
├── services/          Domain logic (issues, work orders, twin, L&F, notifications)
├── ai/                Classification, duplicates, L&F matching — each with a fallback
└── api/v1/            Route modules
```

## Design notes

**State machines live in `core/enums.py`.** `ISSUE_TRANSITIONS` and
`WORK_ORDER_TRANSITIONS` are the single definition of what moves are legal; routes
reject anything else with a 409 that names the allowed targets.

**Views are separate from routes.** `services/issue_views.py` batch-loads every
related label in one query per table, so the list endpoint does not degrade into
N+1 as issue volume grows.

**Serialising after a mutation.** Postgres triggers maintain `updated_at`, so a
flushed object has expired attributes. Touching one during serialisation would
attempt lazy IO outside the async context and raise `MissingGreenlet`. Routes call
`issue_views.reload_issue()` after mutating rather than serialising the stale object.

**AI never hard-fails.** `ai/client.py` returns `AIResult(data=None)` on any error,
and every caller has a deterministic path. With no API key the platform still
classifies, deduplicates and matches — it simply reports `heuristic-v1` as the model.

## Tests

Domain logic is verifiable without a server:

```bash
.venv/bin/python -c "
from app.ai.classifier import classify_heuristic
from app.ai.duplicates import find_duplicates
from app.ai.matching import rank_matches
print('AI modules import cleanly')"
```
