import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'

export default function EmailSettingsSection() {
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
    return (
      <section className="lookup-section email-settings-section">
        <h3 className="lookup-section-title">Microsoft email</h3>
        <p className="muted">Loading sign-in status…</p>
      </section>
    )
  }

  if (!configured) {
    return (
      <section className="lookup-section email-settings-section">
        <h3 className="lookup-section-title">Microsoft email</h3>
        <p className="lookup-section-intro muted">
          {import.meta.env.DEV ? (
            <>
              Add <code>VITE_MS_TENANT_ID</code>, <code>VITE_MS_CLIENT_ID</code>, and{' '}
              <code>VITE_MS_REDIRECT_URI</code> to <code>.env.local</code>, then restart{' '}
              <code>npm run dev</code>.
            </>
          ) : (
            <>
              Microsoft sign-in is not configured on this deployment. Set{' '}
              <code>VITE_MS_TENANT_ID</code> and <code>VITE_MS_CLIENT_ID</code> in{' '}
              <code>apphosting.yaml</code> (build time) and redeploy. Also register the hosted
              redirect URI in Azure:{' '}
              <code>{window.location.origin}/auth/microsoft/callback</code>
            </>
          )}
        </p>
      </section>
    )
  }

  return (
    <section className="lookup-section email-settings-section">
      <h3 className="lookup-section-title">Microsoft email</h3>
      <p className="lookup-section-intro muted">
        Connect your Microsoft 365 mailbox so the Communications tab can show messages matching
        each project&apos;s client contact email.
      </p>

      {initError && <p className="form-error">{initError}</p>}

      <div className="systems-card email-settings-card">
        {account ? (
          <>
            <p className="email-settings-status">
              Connected as <strong>{userName || userEmail}</strong>
              {userName && userEmail ? ` (${userEmail})` : ''}
            </p>
            <p className="muted email-settings-hint">
              Mail is read via Microsoft Graph using delegated permissions. Sign in again if scans
              stop working after a long idle period.
            </p>
            <button type="button" className="btn-secondary btn-small" onClick={() => logout()}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="muted email-settings-hint">
              Sign in with your Microsoft 365 account. You will be asked to allow read access to
              your mail.
            </p>
            <button type="button" className="btn-primary btn-small" onClick={() => login()}>
              Connect Microsoft account
            </button>
          </>
        )}
      </div>
    </section>
  )
}
