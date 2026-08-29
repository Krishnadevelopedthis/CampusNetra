#!/usr/bin/env bash
# Start everything Campus Netra needs, in one command.
#   ./scripts/start.sh          start database + backend + frontend
#   ./scripts/start.sh stop     stop them again
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.logs"
mkdir -p "$LOGS"

# Must match scripts/dev_db.sh.
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
SOCKDIR="/tmp/campusnetra-pg"
PORT=55432
DB_NAME=campusnetra
DB_USER=campusnetra

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
info()  { printf "\033[36m%s\033[0m\n" "$1"; }

stop_all() {
  info "Stopping services…"
  for name in backend frontend; do
    if [ -f "$LOGS/$name.pid" ]; then
      kill "$(cat "$LOGS/$name.pid")" 2>/dev/null || true
      rm -f "$LOGS/$name.pid"
    fi
  done
  # Catch anything started outside this script too.
  pkill -f "uvicorn app.main:app" 2>/dev/null || true
  pkill -f "frontend/node_modules/.bin/vite" 2>/dev/null || true
  bash "$ROOT/scripts/dev_db.sh" stop || true
  green "All stopped."
}

wait_for() {   # wait_for <url> <label> <max_seconds>
  local url="$1" label="$2" max="${3:-40}" i=0
  while [ "$i" -lt "$max" ]; do
    if curl -sf --max-time 2 "$url" >/dev/null 2>&1; then
      green "  $label ready"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  red "  $label did not come up — see $LOGS/"
  return 1
}

if [ "${1:-start}" = "stop" ]; then
  stop_all
  exit 0
fi

# ---------- 1. Database ----------
info "[1/3] Database"
bash "$ROOT/scripts/dev_db.sh" start >/dev/null

# Starting the cluster is not the same as having a schema. On a fresh clone the
# database is empty, and without this the app comes up against zero tables and
# every request fails — so apply migrations and seed when the schema is absent.
TABLES=$(
  "$PG_BIN/psql" -h "$SOCKDIR" -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo 0
)
if [ "${TABLES:-0}" -eq 0 ]; then
  info "  empty database — applying migrations and seed data"
  bash "$ROOT/scripts/dev_db.sh" migrate >/dev/null
  bash "$ROOT/scripts/dev_db.sh" seed >/dev/null
  green "  schema created and seeded"
else
  green "  postgres ready on port 55432 ($TABLES tables)"
fi

# ---------- 2. Backend ----------
info "[2/3] Backend"
if [ ! -d "$ROOT/backend/.venv" ]; then
  info "  first run — creating virtualenv and installing dependencies…"
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q --upgrade pip
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi
[ -f "$ROOT/backend/.env" ] || cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"

pkill -f "uvicorn app.main:app" 2>/dev/null || true
sleep 1
(
  cd "$ROOT/backend"
  nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload \
    > "$LOGS/backend.log" 2>&1 &
  echo $! > "$LOGS/backend.pid"
)
wait_for "http://127.0.0.1:8000/health" "backend  http://localhost:8000/docs"

# ---------- 3. Frontend ----------
info "[3/3] Frontend"
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  info "  first run — installing npm packages…"
  (cd "$ROOT/frontend" && npm install --no-audit --no-fund >/dev/null)
fi

pkill -f "frontend/node_modules/.bin/vite" 2>/dev/null || true
sleep 1
(
  cd "$ROOT/frontend"
  nohup npm run dev > "$LOGS/frontend.log" 2>&1 &
  echo $! > "$LOGS/frontend.pid"
)
wait_for "http://localhost:5173" "frontend http://localhost:5173"

echo
green "Campus Netra is running."
echo "  App        http://localhost:5173"
echo "  API docs   http://localhost:8000/docs"
echo
echo "  Sign in with any of these (password: Campus@2026)"
echo "    student@campus.edu       Student"
echo "    meera.teacher@campus.edu Teacher"
echo "    rahul.elec@campus.edu    Technician"
echo "    facility@campus.edu      Facility Manager"
echo "    admin@campus.edu         Administrator"
echo
echo "  Logs   $LOGS/backend.log, $LOGS/frontend.log"
echo "  Stop   ./scripts/start.sh stop"
