import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { initDb } from './db/database.js';
import { requireAuth } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import exercisesRouter from './routes/exercises.js';
import categoriesRouter from './routes/categories.js';
import templatesRouter from './routes/templates.js';
import sessionsRouter from './routes/sessions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
// Raw CSV bodies for the history import endpoint (kept separate from JSON).
app.use(express.text({ type: 'text/csv', limit: '5mb' }));

// API routes. Everything except auth itself and the health probe requires a
// Bearer token (see middleware/auth.js) — the app is exposed publicly.
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/exercises', requireAuth, exercisesRouter);
app.use('/api/categories', requireAuth, categoriesRouter);
app.use('/api/templates', requireAuth, templatesRouter);
app.use('/api/sessions', requireAuth, sessionsRouter);

// In production, serve the built frontend
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Initialize DB (run migrations + seed) then start server
initDb();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
