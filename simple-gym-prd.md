# simple-gym — Personal Strength Training Tracker

## Vision

A minimal, fast workout logger built for one user. Log sets at the gym from your phone with minimal taps. Phase 1 is a Dockerized web app with a mobile-first UI. Phase 2 adds a native iOS app consuming the same API.

---

## Core Features (Phase 1)

### Exercise Library

A seeded database of common strength exercises (bench press, squat, deadlift, rows, etc.), each tagged by muscle group (chest, back, legs, shoulders, arms, core). Custom exercises can be added.

### Workout Templates

Create reusable routines by pulling exercises from the library. For example, a "Push Day" template might include bench press, overhead press, tricep dips, and lateral raises. Each exercise in a template has a default number of sets. Templates are saved to your library and can be edited or deleted.

### Live Workout Session

Pick a template (or start a blank session) and get a clean checklist-style interface. Each exercise shows its sets — tap to log weight and reps for each set, then check it off. A running timer starts when you begin the workout and stops when you finish. The session is saved with total duration.

### Workout History

A simple chronological log of past sessions showing date, template used, duration, and the exercises/sets/reps/weight logged.

---

## Data Model

| Entity | Fields |
|---|---|
| **exercises** | id, name, muscle_group, is_custom, created_at |
| **templates** | id, name, created_at, updated_at |
| **template_exercises** | id, template_id, exercise_id, default_sets, sort_order |
| **sessions** | id, template_id (nullable), started_at, ended_at, duration_seconds |
| **session_sets** | id, session_id, exercise_id, set_number, weight, reps, completed_at |

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Backend** | Node.js + Express | Aligns with existing tooling (Script Runner) |
| **Database** | SQLite (better-sqlite3) | Single-user, no extra container, portable data file |
| **Frontend** | React + Vite | Fast dev experience, mobile-first styling |
| **Deployment** | Docker / docker-compose | Platform-portable, future Linux server migration |
| **API style** | REST | Simple data model, predictable queries |

---

## API Design

### Exercises

- `GET /api/exercises` — list all (optional `?muscle_group=` filter)
- `GET /api/exercises/:id` — get one
- `POST /api/exercises` — create custom exercise
- `PUT /api/exercises/:id` — update
- `DELETE /api/exercises/:id` — delete (custom only)

### Templates

- `GET /api/templates` — list all
- `GET /api/templates/:id` — get with exercises
- `POST /api/templates` — create
- `PUT /api/templates/:id` — update name/exercises
- `DELETE /api/templates/:id` — delete

### Sessions

- `POST /api/sessions` — start a session (starts timer, optional template_id)
- `PUT /api/sessions/:id/end` — end session (stops timer)
- `POST /api/sessions/:id/sets` — log a set
- `PUT /api/sessions/:id/sets/:setId` — update a logged set
- `GET /api/sessions` — list past sessions
- `GET /api/sessions/:id` — get session with all logged sets

---

## Phase 1 Implementation Plan

### Step 1 — Project Scaffolding

Set up the monorepo with Express backend and React/Vite frontend. Dockerize with a Dockerfile and docker-compose.yml. Get hot reload working in dev mode.

### Step 2 — Database & Models

Set up SQLite with a migration system. Create tables for exercises, templates, template_exercises, sessions, and session_sets. Seed the exercise library with 30–40 common movements.

### Step 3 — Exercise Library API + UI

Build the CRUD endpoints and a simple browse/search interface filtered by muscle group.

### Step 4 — Template Builder API + UI

Endpoints for creating and managing templates. UI for selecting exercises into a template, setting default set counts, and saving.

### Step 5 — Live Workout Screen

The core UX. Start button triggers timer, loads the template's exercises, presents the set logging interface (tap a set → enter weight/reps → mark complete). Stop button ends the session and saves everything.

### Step 6 — Workout History

List view of past sessions with drill-down to see full details.

---

## Phase 2 Backlog

- Native iOS app (SwiftUI) consuming the same REST API
- One-rep max estimation and progress charts
- Rest timer between sets
- Exercise history (show last weight/reps when logging)
- Supersets and circuit support
- Data export (CSV)
- Body weight tracking

---

## iOS Considerations Baked Into Phase 1

- API is stateless and RESTful — SwiftUI client can consume it directly
- No auth needed now (single user behind Tailscale), but API structure supports adding token auth later
- SQLite data file is easy to back up or sync
