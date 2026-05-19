#!/usr/bin/env bash
#
# Build and (re)start the simple-gym production container from the current
# working tree. Safe to run by hand at any time; also invoked automatically
# by the git hooks in .githooks/ on commits/merges to main.
#
# Before rebuilding, a consistent snapshot of the live prod DB is written to
# data/backups/. If the snapshot fails the deploy aborts (set -e) and the
# running prod container is left untouched.
#
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Prod's DB volume, created by docker-compose.prod.yml (compose project
# "simple-gym").
PROD_VOLUME="simple-gym_app_data"
BACKUP_DIR="$(pwd)/data/backups"
KEEP_BACKUPS=20

ts() { date '+%Y-%m-%d %H:%M:%S'; }

echo "==> [$(ts)] Deploying simple-gym (prod)..."

# 1. Snapshot the live prod DB before touching anything. sqlite3 .backup is
#    safe against a DB with concurrent writers and captures un-checkpointed
#    WAL contents.
mkdir -p "$BACKUP_DIR"
stamp="$(date '+%Y%m%d-%H%M%S')"
echo "==> [$(ts)] Backing up prod DB -> data/backups/simple-gym-$stamp.db"
docker run --rm \
  -e STAMP="$stamp" \
  -v "$PROD_VOLUME":/prod \
  -v "$BACKUP_DIR":/backups \
  node:20-alpine sh -c '
    set -e
    apk add --no-cache sqlite >/dev/null 2>&1
    if [ -f /prod/simple-gym.db ]; then
      sqlite3 /prod/simple-gym.db ".backup /backups/simple-gym-$STAMP.db"
      echo "    backup written: simple-gym-$STAMP.db"
    else
      echo "    no prod DB yet -- nothing to back up"
    fi
  '

# Keep only the most recent $KEEP_BACKUPS snapshots.
ls -1t "$BACKUP_DIR"/simple-gym-*.db 2>/dev/null \
  | tail -n +$((KEEP_BACKUPS + 1)) \
  | xargs -r rm -- || true

# 2. Rebuild and restart prod.
docker compose -f docker-compose.prod.yml up --build -d
echo "==> [$(ts)] Done -- app live on :3001"
