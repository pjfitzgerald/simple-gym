import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import SortableExerciseGroup from './SortableExerciseGroup.jsx'
import { useCategories } from '../hooks/useCategories.js'
import './LiveWorkout.css'
import './WorkoutEdit.css'

// Local timezone-aware <-> ISO conversion for <input type="datetime-local">.
// The input gives/receives "YYYY-MM-DDTHH:mm" interpreted as local time.
function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(local) {
  if (!local) return null
  return new Date(local).toISOString()
}

function groupSets(flatSets, notes = {}) {
  const groups = {}
  const order = []
  for (const s of flatSets) {
    const key = s.exercise_id
    if (!groups[key]) {
      groups[key] = {
        exercise_id: s.exercise_id,
        exercise_name: s.exercise_name,
        muscle_group: s.muscle_group,
        notes: notes[s.exercise_id] ?? '',
        sets: [],
      }
      order.push(key)
    }
    groups[key].sets.push(s)
  }
  return order.map(k => groups[k])
}

export default function WorkoutEdit({ session: initialSession, onClose }) {
  const { categories } = useCategories()
  const [session, setSession] = useState(initialSession)
  const [sets, setSets] = useState(groupSets(initialSession.sets || [], initialSession.notes || {}))
  const [startedLocal, setStartedLocal] = useState(isoToLocalInput(initialSession.started_at))
  const [endedLocal, setEndedLocal] = useState(isoToLocalInput(initialSession.ended_at))
  const [timesError, setTimesError] = useState(null)

  const [showPicker, setShowPicker] = useState(false)
  const [allExercises, setAllExercises] = useState([])
  const [pickerFilter, setPickerFilter] = useState('all')
  const [pickerSearch, setPickerSearch] = useState('')

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(setAllExercises)
  }, [])

  async function refreshSets() {
    const res = await fetch(`/api/sessions/${session.id}`)
    const full = await res.json()
    setSession(full)
    setSets(groupSets(full.sets, full.notes))
  }

  async function updateSet(setId, weight, reps, completed) {
    const body = { weight: weight ?? null, reps: reps ?? null }
    if (completed !== undefined) body.completed = completed
    await fetch(`/api/sessions/${session.id}/sets/${setId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async function deleteSet(setId) {
    await fetch(`/api/sessions/${session.id}/sets/${setId}`, { method: 'DELETE' })
    await refreshSets()
  }

  // Remove an exercise (and its sets) from the session. The card's × button
  // confirms first, so this deletes straight away, then refreshes.
  async function removeExercise(exerciseId) {
    setSets(prev => prev.filter(g => g.exercise_id !== exerciseId))
    await fetch(`/api/sessions/${session.id}/exercises/${exerciseId}`, { method: 'DELETE' }).catch(() => {})
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

  async function persistOrder(orderedGroups) {
    try {
      await fetch(`/api/sessions/${session.id}/exercises/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderedGroups.map(g => g.exercise_id) }),
      })
    } catch {}
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = sets.findIndex(g => g.exercise_id === active.id)
    const newIdx = sets.findIndex(g => g.exercise_id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(sets, oldIdx, newIdx)
    setSets(reordered)
    persistOrder(reordered)
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

  async function handleToggleComplete(groupIdx, setIdx) {
    const set = sets[groupIdx].sets[setIdx]
    const next = set.completed_at == null
    const nowIso = next ? new Date().toISOString() : null
    setSets(prev => {
      const updated = [...prev]
      const g = { ...updated[groupIdx], sets: [...updated[groupIdx].sets] }
      g.sets[setIdx] = { ...g.sets[setIdx], completed_at: nowIso }
      updated[groupIdx] = g
      return updated
    })
    await updateSet(set.id, set.weight, set.reps, next)
  }

  async function handleSetBlur(groupIdx, setIdx) {
    const set = sets[groupIdx].sets[setIdx]
    await updateSet(set.id, set.weight, set.reps)
  }

  // Copy this set's weight + reps into every set below it in the same card.
  async function handleFillDown(groupIdx, setIdx) {
    const group = sets[groupIdx]
    const src = group.sets[setIdx]
    const toFill = []
    for (let i = setIdx + 1; i < group.sets.length; i++) {
      const s = group.sets[i]
      if (s.weight !== src.weight || s.reps !== src.reps) {
        toFill.push({ idx: i, id: s.id, weight: src.weight, reps: src.reps })
      }
    }
    if (toFill.length === 0) return
    setSets(prev => {
      const updated = [...prev]
      const g = { ...updated[groupIdx], sets: [...updated[groupIdx].sets] }
      for (const f of toFill) {
        g.sets[f.idx] = { ...g.sets[f.idx], weight: f.weight, reps: f.reps }
      }
      updated[groupIdx] = g
      return updated
    })
    await Promise.all(toFill.map(f => updateSet(f.id, f.weight, f.reps)))
  }

  function handleNotesChange(groupIdx, value) {
    setSets(prev => {
      const updated = [...prev]
      updated[groupIdx] = { ...updated[groupIdx], notes: value }
      return updated
    })
  }

  async function handleNotesBlur(groupIdx) {
    const group = sets[groupIdx]
    await fetch(`/api/sessions/${session.id}/exercises/${group.exercise_id}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: group.notes ?? '' }),
    })
  }

  async function saveTimes() {
    setTimesError(null)
    if (!startedLocal || !endedLocal) {
      setTimesError('Both start and end times are required.')
      return
    }
    const startIso = localInputToIso(startedLocal)
    const endIso = localInputToIso(endedLocal)
    if (new Date(endIso) < new Date(startIso)) {
      setTimesError('End time must be after start time.')
      return
    }
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ started_at: startIso, ended_at: endIso }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setTimesError(err.error || 'Could not save times.')
      return
    }
    const fresh = await res.json()
    setSession(fresh)
    setSets(groupSets(fresh.sets, fresh.notes))
  }

  function formatDuration(seconds) {
    if (seconds == null) return '—'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const filteredExercises = allExercises.filter(ex => {
    const matchesGroup = pickerFilter === 'all' || ex.muscle_group === pickerFilter
    const matchesSearch = !pickerSearch || ex.name.toLowerCase().includes(pickerSearch.toLowerCase())
    const notAlreadyAdded = !sets.some(g => g.exercise_id === ex.id)
    return matchesGroup && matchesSearch && notAlreadyAdded
  })

  return (
    <div className="live-workout workout-edit no-tab-swipe">
      <header className="app-header workout-header">
        <div className="workout-header-row">
          <div>
            <h1>simple-gym</h1>
            <div className="workout-timer">
              <span className="timer-label">Editing — {formatDuration(session.duration_seconds)}</span>
            </div>
          </div>
          <div className="workout-header-actions">
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </header>

      <section className="edit-times">
        <label className="edit-times-row">
          <span>Start</span>
          <input
            type="datetime-local"
            value={startedLocal}
            onChange={e => setStartedLocal(e.target.value)}
            onBlur={saveTimes}
          />
        </label>
        <label className="edit-times-row">
          <span>End</span>
          <input
            type="datetime-local"
            value={endedLocal}
            onChange={e => setEndedLocal(e.target.value)}
            onBlur={saveTimes}
          />
        </label>
        {timesError && <p className="edit-times-error">{timesError}</p>}
      </section>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sets.map(g => g.exercise_id)} strategy={verticalListSortingStrategy}>
          {sets.map((group, gi) => (
            <SortableExerciseGroup
              key={group.exercise_id}
              group={group}
              gi={gi}
              onAddSet={addSet}
              onDeleteSet={deleteSet}
              onRemoveExercise={removeExercise}
              onSetChange={handleSetChange}
              onSetBlur={handleSetBlur}
              onToggleComplete={handleToggleComplete}
              onFillDown={handleFillDown}
              onNotesChange={handleNotesChange}
              onNotesBlur={handleNotesBlur}
            />
          ))}
        </SortableContext>
      </DndContext>

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
            {['all', ...categories].map(group => (
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
        <p className="empty-state">No exercises in this workout. Tap "+ Add Exercise" to add one.</p>
      )}
    </div>
  )
}
