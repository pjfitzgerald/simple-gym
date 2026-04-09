import { useState, useEffect } from 'react'
import './WorkoutHistory.css'

export default function WorkoutHistory() {
  const [sessions, setSessions] = useState([])
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    fetch('/api/sessions').then(r => r.json()).then(setSessions)
  }, [])

  async function viewDetail(session) {
    const res = await fetch(`/api/sessions/${session.id}`)
    setDetail(await res.json())
  }

  function formatDuration(seconds) {
    if (!seconds) return '--'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  if (detail) {
    const grouped = {}
    for (const set of detail.sets) {
      if (!grouped[set.exercise_id]) {
        grouped[set.exercise_id] = {
          name: set.exercise_name,
          muscle_group: set.muscle_group,
          sets: [],
        }
      }
      grouped[set.exercise_id].sets.push(set)
    }

    return (
      <div className="history-detail">
        <button className="btn-ghost" onClick={() => setDetail(null)}>Back</button>
        <div className="detail-header">
          <h2>{detail.template_name || 'Blank Workout'}</h2>
          <span className="detail-meta">
            {formatDate(detail.started_at)} at {formatTime(detail.started_at)} — {formatDuration(detail.duration_seconds)}
          </span>
        </div>

        {Object.values(grouped).map((group, i) => (
          <div key={i} className="detail-exercise">
            <div className="detail-exercise-header">
              <h3>{group.name}</h3>
              <span className="exercise-group">{group.muscle_group}</span>
            </div>
            <div className="detail-sets">
              {group.sets.map(set => (
                <div key={set.id} className={`detail-set ${set.completed_at ? '' : 'skipped'}`}>
                  <span className="set-num">Set {set.set_number}</span>
                  {set.weight != null && set.reps != null ? (
                    <span className="set-data">{set.weight} lbs x {set.reps}</span>
                  ) : (
                    <span className="set-data skipped-text">—</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {detail.sets.length === 0 && (
          <p className="empty-state">No sets logged in this session</p>
        )}
      </div>
    )
  }

  return (
    <div className="workout-history">
      <h2>History</h2>

      {sessions.length === 0 && (
        <p className="empty-state">No workouts yet. Complete a session to see it here.</p>
      )}

      {sessions.map(s => (
        <div key={s.id} className="history-card" onClick={() => viewDetail(s)}>
          <div className="history-info">
            <span className="history-name">{s.template_name || 'Blank Workout'}</span>
            <span className="history-meta">
              {formatDate(s.started_at)} — {formatDuration(s.duration_seconds)} — {s.total_sets} set{s.total_sets !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="history-arrow">›</span>
        </div>
      ))}
    </div>
  )
}
