import { useState, useEffect } from 'react'
import './App.css'
import ExerciseLibrary from './components/ExerciseLibrary.jsx'
import TemplateList from './components/TemplateList.jsx'
import LiveWorkout from './components/LiveWorkout.jsx'
import WorkoutHistory from './components/WorkoutHistory.jsx'
import MinimisedSessionBar from './components/MinimisedSessionBar.jsx'

const TABS = [
  { id: 'templates', label: 'Templates' },
  { id: 'history', label: 'History' },
  { id: 'exercises', label: 'Exercises' },
]

function formatStarted(iso) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return `today at ${time}`
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return `${date} at ${time}`
}

function App() {
  const [tab, setTab] = useState('templates')
  const [activeSession, setActiveSession] = useState(null)
  // When true, the active session is collapsed to a bottom bar so the rest
  // of the app is browsable. Tapping the bar restores LiveWorkout.
  const [minimised, setMinimised] = useState(false)
  // An unfinished session found on load — the PWA was closed mid-workout.
  const [resumable, setResumable] = useState(null)
  const [loading, setLoading] = useState(true)

  // Push page content above the fixed bottom bar when it's shown.
  useEffect(() => {
    const show = !!activeSession && minimised
    document.body.classList.toggle('has-minimised-session', show)
    return () => document.body.classList.remove('has-minimised-session')
  }, [activeSession, minimised])

  // On load, recover an in-progress workout so a closed PWA tab or an
  // expired cache can't silently lose a session.
  useEffect(() => {
    fetch('/api/sessions/active')
      .then(r => r.json())
      .then(s => { if (s) setResumable(s) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function startWorkout(templateId) {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId || null }),
    })
    const session = await res.json()
    setActiveSession(session)
  }

  function handleWorkoutEnd() {
    setActiveSession(null)
    setMinimised(false)
    setTab('history')
  }

  function handleMinimise() {
    setMinimised(true)
  }

  // Refresh the session from the server before restoring the full view so
  // any sets logged before minimising (or that came in elsewhere) show up.
  async function handleMaximise() {
    try {
      const res = await fetch(`/api/sessions/${activeSession.id}`)
      if (res.ok) {
        const fresh = await res.json()
        setActiveSession(fresh)
      }
    } catch {}
    setMinimised(false)
  }

  function resumeWorkout() {
    setActiveSession(resumable)
    setResumable(null)
  }

  async function discardResumable() {
    if (!confirm('Discard this in-progress workout? Any logged sets will be lost.')) return
    await fetch(`/api/sessions/${resumable.id}`, { method: 'DELETE' })
    setResumable(null)
  }

  // Wait for the active-session check before rendering, so we don't flash
  // the tabs and then jump to the resume prompt.
  if (loading) return null

  if (resumable && !activeSession) {
    const setCount = resumable.sets.length
    return (
      <div>
        <header className="app-header">
          <h1>simple-gym</h1>
        </header>
        <div className="resume-prompt">
          <h2>{resumable.template_name || 'Workout'} in progress</h2>
          <p className="text-secondary">
            Started {formatStarted(resumable.started_at)} · {setCount} set{setCount === 1 ? '' : 's'}.
          </p>
          <div className="resume-actions">
            <button className="btn-danger" onClick={discardResumable}>Discard</button>
            <button className="btn-primary" onClick={resumeWorkout}>Resume</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <header className="app-header">
        <h1>simple-gym</h1>
        <nav className="app-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'templates' && <TemplateList onStartWorkout={startWorkout} />}
      {tab === 'history' && <WorkoutHistory onResume={setActiveSession} />}
      {tab === 'exercises' && <ExerciseLibrary />}
      {activeSession && minimised && (
        <MinimisedSessionBar session={activeSession} onMaximise={handleMaximise} />
      )}
      {/* The running session is an overlay sheet on top of the tabs, not a
          separate screen — so minimising just slides it down to reveal the
          already-rendered tabs underneath instead of remounting them. */}
      {activeSession && !minimised && (
        <LiveWorkout session={activeSession} onEnd={handleWorkoutEnd} onMinimise={handleMinimise} />
      )}
    </div>
  )
}

export default App
