import { useRef, useState } from 'react'
import './Swipeable.css'

// Swipe-left-to-delete gesture. Wraps arbitrary content; dragging it left past
// `threshold` (fraction of its width) and releasing fires onDelete; releasing
// short snaps back. Uses pointer events so it coexists with @dnd-kit's
// mouse/touch sensors on ancestor elements — a quick horizontal swipe never
// crosses dnd's long-press delay, so it won't start a reorder.
//
// For nested swipeables (set rows inside a swipeable exercise card) pass
// `stopPropagation` so the inner row gesture wins and the card doesn't also
// start swiping.
export default function Swipeable({
  className = '',
  wrapperClassName = '',
  children,
  onDelete,
  actionLabel = 'Delete',
  threshold = 0.4,
  stopPropagation = false,
}) {
  const [dx, setDx] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const elRef = useRef(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const axis = useRef(null) // null | 'h' | 'v' — locked after the first move
  const width = useRef(1)

  function onPointerDown(e) {
    if (stopPropagation) e.stopPropagation()
    startX.current = e.clientX
    startY.current = e.clientY
    axis.current = null
    width.current = elRef.current?.offsetWidth || 1
  }

  function onPointerMove(e) {
    // Nested swipeables (set rows) must not let the gesture bubble up and also
    // start the parent card's swipe.
    if (stopPropagation) e.stopPropagation()
    // Ignore stray mouse moves with no button pressed.
    if (e.pointerType === 'mouse' && e.buttons === 0) return
    const ddx = e.clientX - startX.current
    const ddy = e.clientY - startY.current
    if (axis.current === null) {
      if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v'
      if (axis.current === 'h') {
        setSwiping(true)
        elRef.current?.setPointerCapture?.(e.pointerId)
      }
    }
    if (axis.current === 'h') {
      e.preventDefault()
      setDx(Math.min(0, ddx)) // left-only
    }
  }

  function finish(e) {
    if (stopPropagation) e?.stopPropagation?.()
    const horizontal = axis.current === 'h'
    setSwiping(false)
    axis.current = null
    if (!horizontal) return
    if (dx <= -width.current * threshold) {
      setDx(-width.current)
      onDelete?.()
    } else {
      setDx(0)
    }
  }

  const actionOpacity = Math.min(1, Math.abs(dx) / 80)

  return (
    <div className={`swipeable ${wrapperClassName}`}>
      <div className="swipeable-action" style={{ opacity: actionOpacity }} aria-hidden="true">
        {actionLabel}
      </div>
      <div
        ref={elRef}
        className={`swipeable-content ${className}`}
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: swiping ? 'none' : 'transform 0.2s ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        {children}
      </div>
    </div>
  )
}
