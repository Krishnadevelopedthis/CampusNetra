#!/usr/bin/env bash
# Project-local PostgreSQL cluster for Campus Netra development.
# Runs on port 55432 so it never collides with a system-wide Postgres.
set -euo pipefail

PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$ROOT/database/.pgdata"
# The project path may contain spaces, which Postgres' -o option cannot express.
# Keeping the unix socket outside the project sidesteps that entirely.
SOCKDIR="/tmp/campusnetra-pg"
PORT=55432
DB=campusnetra
USER=campusnetra

export PATH="$PG_BIN:$PATH"
export LC_ALL=C
mkdir -p "$SOCKDIR"

start() {
  if [ ! -d "$PGDATA" ]; then
    echo "==> Initialising cluster at $PGDATA"
    initdb -D "$PGDATA" -U "$USER" --encoding=UTF8 --locale=C >/dev/null
  fi
  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "==> Already running on port $PORT"
  else
    echo "==> Starting PostgreSQL on port $PORT"
    pg_ctl -D "$PGDATA" -o "-p $PORT -k $SOCKDIR" -l "$PGDATA/server.log" -w start
  fi
  createdb -h "$SOCKDIR" -p "$PORT" -U "$USER" "$DB" 2>/dev/null || true
}

stop() { pg_ctl -D "$PGDATA" -w stop 2>/dev/null || echo "not running"; }

run_sql_dir() {
  local dir="$1"
  for f in "$dir"/*.sql; do
    [ -e "$f" ] || continue
    echo "    $(basename "$f")"
    psql -h "$SOCKDIR" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
  done
}

migrate() { start; echo "==> Applying migrations"; run_sql_dir "$ROOT/database/migrations"; echo "==> Migrations applied"; }
seed()    { start; echo "==> Seeding";            run_sql_dir "$ROOT/database/seeds";      echo "==> Seed complete"; }

reset() {
  stop || true
  rm -rf "$PGDATA"
  migrate
  seed
}

case "${1:-start}" in
  start)   start ;;
  stop)    stop ;;
  migrate) migrate ;;
  seed)    seed ;;
  reset)   reset ;;
  psql)    start >/dev/null; psql -h "$SOCKDIR" -p "$PORT" -U "$USER" -d "$DB" ;;
  url)     echo "postgresql+asyncpg://$USER@localhost:$PORT/$DB" ;;
  *) echo "usage: $0 {start|stop|migrate|seed|reset|psql|url}"; exit 1 ;;
esac
