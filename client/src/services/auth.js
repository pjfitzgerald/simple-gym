// Authentication: JWT storage, the /api/auth endpoints, and a fetch
// interceptor that attaches the token to every API call.
//
// Same approach as the inventory app: the JWT lives in localStorage and is
// sent as a Bearer token on every request. Rather than thread a wrapper
// through every component, window.fetch is patched once (installFetchAuth)
// so the existing fetch('/api/...') call sites all pick up the header.

const TOKEN_KEY = 'simple-gym-auth-token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

let onUnauthorized = null

// AuthGate registers a handler so a 401 anywhere (expired token mid-session)
// drops the app back to the login screen.
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

// Patch window.fetch: add Authorization to /api requests, and route 401s on
// authenticated endpoints to the unauthorized handler. Auth endpoints are
// exempt from the 401 hook — a failed login is not an expired session.
export function installFetchAuth() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    const isApi = url.startsWith('/api')
    const token = getToken()

    if (isApi && token) {
      init = { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } }
    }
    const response = await realFetch(input, init)

    if (isApi && !url.startsWith('/api/auth') && response.status === 401) {
      clearToken()
      onUnauthorized?.()
    }
    return response
  }
}

// Carries a user-facing message lifted from the API response.
export class AuthError extends Error {}

async function postAuth(path, body) {
  let response
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AuthError('Could not reach the server. Check your connection and try again.')
  }

  let data = {}
  try {
    data = await response.json()
  } catch {
    // Some failures have no JSON body.
  }
  if (!response.ok) {
    throw new AuthError(data.error || 'Something went wrong. Please try again.')
  }
  return data
}

// Create an account. Login stays blocked until the emailed verification link
// is clicked. The returned verification_token is only present when the server
// exposes tokens (dev/staging), letting the UI offer a click-through that
// bypasses email delivery.
export async function signup(email, password) {
  const data = await postAuth('signup', { email, password })
  return { message: data.message, verification_token: data.verification_token }
}

// Emailed-link target: verifies the address and logs straight in.
export async function verifyEmail(token) {
  const data = await postAuth('verify', { token })
  setToken(data.token)
  return data.user
}

// Request a password-reset email. The API answers identically whether or not
// the address has an account, so this never reveals account existence.
export async function requestPasswordReset(email) {
  const data = await postAuth('request_password_reset', { email })
  return { message: data.message, reset_token: data.reset_token }
}

// Emailed-link target: sets a new password and logs straight in.
export async function resetPassword(token, password) {
  const data = await postAuth('reset_password', { token, password })
  setToken(data.token)
  return data.user
}

// Log in; persists the returned JWT and resolves with the user.
export async function login(email, password) {
  const data = await postAuth('login', { email, password })
  setToken(data.token)
  return data.user
}

// Resolve the user for the stored token, used on startup to restore a
// session. Throws if there is no token or it is no longer valid.
export async function fetchCurrentUser() {
  if (!getToken()) throw new AuthError('Not authenticated')
  const res = await fetch('/api/auth/me')
  if (!res.ok) throw new AuthError('Session expired')
  return (await res.json()).user
}

// Auth is stateless — logging out is just discarding the local token.
export function logout() {
  clearToken()
}
