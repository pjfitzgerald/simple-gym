import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// GET /api/sessions — list past sessions
router.get('/', (_req, res) => {
  const db = getDb();
  const sessions = db.prepare(`
    SELECT s.*, t.name as template_name,
           COUNT(ss.id) as total_sets
    FROM sessions s
    LEFT JOIN templates t ON t.id = s.template_id
    LEFT JOIN session_sets ss ON ss.session_id = s.id
    GROUP BY s.id
    ORDER BY s.started_at DESC
  `).all();
  res.json(sessions);
});

// GET /api/sessions/:id — get session with all logged sets
router.get('/:id', (req, res) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT s.*, t.name as template_name
    FROM sessions s
    LEFT JOIN templates t ON t.id = s.template_id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  session.sets = db.prepare(`
    SELECT ss.*, e.name as exercise_name, e.muscle_group
    FROM session_sets ss
    JOIN exercises e ON e.id = ss.exercise_id
    WHERE ss.session_id = ?
    ORDER BY ss.exercise_id, ss.set_number
  `).all(req.params.id);

  res.json(session);
});

// POST /api/sessions — start a session
router.post('/', (req, res) => {
  const db = getDb();
  const { template_id } = req.body;

  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO sessions (template_id, started_at) VALUES (?, ?)').run(template_id ?? null, now);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);

  // If starting from a template, pre-populate sets
  if (template_id) {
    const templateExercises = db.prepare(`
      SELECT exercise_id, default_sets
      FROM template_exercises
      WHERE template_id = ?
      ORDER BY sort_order
    `).all(template_id);

    const insertSet = db.prepare('INSERT INTO session_sets (session_id, exercise_id, set_number) VALUES (?, ?, ?)');
    const insertAll = db.transaction((exercises) => {
      for (const ex of exercises) {
        for (let i = 1; i <= ex.default_sets; i++) {
          insertSet.run(session.id, ex.exercise_id, i);
        }
      }
    });
    insertAll(templateExercises);
  }

  // Return full session with sets
  session.sets = db.prepare(`
    SELECT ss.*, e.name as exercise_name, e.muscle_group
    FROM session_sets ss
    JOIN exercises e ON e.id = ss.exercise_id
    WHERE ss.session_id = ?
    ORDER BY ss.exercise_id, ss.set_number
  `).all(session.id);

  res.status(201).json(session);
});

// PUT /api/sessions/:id/end — end session
router.put('/:id/end', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const now = new Date().toISOString();
  const startedAt = new Date(session.started_at);
  const duration = Math.round((new Date(now) - startedAt) / 1000);

  db.prepare('UPDATE sessions SET ended_at = ?, duration_seconds = ? WHERE id = ?').run(now, duration, req.params.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// POST /api/sessions/:id/sets — log a set
router.post('/:id/sets', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { exercise_id, set_number, weight, reps } = req.body;
  if (!exercise_id || !set_number) {
    return res.status(400).json({ error: 'exercise_id and set_number are required' });
  }

  const result = db.prepare(
    'INSERT INTO session_sets (session_id, exercise_id, set_number, weight, reps, completed_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, exercise_id, set_number, weight ?? null, reps ?? null, reps != null ? new Date().toISOString() : null);

  const set = db.prepare('SELECT * FROM session_sets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(set);
});

// DELETE /api/sessions/:id/sets/:setId — remove a set
router.delete('/:id/sets/:setId', (req, res) => {
  const db = getDb();
  const set = db.prepare('SELECT * FROM session_sets WHERE id = ? AND session_id = ?').get(req.params.setId, req.params.id);
  if (!set) return res.status(404).json({ error: 'Set not found' });

  db.prepare('DELETE FROM session_sets WHERE id = ?').run(req.params.setId);

  // Renumber remaining sets for this exercise in this session
  const remaining = db.prepare(
    'SELECT id FROM session_sets WHERE session_id = ? AND exercise_id = ? ORDER BY set_number'
  ).all(req.params.id, set.exercise_id);

  const updateNum = db.prepare('UPDATE session_sets SET set_number = ? WHERE id = ?');
  remaining.forEach((row, i) => updateNum.run(i + 1, row.id));

  res.status(204).end();
});

// PUT /api/sessions/:id/sets/:setId — update a logged set
router.put('/:id/sets/:setId', (req, res) => {
  const db = getDb();
  const set = db.prepare('SELECT * FROM session_sets WHERE id = ? AND session_id = ?').get(req.params.setId, req.params.id);
  if (!set) return res.status(404).json({ error: 'Set not found' });

  const { weight, reps } = req.body;
  const completedAt = reps != null ? (set.completed_at || new Date().toISOString()) : set.completed_at;

  db.prepare('UPDATE session_sets SET weight = ?, reps = ?, completed_at = ? WHERE id = ?')
    .run(weight ?? null, reps ?? null, completedAt, req.params.setId);

  const updated = db.prepare('SELECT * FROM session_sets WHERE id = ?').get(req.params.setId);
  res.json(updated);
});

export default router;
