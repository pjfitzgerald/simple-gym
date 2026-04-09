import { useState, useEffect, useRef } from 'react'
import './LiveWorkout.css'

export default function LiveWorkout({ session: initialSession, onEnd }) {
  const [session, setSession] = useState(initialSession)
  const [sets, setSets] = useState(groupSets(initialSession.sets || []))
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const startTime = useRef(new Date(initialSession.started_at).getTime())

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  function groupSets(flatSets) {
    const groups = {}
    for (const s of flatSets) {
      const key = s.exercise_id
      if (!groups[key]) {
        groups[key] = {
          exercise_id: s.exercise_id,
          exercise_name: s.exercise_name,
          muscle_group: s.muscle_group,
          sets: [],
        }
      }
      groups[key].sets.push(s)
    }
    return Object.values(groups)
  }

  async function updateSet(setId, weight, reps) {
    const res = await fetch(`/api/sessions/${session.id}/sets/${setId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight: weight || null, reps: reps || null }),
    })
    return res.json()
  }

  async function addSet(exerciseId) {
    const group = sets.find(g => g.exercise_id === exerciseId)
    const nextNum = group ? group.sets.length + 1 : 1
    const res = await fetch(`/api/sessions/${session.id}/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_id: exerciseId, set_number: nextNum }),
    })
    const newSet = await res.json()
    // Refetch to get exercise_name
    const sessionRes = await fetch(`/api/sessions/${session.id}`)
    const full = await sessionRes.json()
    setSets(groupSets(full.sets))
  }

  async function handleFinish() {
    if (!confirm('End this workout?')) return
    clearInterval(timerRef.current)
    await fetch(`/api/sessions/${session.id}/end`, { method: 'PUT' })
    onEnd()
  }

  function handleSetChange(groupIdx, setIdx, field, value) {
    setSets(prev => {
      const updated = [...prev]
      const group = { ...updated[groupIdx], sets: [...updated[groupIdx].sets] }
      group.sets[setIdx] = { ...group.sets[setIdx], [field]: value }
      updated[groupIdx] = group
      return updated
    })
  }

  async function handleSetBlur(groupIdx, setIdx) {
    const set = sets[groupIdx].sets[setIdx]
    await updateSet(set.id, set.weight, set.reps)
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const completedSets = sets.reduce((acc, g) => acc + g.sets.filter(s => s.reps != null).length, 0)
  const totalSets = sets.reduce((acc, g) => acc + g.sets.length, 0)

  return (
    <div className="live-workout">
      <div className="workout-header">
        <div className="workout-timer">
          <span className="timer-value">{formatTime(elapsed)}</span>
          <span className="timer-label">{completedSets}/{totalSets} sets</span>
        </div>
        <button className="btn-finish" onClick={handleFinish}>Finish</button>
      </div>

      {sets.map((group, gi) => (
        <div key={group.exercise_id} className="exercise-group">
          <div className="group-header">
            <h3>{group.exercise_name}</h3>
            <span className="group-muscle">{group.muscle_group}</span>
          </div>

          <div className="sets-table">
            <div className="sets-row sets-header-row">
              <span className="set-col-num">Set</span>
              <span className="set-col-weight">Weight</span>
              <span className="set-col-reps">Reps</span>
              <span className="set-col-check"></span>
            </div>

            {group.sets.map((set, si) => (
              <div key={set.id} className={`sets-row ${set.reps != null ? 'completed' : ''}`}>
                <span className="set-col-num">{set.set_number}</span>
                <input
                  className="set-col-weight"
                  type="number"
                  inputMode="decimal"
                  placeholder="lbs"
                  value={set.weight ?? ''}
                  onChange={e => handleSetChange(gi, si, 'weight', e.target.value ? parseFloat(e.target.value) : null)}
                  onBlur={() => handleSetBlur(gi, si)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.target.nextElementSibling?.focus()
                    }
                  }}
                />
                <input
                  className="set-col-reps"
                  type="number"
                  inputMode="numeric"
                  placeholder="reps"
                  value={set.reps ?? ''}
                  onChange={e => handleSetChange(gi, si, 'reps', e.target.value ? parseInt(e.target.value) : null)}
                  onBlur={() => handleSetBlur(gi, si)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSetBlur(gi, si)
                      e.target.blur()
                    }
                  }}
                />
                <span className="set-col-check">
                  {set.reps != null ? '✓' : ''}
                </span>
              </div>
            ))}
          </div>

          <button className="btn-add-set" onClick={() => addSet(group.exercise_id)}>
            + Add Set
          </button>
        </div>
      ))}

      {sets.length === 0 && (
        <p className="empty-state">No exercises in this session. Start from a template to pre-load exercises.</p>
      )}
    </div>
  )
}
