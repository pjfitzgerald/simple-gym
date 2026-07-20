import { useState, useEffect } from 'react'
import ExerciseForm from './ExerciseForm.jsx'
import { useCategories } from '../hooks/useCategories.js'
import { useCachedGet } from '../hooks/useCachedGet.js'
import { useSettings, formatWeight, unitLabel } from '../hooks/useSettings.jsx'
import './ExerciseLibrary.css'

export default function ExerciseLibrary() {
  const { categories } = useCategories()
  const { unit } = useSettings()
  const { data: exercisesData, refresh: refreshExercises } = useCachedGet('/api/exercises')
  const { data: prsData, refresh: refreshPrs } = useCachedGet('/api/exercises/prs')
  const exercises = exercisesData ?? []
  const prs = prsData ?? {}
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  // The list and the add/edit form swap within the same page scroll; reset it
  // so the incoming view starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [showForm])

  function fetchExercises() {
    return Promise.all([refreshExercises(), refreshPrs()])
  }

  async function handleDelete(exercise) {
    if (!confirm(`Delete "${exercise.name}"?`)) return
    await fetch(`/api/exercises/${exercise.id}`, { method: 'DELETE' })
    fetchExercises()
  }

  function handleEdit(exercise) {
    setEditing(exercise)
    setShowForm(true)
  }

  function handleFormDone() {
    setShowForm(false)
    setEditing(null)
    fetchExercises()
  }

  const filtered = exercises.filter(ex => {
    const matchesGroup = filter === 'all' || ex.muscle_group === filter
    const matchesSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase())
    return matchesGroup && matchesSearch
  })

  // In the 'all' view, exercises are grouped under category subheadings rather
  // than each carrying a badge. Order by the category list, then any stray
  // muscle group not in it; items stay name-sorted (the API returns them so).
  const present = [...new Set(filtered.map(ex => ex.muscle_group))]
  const extra = present.filter(g => !categories.includes(g)).sort()
  const sections = [...categories, ...extra]
    .map(category => ({ category, items: filtered.filter(ex => ex.muscle_group === category) }))
    .filter(section => section.items.length > 0)

  function renderItem(ex) {
    const pr = prs[ex.id]
    return (
      <div key={ex.id} className="exercise-item">
        <div className="exercise-item-info">
          <span className="exercise-name">{ex.name}</span>
          {pr && (
            <span className="exercise-pr">
              PR {formatWeight(pr.weight, unit)} {unitLabel(unit)} × {pr.reps}
            </span>
          )}
        </div>
        <div className="exercise-actions">
          <button className="btn-ghost" onClick={() => handleEdit(ex)}>Edit</button>
          <button className="btn-ghost btn-danger" onClick={() => handleDelete(ex)}>Delete</button>
        </div>
      </div>
    )
  }

  return (
    <div className="exercise-library">
      {/* Header, search and category pills pin together below the tab bar
          so filtering stays reachable however deep the list is scrolled. */}
      <div className="pane-header library-pinned">
        <div className="library-header">
          <h2>Exercises</h2>
          <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
            + Add
          </button>
        </div>

        <input
          type="search"
          placeholder="Search exercises..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />

        <div className="filter-tabs">
          {['all', ...categories].map(group => (
            <button
              key={group}
              className={`filter-tab ${filter === group ? 'active' : ''}`}
              onClick={() => setFilter(group)}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <ExerciseForm
          exercise={editing}
          onDone={handleFormDone}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      <div className="exercise-list">
        {exercisesData && filtered.length === 0 && (
          <p className="empty-state">No exercises found</p>
        )}
        {sections.map(section => (
          <div key={section.category} className="exercise-section">
            <h3 className="exercise-section-title">{section.category}</h3>
            {section.items.map(renderItem)}
          </div>
        ))}
      </div>
    </div>
  )
}
