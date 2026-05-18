#!/usr/bin/env bash
#
# Build and (re)start the simple-gym production container from the current
# working tree. Safe to run by hand at any time; also invoked automatically
# by the git hooks in .githooks/ on commits/merges to main.
#
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

echo "==> [$(ts)] Deploying simple-gym (prod)..."
docker compose -f docker-compose.prod.yml up --build -d
echo "==> [$(ts)] Done -- app live on :3001"
