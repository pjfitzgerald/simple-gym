import { useState } from 'react'
import './ExerciseForm.css'

const MUSCLE_GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core']

export default function ExerciseForm({ exercise, onDone, onCancel }) {
  const [name, setName] = useState(exercise?.name || '')
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscle_group || MUSCLE_GROUPS[0])
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const body = { name: name.trim(), muscle_group: muscleGroup }
    if (!body.name) {
      setError('Name is required')
      return
    }

    const url = exercise ? `/api/exercises/${exercise.id}` : '/api/exercises'
    const method = exercise ? 'PUT' : 'POST'

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

  return (
    <form className="exercise-form" onSubmit={handleSubmit}>
      <h3>{exercise ? 'Edit Exercise' : 'Add Exercise'}</h3>
      {error && <p className="form-error">{error}</p>}
      <input
        type="text"
        placeholder="Exercise name"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <select value={muscleGroup} onChange={e => setMuscleGroup(e.target.value)}>
        {MUSCLE_GROUPS.map(g => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">
          {exercise ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  )
}
