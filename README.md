# Campus Netra

**AI-assisted campus facility management, with a live digital twin, IoT health monitoring and Lost & Found.**

Report a campus problem with a photo and a location. Campus Netra classifies it, routes it to the right team, opens a work order, and shows the affected equipment changing colour on a live map of the campus until it is fixed.

🌐 **Web:** [campusnetra.dpdns.org](https://campusnetra.dpdns.org) · 📱 **Android:** app available (APK)

---

## Features

| Area | What it does |
| --- | --- |
| **Issue reporting** | Report a problem with photos and an exact location (building, floor, room, equipment). AI suggests the category and priority. |
| **QR reporting** | Every asset can carry a QR sticker. Scanning it opens a report with the location already filled in. |
| **Smart routing** | Issues go to the right department and technician by specialisation and current workload. Likely duplicates are flagged. |
| **Work orders & SLA** | Assignment, progress, parts and costs, verification and closure, each with response and resolution targets. |
| **Digital twin** | A live 3D and floor-plan view of the campus. Equipment turns red, blue, amber, purple or green as its condition changes, in real time. |
| **Event replay** | See how the whole campus looked at any moment in the past. |
| **Inspections** | Checklist-based inspections. A failed critical check raises a complaint automatically. |
| **IoT health monitoring** | Sensor devices report power, fan and light status, temperature and humidity. Confirmed faults schedule an inspection and alert staff. A history chart shows the readings over time. |
| **Lost & Found** | Lost and found reports are matched automatically on photo, description, place, category and time, with a conservative threshold before anyone is notified. |
| **Predictive maintenance** | Ranks equipment by failure risk using an explainable, weighted model. |
| **Analytics & simulation** | Hotspots, repeat failures, team performance, cost, and "what-if" surge simulation. |
| **AI assistant** | Answers questions about the platform and the user's own data, and can file reports on their behalf. |
| **Mobile** | Phone-friendly layout with bottom navigation, plus an Android app. |

---

## How it works

```
 Report (web, app or QR)
        │
        ▼
 AI classification ──► department & technician routing
        │
        ▼
 Work order ──► repair ──► verification ──► closed
        │
        ▼
 Digital twin updates live:  🔴 fault → 🔵 in repair → 🟢 healthy
```

IoT devices feed the same loop:

```
 Sensor reading ──► fault confirmed ──► inspection scheduled ──► technician checks
                                                                    │
                                     no fault ◄─────────────────────┼────► fault confirmed
                                     (back to 🟢)                        complaint + work order
```

A piece of equipment returns to green only when nothing else is still open against it.

---

## Roles

| Role | Typical use |
| --- | --- |
| **Student / Teacher** | Report issues, track complaints, Lost & Found, campus map |
| **Technician** | Work orders, inspections, assets, digital twin |
| **Facility Manager** | Live issues, assignment, analytics, simulation |
| **Administrator** | Users and roles, campus setup, configuration, IoT devices, audit |

Access is permission-based: an administrator decides what each role can see and do.

---

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS, Recharts, Three.js / MapLibre for the 3D and outdoor maps
- **Backend:** Python, FastAPI, async SQLAlchemy, WebSockets
- **Database:** PostgreSQL, plus a time-series store for sensor history
- **IoT:** ESP32 devices over MQTT
- **AI:** language models for classification, matching and the assistant, each with a rule-based fallback, so the platform works without them
- **Mobile:** Capacitor (Android)

---

## Project structure

```
CampusNetra/
├── frontend/   Web app (and the Android project in frontend/android)
├── backend/    API, background jobs and AI services
├── database/   Schema migrations and seed data
├── docs/       Diagrams (DFD, class, sequence, state, use case)
└── scripts/    Development helpers
```

---

## Running locally

**Requirements:** Node.js 20+, Python 3.11+, PostgreSQL 16.

**Backend**

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt     # Windows: .venv\Scripts\pip
cp .env.example .env                          # then fill in your own values
.venv/bin/uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

**Android app** (requires the Android SDK and JDK 21)

```bash
cd frontend
npm run build:app
cd android && ./gradlew assembleDebug
```

> Configuration lives in environment variables (`backend/.env`). Never commit real credentials. `.env.example` lists what is needed, without values.

---

## Security

- Role and permission checks on every request
- Short-lived access tokens with single-use refresh tokens, and one active session per account
- Built-in image captcha, login lockout and rate limiting on code and SMS requests
- AI assistant guarded against revealing credentials or other users' data
- Secrets are supplied through the environment, never stored in the code

---

© Campus Netra. All rights reserved.
