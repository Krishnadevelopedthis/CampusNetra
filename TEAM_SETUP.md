# Campus Netra — Setup for the team

Everything runs locally. One command does the whole setup.

## Requirements

macOS or Linux, with:

| | Check | Install |
| --- | --- | --- |
| Python 3.11+ | `python3 --version` | [python.org](https://www.python.org/downloads/) |
| Node 18+ | `node --version` | `brew install node` |
| PostgreSQL 16 | `psql --version` | `brew install postgresql@16` |

On Windows, use WSL2 — the scripts are bash.

## Run it

```bash
cd "Campus Netra"
./scripts/start.sh
```

First run takes a few minutes: it creates a Python virtualenv, installs backend
dependencies, installs npm packages, initialises a PostgreSQL cluster on port
55432, applies migrations and seeds demo data. After that it starts in seconds.

Then open **http://localhost:5173**

To stop:

```bash
./scripts/start.sh stop
```

## Sign in

Password for every demo account is `Campus@2026`.

| Role | Email | What you see |
| --- | --- | --- |
| Student | `student@campus.edu` | Report issues, track them, Lost & Found |
| Teacher | `meera.teacher@campus.edu` | Same as student |
| Technician | `rahul.elec@campus.edu` | Assigned work orders, inspections |
| Facility Manager | `facility@campus.edu` | Digital twin, analytics, simulation |
| Administrator | `admin@campus.edu` | Everything, plus user and SLA config |

You can also register a new account — any email address works. With no mail
server configured the verification code is shown on screen instead of emailed.

## Worth trying

1. **Report an issue** as a student — pick Bldg A / Floor 1 / Class 101, describe
   a broken fan. Watch the AI classify and route it before you submit.
2. **Open the Digital Twin** — the asset you reported against has turned red.
3. **Sign in as the facility manager** and move the issue through
   Assigned → In Progress → Resolved. The twin marker follows: red → blue → green.
4. **Lost & Found** — report a lost item, then a matching found item, and see the
   five-factor AI match analysis.
5. **Analytics → Simulation** — ask what happens if 30 complaints arrive at once.

## Sharing one database across machines

By default each person gets their own local database, so data is not shared.
To point everyone at one database instead:

1. Create a PostgreSQL database somewhere reachable — [Neon](https://neon.tech),
   [Supabase](https://supabase.com) and [Railway](https://railway.app) all have
   free tiers.

2. Apply the schema and seed data to it once:

   ```bash
   for f in database/migrations/*.sql; do psql "<connection-string>" -f "$f"; done
   for f in database/seeds/*.sql;      do psql "<connection-string>" -f "$f"; done
   ```

3. Each person edits `backend/.env`:

   ```
   DATABASE_URL=postgresql+asyncpg://user:password@host/dbname
   ```

   Note `postgresql+asyncpg://`, not plain `postgresql://` — the backend uses an
   async driver.

4. Everyone runs `./scripts/start.sh` as normal. It will still start the local
   cluster, which is harmless; the backend uses whatever `DATABASE_URL` points at.

Live Digital Twin updates are pushed in-process, so with a shared database each
person sees changes on refresh rather than instantly. Making that instant across
machines needs one shared backend rather than one each.

## Email (optional)

Verification codes appear on screen without it. For real emails:

```bash
./scripts/setup_email.py
```

Pick Brevo (free, 300/day). Note that Brevo blocks unlisted IP addresses, so each
person's IP needs adding under SMTP & API in the Brevo dashboard.

## If something goes wrong

```bash
./scripts/start.sh stop
./scripts/dev_db.sh reset     # rebuild the database from scratch
./scripts/start.sh
```

Logs are in `.logs/backend.log` and `.logs/frontend.log`.

**Port already in use** — something else is on 5173, 8000 or 55432. Stop it, or
change the port in `frontend/vite.config.js`.

**`psql: command not found`** — PostgreSQL is installed but not on PATH:

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

## What's in the box

```
frontend/   React 18 + Vite + Tailwind
backend/    FastAPI + async SQLAlchemy + WebSockets
database/   PostgreSQL schema (49 tables), migrations, seed data
scripts/    start.sh, dev_db.sh, setup_email.py, check_email.py
```

README.md has the architecture and design notes.
