import { useState } from 'react'
import './App.css'
import ExerciseLibrary from './components/ExerciseLibrary.jsx'
import TemplateList from './components/TemplateList.jsx'
import LiveWorkout from './components/LiveWorkout.jsx'

const TABS = [
  { id: 'templates', label: 'Templates' },
  { id: 'exercises', label: 'Exercises' },
]

function App() {
  const [tab, setTab] = useState('templates')
  const [activeSession, setActiveSession] = useState(null)

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
    setTab('templates')
  }

  if (activeSession) {
    return (
      <div>
        <header className="app-header">
          <h1>simple-gym</h1>
        </header>
        <LiveWorkout session={activeSession} onEnd={handleWorkoutEnd} />
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
      {tab === 'exercises' && <ExerciseLibrary />}
    </div>
  )
}

export default App
