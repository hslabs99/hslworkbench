/** Where the user is looking at the app — not NODE_ENV (the production bundle also runs on localhost preview). */
export function isHostedBrowser() {
  if (typeof window === 'undefined') return false
  const host = String(window.location.hostname || '')
  return (
    host.endsWith('.hosted.app') ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com')
  )
}

export function isLocalBrowser() {
  if (typeof window === 'undefined') return true
  const host = String(window.location.hostname || '')
  return host === 'localhost' || host === '127.0.0.1'
}

export function sendGridClientHint(config = {}) {
  const hosted = config.runtime === 'hosted' || isHostedBrowser()
  const hint = String(config.setupHint || '')
  if (hosted) {
    if (hint && !/\.env\.local/i.test(hint)) return hint
    return (
      'SendGrid is not configured on App Hosting. Set Secret Manager secret sendgridApiKey ' +
      '(maps to SENDGRID_API_KEY), grant the backend access, set SENDGRID_FROM_EMAIL, then redeploy.'
    )
  }
  return (
    hint ||
    'SendGrid is not configured. Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to .env.local and restart the dev server.'
  )
}
