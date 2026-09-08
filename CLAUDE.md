# Campus Netra - AI-Powered Campus Facility Management

## Project Overview
Campus Netra is a full-stack campus facility management and Lost & Found platform with:
- **Frontend**: React 18 + Vite + Tailwind + Recharts
- **Backend**: Python FastAPI + SQLAlchemy (async) + WebSockets
- **Database**: PostgreSQL 16 with schema, migrations, seed data
- **AI**: Anthropic Claude integration (with deterministic fallback when no API key)

## Key Features
1. **Issue Reporting** - Photo + location → AI classification → department routing → work order
2. **Digital Twin** - Live SVG floor plans with asset markers (🔴🔵🟡🟢🟣) updated via WebSocket
3. **Lost & Found** - AI matching across image, description, location, category, time
4. **Predictive Maintenance** - Weighted risk scoring from fault history, age, service overdue, MTBF, warranty
5. **Scenario Simulation** - Surge modeling with capacity/SLA projections
6. **Inspections** - Checklist execution with critical failure auto-escalation

## Architecture
```
Frontend (React + Vite + Tailwind)     Backend (Python FastAPI)
SVG Digital Twin                        REST + WebSockets
Recharts analytics                      Async SQLAlchemy
                    │                          │
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

## Development Setup

### Quick Start (3 terminals)
```bash
# 1 — Database (local Postgres on port 55432)
./scripts/dev_db.sh reset

# 2 — Backend (http://localhost:8000, docs at /docs)
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cp .env.example .env && .venv/bin/uvicorn app.main:app --reload

# 3 — Frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

### Demo Accounts (password: `Campus@2026`)
| Role | Email |
|------|-------|
| Student | student@campus.edu |
| Teacher | meera.teacher@campus.edu |
| Technician (AV) | deepak.av@campus.edu |
| Technician (Electrical) | rahul.elec@campus.edu |
| Facility Manager | facility@campus.edu |
| Administrator | admin@campus.edu |

## Configuration

### Backend `.env` (see `.env.example`)
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing (production refuses dev default) |
| `ANTHROPIC_API_KEY` | Blank → heuristics; set → live AI |
| `SMTP_HOST` | Blank → OTP prints to console |

### Environment Detection
- `ENVIRONMENT=development` enables dev features (exposed OTP codes, etc.)
- Production requires custom `SECRET_KEY`

## Design System (CampusCare AI Kinetic System)
| Token | Value |
|-------|-------|
| Primary | `#1e1b4b` (deep professional indigo) |
| Secondary/AI | `#3b82f6` |
| Typeface | Geist / Geist Mono |
| Radii | 4px structural, 8px buttons, pill for status |
| Elevation | L1 borders only · L2 hover shadow · L3 overlays |
| Grid | 280px fixed sidebar, 32px desktop margin, 4px baseline |

Semantic color reserved strictly for status. Widgets: 1px `#e2e8f0` border, no shadow. Shadow = interactivity.

## Digital Twin State Machine
| Issue Status | Asset State | Marker |
|--------------|-------------|--------|
| Reported/Triaged/Assigned | `fault` | 🔴 red |
| In Progress | `under_maintenance` | 🔵 blue |
| On Hold | `warning` | 🟡 amber |
| Resolved/Verified/Closed | `healthy` | 🟢 green |
| Inspection due | `inspection_required` | 🟣 purple |

> Asset only returns to green once **no other open issue** references it.

## AI Features (deterministic fallback when no key)
1. **Classification** - Free text + photo → category, department, priority
2. **Duplicate Detection** - Text similarity + spatial proximity + temporal gate (not weighted term)
3. **Lost & Found Matching** - 5 signals; hard vetoes: found before lost = 0.0, category mismatch → near zero
4. **Predictive Maintenance** - Interpretable weights: fault history 35%, age 20%, service overdue 20%, MTBF 15%, warranty 10%
5. **Scenario Simulation** - N hypothetical complaints with Laplace smoothing

## API Endpoints (83 total)
| Area | Prefix |
|------|--------|
| Auth | `/api/v1/auth` |
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

WebSocket: `ws://localhost:8000/api/v1/campus/ws/{campus_id}`

