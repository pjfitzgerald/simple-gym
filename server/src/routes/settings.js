import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

const VALID_UNIT = ['kg', 'lbs'];
const VALID_DENSITY = ['comfortable', 'compact'];
const VALID_THEME = ['auto', 'light', 'dark'];

// PATCH /api/settings — update any subset of the account's display
// preferences. These used to live in client localStorage; moving them here
// makes them follow the account across devices/browsers instead of the
// current one.
router.patch('/', (req, res) => {
  const db = getDb();
  const { unit, density, theme } = req.body;
  if (unit !== undefined && !VALID_UNIT.includes(unit)) {
    return res.status(400).json({ error: 'Invalid unit' });
  }
  if (density !== undefined && !VALID_DENSITY.includes(density)) {
    return res.status(400).json({ error: 'Invalid density' });
  }
  if (theme !== undefined && !VALID_THEME.includes(theme)) {
    return res.status(400).json({ error: 'Invalid theme' });
  }

  const fields = [];
  const values = [];
  if (unit !== undefined) { fields.push('unit = ?'); values.push(unit); }
  if (density !== undefined) { fields.push('density = ?'); values.push(density); }
  if (theme !== undefined) { fields.push('theme = ?'); values.push(theme); }
  if (!fields.length) return res.status(400).json({ error: 'No settings provided' });

  values.push(req.userId);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const user = db.prepare('SELECT unit, density, theme FROM users WHERE id = ?').get(req.userId);
  res.json({ settings: user });
});

export default router;
