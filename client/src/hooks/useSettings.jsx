import { createContext, useContext, useEffect, useState } from 'react'

// App-wide user preferences, persisted to localStorage (single-user app, so
// no server round-trip needed). Two settings today:
//   unit    — 'kg' | 'lbs'  weight display unit. Weights are always *stored* in
//             kg; this only changes how they're shown and entered.
//   density — 'comfortable' | 'compact'  toggles a body class that tightens
//             spacing across the app for a denser, more information-rich layout.

const LB_PER_KG = 2.2046226218

const SettingsContext = createContext(null)

function read(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function SettingsProvider({ children }) {
  const [unit, setUnitState] = useState(() => read('sg.unit', 'kg'))
  const [density, setDensityState] = useState(() => read('sg.density', 'comfortable'))

  useEffect(() => {
    try { localStorage.setItem('sg.unit', unit) } catch {}
  }, [unit])

  useEffect(() => {
    try { localStorage.setItem('sg.density', density) } catch {}
    document.body.classList.toggle('density-compact', density === 'compact')
    return () => document.body.classList.remove('density-compact')
  }, [density])

  const value = {
    unit,
    setUnit: setUnitState,
    density,
    setDensity: setDensityState,
  }
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}

// --- Unit conversion helpers (pure; usable outside React) -------------------

export function unitLabel(unit) {
  return unit === 'lbs' ? 'lbs' : 'kg'
}

// kg (stored) → display number in the active unit.
export function kgToDisplay(kg, unit) {
  if (kg == null) return null
  return unit === 'lbs' ? kg * LB_PER_KG : kg
}

// display number in the active unit → kg (for storage).
export function displayToKg(val, unit) {
  if (val == null) return null
  return unit === 'lbs' ? val / LB_PER_KG : val
}

// kg → a tidy display string in the active unit (≤1 decimal, no trailing .0).
export function formatWeight(kg, unit) {
  const v = kgToDisplay(kg, unit)
  if (v == null) return ''
  return String(parseFloat(v.toFixed(1)))
}
