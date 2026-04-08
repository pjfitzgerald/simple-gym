[[simple-gym]]
# simple-gym — Claude Code Bootstrap Prompt

Use the following prompt to kick off the project in Claude Code. Copy-paste it directly.

---

```
I'm building simple-gym, a personal strength training tracker. Here's what I need you to set up for Step 1 (project scaffolding):

## What to build

A monorepo with a Node.js/Express REST API backend and a React/Vite frontend, all Dockerized.

## Project structure

```
simple-gym/
├── docker-compose.yml
├── Dockerfile
├── .dockerignore
├── package.json          # root workspace
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js      # Express app entry point
│   │   ├── routes/        # API route files
│   │   ├── db/
│   │   │   ├── database.js    # SQLite connection (better-sqlite3)
│   │   │   ├── migrations/    # SQL migration files
│   │   │   └── seed.js        # Seed 30-40 common exercises
│   │   └── middleware/
│   └── .env.example
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── components/
└── README.md
```

## Requirements

- **Backend**: Express on port 3001, serves the API under `/api`. Use `better-sqlite3` for the database. The SQLite file should live at `./data/simple-gym.db` (Docker volume mounted).
- **Frontend**: React + Vite on port 3000 in dev mode. Proxy `/api` requests to the backend. Style mobile-first — this will primarily be used on an iPhone at the gym.
- **Docker**: Single Dockerfile (multi-stage: build frontend, then serve everything from the Express server in production). docker-compose.yml for dev mode with hot reload on both frontend and backend (use volumes, bind to 0.0.0.0 for remote access via Tailscale). Mount `./data` as a volume so the SQLite DB persists.
- **Dev server**: Both frontend and backend dev servers should bind to `0.0.0.0` so I can access them remotely through Tailscale from my phone.
- **Database**: Create migration files for these tables:

  - `exercises` (id INTEGER PRIMARY KEY, name TEXT NOT NULL, muscle_group TEXT NOT NULL, is_custom INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)
  - `templates` (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT, updated_at TEXT)
  - `template_exercises` (id INTEGER PRIMARY KEY, template_id INTEGER REFERENCES templates, exercise_id INTEGER REFERENCES exercises, default_sets INTEGER DEFAULT 3, sort_order INTEGER)
  - `sessions` (id INTEGER PRIMARY KEY, template_id INTEGER REFERENCES templates, started_at TEXT NOT NULL, ended_at TEXT, duration_seconds INTEGER)
  - `session_sets` (id INTEGER PRIMARY KEY, session_id INTEGER REFERENCES sessions, exercise_id INTEGER REFERENCES exercises, set_number INTEGER NOT NULL, weight REAL, reps INTEGER, completed_at TEXT)

- **Seed data**: Populate ~30-40 common strength exercises across these muscle groups: chest, back, legs, shoulders, arms, core. Include the staples (bench press, squat, deadlift, overhead press, barbell row, pull-up, etc.) and common accessory movements.

- **Verify it works**: After setup, I should be able to run `docker-compose up` and hit the frontend at `http://localhost:3000` with the API proxied to the backend. The database should be created and seeded on first run.

Don't build any actual feature UI yet — just a placeholder App.jsx that confirms the frontend is running and can reach the API (maybe a simple fetch to `GET /api/exercises` and display the count).
```
