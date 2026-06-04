import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Swipeable from './Swipeable.jsx'

// One exercise group. The shell is the @dnd-kit drag target (long-press the
// card to reorder). Inside, a Swipeable lets you swipe the whole card left to
// remove the exercise, and each set row is independently swipe-to-delete. The
// inner row swipes stop propagation so a swipe that starts on a row deletes
// that set rather than the whole card.
// Used by both LiveWorkout and WorkoutEdit so the live and edit views match.
export default function SortableExerciseGroup({
  group,
  gi,
  pr,
  onAddSet,
  onDeleteSet,
  onRemoveExercise,
  onSetChange,
  onSetBlur,
  onToggleComplete,
  onFillDown,
  onNotesChange,
  onNotesBlur,
}) {
  // The notes textarea starts open if there's already a note to show.
  const [showNotes, setShowNotes] = useState(!!group.notes)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.exercise_id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 2 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`exercise-group-shell exercise-group${isDragging ? ' is-dragging' : ''}`}
    >
      {/* Only the header is the drag handle (long-press to reorder) and the
          swipe-to-remove target. The sets list below is left free so a swipe
          there deletes an individual set rather than the whole card. */}
      <Swipeable
        wrapperClassName="group-header-swipe"
        actionLabel="Remove"
        onDelete={() => onRemoveExercise(group.exercise_id)}
      >
        <div className="group-header" {...attributes} {...listeners}>
          <div>
            <h3>{group.exercise_name}</h3>
            <span className="group-muscle">{group.muscle_group}</span>
          </div>
          {pr && (
            <span className="group-pr" title="Personal record">
              PR {pr.weight} kg × {pr.reps}
            </span>
          )}
        </div>
      </Swipeable>

      {/* Optional free-text note for this exercise card. The button just
          reveals the textarea; the note persists on blur. */}
      {showNotes ? (
        <textarea
          className="group-notes"
          placeholder="Notes…"
          value={group.notes ?? ''}
          rows={2}
          onChange={e => onNotesChange(gi, e.target.value)}
          onBlur={() => onNotesBlur(gi)}
        />
      ) : (
        <button className="btn-add-note" onClick={() => setShowNotes(true)}>
          + Note
        </button>
      )}

      <div className="sets-table">
          <div className="sets-row sets-header-row">
            <span className="set-col-num">Set</span>
            <span className="set-col-weight">Weight</span>
            <span className="set-col-reps">Reps</span>
            <span className="set-col-actions"></span>
          </div>

          {group.sets.map((set, si) => {
            const isComplete = set.completed_at != null
            return (
              <Swipeable
                key={set.id}
                className={`sets-row ${isComplete ? 'completed' : ''}`}
                wrapperClassName="swipeable-flush"
                actionLabel="Delete"
                stopPropagation
                onDelete={() => onDeleteSet(set.id)}
              >
                <span className="set-col-num">{set.set_number}</span>
                <input
                  className="set-col-weight"
                  type="number"
                  inputMode="decimal"
                  placeholder={pr ? String(pr.weight) : 'kg'}
                  value={set.weight ?? ''}
                  onChange={e => onSetChange(gi, si, 'weight', e.target.value ? parseFloat(e.target.value) : null)}
                  onBlur={() => onSetBlur(gi, si)}
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
                  placeholder={pr ? String(pr.reps) : 'reps'}
                  value={set.reps ?? ''}
                  onChange={e => onSetChange(gi, si, 'reps', e.target.value ? parseInt(e.target.value) : null)}
                  onBlur={() => onSetBlur(gi, si)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onSetBlur(gi, si)
                      e.target.blur()
                    }
                  }}
                />
                <span className="set-col-actions">
                  {si < group.sets.length - 1 && (set.weight != null || set.reps != null) && (
                    <button
                      className="btn-fill-down"
                      onClick={() => onFillDown(gi, si)}
                      aria-label="Copy this weight and reps to the sets below"
                      title="Copy down to following sets"
                    >↓</button>
                  )}
                  <button
                    className={`btn-toggle-complete ${isComplete ? 'is-complete' : ''}`}
                    onClick={() => onToggleComplete(gi, si)}
                    aria-label={isComplete ? 'Mark set incomplete' : 'Mark set complete'}
                  >{isComplete ? '✓' : ''}</button>
                </span>
              </Swipeable>
            )
          })}
        </div>

      <button className="btn-add-set" onClick={() => onAddSet(group.exercise_id)}>
        + Add Set
      </button>
    </div>
  )
}
