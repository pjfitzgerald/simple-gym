import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/database.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { seedUser } from '../db/seed.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/mailer.js';

const router = Router();

// Multi-user auth, same flows as the inventory app: signup with email
// verification (login stays blocked until the emailed link is clicked),
// stateless JWT login, and password reset via an emailed, time-limited token.

// A password-reset link is only usable for a short window after it is issued.
const PASSWORD_RESET_TTL_HOURS = 2;

function userJson(user) {
  return { id: user.id, email: user.email, email_verified: !!user.email_verified_at };
}

function findByEmail(email) {
  return getDb()
    .prepare('SELECT * FROM users WHERE email = ?')
    .get((email ?? '').toString().trim().toLowerCase());
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Whether verification / reset tokens are returned in the JSON response.
// Always outside production; in production, gated on EXPOSE_AUTH_TOKENS
// (set on staging so the UI flows are testable without real email delivery).
function authTokensExposed() {
  return process.env.NODE_ENV !== 'production' || process.env.EXPOSE_AUTH_TOKENS === 'true';
}

function validate(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid email is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

// POST /api/auth/signup — create an account. Login stays blocked until the
// emailed verification link is clicked. The first account ever created
// adopts all pre-multi-user data (user_id IS NULL rows: the original
// single-user history); everyone else starts fresh with the seed library.
router.post('/signup', (req, res) => {
  const db = getDb();
  const email = (req.body.email ?? '').toString().trim().toLowerCase();
  const password = (req.body.password ?? '').toString();

  const invalid = validate(email, password);
  if (invalid) return res.status(400).json({ error: invalid });
  if (findByEmail(email)) return res.status(400).json({ error: 'That email already has an account' });

  const verificationToken = newToken();
  const create = db.transaction(() => {
    const info = db.prepare(
      'INSERT INTO users (email, password_hash, email_verification_token) VALUES (?, ?, ?)'
    ).run(email, bcrypt.hashSync(password, 10), verificationToken);
    const userId = info.lastInsertRowid;

    if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 1) {
      for (const table of ['exercises', 'templates', 'sessions', 'categories']) {
        db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId);
      }
    }
    seedUser(db, userId);
    return userId;
  });
  create();

  sendVerificationEmail(email, verificationToken);
  res.status(201).json({
    message: 'Account created. Check your email for a verification link.',
    ...(authTokensExposed() && { verification_token: verificationToken }),
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const user = findByEmail(req.body.email);
  if (!user || !bcrypt.compareSync((req.body.password ?? '').toString(), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!user.email_verified_at) {
    return res.status(403).json({ error: 'Email not verified — check your inbox for the verification link' });
  }
  res.json({ token: signToken(user.id), user: userJson(user) });
});

// POST /api/auth/verify — emailed-link target; marks the email verified and
// logs the user straight in.
router.post('/verify', (req, res) => {
  const db = getDb();
  const token = (req.body.token ?? '').toString();
  const user = token && db.prepare('SELECT * FROM users WHERE email_verification_token = ?').get(token);
  if (!user) return res.status(422).json({ error: 'Invalid or expired verification token' });

  db.prepare(
    "UPDATE users SET email_verified_at = datetime('now'), email_verification_token = NULL WHERE id = ?"
  ).run(user.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ token: signToken(user.id), user: userJson(fresh), message: 'Email verified.' });
});

// POST /api/auth/request_password_reset — identical response whether or not
// the email has an account, so this can't be used to probe for addresses.
router.post('/request_password_reset', (req, res) => {
  const db = getDb();
  const user = findByEmail(req.body.email);
  let resetToken = null;
  if (user) {
    resetToken = newToken();
    db.prepare(
      "UPDATE users SET password_reset_token = ?, password_reset_sent_at = datetime('now') WHERE id = ?"
    ).run(resetToken, user.id);
    sendPasswordResetEmail(user.email, resetToken, PASSWORD_RESET_TTL_HOURS);
  }
  res.json({
    message: 'If that email has an account, a password reset link is on its way.',
    ...(authTokensExposed() && resetToken && { reset_token: resetToken }),
  });
});

// POST /api/auth/reset_password — emailed-link target. Possession of the
// reset token also proves control of the inbox, so this marks the email
// verified — otherwise a user who lost their verification email would reset
// their password and still be unable to log in.
router.post('/reset_password', (req, res) => {
  const db = getDb();
  const token = (req.body.token ?? '').toString();
  const password = (req.body.password ?? '').toString();

  const user = token && db.prepare('SELECT * FROM users WHERE password_reset_token = ?').get(token);
  // sent_at is SQLite's "YYYY-MM-DD HH:MM:SS" in UTC; make it ISO to parse.
  const fresh_enough = user && user.password_reset_sent_at &&
    (Date.now() - new Date(user.password_reset_sent_at.replace(' ', 'T') + 'Z').getTime()) < PASSWORD_RESET_TTL_HOURS * 3600 * 1000;
  if (!user || !fresh_enough) {
    return res.status(422).json({ error: 'Invalid or expired reset token' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  db.prepare(`
    UPDATE users SET password_hash = ?,
      email_verified_at = COALESCE(email_verified_at, datetime('now')),
      email_verification_token = NULL,
      password_reset_token = NULL, password_reset_sent_at = NULL
    WHERE id = ?
  `).run(bcrypt.hashSync(password, 10), user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ token: signToken(user.id), user: userJson(updated), message: 'Password updated.' });
});

// GET /api/auth/me — resolve the user for a token; used on startup to
// restore a session.
router.get('/me', requireAuth, (req, res) => {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: userJson(user) });
});

export default router;
