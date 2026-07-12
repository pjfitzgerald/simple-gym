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
  arrayMove,
} from '@dnd-kit/sortable'
import SortableExerciseGroup from './SortableExerciseGroup.jsx'
import { useCategories } from '../hooks/useCategories.js'
import './LiveWorkout.css'

// Lock card reordering to the vertical axis: without this a dragged card
// follows the pointer sideways, and dragging right pushes it past the sheet's
// edge — turning the sheet horizontally scrollable and letting dnd-kit
// auto-scroll into empty space. Same as @dnd-kit/modifiers'
// restrictToVerticalAxis, inlined to avoid adding the dependency.
const restrictToVerticalAxis = ({ transform }) => ({ ...transform, x: 0 })

export default function LiveWorkout({ session: initialSession, onEnd, onMinimise }) {
  const { categories } = useCategories()
  const [session] = useState(initialSession)
  const [sets, setSets] = useState(groupSets(initialSession.sets || [], initialSession.notes || {}))
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
  // Offered at the end of a workout started from a template: push the session's
  // exercise order / line-up / set counts back into that template.
  const [showUpdateTemplate, setShowUpdateTemplate] = useState(false)
  // Pressing "End" opens a Save / Discard / Return choice rather than ending
  // immediately, so an accidental tap doesn't save (or lose) a workout.
  const [showEndPrompt, setShowEndPrompt] = useState(false)

  // Per-exercise personal records (heaviest weight + reps at it), from prior
  // sessions only — the benchmark shown grayed in each card while you train.
  const [prs, setPrs] = useState({})

  // Drag-down-to-minimise (the grabber pill behaves like an iOS sheet handle).
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  const draggingRef = useRef(false)
  const sheetStartY = useRef(0)

  // Long-press on the whole card starts a drag; quick taps fall through to
  // the inputs/buttons inside it. Tolerance lets a scroll gesture move on
  // without ever activating a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
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

  useEffect(() => {
    fetch(`/api/exercises/prs?exclude_session=${session.id}`)
      .then(r => r.json())
      .then(setPrs)
      .catch(() => {})
  }, [session.id])

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

  async function refreshSets() {
    const res = await fetch(`/api/sessions/${session.id}`)
    const full = await res.json()
    setSets(groupSets(full.sets, full.notes))
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

  // Remove an exercise (and all its sets) from the session. The card's × button
  // confirms first, so this commits straight away — optimistic locally, then
  // the DELETE on the server.
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

  // Grabber drag handlers: follow the finger down, and minimise if released
  // past the threshold (otherwise spring back to the top).
  function onGrabDown(e) {
    if (!onMinimise) return
    draggingRef.current = true
    setDragging(true)
    sheetStartY.current = e.clientY
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onGrabMove(e) {
    if (!draggingRef.current) return
    setDragY(Math.max(0, e.clientY - sheetStartY.current))
  }

  function onGrabUp() {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    const threshold = Math.min(160, window.innerHeight * 0.25)
    if (dragY > threshold) {
      setClosing(true) // CSS transitions the sheet fully off-screen
      setTimeout(() => onMinimise(), 300)
    } else {
      setDragY(0)
    }
  }

  // "Save" in the End prompt: stop the timer, end the session, then run the
  // template follow-up (save-as-new for ad-hoc, update for template-based).
  async function saveAndEnd() {
    setShowEndPrompt(false)
    clearInterval(timerRef.current)
    await fetch(`/api/sessions/${session.id}/end`, { method: 'PUT' })
    if (sets.length === 0) {
      onEnd()
    } else if (!session.template_id) {
      // Ad-hoc workout: offer to save it as a new template.
      setShowSaveTemplate(true)
    } else {
      // Started from a template: offer to push the session's changes back.
      setShowUpdateTemplate(true)
    }
  }

  // "Discard workout" in the End prompt: delete the session and its sets, no save.
  async function discardWorkout() {
    setShowEndPrompt(false)
    clearInterval(timerRef.current)
    await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' })
    onEnd()
  }

  // Sync this template to match how the session actually went: exercise
  // line-up, order, and set counts (weights/reps are never stored on templates).
  async function handleUpdateTemplate() {
    const exercises = sets.map((g, i) => ({
      exercise_id: g.exercise_id,
      default_sets: g.sets.length,
      sort_order: i,
    }))
    await fetch(`/api/templates/${session.template_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercises }),
    })
    onEnd()
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
    const group = sets[groupIdx]
    const set = group.sets[setIdx]
    const next = set.completed_at == null
    const nowIso = next ? new Date().toISOString() : null
    // Ticking a set with nothing entered adopts the grayed PR placeholder (the
    // previous record shown in the inputs), so a "same as last time" set is a
    // single tap.
    const pr = prs[group.exercise_id]
    const adopt = next && set.weight == null && set.reps == null && pr
    const weight = adopt ? pr.weight : set.weight
    const reps = adopt ? pr.reps : set.reps
    setSets(prev => {
      const updated = [...prev]
      const g = { ...updated[groupIdx], sets: [...updated[groupIdx].sets] }
      g.sets[setIdx] = { ...g.sets[setIdx], completed_at: nowIso, weight, reps }
      updated[groupIdx] = g
      return updated
    })
    await updateSet(set.id, weight, reps, next)
  }

  async function handleSetBlur(groupIdx, setIdx) {
    const set = sets[groupIdx].sets[setIdx]
    await updateSet(set.id, set.weight, set.reps)
  }

  // Manual "fill down": copy this set's weight + reps into every set below it
  // (overwriting their values). Replaces the old automatic first-set copy-down.
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

  if (showUpdateTemplate) {
    return (
      <div className="live-workout workout-sheet">
        <header className="app-header">
          <h1>simple-gym</h1>
        </header>
        <div className="save-template-prompt">
          <h2>Update template?</h2>
          <p className="text-secondary">
            Save this workout's exercise order, line-up and set counts back to
            {session.template_name ? ` “${session.template_name}”` : ' the template'}.
            Weights and reps aren't stored on templates.
          </p>
          <div className="save-template-actions">
            <button type="button" className="btn-ghost" onClick={() => onEnd()}>Skip</button>
            <button type="button" className="btn-primary" onClick={handleUpdateTemplate}>Update Template</button>
          </div>
        </div>
      </div>
    )
  }

  if (showSaveTemplate) {
    return (
      <div className="live-workout workout-sheet">
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

  const sheetStyle = closing
    ? { transform: 'translateY(100vh)' }
    : dragging || dragY
      ? { transform: `translateY(${dragY}px)` }
      : undefined

  return (
    <div
      className={`live-workout workout-sheet${dragging ? ' is-dragging' : ''}${closing ? ' is-closing' : ''}`}
      style={sheetStyle}
    >
      {onMinimise && (
        <div
          className="sheet-grabber"
          role="button"
          tabIndex={0}
          aria-label="Drag down to minimise workout"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onMinimise()
            }
          }}
        >
          <span className="sheet-grabber-pill" />
        </div>
      )}
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
                title="Minimise workout"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
            <button className="btn-finish" onClick={() => setShowEndPrompt(true)}>End</button>
          </div>
        </div>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={sets.map(g => g.exercise_id)} strategy={verticalListSortingStrategy}>
          {sets.map((group, gi) => (
            <SortableExerciseGroup
              key={group.exercise_id}
              group={group}
              gi={gi}
              pr={prs[group.exercise_id]}
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
        <p className="empty-state">Tap "+ Add Exercise" to get started.</p>
      )}

      {showEndPrompt && (
        <div className="end-prompt-backdrop" onClick={() => setShowEndPrompt(false)}>
          <div className="end-prompt" onClick={e => e.stopPropagation()}>
            <h2>End workout?</h2>
            <div className="end-prompt-actions">
              <button className="btn-primary" onClick={saveAndEnd} autoFocus>Save</button>
              <button className="btn-danger" onClick={discardWorkout}>Discard workout</button>
              <button className="btn-ghost" onClick={() => setShowEndPrompt(false)}>Return to workout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
