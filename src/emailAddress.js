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

const WIX_MAIL_HOSTS = [
  'wix.com',
  'wixsite.com',
  'wix-forms.com',
  'wixpress.com',
  'wixanswers.com',
]

/** True for Wix / Wix CRM / Wix Forms mailboxes — not a client address. */
export function isWixMailboxAddress(email) {
  const host = parseEmailAddress(email).split('@')[1] || ''
  if (!host) return false
  const h = host.toLowerCase()
  return WIX_MAIL_HOSTS.some((d) => h === d || h.endsWith(`.${d}`))
}

/** Display name with any embedded address stripped (empty when the name was only an email). */
export function displayNameWithoutEmail(name) {
  const raw = String(name || '').trim()
  if (!raw) return ''
  const stripped = raw.replace(/<[^<>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (!stripped) return ''
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stripped)) return ''
  return stripped
}

function isBareEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Resolve a Graph emailAddress into a client contact.
 * Wix / Wix CRM often put the real client address in the display name while From or
 * Reply-To is a Wix mailbox — prefer the client address and skip the Wix one.
 */
export function contactFromGraphEmailAddress(emailAddress) {
  if (!emailAddress) return null
  const parsedAddress = parseEmailAddress(emailAddress.address)
  const rawAddress = isBareEmail(parsedAddress) ? parsedAddress : ''
  const rawName = String(emailAddress.name || '').trim()
  const parsedFromName = parseEmailAddress(rawName)
  const emailFromName = isBareEmail(parsedFromName) ? parsedFromName : ''

  let email = rawAddress
  if (email && isWixMailboxAddress(email)) {
    if (emailFromName && !isWixMailboxAddress(emailFromName)) {
      email = emailFromName
    } else {
      return null
    }
  } else if (!email) {
    email = emailFromName
  }

  if (!email || isWixMailboxAddress(email)) return null

  return { email, name: displayNameWithoutEmail(rawName) }
}
