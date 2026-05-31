import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// One exercise group, made draggable by long-pressing the whole card. The
// inputs and buttons inside stay interactive because the TouchSensor only
// activates a drag after a held delay — a tap/scroll completes first.
// Used by both LiveWorkout and WorkoutEdit so the live and edit views look
// and behave identically for sets management.
export default function SortableExerciseGroup({
  group,
  gi,
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
      className={`exercise-group${isDragging ? ' is-dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="group-header">
        <div>
          <h3>{group.exercise_name}</h3>
          <span className="group-muscle">{group.muscle_group}</span>
        </div>
        <div className="group-actions">
          <button
            type="button"
            className="btn-remove-exercise"
            onClick={() => onRemoveExercise(group.exercise_id)}
            aria-label="Remove exercise"
          >×</button>
        </div>
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
            <div key={set.id} className={`sets-row ${isComplete ? 'completed' : ''}`}>
              <span className="set-col-num">{set.set_number}</span>
              <input
                className="set-col-weight"
                type="number"
                inputMode="decimal"
                placeholder="kg"
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
                placeholder="reps"
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
                {!isComplete && (
                  <button
                    className="btn-icon btn-delete-set"
                    onClick={() => onDeleteSet(set.id)}
                    aria-label="Delete set"
                  >×</button>
                )}
                <button
                  className={`btn-toggle-complete ${isComplete ? 'is-complete' : ''}`}
                  onClick={() => onToggleComplete(gi, si)}
                  aria-label={isComplete ? 'Mark set incomplete' : 'Mark set complete'}
                >{isComplete ? '✓' : ''}</button>
              </span>
            </div>
          )
        })}
      </div>

      <button className="btn-add-set" onClick={() => onAddSet(group.exercise_id)}>
        + Add Set
      </button>
    </div>
  )
}
