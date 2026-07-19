import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import TemplateForm from './TemplateForm.jsx'
import './TemplateList.css'

export default function TemplateList({ onStartWorkout }) {
  const [templates, setTemplates] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  // Tapping Start opens a preview of the template's exercises first, so you can
  // confirm the line-up before the session timer begins.
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    fetchTemplates()
  }, [])

  // The list and the template form swap within the same page scroll; reset it
  // so the incoming view starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [showForm])

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

  // Fetch the template's exercises and show the preview overlay rather than
  // starting straight away.
  async function openPreview(template) {
    const res = await fetch(`/api/templates/${template.id}`)
    setPreview(await res.json())
  }

  function startFromPreview() {
    const id = preview.id
    setPreview(null)
    onStartWorkout(id)
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
            <button className="btn-primary btn-small" onClick={() => openPreview(t)}>
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

      {/* Rendered via a portal to <body>: the modal is fixed-position, but its
          natural home inside .tab-pane has an animation whose `both` fill keeps
          a transform applied — which would make the tab-pane the containing
          block for this fixed element (boxing it inside the pane, below the
          sticky header) instead of the viewport. The portal escapes that. */}
      {preview && createPortal(
        <div className="template-preview-backdrop" onClick={() => setPreview(null)}>
          <div className="template-preview" onClick={e => e.stopPropagation()}>
            <button
              className="preview-close"
              onClick={() => setPreview(null)}
              aria-label="Close preview"
            >✕</button>
            <h2>{preview.name}</h2>
            <p className="preview-meta">
              {preview.exercises.length} exercise{preview.exercises.length !== 1 ? 's' : ''}
            </p>
            <div className="preview-exercises">
              {preview.exercises.length === 0 && (
                <p className="empty-state">No exercises in this template.</p>
              )}
              {preview.exercises.map(ex => (
                <div key={ex.template_exercise_id} className="preview-exercise">
                  <span className="preview-ex-name">{ex.name}</span>
                  <span className="preview-ex-meta">
                    {ex.default_sets} set{ex.default_sets !== 1 ? 's' : ''} · {ex.muscle_group}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn-primary preview-start" onClick={startFromPreview}>
              Start workout
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
