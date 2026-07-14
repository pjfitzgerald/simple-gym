import { useState, useEffect } from 'react'
import App from '../App.jsx'
import AuthScreen from './AuthScreen.jsx'
import {
  getToken,
  clearToken,
  fetchCurrentUser,
  setUnauthorizedHandler,
  logout,
} from '../services/auth.js'

// Gates the app behind authentication: shows the auth screen until a session
// exists, the main App once it does. On startup it revives a session from a
// stored token; an expired token (here or mid-session) drops back to login.
export default function AuthGate() {
  const [user, setUser] = useState(null)
  // True until the stored token has been checked — avoids flashing the login
  // screen for an already-authenticated user.
  const [checking, setChecking] = useState(true)

  // A 401 on any API call means the token is no longer good.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!getToken()) {
        setChecking(false)
        return
      }
      try {
        const restored = await fetchCurrentUser()
        if (!cancelled) setUser(restored)
      } catch {
        clearToken()
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  function handleSignOut() {
    logout()
    setUser(null)
  }

  if (checking) return null

  if (!user) return <AuthScreen onAuthenticated={setUser} />

  return <App onSignOut={handleSignOut} />
}
