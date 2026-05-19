-- Add a per-exercise ordering position to session sets.
-- All sets belonging to the same exercise within a session share the same
-- sort_order value, which represents that exercise group's position in the
-- workout. This persists manual reordering so it survives a page reload.
ALTER TABLE session_sets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill existing sessions: order exercise groups by exercise_id (the
-- previous implicit ordering) so nothing visibly changes for old data.
WITH ranked AS (
  SELECT id,
         DENSE_RANK() OVER (PARTITION BY session_id ORDER BY exercise_id) - 1 AS so
  FROM session_sets
)
UPDATE session_sets
SET sort_order = ranked.so
FROM ranked
WHERE ranked.id = session_sets.id;
