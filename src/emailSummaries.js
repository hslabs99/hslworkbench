import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { parseEmailAddress } from './emailAddress.js'
import { mergeHarvestedClientContacts } from './graphMail.js'
import { isExcludedHarvestEmail } from './harvestExclusionsCleanup.js'

const COLLECTION = 'email_summaries'

/** Stable Firestore doc id: one summary per project + Graph message. */
export function emailSummaryDocId(projectId, messageId) {
  const safe = String(messageId || '')
    .replace(/\//g, '_')
    .replace(/\s/g, '_')
  return `${projectId}__${safe}`
}

function sinceDateFromDays(days) {
  const since = new Date()
  since.setDate(since.getDate() - Math.max(1, Number(days) || 30))
  since.setHours(0, 0, 0, 0)
  return since
}

export function rowWithinDays(row, days) {
  const since = sinceDateFromDays(days)
  if (!row?.date && !row?.messageDate) return true
  const iso = row.messageDate || row.date
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t >= since.getTime()
}

function docToRow(id, data) {
  return {
    id: data.messageId || id,
    firestoreId: id,
    projectId: data.projectId,
    messageId: data.messageId,
    direction: data.direction,
    inInbox: Boolean(data.inInbox),
    from: parseEmailAddress(data.from) || data.from || '',
    to: data.to,
    cc: data.cc || '',
    bcc: data.bcc || '',
    subject: data.subject,
    bodyPreview: data.bodyPreview || '',
    summary: data.summary || '',
    type: data.type,
    typeLabel: data.typeLabel,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    webLink: data.webLink || null,
    date: data.messageDate || null,
    messageDate: data.messageDate || null,
    dateDisplay: data.dateDisplay || '—',
    summarisedAt: data.summarisedAt,
  }
}

export function sortSummaryRows(rows) {
  return [...rows].sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0
    const tb = b.date ? new Date(b.date).getTime() : 0
    return tb - ta
  })
}

/** Live list of stored summaries for a project (filtered by days in the UI). */
export function subscribeEmailSummaries(projectId, onRows, onError) {
  if (!projectId) {
    onRows([])
    return () => {}
  }

  const q = query(collection(db, COLLECTION), where('projectId', '==', projectId))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => docToRow(d.id, d.data()))
      onRows(sortSummaryRows(rows))
    },
    (err) => {
      console.error(err)
      const msg = err?.code === 'permission-denied'
        ? 'Missing or insufficient permissions. Deploy Firestore rules: firebase deploy --only firestore:rules'
        : err instanceof Error
          ? err.message
          : String(err)
      onError?.(new Error(msg))
    },
  )
}

/** One-time fetch of messageIds already summarised for this project. */
export async function getSummarisedMessageIds(projectId) {
  if (!projectId) return new Set()
  const q = query(collection(db, COLLECTION), where('projectId', '==', projectId))
  const snap = await getDocs(q)
  const ids = new Set()
  for (const d of snap.docs) {
    const mid = d.data().messageId
    if (mid) ids.add(mid)
  }
  return ids
}

/** Load stored summaries keyed by Graph message id. */
export async function getStoredSummariesByMessageId(projectId) {
  if (!projectId) return new Map()
  const q = query(collection(db, COLLECTION), where('projectId', '==', projectId))
  const snap = await getDocs(q)
  const map = new Map()
  for (const d of snap.docs) {
    const row = docToRow(d.id, d.data())
    const messageId = row.messageId || messageIdFromDocId(projectId, d.id)
    if (!messageId) continue
    row.messageId = messageId
    map.set(messageId, row)
  }
  return map
}

function messageIdFromDocId(projectId, docId) {
  const prefix = `${projectId}__`
  if (!docId.startsWith(prefix)) return null
  return docId.slice(prefix.length) || null
}

/**
 * Prefer filed (inInbox false) when Graph returns the same message id twice.
 */
