import { useState, useEffect } from 'react'
import TemplateForm from './TemplateForm.jsx'
import './TemplateList.css'

export default function TemplateList({ onStartWorkout }) {
  const [templates, setTemplates] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    const res = await fetch('/api/templates')
    setTemplates(await res.json())
  }

  async function handleDelete(template) {
    if (!confirm(`Delete "${template.name}"?`)) return
    await fetch(`/api/templates/${template.id}`, { method: 'DELETE' })
    fetchTemplates()
  }

  async function handleEdit(template) {
    const res = await fetch(`/api/templates/${template.id}`)
    setEditing(await res.json())
    setShowForm(true)
  }

  function handleFormDone() {
    setShowForm(false)
    setEditing(null)
    fetchTemplates()
  }

  if (showForm) {
    return (
      <TemplateForm
        template={editing}
        onDone={handleFormDone}
        onCancel={() => { setShowForm(false); setEditing(null) }}
      />
    )
  }

  return (
    <div className="template-list">
      <div className="template-header">
        <h2>Templates</h2>
        <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          + New
        </button>
      </div>

      <button className="btn-start-blank" onClick={() => onStartWorkout(null)}>
        Start Blank Workout
      </button>

      {templates.length === 0 && (
        <p className="empty-state">No templates yet. Create one to get started.</p>
      )}

      {templates.map(t => (
        <div key={t.id} className="template-card">
          <div className="template-info" onClick={() => handleEdit(t)}>
            <span className="template-name">{t.name}</span>
            <span className="template-meta">{t.exercise_count} exercise{t.exercise_count !== 1 ? 's' : ''}</span>
          </div>
          <div className="template-actions">
            <button className="btn-primary btn-small" onClick={() => onStartWorkout(t.id)}>
              Start
            </button>
            <button
              className="btn-ghost btn-danger"
              onClick={() => handleDelete(t)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
