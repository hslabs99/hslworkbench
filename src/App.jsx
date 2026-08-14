import { useLayoutEffect, useState } from 'react'
import Workbench from './components/Workbench.jsx'
import MarketingPage from './pages/MarketingPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { useMicrosoftAuth } from './MicrosoftAuthContext.jsx'
import { useUsersAuth } from './UsersAuthContext.jsx'

const PAGE_SUBTITLES = {
  dashboard: 'Client project board',
  marketing: 'Email templates, campaigns, and audiences',
  settings: 'Lookup tables and settings',
}

export default function App() {
  const [page, setPage] = useState('dashboard')
  const { user, loading, logout, isAuthenticated } = useUsersAuth()
  const { ready, account } = useMicrosoftAuth()

  useLayoutEffect(() => {
    if (!ready) return
    if (page === 'dashboard' && !account) {
      setPage('marketing')
    }
  }, [ready, account, page])

  if (loading) {
    return (
      <div className="login-page">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-brand">
            <h1>HSL Workbench</h1>
            <p className="app-subtitle">{PAGE_SUBTITLES[page] || PAGE_SUBTITLES.dashboard}</p>
          </div>
          <nav className="app-nav" aria-label="Main navigation">
            <button
              type="button"
              className={`app-nav-btn ${page === 'dashboard' ? 'app-nav-btn--active' : ''}`}
              onClick={() => setPage('dashboard')}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={`app-nav-btn ${page === 'marketing' ? 'app-nav-btn--active' : ''}`}
              onClick={() => setPage('marketing')}
            >
              Marketing
            </button>
            <button
              type="button"
              className={`app-nav-btn ${page === 'settings' ? 'app-nav-btn--active' : ''}`}
              onClick={() => setPage('settings')}
            >
              Settings
            </button>
            <span className="app-nav-user">{user.displayName || user.username}</span>
            <button type="button" className="app-nav-btn app-nav-btn--logout" onClick={logout}>
              Sign out
            </button>
          </nav>
        </div>
      </header>
      {page === 'dashboard' && <Workbench />}
      {page === 'marketing' && <MarketingPage />}
      {page === 'settings' && <SettingsPage />}
    </div>
  )
}
