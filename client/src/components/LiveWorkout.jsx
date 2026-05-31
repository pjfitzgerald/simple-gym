import { useState, useEffect, useRef } from 'react'
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
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './LiveWorkout.css'

const MUSCLE_GROUPS = ['all', 'chest', 'back', 'legs', 'shoulders', 'arms', 'core']

// One exercise group, made draggable for reordering. Only the handle starts
// a drag, so the inputs and the rest of the card stay normally interactive.
function SortableExerciseGroup({ group, gi, onAddSet, onDeleteSet, onRemoveExercise, onSetChange, onSetBlur, onToggleComplete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.exercise_id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 2 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="exercise-group">
      <div className="group-header">
        <div>
          <h3>{group.exercise_name}</h3>
          <span className="group-muscle">{group.muscle_group}</span>
        </div>
        <div className="group-actions">
          <button
            type="button"
            className="btn-drag-handle"
            aria-label="Drag to reorder exercise"
            {...attributes}
            {...listeners}
          >⠿</button>
          <button
            type="button"
            className="btn-remove-exercise"
            onClick={() => onRemoveExercise(group.exercise_id)}
            aria-label="Remove exercise"
          >×</button>
        </div>
      </div>

      <div className="sets-table">
        <div className="sets-row sets-header-row">
          <span className="set-col-num">Set</span>
          <span className="set-col-weight">Weight</span>
          <span className="set-col-reps">Reps</span>
          <span className="set-col-actions"></span>
        </div>

        {group.sets.map((set, si) => {
          const isComplete = set.completed_at != null
          return (
          <div key={set.id} className={`sets-row ${isComplete ? 'completed' : ''}`}>
            <span className="set-col-num">{set.set_number}</span>
            <input
              className="set-col-weight"
              type="number"
              inputMode="decimal"
              placeholder="kg"
              value={set.weight ?? ''}
              onChange={e => onSetChange(gi, si, 'weight', e.target.value ? parseFloat(e.target.value) : null)}
              onBlur={() => onSetBlur(gi, si)}
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
              onChange={e => onSetChange(gi, si, 'reps', e.target.value ? parseInt(e.target.value) : null)}
              onBlur={() => onSetBlur(gi, si)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onSetBlur(gi, si)
                  e.target.blur()
                }
              }}
            />
            <span className="set-col-actions">
              {!isComplete && (
                <button
                  className="btn-icon btn-delete-set"
                  onClick={() => onDeleteSet(set.id)}
                  aria-label="Delete set"
                >×</button>
              )}
              <button
                className={`btn-toggle-complete ${isComplete ? 'is-complete' : ''}`}
                onClick={() => onToggleComplete(gi, si)}
                aria-label={isComplete ? 'Mark set incomplete' : 'Mark set complete'}
              >{isComplete ? '✓' : ''}</button>
            </span>
          </div>
          )
        })}
      </div>

      <button className="btn-add-set" onClick={() => onAddSet(group.exercise_id)}>
        + Add Set
      </button>
    </div>
  )
}

export default function LiveWorkout({ session: initialSession, onEnd, onMinimise }) {
  const [session] = useState(initialSession)
  const [sets, setSets] = useState(groupSets(initialSession.sets || []))
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  // Shift the timer base forward by accumulated paused time so a resumed
  // session continues from where it stopped instead of jumping forward by
  // the idle gap.
  const startTime = useRef(
    new Date(initialSession.started_at).getTime() + (initialSession.paused_seconds || 0) * 1000
  )

  // Exercise picker state
  const [showPicker, setShowPicker] = useState(false)
  const [allExercises, setAllExercises] = useState([])
  const [pickerFilter, setPickerFilter] = useState('all')
  const [pickerSearch, setPickerSearch] = useState('')

  // Save-as-template state
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // Touch needs a short press-hold so a scroll/tap isn't read as a drag;
  // mouse uses a small movement threshold.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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

  async function updateSet(setId, weight, reps, completed) {
    const body = { weight: weight ?? null, reps: reps ?? null }
    if (completed !== undefined) body.completed = completed
    const res = await fetch(`/api/sessions/${session.id}/sets/${setId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

  // Persist exercise group order so it survives refreshSets() and reloads.
  // The body is the absolute order, so the latest call always wins.
  async function persistOrder(orderedGroups) {
    try {
      await fetch(`/api/sessions/${session.id}/exercises/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderedGroups.map(g => g.exercise_id) }),
      })
    } catch {
      // Offline: the local reorder still shows; it just won't survive a reload.
    }
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

  // Drop an exercise from this session only — the template is untouched.
  async function removeExercise(exerciseId) {
    if (!confirm('Remove this exercise from this workout? Its logged sets will be lost.')) return
    await fetch(`/api/sessions/${session.id}/exercises/${exerciseId}`, { method: 'DELETE' })
    await refreshSets()
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

    // Fill empty later sets with the first set's values (each field
    // independently, never overwriting one the user has already filled).
    if (setIdx !== 0) return
    const group = sets[groupIdx]
    const first = group.sets[0]
    const toFill = []
    for (let i = 1; i < group.sets.length; i++) {
      const s = group.sets[i]
      const newWeight = s.weight == null && first.weight != null ? first.weight : s.weight
      const newReps = s.reps == null && first.reps != null ? first.reps : s.reps
      if (newWeight !== s.weight || newReps !== s.reps) {
        toFill.push({ idx: i, id: s.id, weight: newWeight, reps: newReps })
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

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const completedSets = sets.reduce((acc, g) => acc + g.sets.filter(s => s.completed_at != null).length, 0)
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
          <div className="workout-header-actions">
            {onMinimise && (
              <button
                className="btn-minimise"
                onClick={onMinimise}
                aria-label="Minimise workout"
              >▾</button>
            )}
            <button className="btn-finish" onClick={handleFinish}>Finish</button>
          </div>
        </div>
      </header>

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
