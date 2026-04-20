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

## Long-term documentation hub

The Obsidian note at `~/pkm/projects/01 active/simple-gym/simple-gym.md` is the single source of truth for long-term project documentation and cross-session continuity. It holds outstanding tasks, backlog, progress log, decisions, and context that should survive past the current conversation.

Prefer the `/session-resume` and `/session-end` skills to drive the rituals below — they encapsulate the steps. The rules here still apply whether you invoke via skill or do it inline.

### Start of session (always)

Read the hub note with the Read tool — the path is fixed. The `# Resume here` block at the top is designed so you can pick up without reading the rest; skim it first, then dive deeper only if the current request needs it. The `/session-resume` skill does this for you.

### End of session (always, even if "nothing happened")

**Update the `# Resume here` block** so a cold future session can pick up seamlessly (the `/session-end` skill does this for you). Overwrite — don't append — these fields:
- **Last session (YYYY-MM-DD):** one sentence on what we did
- **Current focus:** what's in progress, or "idle" if nothing is
- **Next steps:** 1–3 concrete actions, ordered
- **Blockers / open questions:** anything waiting on the user or unresolved

**When to run this ritual** — whichever comes first:
1. **User signals end-of-session**, explicitly ("wrap up", "end this session", "done for now") or implicitly ("thanks, that's all", "see you tomorrow").
2. **A significant unit of work completes with no implied follow-up** — a natural stopping point where the user might walk away. Proactively run the ritual without being asked, so `Resume here` doesn't go stale if the session ends quietly.
3. **User asks for a checkpoint** ("update resume", "checkpoint") — mid-session refresh of just the `Resume here` block.

This ritual is non-negotiable — it's the whole reason the hub note exists. If you're not sure whether something is worth recording elsewhere, at minimum keep `Resume here` fresh.

### During a session (as they come up)

- Task completed → tick it off or move it out of `# Tasks`
- New task emerges → add to `# Tasks` (or `# Backlog` if not near-term)
- Meaningful decision (product, architectural, trade-off) → append to `# Decisions` with a date and the *why*
- Notable change worth a breadcrumb for next session → append dated entry to `# Progress log`

### Branching for digestibility

The hub note should stay scannable. When a section grows beyond ~10 items, or a topic warrants deeper treatment (design doc, research, investigation), **branch it into a sub-note**:
- Create `~/pkm/projects/01 active/simple-gym/simple-gym - <topic>.md`
- Replace the section content (or its detail) in the hub with a one-line summary + `[[simple-gym - <topic>]]` link
- Add the sub-note to the hub's `# Linked notes` section

Prefer branching over letting the hub bloat.

### What does NOT belong in the hub

Anything derivable from the code or git history — file paths, function names, commit summaries, architecture already documented in this `CLAUDE.md`. Keep the hub focused on *why*, *what's next*, and *what we decided* — not *what the code currently does*.

## Design Constraints

- Mobile-first UI — primarily used on iPhone at the gym, minimize taps
- API is stateless/RESTful to support future iOS (SwiftUI) client
- No auth required now but API structure should support adding token auth later
