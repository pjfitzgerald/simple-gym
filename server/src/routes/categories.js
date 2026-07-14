import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

function list(db, userId) {
  return db.prepare('SELECT name FROM categories WHERE user_id = ? ORDER BY name')
    .all(userId).map(r => r.name);
}

// GET /api/categories — the user's exercise categories (muscle groups),
// defaults + custom.
router.get('/', (req, res) => {
  res.json(list(getDb(), req.userId));
});

// POST /api/categories — add a custom category. Idempotent (names are unique
// per user); stored lowercase so they read consistently next to the defaults.
router.post('/', (req, res) => {
  const db = getDb();
  const name = (req.body.name ?? '').toString().trim().toLowerCase();
  if (!name) return res.status(400).json({ error: 'name is required' });

  db.prepare('INSERT OR IGNORE INTO categories (user_id, name) VALUES (?, ?)').run(req.userId, name);
  res.status(201).json(list(db, req.userId));
});

export default router;
