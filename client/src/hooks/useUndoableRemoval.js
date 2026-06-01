import { useEffect, useRef, useState } from 'react'

// Optimistically remove an exercise group from local state and open an "Undo"
// window before the deletion is committed to the server. If the user doesn't
// undo within UNDO_MS, the DELETE is sent. Shared by LiveWorkout and
// WorkoutEdit so swipe-to-remove behaves identically in both views.
const UNDO_MS = 5000

export function useUndoableRemoval(sessionId, sets, setSets) {
  const [pending, setPending] = useState(null) // { group, index }
  const timer = useRef(null)

  // Drop the timer on unmount. We intentionally do NOT commit a still-pending
  // removal here: if the view is torn down mid-window the safer outcome is to
  // leave the exercise on the server (it simply reappears on next load).
  useEffect(() => () => clearTimeout(timer.current), [])

  function commit(exerciseId) {
    return fetch(`/api/sessions/${sessionId}/exercises/${exerciseId}`, {
      method: 'DELETE',
    }).catch(() => {})
  }

  function request(exerciseId) {
    const index = sets.findIndex(g => g.exercise_id === exerciseId)
    if (index === -1) return
    const group = sets[index]
    // Only one pending removal at a time — flush the previous one immediately.
    if (pending) {
      clearTimeout(timer.current)
      commit(pending.group.exercise_id)
    }
    setSets(prev => prev.filter(g => g.exercise_id !== exerciseId))
    setPending({ group, index })
    timer.current = setTimeout(() => {
      commit(exerciseId)
      setPending(null)
    }, UNDO_MS)
  }

  function undo() {
    clearTimeout(timer.current)
    if (!pending) return
    const { group, index } = pending
    setSets(prev => {
      const next = [...prev]
      next.splice(Math.min(index, next.length), 0, group)
      return next
    })
    setPending(null)
  }

  return { pending, request, undo }
}
