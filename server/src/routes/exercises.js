import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// GET /api/exercises — list all, optional ?muscle_group= filter
router.get('/', (req, res) => {
  const db = getDb();
  const { muscle_group } = req.query;

  if (muscle_group) {
    const rows = db.prepare('SELECT * FROM exercises WHERE muscle_group = ? ORDER BY name').all(muscle_group);
    return res.json(rows);
  }

  const rows = db.prepare('SELECT * FROM exercises ORDER BY name').all();
  res.json(rows);
});

// GET /api/exercises/prs — personal records per exercise, derived from logged
// sets: the heaviest weight ever lifted, with the best reps achieved at that
// weight. Returns a map keyed by exercise_id ({ weight, reps }). Pass
// ?exclude_session= to compute from prior sessions only, so an in-progress
// workout shows the record it's trying to beat rather than its own just-
// entered numbers. Must precede '/:id' so 'prs' isn't treated as an id.
router.get('/prs', (req, res) => {
  const db = getDb();
  const exclude = req.query.exclude_session ?? null;
  const rows = db.prepare(`
    SELECT exercise_id, weight, reps FROM (
      SELECT exercise_id, weight, reps,
             ROW_NUMBER() OVER (
               PARTITION BY exercise_id ORDER BY weight DESC, reps DESC
             ) AS rn
      FROM session_sets
      WHERE weight IS NOT NULL AND reps IS NOT NULL
        AND weight > 0 AND reps > 0
        AND (? IS NULL OR session_id != ?)
    ) WHERE rn = 1
  `).all(exclude, exclude);
  const map = {};
  for (const r of rows) map[r.exercise_id] = { weight: r.weight, reps: r.reps };
  res.json(map);
});

// GET /api/exercises/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
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
  const result = db.prepare('INSERT INTO exercises (name, muscle_group, is_custom) VALUES (?, ?, 1)').run(name, muscle_group);
  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(exercise);
});

// PUT /api/exercises/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const { name, muscle_group } = req.body;
  db.prepare('UPDATE exercises SET name = COALESCE(?, name), muscle_group = COALESCE(?, muscle_group) WHERE id = ?')
    .run(name ?? null, muscle_group ?? null, req.params.id);
  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/exercises/:id — custom only
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });
  if (!existing.is_custom) return res.status(403).json({ error: 'Cannot delete built-in exercises' });

  db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
