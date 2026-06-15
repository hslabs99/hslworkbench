import { normalizeEmailAddress } from './emailAddress.js'

const MAX_PROJECT_NAME_LEN = 72

export const DEFAULT_PROSPECT_NAME_SYSTEM_PROMPT = `You name new business leads for a project workbench before a project is formally scoped.

Given one lead email, output a short project card title that captures what the client wants — the service, product, or problem — not their personal name or email address.

Rules:
- 3–10 words, concrete and scannable on a kanban card
- Use nouns from the email (e.g. "Customer portal quote", "Warehouse ERP integration")
- Do not use the sender's name or company name alone as the title
- Do not wrap the title in quotes
- Maximum ${MAX_PROJECT_NAME_LEN} characters
- description: one optional sentence (under 25 words) expanding the need; omit if redundant

Return valid JSON only: { "projectName": "...", "description": "..." }`

export function sanitizeProjectName(raw) {
  let name = String(raw || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ')
  if (!name) return ''
  if (name.length > MAX_PROJECT_NAME_LEN) {
    name = `${name.slice(0, MAX_PROJECT_NAME_LEN - 1)}…`
  }
  return name
}

export function isGenericProspectProjectName(name, email, contactName = '') {
  const n = (name || '').trim()
  if (!n) return true
  const e = normalizeEmailAddress(email)
  if (e && n.toLowerCase() === e) return true
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) return true
  const cn = (contactName || '').trim()
  if (cn && n.toLowerCase() === cn.toLowerCase()) return true
  return false
}

export function suggestNameFromSubject(subject) {
  let s = (subject || '').trim()
  if (!s) return ''
  while (/^(re|fw|fwd):\s*/i.test(s)) {
    s = s.replace(/^(re|fw|fwd):\s*/i, '').trim()
  }
  if (s.length < 5) return ''
  return sanitizeProjectName(s)
}

export function pickProspectTitleFromSummaries(rows) {
  const list = rows || []
  const inbound = list.filter((r) => r.direction === 'inbound')
  const newInquiry = inbound.find((r) => r.type === 'New inquiry')
  const pick = newInquiry || inbound[0] || list[0]
  if (!pick?.summary) return ''
  return sanitizeProjectName(pick.summary)
}

export async function suggestProspectProjectNameViaOpenAI({
  senderEmail,
  senderName,
  subject,
  body,
  promptOverrides = null,
}) {
  const res = await fetch('/api/suggest-prospect-name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      senderEmail,
      senderName,
      subject,
      body,
      promptOverrides: promptOverrides || undefined,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Prospect naming failed (${res.status})`)
  }
  return {
    projectName: sanitizeProjectName(data.projectName),
    description: (data.description || '').trim(),
  }
}

export async function resolveProspectProjectName(prospect, { promptOverrides } = {}) {
  const email = normalizeEmailAddress(prospect.email)
  const contactName = (prospect.name || '').trim()
  const subject = prospect.leadSubject || ''
  const body = prospect.leadBody || ''

  if (subject || body) {
    try {
      const ai = await suggestProspectProjectNameViaOpenAI({
        senderEmail: email,
        senderName: contactName,
        subject,
        body,
        promptOverrides,
      })
      if (
        ai.projectName &&
        !isGenericProspectProjectName(ai.projectName, email, contactName)
      ) {
        return ai
      }
    } catch {
      // fall through to subject / contact fallback
    }
  }

  const fromSubject = suggestNameFromSubject(subject)
  if (fromSubject && !isGenericProspectProjectName(fromSubject, email, contactName)) {
    return { projectName: fromSubject, description: '' }
  }

  return { projectName: contactName || email, description: '' }
}
