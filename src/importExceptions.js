import { db, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from './firestore.js'
import { parseEmailAddress } from './emailAddress.js'
import { asFirestoreError } from './firestoreErrors.js'

const COLLECTION = 'boardSettings'
export const IMPORT_EXCEPTIONS_DOC = 'clientEmailImportExceptions'
const MAX_ITEMS = 2000

export const IMPORT_EXCEPTION_REASONS = {
  existing: 'Already on master list',
  excluded: 'On exclusions list',
  duplicate: 'Duplicate in this file',
  no_email: 'No valid email',
}

function normalizeException(row) {
  if (!row || typeof row !== 'object') return null
  const reason = IMPORT_EXCEPTION_REASONS[row.reason] ? row.reason : 'existing'
  const email = parseEmailAddress(row.email) || String(row.email || '').trim()
  if (!email && reason !== 'no_email') return null
  return {
    email,
    name: String(row.name || '').trim(),
    company: String(row.company || '').trim(),
    reason,
    batch: String(row.batch || '').trim(),
    existingBatch: String(row.existingBatch || '').trim(),
    fileName: String(row.fileName || '').trim(),
    at: String(row.at || '').trim(),
  }
}

function normalizeItems(data) {
  return (Array.isArray(data?.items) ? data.items : []).map(normalizeException).filter(Boolean)
}

async function writeItems(ref, snap, items) {
  await setDoc(
    ref,
    {
      items: items.slice(0, MAX_ITEMS),
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  )
}

export function subscribeImportExceptions(onChange, onError) {
  const ref = doc(db, COLLECTION, IMPORT_EXCEPTIONS_DOC)
  return onSnapshot(
    ref,
    (snap) => onChange(normalizeItems(snap.data())),
    (err) => onError?.(asFirestoreError(err)),
  )
}

export async function appendImportExceptions(rows) {
  const incoming = (rows || []).map(normalizeException).filter(Boolean)
  if (!incoming.length) return { added: 0 }
  const ref = doc(db, COLLECTION, IMPORT_EXCEPTIONS_DOC)
  try {
    const snap = await getDoc(ref)
    const current = normalizeItems(snap.data())
    await writeItems(ref, snap, [...incoming, ...current])
    return { added: incoming.length }
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function emptyImportExceptions() {
  const ref = doc(db, COLLECTION, IMPORT_EXCEPTIONS_DOC)
  try {
    const snap = await getDoc(ref)
    const removed = normalizeItems(snap.data()).length
    await writeItems(ref, snap, [])
    return { removed }
  } catch (err) {
    throw asFirestoreError(err)
  }
}
