/** Public origin for campaign tracking and unsubscribe links (hosted App Hosting URL). */
export const DEFAULT_MAILING_PUBLIC_ORIGIN = 'https://hslworkbench--hslworkbench.asia-southeast1.hosted.app'

export function mailingPublicOrigin() {
  const fromEnv = String(import.meta.env.VITE_MAILING_PUBLIC_ORIGIN || '')
    .trim()
    .replace(/\/$/, '')
  return fromEnv || DEFAULT_MAILING_PUBLIC_ORIGIN
}

/** Template href for the editor: hosted /unsubscribe with a {{email}} merge placeholder. */
export function mailingUnsubscribeHrefTemplate() {
  return `${mailingPublicOrigin()}/unsubscribe?{{email}}`
}

/**
 * Hosted unsubscribe link. Visible text in the email is always "unsubscribe".
 * Example: https://hslworkbench--hslworkbench.asia-southeast1.hosted.app/unsubscribe?mike@test.com
 */
export function mailingUnsubscribeUrl({ sendId = '', email = '' } = {}) {
  const origin = mailingPublicOrigin()
  const address = String(email || '').trim()
  const parts = []
  if (address) parts.push(address)
  if (sendId) parts.push(`sid=${encodeURIComponent(sendId)}`)
  const query = parts.join('&')
  return query ? `${origin}/unsubscribe?${query}` : `${origin}/unsubscribe`
}

export function mailingOpenPixelUrl(sendId) {
  const origin = mailingPublicOrigin()
  if (!sendId) return ''
  return `${origin}/api/mailings/track/open?sid=${encodeURIComponent(sendId)}`
}

export function mailingClickUrl(sendId, url) {
  const origin = mailingPublicOrigin()
  return `${origin}/api/mailings/track/click?sid=${encodeURIComponent(sendId)}&url=${encodeURIComponent(url)}`
}

export function isUnsubscribeHref(href) {
  const value = String(href || '')
  if (!value) return false
  if (value.includes('{{unsubscribe_url}}')) return true
  if (value === '#unsubscribe' || value.endsWith('#unsubscribe')) return true
  try {
    const url = value.includes(':') ? new URL(value) : new URL(value, 'https://example.invalid')
    return url.pathname === '/unsubscribe' || url.pathname === '/api/mailings/unsubscribe'
  } catch {
    return /unsubscribe/i.test(value)
  }
}
