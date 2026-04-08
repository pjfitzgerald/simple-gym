# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

simple-gym is a personal strength training tracker. Single-user, no auth (accessed via Tailscale). Phase 1 is a Dockerized web app with mobile-first UI. Phase 2 adds a native iOS app.

## Tech Stack

- **Backend**: Node.js + Express (port 3001), REST API under `/api`
- **Database**: SQLite via `better-sqlite3`, stored at `./data/simple-gym.db`
- **Frontend**: React + Vite (port 3000 in dev), proxies `/api` to backend
- **Deployment**: Docker / docker-compose

## Project Structure

Monorepo with `server/` and `client/` directories. Root `package.json` manages workspaces.

- `server/src/index.js` — Express entry point
- `server/src/routes/` — API route files
- `server/src/db/database.js` — SQLite connection
- `server/src/db/migrations/` — SQL migration files
- `server/src/db/seed.js` — Exercise library seed data (~30-40 exercises)
- `client/src/` — React app

## Common Commands

```bash
# Dev mode (hot reload on both frontend and backend)
docker-compose up

# Local dev without Docker (requires npm install first)
npm install
node server/src/index.js                    # server on :3001
cd client && npx vite --host 0.0.0.0        # client on :3000

# Access
# Frontend: http://localhost:3000
# API: http://localhost:3001/api
```

## Database

Migrations run automatically on server startup. To add a new migration, create a numbered `.sql` file in `server/src/db/migrations/` (e.g., `002_add_foo.sql`). The migration runner tracks applied migrations in a `migrations` table and applies new ones in sort order.

`better-sqlite3` is a native module — Docker containers install their own copies via named volumes to avoid architecture mismatches with the host.

## Architecture

- REST API with resources: exercises, templates, sessions
- Data model: exercises → template_exercises ← templates; sessions → session_sets ← exercises
- Sessions have a timer (started_at/ended_at/duration_seconds)
- Templates are reusable workout routines; sessions optionally reference a template
- All dev servers bind to `0.0.0.0` for Tailscale remote access
- Docker volume mounts `./data` for SQLite persistence
- Single Dockerfile is multi-stage: builds frontend, then serves everything from Express in production

## Design Constraints

- Mobile-first UI — primarily used on iPhone at the gym, minimize taps
- API is stateless/RESTful to support future iOS (SwiftUI) client
- No auth required now but API structure should support adding token auth later
