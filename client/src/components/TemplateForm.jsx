import { useState, useEffect } from 'react'
import { useCategories } from '../hooks/useCategories.js'
import './TemplateForm.css'

export default function TemplateForm({ template, onDone, onCancel }) {
  const { categories } = useCategories()
  const [name, setName] = useState(template?.name || '')
  const [selectedExercises, setSelectedExercises] = useState([])
  const [allExercises, setAllExercises] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  // Exercise ids ticked in the picker but not yet committed — lets you bulk
  // select several and add them all in one tap.
  const [pending, setPending] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(setAllExercises)
    if (template?.exercises) {
      setSelectedExercises(template.exercises.map(ex => ({
        exercise_id: ex.id,
        name: ex.name,
        muscle_group: ex.muscle_group,
        default_sets: ex.default_sets,
      })))
    }
  }, [])

  async function handleSave(e) {
    e?.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Template name is required')
      return
    }

    const body = {
      name: name.trim(),
      exercises: selectedExercises.map((ex, i) => ({
        exercise_id: ex.exercise_id,
        default_sets: ex.default_sets,
        sort_order: i,
      })),
    }

    const url = template ? `/api/templates/${template.id}` : '/api/templates'
    const method = template ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Something went wrong')
      return
    }

    onDone()
  }

  function togglePending(id) {
    setPending(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Commit every ticked exercise to the template at once, then close the picker.
  function addSelected() {
    const toAdd = allExercises.filter(
      ex => pending.includes(ex.id) && !selectedExercises.some(s => s.exercise_id === ex.id)
    )
    setSelectedExercises([
      ...selectedExercises,
      ...toAdd.map(ex => ({
        exercise_id: ex.id,
        name: ex.name,
        muscle_group: ex.muscle_group,
        default_sets: 3,
      })),
    ])
    setPending([])
    setShowPicker(false)
    setSearch('')
  }

  function togglePicker() {
    setPending([])
    setSearch('')
    setShowPicker(s => !s)
  }

  function removeExercise(index) {
    setSelectedExercises(selectedExercises.filter((_, i) => i !== index))
  }

  function updateSets(index, sets) {
    const value = Math.max(1, Math.min(20, parseInt(sets) || 1))
    setSelectedExercises(selectedExercises.map((ex, i) =>
      i === index ? { ...ex, default_sets: value } : ex
    ))
  }

  function moveExercise(index, direction) {
    const target = index + direction
    if (target < 0 || target >= selectedExercises.length) return
    const updated = [...selectedExercises]
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    setSelectedExercises(updated)
  }

  const filteredExercises = allExercises.filter(ex => {
    const matchesGroup = filter === 'all' || ex.muscle_group === filter
    const matchesSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase())
    return matchesGroup && matchesSearch
  })

  return (
    <form className="template-form" onSubmit={handleSave}>
      <div className="template-form-header">
        <h2>{template ? 'Edit Template' : 'New Template'}</h2>
      </div>

      {error && <p className="form-error">{error}</p>}

      <input
        type="text"
        placeholder="Template name (e.g. Push Day)"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />

      <div className="selected-exercises">
        <div className="section-header">
          <h3>Exercises ({selectedExercises.length})</h3>
          <button type="button" className="btn-primary btn-small" onClick={togglePicker}>
            + Add
          </button>
        </div>

        {selectedExercises.length === 0 && (
          <p className="empty-state">No exercises added yet</p>
        )}

        {selectedExercises.map((ex, i) => (
          <div key={`${ex.exercise_id}-${i}`} className="selected-exercise">
            <div className="reorder-buttons">
              <button
                type="button"
                className="btn-icon"
                onClick={() => moveExercise(i, -1)}
                disabled={i === 0}
              >^</button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => moveExercise(i, 1)}
                disabled={i === selectedExercises.length - 1}
              >v</button>
            </div>
            <div className="selected-exercise-info">
              <span className="exercise-name">{ex.name}</span>
              <span className="exercise-group">{ex.muscle_group}</span>
            </div>
            <div className="sets-control">
              <button type="button" className="btn-icon" onClick={() => updateSets(i, ex.default_sets - 1)}>-</button>
              <span className="sets-count">{ex.default_sets}</span>
              <button type="button" className="btn-icon" onClick={() => updateSets(i, ex.default_sets + 1)}>+</button>
              <span className="sets-label">sets</span>
            </div>
            <button type="button" className="btn-icon btn-remove" onClick={() => removeExercise(i)}>x</button>
          </div>
        ))}
      </div>

      {showPicker && (
        <div className="exercise-picker">
          <input
            type="search"
            placeholder="Search exercises..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="filter-tabs">
            {['all', ...categories].map(group => (
              <button
                type="button"
                key={group}
                className={`filter-tab ${filter === group ? 'active' : ''}`}
                onClick={() => setFilter(group)}
              >
                {group}
              </button>
            ))}
          </div>
          <div className="picker-list">
            {filteredExercises.map(ex => {
              const alreadyAdded = selectedExercises.some(s => s.exercise_id === ex.id)
              const checked = pending.includes(ex.id)
              return (
                <button
                  type="button"
                  key={ex.id}
                  className={`picker-item ${alreadyAdded ? 'added' : ''} ${checked ? 'checked' : ''}`}
                  onClick={() => togglePending(ex.id)}
                  disabled={alreadyAdded}
                >
                  <span className="picker-check">{alreadyAdded ? '✓' : checked ? '☑' : '☐'}</span>
                  <span className="picker-name">{ex.name}</span>
                  <span className="exercise-group">{ex.muscle_group}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="btn-primary picker-add-selected"
            onClick={addSelected}
            disabled={pending.length === 0}
          >
            Add {pending.length || ''} {pending.length === 1 ? 'exercise' : 'exercises'}
          </button>
        </div>
      )}

      <div className="template-form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">
          {template ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  )
}
