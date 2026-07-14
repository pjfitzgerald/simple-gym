-- Multi-user: user-scoped data + inventory-style email verification and
-- password reset columns on users.
--
-- user_id is nullable: rows from the pre-auth era stay NULL ("orphaned") and
-- are adopted wholesale by the FIRST account to sign up (see routes/auth.js).
-- If a user already exists when this migration runs (a DB from the brief
-- single-user-auth era), orphans are backfilled to that user here instead.

ALTER TABLE users ADD COLUMN email_verification_token TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN password_reset_token TEXT;
ALTER TABLE users ADD COLUMN password_reset_sent_at TEXT;

-- Accounts created before verification existed are grandfathered as verified.
UPDATE users SET email_verified_at = datetime('now');

ALTER TABLE exercises ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE templates ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id);

-- categories.name was globally UNIQUE; rebuild for per-user uniqueness.
CREATE TABLE categories_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  UNIQUE(user_id, name)
);
INSERT INTO categories_new (id, name) SELECT id, name FROM categories;
DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;

UPDATE exercises  SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users);
UPDATE templates  SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users);
UPDATE sessions   SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users);
UPDATE categories SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users);

CREATE INDEX idx_exercises_user ON exercises(user_id);
CREATE INDEX idx_templates_user ON templates(user_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
