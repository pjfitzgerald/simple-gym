import { useState } from 'react'
import { useCategories } from '../hooks/useCategories.js'
import './ExerciseForm.css'

const ADD_NEW = '__add_new__'

export default function ExerciseForm({ exercise, onDone, onCancel }) {
  const { categories, addCategory } = useCategories()
  const [name, setName] = useState(exercise?.name || '')
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscle_group || '')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [error, setError] = useState(null)

  // Default the dropdown to the first category once they load (for a new
  // exercise that didn't come with a muscle group).
  const effectiveGroup = muscleGroup || (categories[0] ?? '')

  function handleCategorySelect(value) {
    if (value === ADD_NEW) {
      setAddingCategory(true)
      return
    }
    setMuscleGroup(value)
  }

  async function handleAddCategory() {
    const saved = await addCategory(newCategory)
    if (!saved) return
    setMuscleGroup(saved)
    setAddingCategory(false)
    setNewCategory('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const body = { name: name.trim(), muscle_group: effectiveGroup }
    if (!body.name) {
      setError('Name is required')
      return
    }
    if (!body.muscle_group) {
      setError('Category is required')
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
      {addingCategory ? (
        <div className="new-category-row">
          <input
            type="text"
            placeholder="New category"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            autoFocus
          />
          <button type="button" className="btn-primary btn-small" onClick={handleAddCategory} disabled={!newCategory.trim()}>
            Add
          </button>
          <button type="button" className="btn-ghost btn-small" onClick={() => { setAddingCategory(false); setNewCategory('') }}>
            Cancel
          </button>
        </div>
      ) : (
        <select value={effectiveGroup} onChange={e => handleCategorySelect(e.target.value)}>
          {categories.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
          <option value={ADD_NEW}>+ Add new category…</option>
        </select>
      )}
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">
          {exercise ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  )
}
