import './UndoToast.css'

// Bottom-anchored toast offering a brief window to undo a destructive action
// (currently: removing an exercise from a session). The pending action is
// committed by the caller's timer when the toast's window elapses.
export default function UndoToast({ message, onUndo }) {
  return (
    <div className="undo-toast" role="status">
      <span className="undo-toast-msg">{message}</span>
      <button className="undo-toast-btn" onClick={onUndo}>Undo</button>
    </div>
  )
}
