import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// GET /api/exercises — list all, optional ?muscle_group= filter
router.get('/', (req, res) => {
  const db = getDb();
  const { muscle_group } = req.query;

  if (muscle_group) {
    const rows = db.prepare('SELECT * FROM exercises WHERE user_id = ? AND muscle_group = ? AND archived = 0 ORDER BY name').all(req.userId, muscle_group);
    return res.json(rows);
  }

  const rows = db.prepare('SELECT * FROM exercises WHERE user_id = ? AND archived = 0 ORDER BY name').all(req.userId);
  res.json(rows);
});

// GET /api/exercises/prs — personal records per exercise. A PR is the heaviest
// weight ever lifted, with the best reps achieved at that weight. A set with
// reps but no weight counts as bodyweight (0 kg), so bodyweight exercises still
// earn a PR (most reps at 0 kg). The user can also set a manual PR per exercise
// (Settings tab); the displayed PR is the heavier of {manual override, best
// logged set} — a heavier logged set still wins. Returns a map keyed by
// exercise_id ({ weight, reps, manual }), where `manual` is true when the
// manual override is what's being shown. Pass ?exclude_session= to compute the
// logged side from prior sessions only, so an in-progress workout shows the
// record it's trying to beat rather than its own just-entered numbers. Must
// precede '/:id' so 'prs' isn't treated as an id.
router.get('/prs', (req, res) => {
  const db = getDb();
  const exclude = req.query.exclude_session ?? null;
  const rows = db.prepare(`
    SELECT exercise_id, weight, reps FROM (
      SELECT exercise_id, COALESCE(weight, 0) AS weight, reps,
             ROW_NUMBER() OVER (
               PARTITION BY exercise_id ORDER BY COALESCE(weight, 0) DESC, reps DESC
             ) AS rn
      FROM session_sets
      WHERE reps IS NOT NULL AND reps > 0
        AND session_id IN (SELECT id FROM sessions WHERE user_id = ?)
        AND (? IS NULL OR session_id != ?)
    ) WHERE rn = 1
  `).all(req.userId, exclude, exclude);
  const map = {};
  for (const r of rows) map[r.exercise_id] = { weight: r.weight, reps: r.reps, manual: false };

  // Merge in manual overrides: a manual PR wins only when it's heavier (or
  // equal weight with more reps) than the logged best, matching how two logged
  // sets are compared.
  const manuals = db.prepare(
    'SELECT id, manual_pr_weight AS weight, manual_pr_reps AS reps FROM exercises WHERE user_id = ? AND manual_pr_weight IS NOT NULL'
  ).all(req.userId);
  for (const m of manuals) {
    const cur = map[m.id];
    const beats = !cur || m.weight > cur.weight || (m.weight === cur.weight && m.reps > cur.reps);
    if (beats) map[m.id] = { weight: m.weight, reps: m.reps, manual: true };
  }
  res.json(map);
});

// GET /api/exercises/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Exercise not found' });
  res.json(row);
});

// POST /api/exercises — create custom exercise
router.post('/', (req, res) => {
  const db = getDb();
  const { name, muscle_group } = req.body;
  if (!name || !muscle_group) {
    return res.status(400).json({ error: 'name and muscle_group are required' });
  }
  const result = db.prepare('INSERT INTO exercises (user_id, name, muscle_group, is_custom) VALUES (?, ?, ?, 1)').run(req.userId, name, muscle_group);
  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(exercise);
});

// PUT /api/exercises/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const { name, muscle_group } = req.body;
  db.prepare('UPDATE exercises SET name = COALESCE(?, name), muscle_group = COALESCE(?, muscle_group) WHERE id = ?')
    .run(name ?? null, muscle_group ?? null, req.params.id);
  const updated = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  res.json(updated);
});

// PUT /api/exercises/:id/pr — set a manual personal-record override (kg).
// Stored on the exercise; the /prs endpoint shows it only when it beats the
// best logged set. Reps must be a positive integer; weight a non-negative
// number (0 = bodyweight).
router.put('/:id/pr', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const weight = Number(req.body.weight);
  const reps = Number(req.body.reps);
  if (!Number.isFinite(weight) || weight < 0) {
    return res.status(400).json({ error: 'weight must be a non-negative number' });
  }
  if (!Number.isInteger(reps) || reps < 1) {
    return res.status(400).json({ error: 'reps must be a positive integer' });
  }

  db.prepare('UPDATE exercises SET manual_pr_weight = ?, manual_pr_reps = ? WHERE id = ?')
    .run(weight, reps, req.params.id);
  res.json(db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.userId));
});

// DELETE /api/exercises/:id/pr — clear the manual override, reverting that
// exercise's PR to its purely-derived value.
router.delete('/:id/pr', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  db.prepare('UPDATE exercises SET manual_pr_weight = NULL, manual_pr_reps = NULL WHERE id = ?')
    .run(req.params.id);
  res.json(db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.userId));
});

// DELETE /api/exercises/:id — any exercise (built-in or custom). It's always
// pulled out of every template. If it's referenced by a past session (sets or
// notes) we archive it instead of deleting the row, so that workout history
// still renders; otherwise the row is hard-deleted.
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const inHistory =
    db.prepare('SELECT 1 FROM session_sets WHERE exercise_id = ? LIMIT 1').get(req.params.id) ||
    db.prepare('SELECT 1 FROM session_exercise_notes WHERE exercise_id = ? LIMIT 1').get(req.params.id);

  const remove = db.transaction(() => {
    db.prepare('DELETE FROM template_exercises WHERE exercise_id = ?').run(req.params.id);
    if (inHistory) {
      db.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(req.params.id);
    } else {
      db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.id);
    }
  });
  remove();

  res.status(204).end();
});

export default router;
