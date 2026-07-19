import { useState, useEffect } from 'react'
import {
  useSettings,
  unitLabel,
  kgToDisplay,
  displayToKg,
  formatWeight,
} from '../hooks/useSettings.jsx'
import './Settings.css'

export default function Settings({ onSignOut }) {
  const { unit, setUnit, density, setDensity, theme, setTheme } = useSettings()

  // PR management: exercises carry their manual override (manual_pr_weight/reps)
  // via SELECT *, while /prs gives the combined value actually displayed.
  const [exercises, setExercises] = useState([])
  const [prs, setPrs] = useState({})
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ weight: '', reps: '' })

  useEffect(() => {
    loadPrData()
  }, [])

  async function loadPrData() {
    const [exRes, prRes] = await Promise.all([
      fetch('/api/exercises'),
      fetch('/api/exercises/prs'),
    ])
    setExercises(await exRes.json())
    setPrs(await prRes.json())
  }

  function startEdit(ex) {
    const pr = prs[ex.id]
    // Seed the form from the manual value if set, else the current PR, so the
    // user adjusts from a sensible starting point rather than a blank field.
    const seedKg = ex.manual_pr_weight ?? pr?.weight ?? null
    const seedReps = ex.manual_pr_reps ?? pr?.reps ?? ''
    setDraft({
      weight: seedKg == null ? '' : formatWeight(seedKg, unit),
      reps: seedReps === '' ? '' : String(seedReps),
    })
    setEditingId(ex.id)
  }

  async function saveEdit(ex) {
    const w = parseFloat(draft.weight)
    const r = parseInt(draft.reps, 10)
    if (!Number.isFinite(w) || w < 0 || !Number.isInteger(r) || r < 1) {
      alert('Enter a weight (0 or more) and reps (1 or more).')
      return
    }
    const res = await fetch(`/api/exercises/${ex.id}/pr`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight: displayToKg(w, unit), reps: r }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Could not save PR.')
      return
    }
    setEditingId(null)
    await loadPrData()
  }

  async function clearPr(ex) {
    await fetch(`/api/exercises/${ex.id}/pr`, { method: 'DELETE' })
    setEditingId(null)
    await loadPrData()
  }

  const filtered = exercises.filter(
    ex => !search || ex.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="settings">
      <div className="pane-header settings-header">
        <h2>Settings</h2>
      </div>

      <section className="settings-section">
        <h3>Units</h3>
        <p className="settings-hint">Weight display across the app.</p>
        <div className="settings-segmented">
          {['kg', 'lbs'].map(u => (
            <button
              key={u}
              className={`segmented-option ${unit === u ? 'active' : ''}`}
              onClick={() => setUnit(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Display density</h3>
        <p className="settings-hint">Compact tightens spacing for a denser layout.</p>
        <div className="settings-segmented">
          {[
            ['comfortable', 'Comfortable'],
            ['compact', 'Compact'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`segmented-option ${density === value ? 'active' : ''}`}
              onClick={() => setDensity(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Theme</h3>
        <p className="settings-hint">Auto follows your device's light/dark setting.</p>
        <div className="settings-segmented">
          {[
            ['auto', 'Auto'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`segmented-option ${theme === value ? 'active' : ''}`}
              onClick={() => setTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Personal records</h3>
        <p className="settings-hint">
          Manually set or correct a PR. A heavier logged set still takes over.
        </p>
        <input
          type="search"
          className="settings-pr-search"
          placeholder="Search exercises…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="settings-pr-list">
          {filtered.length === 0 && <p className="empty-state">No exercises found</p>}
          {filtered.map(ex => {
            const pr = prs[ex.id]
            const isEditing = editingId === ex.id
            return (
              <div key={ex.id} className="settings-pr-row">
                <div className="settings-pr-head">
                  <div className="settings-pr-info">
                    <span className="settings-pr-name">{ex.name}</span>
                    <span className="settings-pr-value">
                      {pr
                        ? `${formatWeight(pr.weight, unit)} ${unitLabel(unit)} × ${pr.reps}${pr.manual ? ' (manual)' : ''}`
                        : 'No PR yet'}
                    </span>
                  </div>
                  {!isEditing && (
                    <button className="btn-ghost" onClick={() => startEdit(ex)}>
                      {ex.manual_pr_weight != null ? 'Edit' : 'Set'}
                    </button>
                  )}
                </div>

                {isEditing && (
                  <div className="settings-pr-edit">
                    <label>
                      Weight ({unitLabel(unit)})
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.weight}
                        onChange={e => setDraft(d => ({ ...d, weight: e.target.value }))}
                        autoFocus
                      />
                    </label>
                    <label>
                      Reps
                      <input
                        type="number"
                        inputMode="numeric"
                        value={draft.reps}
                        onChange={e => setDraft(d => ({ ...d, reps: e.target.value }))}
                      />
                    </label>
                    <div className="settings-pr-edit-actions">
                      {ex.manual_pr_weight != null && (
                        <button className="btn-danger" onClick={() => clearPr(ex)}>Clear</button>
                      )}
                      <button className="btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                      <button className="btn-primary btn-small" onClick={() => saveEdit(ex)}>Save</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="settings-section">
        <h3>Account</h3>
        <p className="settings-hint">Signing out on this device only — the token is discarded.</p>
        <button
          className="btn-ghost"
          onClick={() => { if (confirm('Sign out?')) onSignOut() }}
        >
          Sign out
        </button>
      </section>
    </div>
  )
}
