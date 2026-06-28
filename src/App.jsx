import { useState } from 'react'
import Workbench from './components/Workbench.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { useUsersAuth } from './UsersAuthContext.jsx'

export default function App() {
  const [page, setPage] = useState('workbench')
  const { user, loading, logout, isAuthenticated } = useUsersAuth()

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
            <p className="app-subtitle">
              {page === 'settings'
                ? 'Lookup tables and settings'
                : 'Client project board'}
            </p>
          </div>
          <nav className="app-nav" aria-label="Main navigation">
            <button
              type="button"
              className={`app-nav-btn ${page === 'workbench' ? 'app-nav-btn--active' : ''}`}
              onClick={() => setPage('workbench')}
            >
              Workbench
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
      {page === 'workbench' ? <Workbench /> : <SettingsPage />}
    </div>
  )
}