export function indexFreshRowsByMessageId(freshRows) {
  const map = new Map()
  for (const row of freshRows) {
    const existing = map.get(row.id)
    if (!existing) {
      map.set(row.id, row)
      continue
    }
    if (existing.inInbox && !row.inInbox) {
      map.set(row.id, row)
    }
  }
  return map
}

/**
 * Update inInbox / typeLabel for already-indexed emails (no OpenAI).
 * filedMessageIds — message ids seen in the client folder scan (filed = not in root Inbox).
 */
export async function syncEmailSummaryLocations(
  projectId,
  freshRows,
  { formatTypeLabel, resolveInInboxForMessageId, filedMessageIds },
) {
  if (!projectId) return { updated: 0, ids: [] }

  const stored = await getStoredSummariesByMessageId(projectId)
  const freshById = indexFreshRowsByMessageId(freshRows || [])
  const filed = filedMessageIds instanceof Set
    ? filedMessageIds
    : new Set(filedMessageIds || [])
  const patches = []

  // Re-check flagged inbox rows first — these are stuck most often.
  const entries = [...stored.entries()].sort(([, a], [, b]) => {
    if (a.inInbox === b.inInbox) return 0
    return a.inInbox ? -1 : 1
  })

  for (const [messageId, existing] of entries) {
    if (existing.direction === 'outbound') continue

    let nextInInbox

    if (filed.has(messageId)) {
      nextInInbox = false
    } else if (resolveInInboxForMessageId) {
      try {
        nextInInbox = await resolveInInboxForMessageId(messageId)
      } catch {
        // Cannot read folder — do not leave stuck as inbox if we cannot verify
        nextInInbox = existing.inInbox ? false : Boolean(freshById.get(messageId)?.inInbox)
      }
    } else {
      const fresh = freshById.get(messageId)
      if (!fresh) continue
      nextInInbox = Boolean(fresh.inInbox)
    }

    const prevInInbox = Boolean(existing.inInbox)
    if (nextInInbox === prevInInbox) continue

    const type = existing.type || freshById.get(messageId)?.type || 'Informative'

    patches.push({
      messageId,
      inInbox: nextInInbox,
      typeLabel: formatTypeLabel(existing.direction || 'inbound', type, {
        inInbox: nextInInbox,
      }),
    })
  }

  if (!patches.length) return { updated: 0, ids: [] }

  const batch = writeBatch(db)
  for (const patch of patches) {
    const ref = doc(db, COLLECTION, emailSummaryDocId(projectId, patch.messageId))
    batch.set(
      ref,
      {
        inInbox: patch.inInbox,
        typeLabel: patch.typeLabel,
        locationSyncedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }
  await batch.commit()

  return { updated: patches.length, ids: patches.map((p) => p.messageId) }
}

export function rowToFirestorePayload(projectId, row) {
  return {
    projectId,
    messageId: row.id,
    direction: row.direction,
    inInbox: Boolean(row.inInbox),
    from: parseEmailAddress(row.from) || row.from || '',
    to: row.to,
    cc: row.cc || '',
    bcc: row.bcc || '',
    subject: row.subject,
    bodyPreview: row.bodyPreview || '',
    summary: row.summary || '',
    type: row.type,
    typeLabel: row.typeLabel,
    attachments: row.attachments || [],
    webLink: row.webLink || null,
    messageDate: row.date || null,
    dateDisplay: row.dateDisplay || '—',
    summarisedAt: serverTimestamp(),
  }
}

/** Persist newly AI-summarised rows (skips if doc already exists — use only for new rows). */
export async function saveEmailSummaries(projectId, rows) {
  if (!projectId || !rows.length) return

  const batch = writeBatch(db)
  for (const row of rows) {
    const ref = doc(db, COLLECTION, emailSummaryDocId(projectId, row.id))
    batch.set(ref, rowToFirestorePayload(projectId, row), { merge: true })
  }
  await batch.commit()
}

/** One-time fetch of stored summary rows for a project. */
export async function getProjectSummaryRows(projectId) {
  if (!projectId) return []
  const q = query(collection(db, COLLECTION), where('projectId', '==', projectId))
  const snap = await getDocs(q)
  return sortSummaryRows(snap.docs.map((d) => docToRow(d.id, d.data())))
}

function parseAddressListField(field) {
  if (!field || field === '—') return []
  return field
    .split(',')
    .map((part) => parseEmailAddress(part.trim()))
    .filter(Boolean)
}

function addressesFromSummaryRow(row) {
  const addrs = new Set()
  const from = parseEmailAddress(row.from)
  if (from) addrs.add(from)
  for (const field of [row.to, row.cc, row.bcc]) {
    for (const email of parseAddressListField(field)) {
      addrs.add(email)
    }
  }
  return [...addrs]
}

function buildExcludeSet({ mailboxEmail = '', globalExcludeEmails = [] } = {}) {
  return new Set(
    [mailboxEmail, ...(globalExcludeEmails || [])].map(parseEmailAddress).filter(Boolean),
  )
}

function isHarvestExcluded(email, exclude, globalExcludeEmails) {
  const key = parseEmailAddress(email)
  if (!key || exclude.has(key)) return true
  return isExcludedHarvestEmail(key, globalExcludeEmails)
}

function pickPrimaryFromSummaryRows(rows, { exclude, globalExcludeEmails, primaryEmail = '' } = {}) {
  const primaryKey = parseEmailAddress(primaryEmail)
  if (primaryKey && !isHarvestExcluded(primaryKey, exclude, globalExcludeEmails)) {
    return { email: primaryKey, name: '' }
  }

  const fromCounts = new Map()
  for (const row of rows) {
    if (row.direction === 'outbound') continue
    const from = parseEmailAddress(row.from)
    if (!from || isHarvestExcluded(from, exclude, globalExcludeEmails)) continue
    fromCounts.set(from, (fromCounts.get(from) || 0) + 1)
  }

  let best = null
  for (const [email, count] of fromCounts) {
    if (!best || count > best.count || (count === best.count && email.localeCompare(best.email) < 0)) {
      best = { email, count }
    }
  }
  if (!best) return null
  return { email: best.email, name: '' }
}

/** Harvest contacts from Communication Summary rows already stored for this card. */
export function harvestContactsFromSummaryRows(
  rows,
  existingContacts,
  { mailboxEmail = '', globalExcludeEmails = [], primaryEmail = '' } = {},
) {
  const exclude = buildExcludeSet({ mailboxEmail, globalExcludeEmails })
  for (const c of existingContacts || []) {
    const key = parseEmailAddress(c.email)
    if (key) exclude.add(key)
  }

  const byEmail = new Map()
  for (const row of rows || []) {
    for (const email of addressesFromSummaryRow(row)) {
      if (isHarvestExcluded(email, exclude, globalExcludeEmails)) continue
      if (!byEmail.has(email)) {
        byEmail.set(email, { email, name: '' })
      }
    }
  }

  const harvested = [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email))
  const { merged, added } = mergeHarvestedClientContacts(existingContacts, harvested)
  const primary = pickPrimaryFromSummaryRows(rows, {
    exclude: buildExcludeSet({ mailboxEmail, globalExcludeEmails }),
    globalExcludeEmails,
    primaryEmail,
  })

  return {
    merged,
    added,
    messagesScanned: (rows || []).length,
    messagesMatched: (rows || []).length,
    contactFilterApplied: true,
    source: 'stored_summaries',
    primary,
    harvested,
  }
}

export async function harvestContactsFromStoredSummaries(
  projectId,
  existingContacts,
  options = {},
) {
  const rows = await getProjectSummaryRows(projectId)
  return harvestContactsFromSummaryRows(rows, existingContacts, options)
}
