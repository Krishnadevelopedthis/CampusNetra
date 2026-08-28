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

Inspections feed the same loop. A failed **critical** checklist item does not just
lower a score: it raises a routed, high-priority issue and flips the asset to
`fault` on the twin, so a safety finding cannot be filed away and forgotten.
Items marked N/A are excluded from the score rather than counted as failures.

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

### 4. Predictive maintenance
Ranks every asset by near-term failure risk from signals the platform already
records: fault history (35%), age against expected life (20%), service overdue
(20%), mean time between failures (15%) and warranty status (10%).

Deliberately an interpretable weighted model rather than a learned one — a
facility manager has to justify spending money on a machine that currently works,
so every score ships with the signals that produced it. An asset already in
`fault` is damped, because that is a present problem, not a prediction.

A high-risk asset can be turned into a preventive work order in one click, and
the platform refuses to raise a second one while the first is open.

### 5. Scenario simulation
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

83 endpoints. Interactive docs at http://localhost:8000/docs.

| Area | Prefix |
| --- | --- |
| Authentication | `/api/v1/auth` |
| Dashboard | `/api/v1/dashboard` |
| Campus & Digital Twin | `/api/v1/campus` |
| Issues | `/api/v1/issues` |
| Work Orders | `/api/v1/work-orders` |
| Lost & Found | `/api/v1/lost-found` |
| Inspections | `/api/v1/inspections` |
| Notifications | `/api/v1/notifications` |
| AI & Intelligence | `/api/v1/ai` |
| Analytics & Simulation | `/api/v1/analytics` |
| Administration | `/api/v1/admin` |

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

## Who can register

By default **any email address can register**, and the user joins the single
campus in the database. That is the right behaviour for a fresh deployment or a
demo, where requiring institutional email would block you before you start.

Resolution order:

1. **Email domain matches** an organization's `email_domain` — always accepted.
2. **Open registration** — organizations with `settings.allow_open_registration`
   unset or true accept any address. Unambiguous only while exactly one such
   organization exists.
3. **Otherwise refused**, with a message naming what would be accepted.

### Tightening it for production

Once you are running a real campus, restrict signup to institutional email.
Domain matching then means email verification proves *membership*, not merely
that the person owns an inbox:

```sql
UPDATE organizations
   SET email_domain = 'vit.ac.in',
       settings = settings || '{"allow_open_registration": false}'::jsonb
 WHERE name = 'Your College';
```

After that, `21bce1234@vit.ac.in` joins automatically and `someone@gmail.com` is
refused and pointed at the administrator.

Two paths bypass this entirely:

- **Institution signup** creates a new organization; the registrant becomes its
  administrator.
- **Admin provisioning** (Administration > Users > Add user) creates any account
  regardless of domain, and is the only route to technician, manager and admin
  roles.

## Email delivery

Verification codes and password resets are sent over SMTP. Any provider works —
here is Gmail, which needs no signup.

Run the guided setup:

```bash
./scripts/setup_email.py
```

It offers Brevo, Gmail, Outlook or Mailtrap, reads the key with a hidden prompt
so it never reaches your shell history, writes to `backend/.env` (gitignored,
`chmod 600`), verifies the login, and offers to send a test message.

**Brevo** is the path of least resistance — free 300 emails/day, no 2FA
requirement, and better deliverability than personal Gmail SMTP. Sign up at
[brevo.com](https://www.brevo.com), then **SMTP & API → SMTP** for the login and key.

**Gmail** needs 2-Step Verification enabled *first*, then an
[App Password](https://myaccount.google.com/apppasswords). If that page says
"the setting you are looking for is not available", 2SV is off — Google hides
app passwords entirely until it is on.

To re-check an existing configuration, or send another test:

```bash
./scripts/check_email.py you@example.com
```

Both scripts verify connection and login separately from sending, so a wrong
password reports "authentication failed" rather than a generic timeout.

| Provider | Host | Port |
| --- | --- | --- |
| Brevo | `smtp-relay.brevo.com` | 587 |
| Gmail | `smtp.gmail.com` | 587 |
| Outlook | `smtp-mail.outlook.com` | 587 |
| Mailtrap (testing) | `sandbox.smtp.mailtrap.io` | 2525 |

### Without SMTP configured

Signup still works. With no `SMTP_HOST`, the API returns the verification code in
the response and the app displays it on the verification screen, so you are never
stranded at a step you cannot complete.

This is strictly development-only — the code is exposed **only** when the
environment is not production **and** no mail server is configured. Setting
either one closes it off:

| Environment | SMTP | Code exposed |
| --- | --- | --- |
| development | not set | yes |
| development | configured | no |
| production | anything | no |

## Configuration

`backend/.env` — see `.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key — **production refuses to boot on the dev default** |
| `ANTHROPIC_API_KEY` | Blank ⇒ deterministic heuristics; set ⇒ live model calls |
| `SMTP_HOST` | Blank ⇒ codes are shown in-app instead of emailed (dev only) |
| `SMTP_USER` / `SMTP_PASSWORD` | SMTP credentials — Gmail requires an App Password |

---

## Status

Implemented and verified end to end:

- **Authentication** — all roles, OTP verification, password reset, account
  lockout, single-use refresh rotation
- **Digital Twin** — campus hierarchy, SVG floor plans, live WebSocket updates
- **Issues** — AI routing, duplicate detection, full lifecycle, SLA tracking
- **Work orders** — assignment, technician panel, parts requests, board view
- **Inspections** — scheduling, checklist execution, automatic escalation of
  critical failures into routed issues
- **Lost & Found** — AI matching, staff review queue, claim verification
- **Analytics** — hotspots, recurring assets, technician performance, cost
- **Scenario simulation** — surge modelling with capacity and SLA projection
- **Administration** — user and role management, issue configuration, SLA
  policies, audit log, login activity, predictive maintenance forecast

Schema and routes exist but are not yet surfaced in the UI: floor-plan upload and
the room-boundary editor, notification template management, and the 3D campus view.
