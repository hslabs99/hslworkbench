import { useState } from 'react'
import { DEV_SEED_USER } from '../users.js'
import { useUsersAuth } from '../UsersAuthContext.jsx'

const isDev = import.meta.env.DEV

export default function LoginPage() {
  const { login } = useUsersAuth()
  const [username, setUsername] = useState(isDev ? DEV_SEED_USER.username : '')
  const [password, setPassword] = useState(isDev ? DEV_SEED_USER.password : '')
  const [remember, setRemember] = useState(!isDev)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password, remember)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card systems-card">
        <h1 className="login-title">HSL Workbench</h1>
        <p className="login-intro muted">Sign in with your workbench account.</p>

        {isDev && (
          <p className="login-dev-hint muted">
            Local dev — credentials pre-filled. User <strong>{DEV_SEED_USER.username}</strong> is
            seeded once when the dev server starts (if missing).
          </p>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            Username
            <input
              type="text"
              className="login-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="login-field">
            Password
            <input
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label className="login-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me on this device
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary login-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
