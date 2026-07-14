import { useState, useEffect } from 'react'
import './AuthScreen.css'
import {
  login,
  signup,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  AuthError,
} from '../services/auth.js'

// The app has no router, so emailed links land on / with a query param:
//   /?verify_token=…  — email verification (from signup)
//   /?reset_token=…   — password reset form
function urlToken(name) {
  return new URLSearchParams(window.location.search).get(name)
}

function clearUrlParams() {
  window.history.replaceState(null, '', window.location.pathname)
}

// Login / signup / password-reset screens, matching the inventory app's
// flows: signup requires clicking an emailed verification link before login
// works; "forgot password" emails a time-limited reset link. On dev/staging
// the server returns the tokens directly, so the UI shows a click-through
// button instead of requiring a real inbox.
export default function AuthScreen({ onAuthenticated }) {
  // 'login' | 'signup' | 'signup-sent' | 'forgot' | 'forgot-sent' | 'reset'
  const [mode, setMode] = useState(urlToken('reset_token') ? 'reset' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  // Tokens the server exposed in a response (dev/staging only).
  const [exposedToken, setExposedToken] = useState(null)

  // An arriving verification link verifies immediately and logs in.
  useEffect(() => {
    const token = urlToken('verify_token')
    if (!token) return
    clearUrlParams()
    setBusy(true)
    verifyEmail(token)
      .then(onAuthenticated)
      .catch(err => {
        setError(err instanceof AuthError ? err.message : 'Verification failed. Please try again.')
        setBusy(false)
      })
  }, [onAuthenticated])

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
    setExposedToken(null)
    setPassword('')
    setConfirm('')
  }

  async function run(action) {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if ((mode === 'signup' || mode === 'reset') && password !== confirm) {
      setError('Passwords do not match')
      return
    }
    run(async () => {
      if (mode === 'login') {
        onAuthenticated(await login(email, password))
      } else if (mode === 'signup') {
        const r = await signup(email, password)
        setNotice(r.message)
        setExposedToken(r.verification_token || null)
        setMode('signup-sent')
      } else if (mode === 'forgot') {
        const r = await requestPasswordReset(email)
        setNotice(r.message)
        setExposedToken(r.reset_token || null)
        setMode('forgot-sent')
      } else if (mode === 'reset') {
        const user = await resetPassword(urlToken('reset_token'), password)
        clearUrlParams()
        onAuthenticated(user)
      }
    })
  }

  // Dev/staging click-throughs standing in for the emailed link.
  function handleExposedVerify() {
    run(async () => onAuthenticated(await verifyEmail(exposedToken)))
  }

  if (mode === 'signup-sent' || mode === 'forgot-sent') {
    const isSignup = mode === 'signup-sent'
    return (
      <div className="auth-screen">
        <h1 className="auth-brand">simple-gym</h1>
        <div className="auth-card">
          <p className="auth-hint">{notice}</p>
          {error && <p className="auth-error">{error}</p>}
          {exposedToken && isSignup && (
            <button className="btn-primary" onClick={handleExposedVerify} disabled={busy}>
              Verify now (test mode)
            </button>
          )}
          {exposedToken && !isSignup && (
            <button
              className="btn-primary"
              onClick={() => {
                window.history.replaceState(null, '', `/?reset_token=${encodeURIComponent(exposedToken)}`)
                switchMode('reset')
              }}
            >
              Reset now (test mode)
            </button>
          )}
          <button className="btn-ghost" onClick={() => switchMode('login')}>Back to sign in</button>
        </div>
      </div>
    )
  }

  const titles = {
    login: 'Sign in',
    signup: 'Create account',
    forgot: 'Reset password',
    reset: 'Choose a new password',
  }

  return (
    <div className="auth-screen">
      <h1 className="auth-brand">simple-gym</h1>
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="auth-hint">{titles[mode]}</p>
        {mode !== 'reset' && (
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        )}
        {mode !== 'forgot' && (
          <input
            type="password"
            placeholder={mode === 'reset' ? 'New password' : 'Password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        )}
        {(mode === 'signup' || mode === 'reset') && (
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
          {titles[mode]}
        </button>
        {mode === 'login' && (
          <div className="auth-links">
            <button type="button" className="auth-link" onClick={() => switchMode('signup')}>
              Create account
            </button>
            <button type="button" className="auth-link" onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
          </div>
        )}
        {(mode === 'signup' || mode === 'forgot') && (
          <div className="auth-links">
            <button type="button" className="auth-link" onClick={() => switchMode('login')}>
              Sign in instead
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
