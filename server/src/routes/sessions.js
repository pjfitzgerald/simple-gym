import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// Shared query: a session's sets in display order (exercise group order, then set number)
const SETS_QUERY = `
  SELECT ss.*, e.name as exercise_name, e.muscle_group
  FROM session_sets ss
  JOIN exercises e ON e.id = ss.exercise_id
  WHERE ss.session_id = ?
  ORDER BY ss.sort_order, ss.set_number
`;

// Minimal RFC-4180-ish CSV parser: handles quoted fields with embedded
// commas, quotes ("" escape) and newlines. Returns an array of row arrays.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Per-exercise notes for a session as a { exercise_id: notes } map, so the
// client can hang each note off its card without a second request.
function notesMap(db, sessionId) {
  const rows = db.prepare(
    'SELECT exercise_id, notes FROM session_exercise_notes WHERE session_id = ?'
  ).all(sessionId);
  const map = {};
  for (const r of rows) map[r.exercise_id] = r.notes;
  return map;
}

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

// GET /api/sessions/active — the most recent in-progress session, or null.
// Lets the app recover a workout after the PWA is closed or reloaded.
// NOTE: must be declared before '/:id' so 'active' is not treated as an id.
router.get('/active', (_req, res) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT s.*, t.name as template_name
    FROM sessions s
    LEFT JOIN templates t ON t.id = s.template_id
    WHERE s.ended_at IS NULL
    ORDER BY s.started_at DESC
    LIMIT 1
  `).get();
  if (!session) return res.json(null);

  session.sets = db.prepare(SETS_QUERY).all(session.id);
  session.notes = notesMap(db, session.id);
  res.json(session);
});

// GET /api/sessions/export — full workout history as a CSV download, one row
// per logged set (sessions with no sets still get a single row). Declared
// before '/:id' so 'export' isn't parsed as a session id.
router.get('/export', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.id as session_id, s.started_at, s.ended_at, s.duration_seconds,
           t.name as template_name,
           e.name as exercise_name, e.muscle_group,
           ss.exercise_id, ss.set_number, ss.weight, ss.reps, ss.completed_at, ss.sort_order
    FROM sessions s
    LEFT JOIN templates t ON t.id = s.template_id
    LEFT JOIN session_sets ss ON ss.session_id = s.id
    LEFT JOIN exercises e ON e.id = ss.exercise_id
    ORDER BY s.started_at DESC, ss.sort_order, ss.set_number
  `).all();

  const noteRows = db.prepare('SELECT session_id, exercise_id, notes FROM session_exercise_notes').all();
  const notes = {};
  for (const n of noteRows) notes[`${n.session_id}:${n.exercise_id}`] = n.notes;

  // Format dates in the server's local timezone (the host T480 runs in the
  // user's zone) so the export matches what the app shows, not UTC.
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-CA'); // YYYY-MM-DD
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ['Date', 'Start', 'End', 'Workout', 'Duration (min)', 'Exercise', 'Muscle group', 'Set', 'Weight (kg)', 'Reps', 'Completed', 'Notes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const hasSet = r.exercise_id != null;
    lines.push([
      fmtDate(r.started_at),
      fmtTime(r.started_at),
      r.ended_at ? fmtTime(r.ended_at) : '',
      r.template_name || 'Blank Workout',
      r.duration_seconds != null ? Math.round(r.duration_seconds / 60) : '',
      r.exercise_name || '',
      r.muscle_group || '',
      r.set_number ?? '',
      r.weight ?? '',
      r.reps ?? '',
      hasSet ? (r.completed_at ? 'yes' : 'no') : '',
      hasSet ? (notes[`${r.session_id}:${r.exercise_id}`] || '') : '',
    ].map(esc).join(','));
  }

  const filename = `simple-gym-history-${new Date().toLocaleDateString('en-CA')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\n'));
});

// POST /api/sessions/import — restore workout history from a CSV in the same
// shape as the export. Idempotent: a workout already present (matched by local
// date + start time + name) is skipped, so re-importing the same file is safe.
// Missing exercises (and their categories) are auto-created. The whole import
// runs in one transaction, so any error rolls it all back — no partial state.
router.post('/import', (req, res) => {
  const db = getDb();
  const text = typeof req.body === 'string' ? req.body : '';
  if (!text.trim()) return res.status(400).json({ error: 'Empty CSV body' });

  const rows = parseCsv(text);
  if (rows.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });

  const norm = (s) => (s ?? '').trim().toLowerCase();
  const head = rows[0].map(norm);
  const col = (name) => head.indexOf(norm(name));
  const idx = {
    date: col('Date'), start: col('Start'), end: col('End'),
    workout: col('Workout'), duration: col('Duration (min)'),
    exercise: col('Exercise'), muscle: col('Muscle group'),
    set: col('Set'), weight: col('Weight (kg)'), reps: col('Reps'),
    completed: col('Completed'), notes: col('Notes'),
  };
  if (idx.date < 0 || idx.start < 0 || idx.exercise < 0) {
    return res.status(400).json({ error: 'CSV is missing required columns (Date, Start, Exercise)' });
  }
  const cell = (row, i) => (i >= 0 && i < row.length ? row[i] : '');

  // Dedup key, computed exactly the way the export formats date/time, so an
  // import matches both original sessions and previously-imported ones (both
  // collapse to the same minute-resolution key).
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-CA');
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const existing = db.prepare(`
    SELECT s.started_at, COALESCE(t.name, 'Blank Workout') AS workout
    FROM sessions s LEFT JOIN templates t ON t.id = s.template_id
  `).all();
  const seen = new Set(existing.map(s => `${fmtDate(s.started_at)}|${fmtTime(s.started_at)}|${s.workout}`));

  // Group data rows into sessions by date+start+workout (the export's identity),
  // preserving row order within each group.
  const groups = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const date = cell(row, idx.date).trim();
    const start = cell(row, idx.start).trim();
    if (!date || !start) continue;
    const workout = cell(row, idx.workout).trim() || 'Blank Workout';
    const key = `${date}|${start}|${workout}`;
    if (!groups.has(key)) groups.set(key, { date, start, workout, rows: [] });
    groups.get(key).rows.push(row);
  }

  const findExercise = db.prepare('SELECT id FROM exercises WHERE name = ? COLLATE NOCASE LIMIT 1');
  const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  const insertExercise = db.prepare('INSERT INTO exercises (name, muscle_group, is_custom) VALUES (?, ?, 1)');
  const findTemplate = db.prepare('SELECT id FROM templates WHERE name = ? COLLATE NOCASE LIMIT 1');
  const insertSession = db.prepare('INSERT INTO sessions (template_id, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?)');
  const insertSet = db.prepare('INSERT INTO session_sets (session_id, exercise_id, set_number, weight, reps, completed_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const upsertNote = db.prepare(`
    INSERT INTO session_exercise_notes (session_id, exercise_id, notes) VALUES (?, ?, ?)
    ON CONFLICT(session_id, exercise_id) DO UPDATE SET notes = excluded.notes
  `);

  const exerciseCache = new Map(); // lower(name) -> id
  let createdExercises = 0;
  function exerciseId(name, muscle) {
    const key = name.toLowerCase();
    if (exerciseCache.has(key)) return exerciseCache.get(key);
    let row = findExercise.get(name);
    if (!row) {
      const mg = norm(muscle) || 'other';
      insertCategory.run(mg);
      row = { id: insertExercise.run(name, mg).lastInsertRowid };
      createdExercises++;
    }
    exerciseCache.set(key, row.id);
    return row.id;
  }

  // 'YYYY-MM-DD' + 'HH:MM' parsed as local time, stored as UTC ISO (matching
  // how the app writes started_at).
  const toIso = (date, time) => {
    const d = new Date(`${date}T${time || '00:00'}:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  let importedSessions = 0, skippedSessions = 0, importedSets = 0;

  const run = db.transaction(() => {
    for (const g of groups.values()) {
      const key = `${g.date}|${g.start}|${g.workout}`;
      if (seen.has(key)) { skippedSessions++; continue; }

      const startedAt = toIso(g.date, g.start);
      if (!startedAt) { skippedSessions++; continue; }

      // End time / duration from the first rows that carry them.
      let endedAt = null, duration = null;
      for (const row of g.rows) {
        const endStr = cell(row, idx.end).trim();
        if (endStr && !endedAt) {
          let e = new Date(`${g.date}T${endStr}:00`);
          if (!isNaN(e.getTime()) && e < new Date(`${g.date}T${g.start}:00`)) {
            e = new Date(e.getTime() + 86400000); // workout crossed midnight
          }
          endedAt = isNaN(e.getTime()) ? null : e.toISOString();
        }
        const durStr = cell(row, idx.duration).trim();
        if (durStr && duration == null) {
          const m = Number(durStr);
          if (!isNaN(m)) duration = Math.round(m * 60);
        }
      }

      const tName = g.workout !== 'Blank Workout' ? g.workout : null;
      const tmpl = tName ? findTemplate.get(tName) : null;
      const sessionId = insertSession.run(tmpl ? tmpl.id : null, startedAt, endedAt, duration).lastInsertRowid;

      const exOrder = new Map(); // exId -> sort_order (first-appearance)
      const exSetCount = new Map(); // exId -> running set count (fallback numbering)
      for (const row of g.rows) {
        const exName = cell(row, idx.exercise).trim();
        if (!exName) continue; // a logged session with no sets
        const exId = exerciseId(exName, cell(row, idx.muscle));
        if (!exOrder.has(exId)) exOrder.set(exId, exOrder.size);
        const n = (exSetCount.get(exId) || 0) + 1;
        exSetCount.set(exId, n);

        const setRaw = parseInt(cell(row, idx.set).trim(), 10);
        const setNumber = Number.isFinite(setRaw) && setRaw > 0 ? setRaw : n;
        const weightStr = cell(row, idx.weight).trim();
        const repsStr = cell(row, idx.reps).trim();
        const weight = weightStr === '' || isNaN(Number(weightStr)) ? null : Number(weightStr);
        const reps = repsStr === '' || !Number.isFinite(parseInt(repsStr, 10)) ? null : parseInt(repsStr, 10);
        const completed = norm(cell(row, idx.completed)) === 'yes';
        insertSet.run(sessionId, exId, setNumber, weight, reps, completed ? startedAt : null, exOrder.get(exId));
        importedSets++;

        const note = cell(row, idx.notes).trim();
        if (note) upsertNote.run(sessionId, exId, note);
      }

      seen.add(key); // a duplicate group later in the same file is also skipped
      importedSessions++;
    }
  });
  run();

  res.json({ importedSessions, skippedSessions, importedSets, createdExercises });
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

  session.sets = db.prepare(SETS_QUERY).all(req.params.id);
  session.notes = notesMap(db, req.params.id);

  res.json(session);
});