## Key Implementation Details

### Event-Sourced Twin
- Every state change → `twin_events` + `asset_state_history`
- `GET /campus/campuses/{id}/state-at?at=…` replays history to reconstruct exact state

### Normalized Geometry
- Room polygons & asset positions stored as 0..1 coordinates
- Renders correctly at any viewport without refetch/rescale

### Simulation Isolation
- Simulated events carry `simulation_id`
- Excluded from live map & analytics queries

### Auth
- Single-use refresh tokens (presenting one revokes it, issues new pair)
- Password changes revoke all sessions
- Per-tenant reference counter (`next_reference()` = atomic upsert)

## Frontend Structure
```
src/
├── App.jsx                    # Routes, auth guards, lazy-loaded pages
├── components/                # Reusable UI components
│   ├── ui/                   # Base components (Button, Input, Modal, etc.)
│   └── ...
├── features/                 # Feature-specific components
├── hooks/                    # Custom React hooks
├── layouts/                  # AppLayout, AdminLayout
├── lib/                      # Utilities (auth, api client, helpers)
├── pages/                    # Page components (lazy-loaded)
│   ├── admin/               # Admin pages
│   └── errors/              # 403, 404, 500
└── styles/                   # Global styles, Tailwind
```

### Auth Guards
- `RequireAuth` - requires login + optional role check
- `PublicOnly` - redirects logged-in users away
- Role constants: `STAFF`, `MANAGER`, `ADMIN`

## Backend Structure
```
app/
├── main.py                   # FastAPI entrypoint, lifespan, exception handlers
├── core/                     # Config, database, security
├── api/v1/                   # API routes
├── models/                   # SQLAlchemy models
├── schemas/                  # Pydantic schemas
├── services/                 # Business logic (sla, ai, etc.)
└── ws/                       # WebSocket handlers
```

## Database
- `database/migrations/` - Alembic migrations
- `database/seeds/` - Seed data for demo accounts
- `database/docs/SCHEMA.md` - Schema documentation

## Notable Design Decisions
1. **Temporal gate** for duplicates: same asset + text after 20 days = recurring (new complaint), not duplicate
2. **Laplace smoothing** in simulation: prevents single historical complaint from dominating
3. **Conservative L&F matching**: only ≥80% notifies both parties; wrong match = wrong person gets property
4. **Asset fault damping**: asset in `fault` state damped in predictive maintenance (present problem, not prediction)
5. **Email provider priority**: Resend API → Brevo API → SMTP → none

## Testing Health
```bash
# Backend health
curl http://localhost:8000/health
# Returns: status, database, ai mode, email provider, environment, version
```

## Logo Replacement
1. Save artwork as `frontend/public/logo.svg`
2. In `frontend/src/components/Logo.jsx`, replace inline `<svg>` in `LogoMark` with:
```jsx
<img src="/logo.svg" alt="Campus Netra" className="w-full h-full object-contain" />
```

## Status (Implemented & Verified)
- ✅ Authentication (all roles, OTP, password reset, lockout, refresh rotation)
- ✅ Digital Twin (hierarchy, SVG floor plans, live WebSocket)
- ✅ Issues (AI routing, duplicate detection, lifecycle, SLA)
- ✅ Work Orders (assignment, technician panel, parts, board view)
- ✅ Inspections (scheduling, checklist, critical failure escalation)
- ✅ Lost & Found (AI matching, staff review, claim verification)
- ✅ Analytics (hotspots, recurring assets, performance, cost)
- ✅ Scenario Simulation (surge modeling, capacity, SLA projection)
- ✅ Admin (users, roles, issue config, SLA policies, audit log, predictive maintenance)

Not yet in UI: floor-plan upload/editor, notification templates, 3D campus view

## Development Notes
- Backend uses `python3 -m uvicorn app.main:app --reload` from `backend/` directory
- Frontend uses `npm run dev` from `frontend/` directory  
- Database runs on port 55432 (local cluster, not system Postgres)
- CORS origins configured in `BACKEND_CORS_ORIGINS`
- Upload directory: `backend/uploads/` (mounted at `/media` when local storage)