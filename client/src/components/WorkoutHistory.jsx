import { useState, useEffect, useRef } from 'react'
import WorkoutEdit from './WorkoutEdit.jsx'
import { useSettings, formatWeight, unitLabel } from '../hooks/useSettings.jsx'
import './WorkoutHistory.css'

// The tab panes remount on every tab switch, so cache the last-fetched
// sessions module-side. Re-entering History then renders its cards instantly
// from the cache (and still refetches in the background) instead of flashing
// an empty list + "no workouts" message while a fresh fetch resolves.
let sessionsCache = null

export default function WorkoutHistory({ onResume }) {
  const { unit } = useSettings()
  const [sessions, setSessions] = useState(sessionsCache ?? [])
  // Only trust an empty list once a fetch has actually completed, so the
  // empty-state message never shows during the initial load.
  const [loaded, setLoaded] = useState(sessionsCache != null)
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(false)
  const fileInputRef = useRef(null)

  function storeSessions(next) {
    sessionsCache = next
    setSessions(next)
  }

  // Import history from a CSV in the export's shape. The endpoint skips
  // workouts already present and auto-creates any missing exercises, so this
  // is safe to re-run; we just refresh the list and report a summary.
  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-selected later
    if (!file) return
    const text = await file.text()
    const res = await fetch('/api/sessions/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: text,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Import failed.')
      return
    }
    const r = await res.json()
    const parts = [`Imported ${r.importedSessions} workout${r.importedSessions === 1 ? '' : 's'} (${r.importedSets} set${r.importedSets === 1 ? '' : 's'})`]
    if (r.skippedSessions) parts.push(`skipped ${r.skippedSessions} already present`)
    if (r.createdExercises) parts.push(`created ${r.createdExercises} exercise${r.createdExercises === 1 ? '' : 's'}`)
    alert(parts.join(', ') + '.')
    const listRes = await fetch('/api/sessions')
    storeSessions(await listRes.json())
    setLoaded(true)
  }

  useEffect(() => {
    fetch('/api/sessions').then(r => r.json()).then(data => {
      storeSessions(data)
      setLoaded(true)
    })
  }, [])

  async function viewDetail(session) {
    const res = await fetch(`/api/sessions/${session.id}`)
    setDetail(await res.json())
  }

  async function deleteSession(id) {
    if (!confirm('Delete this workout? This cannot be undone.')) return
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    storeSessions(sessions.filter(s => s.id !== id))
    setDetail(null)
  }

  // After editing, refresh both the list and the detail so any time/duration
  // or set changes show up immediately.
  async function closeEdit() {
    setEditing(false)
    const [listRes, detailRes] = await Promise.all([
      fetch('/api/sessions'),
      fetch(`/api/sessions/${detail.id}`),
    ])
    storeSessions(await listRes.json())
    setDetail(await detailRes.json())
  }

  async function resumeSession(id) {
    if (!confirm('Resume this workout? The timer will continue from where it stopped.')) return
    const res = await fetch(`/api/sessions/${id}/resume`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Could not resume this session.')
      return
    }
    const fresh = await res.json()
    onResume?.(fresh)
  }

  function formatDuration(seconds) {
    if (!seconds) return '--'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  if (editing && detail) {
    return <WorkoutEdit session={detail} onClose={closeEdit} />
  }

  if (detail) {
    // Preserve the session's exercise order (sets arrive sorted by sort_order).
    // A plain object keyed by exercise_id would re-sort integer-like keys
    // numerically and lose any mid-session reorder, so track order explicitly.
    const grouped = {}
    const order = []
    for (const set of detail.sets) {
      if (!grouped[set.exercise_id]) {
        grouped[set.exercise_id] = {
          name: set.exercise_name,
          muscle_group: set.muscle_group,
          notes: detail.notes?.[set.exercise_id] || '',
          sets: [],
        }
        order.push(set.exercise_id)
      }
      grouped[set.exercise_id].sets.push(set)
    }
    const groups = order.map(k => grouped[k])

    return (
      <div className="history-detail">
        <div className="detail-toolbar">
          <button className="btn-ghost" onClick={() => setDetail(null)}>Back</button>
          <div className="detail-toolbar-right">
            {detail.ended_at && (
              <>
                <button className="btn-ghost" onClick={() => setEditing(true)}>Edit</button>
                <button className="btn-ghost" onClick={() => resumeSession(detail.id)}>Resume</button>
              </>
            )}
            <button className="btn-danger" onClick={() => deleteSession(detail.id)}>Delete</button>
          </div>
        </div>
        <div className="detail-header">
          <h2>{detail.template_name || 'Blank Workout'}</h2>
          <span className="detail-meta">
            {formatDate(detail.started_at)} at {formatTime(detail.started_at)} — {formatDuration(detail.duration_seconds)}
          </span>
        </div>

        {groups.map((group, i) => (
          <div key={i} className="detail-exercise">
            <div className="detail-exercise-header">
              <h3>{group.name}</h3>
              <span className="exercise-group">{group.muscle_group}</span>
            </div>
            {group.notes && <p className="detail-note">{group.notes}</p>}
            <div className="detail-sets">
              {group.sets.map(set => (
                <div key={set.id} className={`detail-set ${set.completed_at ? '' : 'skipped'}`}>
                  <span className="set-num">Set {set.set_number}</span>
                  {set.reps != null ? (
                    <span className="set-data">{formatWeight(set.weight ?? 0, unit)} {unitLabel(unit)} x {set.reps}</span>
                  ) : (
                    <span className="set-data skipped-text">—</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {detail.sets.length === 0 && (
          <p className="empty-state">No sets logged in this session</p>
        )}
      </div>
    )
  }

  return (
    <div className="workout-history">
      <div className="history-header">
        <h2>History</h2>
        <div className="history-actions">
          <button className="btn-ghost" onClick={() => fileInputRef.current?.click()}>Import</button>
          {sessions.length > 0 && (
            <button className="btn-ghost" onClick={() => { window.location.href = '/api/sessions/export' }}>
              Export
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            hidden
          />
        </div>
      </div>

      {loaded && sessions.length === 0 && (
        <p className="empty-state">No workouts yet. Complete a session to see it here.</p>
      )}

      {sessions.map(s => (
        <div key={s.id} className="history-card" onClick={() => viewDetail(s)}>
          <div className="history-info">
            <span className="history-name">{s.template_name || 'Blank Workout'}</span>
            <span className="history-meta">
              {formatDate(s.started_at)} — {formatDuration(s.duration_seconds)} — {s.total_sets} set{s.total_sets !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="history-arrow">›</span>
        </div>
      ))}
    </div>
  )
}
