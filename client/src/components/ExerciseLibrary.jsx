import { useState, useEffect } from 'react'
import ExerciseForm from './ExerciseForm.jsx'
import './ExerciseLibrary.css'

const MUSCLE_GROUPS = ['all', 'chest', 'back', 'legs', 'shoulders', 'arms', 'core']

export default function ExerciseLibrary() {
  const [exercises, setExercises] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    fetchExercises()
  }, [])

  async function fetchExercises() {
    const res = await fetch('/api/exercises')
    setExercises(await res.json())
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

  return (
    <div className="exercise-library">
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
        {MUSCLE_GROUPS.map(group => (
          <button
            key={group}
            className={`filter-tab ${filter === group ? 'active' : ''}`}
            onClick={() => setFilter(group)}
          >
            {group}
          </button>
        ))}
      </div>

      {showForm && (
        <ExerciseForm
          exercise={editing}
          onDone={handleFormDone}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      <div className="exercise-list">
        {filtered.map(ex => (
          <div key={ex.id} className="exercise-item">
            <div className="exercise-info">
              <span className="exercise-name">{ex.name}</span>
              <span className="exercise-group">{ex.muscle_group}</span>
            </div>
            {ex.is_custom === 1 && (
              <div className="exercise-actions">
                <button className="btn-ghost" onClick={() => handleEdit(ex)}>Edit</button>
                <button className="btn-ghost btn-danger" onClick={() => handleDelete(ex)}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="empty-state">No exercises found</p>
        )}
      </div>
    </div>
  )
}
