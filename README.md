# Campus Netra

AI-powered campus facility management and Lost & Found.

Report a campus problem with a photo and a location. Campus Netra classifies it,
routes it to the right department, opens a work order, and turns the marker red on
a live floor plan until it's fixed. Separately, lost and found reports are matched
against each other automatically across image, description, location, category and time.

---

## What's in the box

```
Campus Netra/
├── frontend/     React 18 + Vite + Tailwind + Recharts
├── backend/      Python FastAPI + SQLAlchemy (async) + WebSockets
├── database/     PostgreSQL schema, migrations and seed data
└── scripts/      Local development helpers
```

---

## Quick start

Three commands, in three terminals.

**1 — Database** (creates a project-local Postgres cluster on port 55432; it never
touches a system-wide Postgres):

```bash
./scripts/dev_db.sh reset
```

**2 — Backend** (http://localhost:8000, API docs at `/docs`):

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cp .env.example .env && .venv/bin/uvicorn app.main:app --reload
```

**3 — Frontend** (http://localhost:5173):

```bash
cd frontend && npm install && npm run dev
```

### Demo accounts

Every seeded account uses the password `Campus@2026`.

| Role | Email |
| --- | --- |
| Student | `student@campus.edu` |
| Teacher | `meera.teacher@campus.edu` |
| Technician (AV) | `deepak.av@campus.edu` |
| Technician (Electrical) | `rahul.elec@campus.edu` |
| Facility Manager | `facility@campus.edu` |
| Administrator | `admin@campus.edu` |

---

## The core loop

A complaint is not just a ticket — it is anchored to a physical thing.

```
Complaint
├── Room  = A-101
├── Asset = P-101
└── Coordinates (normalised on the floor plan)
        │
        ▼
   DIGITAL TWIN
        │
        ▼
   🔴 P-101 turns red
```

As the work progresses, the marker follows automatically:

| Issue status | Asset state | Marker |
| --- | --- | --- |
| Reported / Triaged / Assigned | `fault` | 🔴 red |
| In Progress | `under_maintenance` | 🔵 blue |
| On Hold | `warning` | 🟡 amber |
| Resolved / Verified / Closed | `healthy` | 🟢 green |
| Inspection due | `inspection_required` | 🟣 purple |

Changes are pushed to every open floor plan over a WebSocket, so the map updates
without a refresh.

> An asset only returns to green once **no other open issue** references it —
> closing one of two faults on the same projector must not clear the marker.

---

## AI features

Every AI feature has a deterministic fallback, so **the platform is fully functional
with no API key configured**. Set `ANTHROPIC_API_KEY` in `backend/.env` to switch
from heuristics to live model calls; the API shape is identical either way and
`/health` reports which mode is active.

### 1. Issue classification
Free text (and optionally a photo) → category, department, priority.
Urgency markers escalate independently of category: *"socket is sparking and there's
a burning smell"* is `critical` regardless of which team owns sockets.

### 2. Duplicate detection
Combines text similarity, spatial proximity and a **temporal gate**.

Time is deliberately a multiplier rather than another weighted term. Two identical
reports on the same asset three weeks apart describe a *recurring* problem — the
first was fixed and it broke again — which is a new complaint, not a duplicate.
A weighted term merely nudges that case; a gate collapses it.

| Scenario | Score | Verdict |
| --- | --- | --- |
| Same asset, reworded, 2h apart | 0.81 | likely duplicate |
| Different asset, same room, near-identical text | 0.43 | not a duplicate |
| Same asset and text, 20 days later | 0.30 | not a duplicate (recurring) |

### 3. Lost & Found matching
Five signals, surfaced as the bars on the match panel: image similarity,
description match, location proximity, category and time window.

Two of them are hard vetoes rather than low scores:
- an item **found before it was reported lost** scores exactly `0.0`
- a category mismatch (a phone against a backpack) is damped to near zero

Only matches at or above 80% notify both parties; the rest go to a staff review queue.
A wrong match hands someone else's property to the wrong person, so the matcher is
deliberately conservative.

### 4. Scenario simulation
Fans *N* hypothetical complaints through classification → department routing →
technician capacity → SLA projection, without writing anything to the live tables.

The category mix is drawn from real history with **additive (Laplace) smoothing**.
A raw `seen/total` ratio is unusable on a young deployment: one past complaint would
send 100% of a simulated surge to a single department — exactly the wrong answer at
the moment the tool is most likely to be demonstrated.

---

## Architecture

```
        FRONTEND                         BACKEND
   React + Vite + Tailwind          Python FastAPI
   SVG Digital Twin                 REST + WebSockets
   Recharts analytics               Async SQLAlchemy
            │                               │
            └───────────────┬───────────────┘
                            │
                       PostgreSQL 16
       assets · rooms · floor plans · work orders
       complaints · inspections · lost & found
                            │
                       AI SERVICES
       classification · duplicate detection
       L&F matching · campus assistant
                            │
                    DIGITAL TWIN ENGINE
       live state · event replay · scenario simulation
```

### Notable design decisions

**Event-sourced twin.** Every state change writes to `twin_events` and
`asset_state_history`. `GET /campus/campuses/{id}/state-at?at=…` replays that history
to reconstruct the exact campus state at any past instant, rather than approximating
from current rows.

**Normalised geometry.** Room polygons and asset positions are stored as `0..1`
coordinates, so a floor plan renders correctly at any viewport size without
re-fetching or rescaling.

**Simulation isolation.** Simulated events carry a `simulation_id` and are excluded
from the live map and from every analytics query, so a scenario run can never
pollute real reporting.

**Single-use refresh tokens.** Presenting a refresh token revokes it and issues a new
pair; replaying an old one fails. Password changes revoke every session.

**One reference counter per tenant.** `next_reference()` is an atomic upsert, so
`CMP-1042` is gap-free and per-organization rather than a shared global sequence.

---

## API

58 endpoints. Interactive docs at http://localhost:8000/docs.

| Area | Prefix |
| --- | --- |
| Authentication | `/api/v1/auth` |
| Dashboard | `/api/v1/dashboard` |
| Campus & Digital Twin | `/api/v1/campus` |
| Issues | `/api/v1/issues` |
| Work Orders | `/api/v1/work-orders` |
| Lost & Found | `/api/v1/lost-found` |
| Notifications | `/api/v1/notifications` |
| AI & Intelligence | `/api/v1/ai` |
| Analytics & Simulation | `/api/v1/analytics` |

Live twin socket: `ws://localhost:8000/api/v1/campus/ws/{campus_id}`

---

## Design system

Implemented from the CampusCare AI Kinetic System spec.

| Token | Value |
| --- | --- |
| Primary | `#1e1b4b` deep professional indigo |
| Secondary / AI | `#3b82f6` |
| Typeface | Geist / Geist Mono |
| Radii | 4px structural, 8px buttons, pill for status |
| Elevation | L1 borders only · L2 hover shadow · L3 overlays |
| Grid | 280px fixed sidebar, 32px desktop margin, 4px baseline |

Semantic colour is reserved strictly for status. Widgets are defined by a 1px
`#e2e8f0` border and carry no shadow; shadow denotes interactivity, not decoration.

---

## Branding

The logo is a **placeholder**. To drop in the real Campus Netra mark:

1. Save the artwork as `frontend/public/logo.svg`
2. In `frontend/src/components/Logo.jsx`, replace the inline `<svg>` inside
   `LogoMark` with:
   ```jsx
   <img src="/logo.svg" alt="Campus Netra" className="w-full h-full object-contain" />
   ```

Sizing, the wordmark and the tagline all stay as they are.

---

## Configuration

`backend/.env` — see `.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key — **production refuses to boot on the dev default** |
| `ANTHROPIC_API_KEY` | Blank ⇒ deterministic heuristics; set ⇒ live model calls |
| `SMTP_HOST` | Blank ⇒ OTP emails print to the console |

---

## Status

Implemented and verified end to end: authentication (all roles, OTP, reset,
lockout, token rotation), the campus hierarchy and live Digital Twin, complaint
intake with AI routing and duplicate detection, work orders with SLA tracking and
the technician panel, Lost & Found with AI matching and claim verification,
dashboards, analytics and scenario simulation.

Scaffolded with routes and schema in place, not yet surfaced in the UI:
inspection execution screens, the full admin configuration panels, and predictive
maintenance scheduling.
