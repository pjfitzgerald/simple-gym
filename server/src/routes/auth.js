import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/database.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

// Same JWT-bearer approach as the inventory app, scoped to a single user:
// no signup — the first (only) account is created once via /setup, then
// it's login-only. No email flows (nothing to verify, no SMTP); a forgotten
// password is reset by hand: delete the users row, then /setup again.

function userJson(user) {
  return { id: user.id, email: user.email };
}

function findUser(email) {
  return getDb()
    .prepare('SELECT * FROM users WHERE email = ?')
    .get((email ?? '').toString().trim().toLowerCase());
}

function userCount() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

// GET /api/auth/status — whether first-run setup is still needed. Open, so
// the login screen knows which form to show.
router.get('/status', (_req, res) => {
  res.json({ needs_setup: userCount() === 0 });
});

// POST /api/auth/setup — create the single account. Only works while no
// account exists; afterwards this endpoint is dead.
router.post('/setup', (req, res) => {
  if (userCount() > 0) {
    return res.status(409).json({ error: 'Already set up' });
  }
  const email = (req.body.email ?? '').toString().trim().toLowerCase();
  const password = (req.body.password ?? '').toString();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = getDb()
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, hash);
  const user = { id: info.lastInsertRowid, email };
  res.status(201).json({ token: signToken(user.id), user: userJson(user) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const user = findUser(req.body.email);
  if (!user || !bcrypt.compareSync((req.body.password ?? '').toString(), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: signToken(user.id), user: userJson(user) });
});

// GET /api/auth/me — resolve the user for a token; used on startup to
// restore a session.
router.get('/me', requireAuth, (req, res) => {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: userJson(user) });
});

export default router;
