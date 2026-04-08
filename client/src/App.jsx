import { useState } from 'react'
import './App.css'
import ExerciseLibrary from './components/ExerciseLibrary.jsx'
import TemplateList from './components/TemplateList.jsx'

const TABS = [
  { id: 'templates', label: 'Templates' },
  { id: 'exercises', label: 'Exercises' },
]

function App() {
  const [tab, setTab] = useState('templates')

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
      {tab === 'templates' && <TemplateList />}
      {tab === 'exercises' && <ExerciseLibrary />}
    </div>
  )
}

export default App
