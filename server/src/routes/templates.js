import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// GET /api/templates — list all
router.get('/', (_req, res) => {
  const db = getDb();
  const templates = db.prepare(`
    SELECT t.*, COUNT(te.id) as exercise_count
    FROM templates t
    LEFT JOIN template_exercises te ON te.template_id = t.id
    GROUP BY t.id
    ORDER BY t.updated_at DESC
  `).all();
  res.json(templates);
});

// GET /api/templates/:id — get with exercises
router.get('/:id', (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  template.exercises = db.prepare(`
    SELECT te.id as template_exercise_id, te.default_sets, te.sort_order,
           e.id, e.name, e.muscle_group
    FROM template_exercises te
    JOIN exercises e ON e.id = te.exercise_id
    WHERE te.template_id = ?
    ORDER BY te.sort_order
  `).all(req.params.id);

  res.json(template);
});

// POST /api/templates — create with exercises
router.post('/', (req, res) => {
  const db = getDb();
  const { name, exercises } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO templates (name, created_at, updated_at) VALUES (?, ?, ?)').run(name.trim(), now, now);
  const templateId = result.lastInsertRowid;

  if (exercises?.length) {
    const insert = db.prepare('INSERT INTO template_exercises (template_id, exercise_id, default_sets, sort_order) VALUES (?, ?, ?, ?)');
    const insertAll = db.transaction((items) => {
      items.forEach((ex, i) => {
        insert.run(templateId, ex.exercise_id, ex.default_sets || 3, ex.sort_order ?? i);
      });
    });
    insertAll(exercises);
  }

  // Return the full template
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
  template.exercises = db.prepare(`
    SELECT te.id as template_exercise_id, te.default_sets, te.sort_order,
           e.id, e.name, e.muscle_group
    FROM template_exercises te
    JOIN exercises e ON e.id = te.exercise_id
    WHERE te.template_id = ?
    ORDER BY te.sort_order
  `).all(templateId);

  res.status(201).json(template);
});

// PUT /api/templates/:id — update name and/or exercises
router.put('/:id', (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const { name, exercises } = req.body;
  const now = new Date().toISOString();

  if (name?.trim()) {
    db.prepare('UPDATE templates SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), now, req.params.id);
  }

  if (exercises) {
    const update = db.transaction(() => {
      db.prepare('DELETE FROM template_exercises WHERE template_id = ?').run(req.params.id);
      const insert = db.prepare('INSERT INTO template_exercises (template_id, exercise_id, default_sets, sort_order) VALUES (?, ?, ?, ?)');
      exercises.forEach((ex, i) => {
        insert.run(req.params.id, ex.exercise_id, ex.default_sets || 3, ex.sort_order ?? i);
      });
    });
    update();
    db.prepare('UPDATE templates SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  }

  // Return updated template
  const updated = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  updated.exercises = db.prepare(`
    SELECT te.id as template_exercise_id, te.default_sets, te.sort_order,
           e.id, e.name, e.muscle_group
    FROM template_exercises te
    JOIN exercises e ON e.id = te.exercise_id
    WHERE te.template_id = ?
    ORDER BY te.sort_order
  `).all(req.params.id);

  res.json(updated);
});

// DELETE /api/templates/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
