-- Custom exercise categories (muscle groups). Previously a hardcoded list in
-- the client; now stored so the user can add their own, which then appear in
-- the filter tabs and the exercise form everywhere. Seeded with the original
-- six defaults plus any category already in use by existing exercises.
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO categories (name) VALUES
  ('chest'), ('back'), ('legs'), ('shoulders'), ('arms'), ('core');

INSERT OR IGNORE INTO categories (name)
  SELECT DISTINCT muscle_group FROM exercises
  WHERE muscle_group IS NOT NULL AND muscle_group != '';

-- Soft-delete flag for exercises. Deleting an exercise that's referenced by a
-- past session (or its notes) archives it instead of removing the row, so the
-- workout history still renders; it's hidden from the library + pickers and
-- pulled out of any templates. Unused exercises are hard-deleted by the API.
ALTER TABLE exercises ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
