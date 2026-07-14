import { useState, useEffect } from 'react'
import './AuthScreen.css'
import { login, setup, needsSetup, AuthError } from '../services/auth.js'

// Login screen, or the one-time create-account form when the server reports
// no account exists yet (first run after deploying with auth).
export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    needsSetup().then(needed => { if (needed) setMode('setup') }).catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (mode === 'setup' && password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      const user = mode === 'setup'
        ? await setup(email, password)
        : await login(email, password)
      onAuthenticated(user)
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <h1 className="auth-brand">simple-gym</h1>
      <form className="auth-card" onSubmit={handleSubmit}>
        {mode === 'setup' && (
          <p className="auth-hint">First run — create your account.</p>
        )}
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {mode === 'setup' && (
          <input
            type="password"
            placeholder="Confirm password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
          />
        )}
        {error && <p className="auth-error">{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {mode === 'setup' ? 'Create account' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
