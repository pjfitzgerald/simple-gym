#!/usr/bin/env bash
#
# Build and (re)start the simple-gym STAGING container from the current
# working tree, on port 3002. Isolated from prod: separate compose project,
# separate DB volume. Safe to run by hand at any time; also invoked
# automatically by the git hooks in .githooks/ on commits/merges to the
# `staging` branch.
#
# Each run refreshes the staging DB with a fresh, consistent snapshot of the
# live prod DB, so migrations are exercised against real data before they
# ever reach prod. Anything you change on staging is discarded on next deploy.
#
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Prod's DB volume, created by docker-compose.prod.yml (compose project
# "simple-gym"). Read-only here -- only ever the source of the snapshot.
PROD_VOLUME="simple-gym_app_data"
# Staging's DB volume (explicit name set in docker-compose.staging.yml).
STAGING_VOLUME="simple-gym-staging-data"
COMPOSE="docker compose -f docker-compose.staging.yml"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo DETACHED)"

echo "==> [$(ts)] Deploying simple-gym STAGING from branch '$branch'..."

# Build first -- fail fast before stopping the running staging container.
$COMPOSE build

# Stop staging so nothing holds the staging DB while we replace it.
$COMPOSE down --remove-orphans 2>/dev/null || true

# Refresh the staging DB with a consistent snapshot of the live prod DB.
# sqlite3 .backup is safe against a DB with concurrent writers and correctly
# captures any un-checkpointed WAL contents.
docker volume create "$STAGING_VOLUME" >/dev/null
echo "==> [$(ts)] Refreshing staging DB from prod snapshot..."
docker run --rm \
  -v "$PROD_VOLUME":/prod \
  -v "$STAGING_VOLUME":/staging \
  node:20-alpine sh -c '
    set -e
    apk add --no-cache sqlite >/dev/null 2>&1
    rm -f /staging/simple-gym.db /staging/simple-gym.db-wal /staging/simple-gym.db-shm
    if [ -f /prod/simple-gym.db ]; then
      sqlite3 /prod/simple-gym.db ".backup /staging/simple-gym.db"
      echo "    prod DB snapshot copied into staging"
    else
      echo "    no prod DB found -- staging will start with a fresh DB"
    fi
  '

# Bring staging up on :3002 with the freshly built image.
$COMPOSE up -d
echo "==> [$(ts)] Done -- staging live on :3002 (branch '$branch')"