// PATCH /api/sessions/:id — edit an ended session's metadata.
// Today only started_at / ended_at are editable; duration_seconds is
// recomputed from them (minus any paused gaps) so it stays consistent.
router.patch('/:id', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { started_at, ended_at } = req.body;
  const newStart = started_at ?? session.started_at;
  const newEnd = ended_at === undefined ? session.ended_at : ended_at;

  if (newEnd && new Date(newEnd) < new Date(newStart)) {
    return res.status(400).json({ error: 'ended_at must be on or after started_at' });
  }

  let duration = session.duration_seconds;
  if (newEnd) {
    const elapsed = Math.round((new Date(newEnd) - new Date(newStart)) / 1000);
    duration = Math.max(0, elapsed - (session.paused_seconds || 0));
  }

  db.prepare('UPDATE sessions SET started_at = ?, ended_at = ?, duration_seconds = ? WHERE id = ?')
    .run(newStart, newEnd, duration, req.params.id);

  const updated = db.prepare(`
    SELECT s.*, t.name as template_name
    FROM sessions s
    LEFT JOIN templates t ON t.id = s.template_id
    WHERE s.id = ?
  `).get(req.params.id);
  updated.sets = db.prepare(SETS_QUERY).all(req.params.id);
  updated.notes = notesMap(db, req.params.id);
  res.json(updated);
});

