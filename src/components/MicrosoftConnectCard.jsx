import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'

export default function MicrosoftConnectCard({ hint, scopes }) {
  const {
    configured,
    ready,
    account,
    initError,
    login,
    logout,
    userEmail,
    userName,
  } = useMicrosoftAuth()

  if (!ready) {
    return <p className="muted">Loading sign-in status…</p>
  }

  if (!configured) {
    return (
      <p className="lookup-section-intro muted">
        {import.meta.env.DEV ? (
          <>
            Add <code>VITE_MS_TENANT_ID</code> and <code>VITE_MS_CLIENT_ID</code> to{' '}
            <code>.env.local</code>, then restart <code>npm run dev</code>. Redirect URI is
            optional — the app uses{' '}
            <code>{window.location.origin}/auth/microsoft/callback</code> by default.
          </>
        ) : (
          <>
            Microsoft sign-in is not configured on this deployment. Set{' '}
            <code>VITE_MS_TENANT_ID</code> and <code>VITE_MS_CLIENT_ID</code> in{' '}
            <code>apphosting.yaml</code> and redeploy. Register this redirect URI in Azure:{' '}
            <code>{window.location.origin}/auth/microsoft/callback</code>
          </>
        )}
      </p>
    )
  }

  return (
    <>
      {initError && <p className="form-error">{initError}</p>}
      <div className="systems-card email-settings-card">
        {account ? (
          <>
            <p className="email-settings-status">
              Connected as <strong>{userName || userEmail}</strong>
              {userName && userEmail ? ` (${userEmail})` : ''}
            </p>
            <p className="muted email-settings-hint">
              {hint ||
                'Mail is read via Microsoft Graph using delegated permissions. Sign in again if scans stop working after a long idle period.'}
            </p>
            <button type="button" className="btn-secondary btn-small" onClick={() => logout()}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="muted email-settings-hint">
              Sign in with your Microsoft 365 account. You will be asked to allow access to your
              mail.
            </p>
            <button type="button" className="btn-primary btn-small" onClick={() => login(scopes)}>
              Connect Microsoft account
            </button>
          </>
        )}
      </div>
    </>
  )
}
