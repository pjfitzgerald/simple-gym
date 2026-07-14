import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

// Tokens live for 30 days — the app is a phone PWA used at the gym, so
// re-logins should be rare, but a leaked token still ages out.
const TOKEN_TTL = '30d';

let secret;

// Signing secret: AUTH_SECRET env var if set, otherwise a generated secret
// persisted next to the DB (same volume), so tokens survive container
// restarts with zero config.
function getSecret() {
  if (secret) return secret;
  if (process.env.AUTH_SECRET) {
    secret = process.env.AUTH_SECRET;
    return secret;
  }

  const dbPath = process.env.DB_PATH
    || path.join(path.dirname(new URL(import.meta.url).pathname), '../../../data/simple-gym.db');
  const secretPath = path.join(path.dirname(dbPath), 'auth-secret');

  if (fs.existsSync(secretPath)) {
    secret = fs.readFileSync(secretPath, 'utf-8').trim();
  } else {
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    secret = crypto.randomBytes(48).toString('base64url');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  }
  return secret;
}

export function signToken(userId) {
  return jwt.sign({ user_id: userId }, getSecret(), { expiresIn: TOKEN_TTL });
}

// Returns the payload, or null if the token is missing/invalid/expired.
export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

// Express middleware: require a valid Bearer token, attach req.userId.
export function requireAuth(req, res, next) {
  const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  const payload = verifyToken(match?.[1]);
  if (!payload) return res.status(401).json({ error: 'Not authenticated' });
  req.userId = payload.user_id;
  next();
}
