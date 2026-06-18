import { useState, useEffect, useRef } from 'react'
import './App.css'
import ExerciseLibrary from './components/ExerciseLibrary.jsx'
import TemplateList from './components/TemplateList.jsx'
import LiveWorkout from './components/LiveWorkout.jsx'
import WorkoutHistory from './components/WorkoutHistory.jsx'
import MinimisedSessionBar from './components/MinimisedSessionBar.jsx'
import Settings from './components/Settings.jsx'

const TABS = [
  { id: 'templates', label: 'Templates' },
  { id: 'history', label: 'History' },
  { id: 'exercises', label: 'Exercises' },
  { id: 'settings', label: 'Settings' },
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
  // Direction of the last tab change ('next' = rightward in the tab order),
  // so the incoming pane can slide in from the matching side.
  const [dir, setDir] = useState('next')
  const [activeSession, setActiveSession] = useState(null)
  // When true, the active session is collapsed to a bottom bar so the rest
  // of the app is browsable. Tapping the bar restores LiveWorkout.
  const [minimised, setMinimised] = useState(false)
  // An unfinished session found on load — the PWA was closed mid-workout.
  const [resumable, setResumable] = useState(null)
  const [loading, setLoading] = useState(true)
  // Horizontal swipe across the tab content moves between tabs, anywhere on
  // the page. The start point is recorded on touch-start; `onCard` means the
  // gesture began on a swipe-to-delete card — those own *left* swipes (delete)
  // but still let right swipes change tabs (defensive: no tab list currently
  // has such cards). `noSwipe` means a focused sub-view (an open History
  // detail/edit) that opts out of tab nav.
  const swipe = useRef({ x: 0, y: 0, onCard: false, noSwipe: false })

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

  // Single entry point for tab changes so the slide direction is always set
  // from the index delta, whether the change came from a swipe or a nav tap.
  function goToTab(nextId) {
    const from = TABS.findIndex(t => t.id === tab)
    const to = TABS.findIndex(t => t.id === nextId)
    if (to === -1 || to === from) return
    setDir(to > from ? 'next' : 'prev')
    setTab(nextId)
  }

  function resumeWorkout() {
    setActiveSession(resumable)
    setResumable(null)
  }

  // Touch events (not pointer events) drive tab swiping: iOS fires
  // `pointercancel` and stops sending pointer events the moment it suspects a
  // scroll, so a pointerup-based gesture never completed. `touchend` always
  // fires after `touchstart`, so we read the delta from changedTouches there.
  function onContentTouchStart(e) {
    const t = e.touches[0]
    if (!t) return
    swipe.current = {
      x: t.clientX,
      y: t.clientY,
      onCard: !!e.target.closest?.('.swipeable-content'),
      noSwipe: !!e.target.closest?.('.no-tab-swipe'),
    }
  }

  // A clearly-horizontal swipe flips to the adjacent tab. It works anywhere on
  // the page, with two exceptions: a focused sub-view (`.no-tab-swipe`) opts
  // out entirely, and a swipe-to-delete card keeps *left* swipes for itself
  // (its delete gesture) while still yielding right swipes to tab nav.
  function onContentTouchEnd(e) {
    const { x, y, onCard, noSwipe } = swipe.current
    if (noSwipe) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - x
    const dy = t.clientY - y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (onCard && dx < 0) return
    const idx = TABS.findIndex(tb => tb.id === tab)
    const nextIdx = dx < 0 ? idx + 1 : idx - 1
    if (nextIdx < 0 || nextIdx >= TABS.length) return
    goToTab(TABS[nextIdx].id)
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
              onClick={() => goToTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main
        className="tab-content"
        onTouchStart={onContentTouchStart}
        onTouchEnd={onContentTouchEnd}
      >
        <div className={`tab-pane tab-${dir}`} key={tab}>
          {tab === 'templates' && <TemplateList onStartWorkout={startWorkout} />}
          {tab === 'history' && <WorkoutHistory onResume={setActiveSession} />}
          {tab === 'exercises' && <ExerciseLibrary />}
          {tab === 'settings' && <Settings />}
        </div>
      </main>
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
