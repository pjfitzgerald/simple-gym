-- Display preferences (unit/density/theme) move from client localStorage to
-- the account, so they follow a user across devices/browsers.
ALTER TABLE users ADD COLUMN unit TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE users ADD COLUMN density TEXT NOT NULL DEFAULT 'comfortable';
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'auto';