// DELETE /api/sessions/:id — delete a session and all its logged sets
router.delete('/:id', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  db.prepare('DELETE FROM session_sets WHERE session_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);

  res.status(204).end();
});

// POST /api/sessions — start a session
router.post('/', (req, res) => {
  const db = getDb();
  const { template_id } = req.body;

  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO sessions (template_id, started_at) VALUES (?, ?)').run(template_id ?? null, now);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);

  // If starting from a template, pre-populate sets. These are independent
  // copies — editing/removing them in the session never touches the template.
  if (template_id) {
    const templateExercises = db.prepare(`
      SELECT exercise_id, default_sets
      FROM template_exercises
      WHERE template_id = ?
      ORDER BY sort_order
    `).all(template_id);

    const insertSet = db.prepare('INSERT INTO session_sets (session_id, exercise_id, set_number, sort_order) VALUES (?, ?, ?, ?)');
    const insertAll = db.transaction((exercises) => {
      exercises.forEach((ex, idx) => {
        for (let i = 1; i <= ex.default_sets; i++) {
          insertSet.run(session.id, ex.exercise_id, i, idx);
        }
      });
    });
    insertAll(templateExercises);
  }

  // Return full session with sets
  session.sets = db.prepare(SETS_QUERY).all(session.id);
  session.notes = notesMap(db, session.id);

  res.status(201).json(session);
});

