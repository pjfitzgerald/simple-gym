import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// GET /api/categories — exercise categories (muscle groups), defaults + custom.
router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT name FROM categories ORDER BY name').all();
  res.json(rows.map(r => r.name));
});

// POST /api/categories — add a custom category. Idempotent (names are unique);
// stored lowercase so they read consistently next to the seeded defaults.
router.post('/', (req, res) => {
  const db = getDb();
  const name = (req.body.name ?? '').toString().trim().toLowerCase();
  if (!name) return res.status(400).json({ error: 'name is required' });

  db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name);
  const rows = db.prepare('SELECT name FROM categories ORDER BY name').all();
  res.status(201).json(rows.map(r => r.name));
});

export default router;
