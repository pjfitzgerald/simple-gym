import { useEffect, useState } from 'react'
import './MinimisedSessionBar.css'

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// A slim fixed bottom bar showing live timer + set count for a workout the
// user has minimised so they can browse the rest of the app. Tapping the bar
// restores the full LiveWorkout view.
export default function MinimisedSessionBar({ session, onMaximise }) {
  // Match LiveWorkout's timer base — shift forward by any accumulated
  // paused time so a resumed session shows the right elapsed value.
  const startMs = new Date(session.started_at).getTime() + (session.paused_seconds || 0) * 1000
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startMs) / 1000))

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [startMs])

  const sets = session.sets || []
  const completedSets = sets.filter(s => s.completed_at != null).length
  const totalSets = sets.length
  const label = session.template_name || 'Workout'

  return (
    <button className="minimised-session-bar" onClick={onMaximise} aria-label="Resume active workout">
      <span className="msb-pulse" aria-hidden="true" />
      <span className="msb-label">{label}</span>
      <span className="msb-timer">{formatTime(elapsed)}</span>
      <span className="msb-sets">{completedSets}/{totalSets}</span>
      <span className="msb-expand" aria-hidden="true">▴</span>
    </button>
  )
}
