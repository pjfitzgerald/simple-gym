import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './components/AuthGate.jsx'
import { SettingsProvider } from './hooks/useSettings.jsx'
import { installFetchAuth } from './services/auth.js'

// Attach the auth token to every /api fetch before anything can make one.
installFetchAuth()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SettingsProvider>
      <AuthGate />
    </SettingsProvider>
  </StrictMode>,
)