// PUT /api/sessions/:id/end — end session
router.put('/:id/end', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const now = new Date().toISOString();
  const startedAt = new Date(session.started_at);
  // Subtract any paused gaps so a resumed session's duration is just the
  // actual active time, not the wall-clock span.
  const elapsed = Math.round((new Date(now) - startedAt) / 1000);
  const duration = Math.max(0, elapsed - (session.paused_seconds || 0));

  db.prepare('UPDATE sessions SET ended_at = ?, duration_seconds = ? WHERE id = ?').run(now, duration, req.params.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// POST /api/sessions/:id/resume — reopen an ended session.
// The timer continues from where it stopped (the gap between end and resume
// is accumulated into paused_seconds so it doesn't inflate the total).
router.post('/:id/resume', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!session.ended_at) return res.status(400).json({ error: 'Session is not ended' });

  const active = db.prepare('SELECT id FROM sessions WHERE ended_at IS NULL').get();
  if (active) return res.status(409).json({ error: 'Another session is already active' });

  const gap = Math.max(0, Math.round((Date.now() - new Date(session.ended_at)) / 1000));
  const newPaused = (session.paused_seconds || 0) + gap;

  db.prepare('UPDATE sessions SET ended_at = NULL, duration_seconds = NULL, paused_seconds = ? WHERE id = ?')
    .run(newPaused, req.params.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  updated.sets = db.prepare(SETS_QUERY).all(req.params.id);
  updated.notes = notesMap(db, req.params.id);
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

  // A new set inherits its exercise group's existing position; a brand-new
  // exercise is appended after every current group.
  const existing = db.prepare(
    'SELECT sort_order FROM session_sets WHERE session_id = ? AND exercise_id = ? LIMIT 1'
  ).get(req.params.id, exercise_id);
  let sortOrder;
  if (existing) {
    sortOrder = existing.sort_order;
  } else {
    const max = db.prepare(
      'SELECT MAX(sort_order) as m FROM session_sets WHERE session_id = ?'
    ).get(req.params.id);
    sortOrder = max.m == null ? 0 : max.m + 1;
  }

  const result = db.prepare(
    'INSERT INTO session_sets (session_id, exercise_id, set_number, weight, reps, completed_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, exercise_id, set_number, weight ?? null, reps ?? null, reps != null ? new Date().toISOString() : null, sortOrder);

  const set = db.prepare('SELECT * FROM session_sets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(set);
});

// PUT /api/sessions/:id/exercises/reorder — persist exercise group order
router.put('/:id/exercises/reorder', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { order } = req.body;
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'order must be an array of exercise ids' });
  }

  const update = db.prepare('UPDATE session_sets SET sort_order = ? WHERE session_id = ? AND exercise_id = ?');
  const reorderAll = db.transaction((ids) => {
    ids.forEach((exerciseId, idx) => update.run(idx, req.params.id, exerciseId));
  });
  reorderAll(order);

  res.status(204).end();
});

// PUT /api/sessions/:id/exercises/:exerciseId/notes — set (upsert) the note
// for one exercise card in this session. An empty string clears it.
router.put('/:id/exercises/:exerciseId/notes', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const notes = (req.body.notes ?? '').toString();
  db.prepare(`
    INSERT INTO session_exercise_notes (session_id, exercise_id, notes)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id, exercise_id) DO UPDATE SET notes = excluded.notes
  `).run(req.params.id, req.params.exerciseId, notes);

  res.status(204).end();
});

// DELETE /api/sessions/:id/exercises/:exerciseId — drop an exercise from this
// session only (e.g. skipping a template exercise today). The template is
// never modified.
router.delete('/:id/exercises/:exerciseId', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  db.prepare('DELETE FROM session_sets WHERE session_id = ? AND exercise_id = ?')
    .run(req.params.id, req.params.exerciseId);

  res.status(204).end();
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

// PUT /api/sessions/:id/sets/:setId — update a logged set.
// Completion is now an explicit, separately-controlled flag: pass `completed`
// in the body to set/clear `completed_at`. Editing weight/reps no longer
// auto-marks a set as done; that requires an explicit toggle from the client.
router.put('/:id/sets/:setId', (req, res) => {
  const db = getDb();
  const set = db.prepare('SELECT * FROM session_sets WHERE id = ? AND session_id = ?').get(req.params.setId, req.params.id);
  if (!set) return res.status(404).json({ error: 'Set not found' });

  const { weight, reps, completed } = req.body;
  let completedAt = set.completed_at;
  if (completed === true) completedAt = set.completed_at || new Date().toISOString();
  else if (completed === false) completedAt = null;

  db.prepare('UPDATE session_sets SET weight = ?, reps = ?, completed_at = ? WHERE id = ?')
    .run(weight ?? null, reps ?? null, completedAt, req.params.setId);

  const updated = db.prepare('SELECT * FROM session_sets WHERE id = ?').get(req.params.setId);
  res.json(updated);
});

export default router;
