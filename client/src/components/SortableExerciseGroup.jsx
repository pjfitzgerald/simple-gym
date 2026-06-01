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
}) {
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
      className={`exercise-group-shell${isDragging ? ' is-dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <Swipeable
        className="exercise-group"
        actionLabel="Remove"
        onDelete={() => onRemoveExercise(group.exercise_id)}
      >
        <div className="group-header">
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
      </Swipeable>
    </div>
  )
}
