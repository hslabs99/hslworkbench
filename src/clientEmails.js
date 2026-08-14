import { db, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from './firestore.js'
import { parseEmailAddress } from './emailAddress.js'
import { loadMailingExclusionEmails } from './mailingExclusions.js'

/** Stored as a boardSettings document so it uses the existing Firestore rules. */
const COLLECTION = 'boardSettings'
export const CLIENT_EMAILS_DOC = 'clientEmails'

function itemFromRow(row) {
  const email = parseEmailAddress(row?.email)
  if (!email) return null
  return {
    id: email,
    name: row.name || '',
    email,
    company: row.company || '',
    sourceFolder: row.sourceFolder || '',
    source: row.source || (row.sourceFolder ? 'harvest' : 'manual'),
    importBatch: row.importBatch || '',
    unsubscribed: Boolean(row.unsubscribed),
  }
}

function normalizeItems(data) {
  const items = Array.isArray(data?.items) ? data.items : []
  const byEmail = new Map()
  for (const row of items) {
    const item = itemFromRow(row)
    if (item) byEmail.set(item.email, item)
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email))
}

function itemsPayload(items) {
  return items.map(({ name, email, company, sourceFolder, source, importBatch, unsubscribed }) => ({
    name: name || '',
    email,
    company: company || '',
    sourceFolder: sourceFolder || '',
    source: source || 'manual',
    importBatch: importBatch || '',
    unsubscribed: Boolean(unsubscribed),
  }))
}

/** Timestamped import batch id, e.g. IMP-20260813-180812. Optional label is appended. */
export function createImportBatchRef(label = '', now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const id = `IMP-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const note = String(label || '').trim()
  return note ? `${id} · ${note}` : id
}

async function ensureClientEmailsDoc() {
  const ref = doc(db, COLLECTION, CLIENT_EMAILS_DOC)
  const snap = await getDoc(ref)
  if (snap.exists()) return ref
  await setDoc(ref, {
    items: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref
}

async function writeItems(ref, snap, items) {
  await setDoc(
    ref,
    {
      items: itemsPayload(items),
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  )
}

export function subscribeClientEmails(onChange, onError) {
  const ref = doc(db, COLLECTION, CLIENT_EMAILS_DOC)
  let creating = false

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange([])
        if (creating) return
        creating = true
        ensureClientEmailsDoc().catch((err) => {
          creating = false
          onError?.(asFirestoreError(err))
        })
        return
      }
      onChange(normalizeItems(snap.data()))
    },
    (err) => onError?.(asFirestoreError(err)),
  )
}

export async function loadClientEmails() {
  const ref = doc(db, COLLECTION, CLIENT_EMAILS_DOC)
  try {
    const snap = await getDoc(ref)
    return normalizeItems(snap.data())
  } catch (err) {
    throw asFirestoreError(err)
  }
}

/**
 * Append harvested contacts. Skips emails already stored.
 * Fills an empty name when a later harvest has one. Does not delete existing rows.
 */
export async function mergeHarvestedClientEmails(harvested) {
  return upsertMasterContacts(harvested, { source: 'harvest' })
}

/**
 * Add contacts to the master list. Skips duplicates.
 * Optionally fills empty name/company on existing rows.
 * importBatch is applied only to newly added rows.
 */
export async function upsertMasterContacts(
  rows,
  { source = 'manual', fillBlanks = true, importBatch = '' } = {},
) {
  const ref = doc(db, COLLECTION, CLIENT_EMAILS_DOC)
  try {
    const snap = await getDoc(ref)
    const known = new Map(normalizeItems(snap.data()).map((row) => [row.email, row]))
    const excluded = await loadMailingExclusionEmails()

    let added = 0
    let skipped = 0
    let skippedExcluded = 0
    let namesFilled = 0
    const batch = String(importBatch || '').trim()

    for (const h of rows || []) {
      const email = parseEmailAddress(h.email)
      if (!email) continue
      if (excluded.has(email)) {
        skippedExcluded += 1
        continue
      }
      const existing = known.get(email)
      if (existing) {
        let next = existing
        if (fillBlanks && !existing.name && h.name) {
          next = { ...next, name: h.name }
          namesFilled += 1
        }
        if (fillBlanks && !existing.company && h.company) {
          next = { ...next, company: h.company }
        }
        if (next !== existing) known.set(email, next)
        else skipped += 1
        continue
      }
      known.set(email, {
        id: email,
        email,
        name: h.name || '',
        company: h.company || '',
        sourceFolder: h.sourceFolder || '',
        source: h.source || source,
        importBatch: h.importBatch || batch,
        unsubscribed: Boolean(h.unsubscribed),
      })
      added += 1
    }

    const items = [...known.values()].sort((a, b) => a.email.localeCompare(b.email))
    await writeItems(ref, snap, items)
    return { added, skipped, skippedExcluded, namesFilled }
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function saveClientEmail(row) {
  const email = parseEmailAddress(row?.email)
  if (!email) throw new Error('A valid email address is required.')
  const ref = doc(db, COLLECTION, CLIENT_EMAILS_DOC)
  try {
    const snap = await getDoc(ref)
    const known = new Map(normalizeItems(snap.data()).map((item) => [item.email, item]))
    const existing = known.get(email)
    known.set(email, {
      id: email,
      email,
      name: row.name || existing?.name || '',
      company: row.company ?? existing?.company ?? '',
      sourceFolder: row.sourceFolder ?? existing?.sourceFolder ?? '',
      source: row.source || existing?.source || 'manual',
      importBatch: row.importBatch ?? existing?.importBatch ?? '',
      unsubscribed:
        row.unsubscribed != null ? Boolean(row.unsubscribed) : Boolean(existing?.unsubscribed),
    })
    const items = [...known.values()].sort((a, b) => a.email.localeCompare(b.email))
    await writeItems(ref, snap, items)
    return { created: !existing }
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function removeClientEmail(email) {
  return removeClientEmails([email])
}

export async function removeClientEmails(emails) {
  const ids = new Set((emails || []).map((value) => parseEmailAddress(value)).filter(Boolean))
  if (!ids.size) return { removed: 0 }
  const ref = doc(db, COLLECTION, CLIENT_EMAILS_DOC)
  try {
    const snap = await getDoc(ref)
    const current = normalizeItems(snap.data())
    const items = current.filter((row) => !ids.has(row.email))
    await writeItems(ref, snap, items)
    return { removed: current.length - items.length }
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function setClientEmailUnsubscribed(email, unsubscribed = true) {
  const id = parseEmailAddress(email)
  if (!id) return
  const ref = doc(db, COLLECTION, CLIENT_EMAILS_DOC)
  try {
    const snap = await getDoc(ref)
    const items = normalizeItems(snap.data()).map((row) =>
      row.email === id ? { ...row, unsubscribed: Boolean(unsubscribed) } : row,
    )
    await writeItems(ref, snap, items)
  } catch (err) {
    throw asFirestoreError(err)
  }
}

/** Clear harvested rows. Keeps the boardSettings document in place. */
export async function emptyClientEmailsCollection() {
  const ref = doc(db, COLLECTION, CLIENT_EMAILS_DOC)
  try {
    const snap = await getDoc(ref)
    const removed = normalizeItems(snap.data()).length
    await writeItems(ref, snap, [])
    return { removed }
  } catch (err) {
    throw asFirestoreError(err)
  }
}
