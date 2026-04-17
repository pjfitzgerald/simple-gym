import { useState, useEffect, useRef } from 'react'
import './LiveWorkout.css'

const MUSCLE_GROUPS = ['all', 'chest', 'back', 'legs', 'shoulders', 'arms', 'core']

export default function LiveWorkout({ session: initialSession, onEnd }) {
  const [session, setSession] = useState(initialSession)
  const [sets, setSets] = useState(groupSets(initialSession.sets || []))
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const startTime = useRef(new Date(initialSession.started_at).getTime())

  // Exercise picker state
  const [showPicker, setShowPicker] = useState(false)
  const [allExercises, setAllExercises] = useState([])
  const [pickerFilter, setPickerFilter] = useState('all')
  const [pickerSearch, setPickerSearch] = useState('')

  // Save-as-template state
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(setAllExercises)
  }, [])

  function groupSets(flatSets) {
    const groups = {}
    const order = []
    for (const s of flatSets) {
      const key = s.exercise_id
      if (!groups[key]) {
        groups[key] = {
          exercise_id: s.exercise_id,
          exercise_name: s.exercise_name,
          muscle_group: s.muscle_group,
          sets: [],
        }
        order.push(key)
      }
      groups[key].sets.push(s)
    }
    return order.map(k => groups[k])
  }

  async function refreshSets() {
    const res = await fetch(`/api/sessions/${session.id}`)
    const full = await res.json()
    setSets(groupSets(full.sets))
  }

  async function updateSet(setId, weight, reps) {
    const res = await fetch(`/api/sessions/${session.id}/sets/${setId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight: weight || null, reps: reps || null }),
    })
    return res.json()
  }

  async function deleteSet(setId) {
    await fetch(`/api/sessions/${session.id}/sets/${setId}`, { method: 'DELETE' })
    await refreshSets()
  }

  async function addSet(exerciseId) {
    const group = sets.find(g => g.exercise_id === exerciseId)
    const nextNum = group ? group.sets.length + 1 : 1
    await fetch(`/api/sessions/${session.id}/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_id: exerciseId, set_number: nextNum }),
    })
    await refreshSets()
  }

  async function addExerciseToSession(exercise) {
    await fetch(`/api/sessions/${session.id}/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_id: exercise.id, set_number: 1 }),
    })
    await refreshSets()
    setShowPicker(false)
    setPickerSearch('')
  }

  function moveExercise(groupIdx, direction) {
    const target = groupIdx + direction
    if (target < 0 || target >= sets.length) return
    const updated = [...sets]
    ;[updated[groupIdx], updated[target]] = [updated[target], updated[groupIdx]]
    setSets(updated)
  }

  async function handleFinish() {
    if (!confirm('End this workout?')) return
    clearInterval(timerRef.current)
    await fetch(`/api/sessions/${session.id}/end`, { method: 'PUT' })
    // If session has exercises and no template, offer to save as template
    if (sets.length > 0 && !session.template_id) {
      setShowSaveTemplate(true)
    } else {
      onEnd()
    }
  }

  async function handleSaveTemplate(e) {
    e?.preventDefault()
    if (!templateName.trim()) return
    const exercises = sets.map((g, i) => ({
      exercise_id: g.exercise_id,
      default_sets: g.sets.length,
      sort_order: i,
    }))
    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName.trim(), exercises }),
    })
    onEnd()
  }

  function handleSetChange(groupIdx, setIdx, field, value) {
    setSets(prev => {
      const updated = [...prev]
      const group = { ...updated[groupIdx], sets: [...updated[groupIdx].sets] }
      group.sets[setIdx] = { ...group.sets[setIdx], [field]: value }
      updated[groupIdx] = group
      return updated
    })
  }

  async function handleSetBlur(groupIdx, setIdx) {
    const set = sets[groupIdx].sets[setIdx]
    await updateSet(set.id, set.weight, set.reps)
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const completedSets = sets.reduce((acc, g) => acc + g.sets.filter(s => s.reps != null).length, 0)
  const totalSets = sets.reduce((acc, g) => acc + g.sets.length, 0)

  const filteredExercises = allExercises.filter(ex => {
    const matchesGroup = pickerFilter === 'all' || ex.muscle_group === pickerFilter
    const matchesSearch = !pickerSearch || ex.name.toLowerCase().includes(pickerSearch.toLowerCase())
    const notAlreadyAdded = !sets.some(g => g.exercise_id === ex.id)
    return matchesGroup && matchesSearch && notAlreadyAdded
  })

  if (showSaveTemplate) {
    return (
      <div className="live-workout">
        <header className="app-header">
          <h1>simple-gym</h1>
        </header>
        <div className="save-template-prompt">
          <h2>Save as Template?</h2>
          <p className="text-secondary">Save this workout as a reusable template for next time.</p>
          <form onSubmit={handleSaveTemplate}>
            <input
              type="text"
              placeholder="Template name (e.g. Push Day)"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              autoFocus
            />
            <div className="save-template-actions">
              <button type="button" className="btn-ghost" onClick={() => onEnd()}>Skip</button>
              <button type="submit" className="btn-primary" disabled={!templateName.trim()}>Save Template</button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="live-workout">
      <header className="app-header workout-header">
        <div className="workout-header-row">
          <div>
            <h1>simple-gym</h1>
            <div className="workout-timer">
              <span className="timer-value">{formatTime(elapsed)}</span>
              <span className="timer-label">{completedSets}/{totalSets} sets</span>
            </div>
          </div>
          <button className="btn-finish" onClick={handleFinish}>Finish</button>
        </div>
      </header>

      {sets.map((group, gi) => (
        <div key={group.exercise_id} className="exercise-group">
          <div className="group-header">
            <div>
              <h3>{group.exercise_name}</h3>
              <span className="group-muscle">{group.muscle_group}</span>
            </div>
            <div className="group-actions">
              <button className="btn-icon" onClick={() => moveExercise(gi, -1)} disabled={gi === 0}>^</button>
              <button className="btn-icon" onClick={() => moveExercise(gi, 1)} disabled={gi === sets.length - 1}>v</button>
            </div>
          </div>

          <div className="sets-table">
            <div className="sets-row sets-header-row">
              <span className="set-col-num">Set</span>
              <span className="set-col-weight">Weight</span>
              <span className="set-col-reps">Reps</span>
              <span className="set-col-actions"></span>
            </div>

            {group.sets.map((set, si) => (
              <div key={set.id} className={`sets-row ${set.reps != null ? 'completed' : ''}`}>
                <span className="set-col-num">{set.set_number}</span>
                <input
                  className="set-col-weight"
                  type="number"
                  inputMode="decimal"
                  placeholder="lbs"
                  value={set.weight ?? ''}
                  onChange={e => handleSetChange(gi, si, 'weight', e.target.value ? parseFloat(e.target.value) : null)}
                  onBlur={() => handleSetBlur(gi, si)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.target.nextElementSibling?.focus()
                    }
                  }}
                />
                <input
                  className="set-col-reps"
                  type="number"
                  inputMode="numeric"
                  placeholder="reps"
                  value={set.reps ?? ''}
                  onChange={e => handleSetChange(gi, si, 'reps', e.target.value ? parseInt(e.target.value) : null)}
                  onBlur={() => handleSetBlur(gi, si)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSetBlur(gi, si)
                      e.target.blur()
                    }
                  }}
                />
                <span className="set-col-actions">
                  {set.reps != null
                    ? <span className="set-check">✓</span>
                    : <button className="btn-icon btn-delete-set" onClick={() => deleteSet(set.id)}>×</button>
                  }
                </span>
              </div>
            ))}
          </div>

          <button className="btn-add-set" onClick={() => addSet(group.exercise_id)}>
            + Add Set
          </button>
        </div>
      ))}

      <button className="btn-add-exercise" onClick={() => setShowPicker(!showPicker)}>
        + Add Exercise
      </button>

      {showPicker && (
        <div className="exercise-picker">
          <input
            type="search"
            placeholder="Search exercises..."
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            autoFocus
          />
          <div className="filter-tabs">
            {MUSCLE_GROUPS.map(group => (
              <button
                key={group}
                className={`filter-tab ${pickerFilter === group ? 'active' : ''}`}
                onClick={() => setPickerFilter(group)}
              >
                {group}
              </button>
            ))}
          </div>
          <div className="picker-list">
            {filteredExercises.map(ex => (
              <button
                key={ex.id}
                className="picker-item"
                onClick={() => addExerciseToSession(ex)}
              >
                <span>{ex.name}</span>
                <span className="exercise-group">{ex.muscle_group}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sets.length === 0 && !showPicker && (
        <p className="empty-state">Tap "+ Add Exercise" to get started.</p>
      )}
    </div>
  )
}
