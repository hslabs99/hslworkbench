/**
 * Short-form email only — bare address for storage, display, and matching.
 * Parses Outlook strings like "Name<user@host.com>" → user@host.com
 */
export function parseEmailAddress(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const inAngles = raw.match(/<([^<>@\s]+@[^<>@\s]+)>/i)
  if (inAngles) return inAngles[1].trim().toLowerCase()

  const bare = raw.match(/([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)/)
  if (bare) return bare[1].trim().toLowerCase()

  return raw.toLowerCase()
}

/** Alias — always returns short-form address for comparisons. */
export function normalizeEmailAddress(value) {
  return parseEmailAddress(value)
}

/** Short-form From address from a Graph message (never returns display-name-only). */
export function senderAddressFromGraph(from) {
  const address = from?.emailAddress?.address
  const name = from?.emailAddress?.name
  return parseEmailAddress(address) || parseEmailAddress(name) || ''
}

/** Short-form address from a Graph recipient entry. */
export function recipientAddressFromGraph(recipient) {
  const address = recipient?.emailAddress?.address
  const name = recipient?.emailAddress?.name
  return parseEmailAddress(address) || parseEmailAddress(name) || ''
}
