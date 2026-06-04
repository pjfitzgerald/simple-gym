-- Free-text notes attached to a single exercise card within a session
-- (e.g. "felt heavy", "drop set last", form cues). Keyed per
-- (session, exercise) so each card owns one note; UNIQUE lets the API upsert.
CREATE TABLE IF NOT EXISTS session_exercise_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(session_id, exercise_id)
);
