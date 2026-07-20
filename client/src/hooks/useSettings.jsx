import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { updateSettings } from '../services/auth.js'

// App-wide user preferences, persisted server-side on the account (so they
// follow a user across devices/browsers) rather than in client localStorage.
// AuthGate calls hydrate() with the account's saved settings whenever a user
// is resolved (login, signup verification, or a restored session) and again
// with none on sign-out, so this provider itself doesn't need to know
// anything about auth state. Three settings today:
//   unit    — 'kg' | 'lbs'  weight display unit. Weights are always *stored* in
//             kg; this only changes how they're shown and entered.
//   density — 'comfortable' | 'compact'  toggles a body class that tightens
//             spacing across the app for a denser, more information-rich layout.
//   theme   — 'auto' | 'light' | 'dark'  'auto' keeps the prefers-color-scheme
//             media query in charge; the explicit values set data-theme on
//             <html>, which the palette blocks in index.css key off.

const LB_PER_KG = 2.2046226218

const DEFAULTS = { unit: 'kg', density: 'comfortable', theme: 'auto' }

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [unit, setUnitState] = useState(DEFAULTS.unit)
  const [density, setDensityState] = useState(DEFAULTS.density)
  const [theme, setThemeState] = useState(DEFAULTS.theme)

  useEffect(() => {
    const rootEl = document.documentElement
    if (theme === 'auto') delete rootEl.dataset.theme
    else rootEl.dataset.theme = theme
    // Keep the browser/PWA chrome in step: a forced theme pins both
    // theme-color metas to the forced background; auto restores the authored
    // per-scheme values (captured on first run — the staging boot script may
    // have already swapped them, so don't hardcode).
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      if (!m.dataset.autoContent) m.dataset.autoContent = m.content
      m.content = theme === 'auto'
        ? m.dataset.autoContent
        : getComputedStyle(rootEl).getPropertyValue('--bg').trim()
    })
  }, [theme])

  useEffect(() => {
    document.body.classList.toggle('density-compact', density === 'compact')
    return () => document.body.classList.remove('density-compact')
  }, [density])

  // Overwrite local state from the account's saved settings — no persisting
  // back, this is a pure read into the UI.
  const hydrate = useCallback(settings => {
    setUnitState(settings?.unit ?? DEFAULTS.unit)
    setDensityState(settings?.density ?? DEFAULTS.density)
    setThemeState(settings?.theme ?? DEFAULTS.theme)
  }, [])

  // Each setter applies immediately and saves to the account in the
  // background; a failed save is swallowed — worst case the change doesn't
  // survive a reload, which isn't worth surfacing for a display preference.
  function setUnit(value) {
    setUnitState(value)
    updateSettings({ unit: value }).catch(() => {})
  }
  function setDensity(value) {
    setDensityState(value)
    updateSettings({ density: value }).catch(() => {})
  }
  function setTheme(value) {
    setThemeState(value)
    updateSettings({ theme: value }).catch(() => {})
  }

  const value = { unit, setUnit, density, setDensity, theme, setTheme, hydrate }
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
