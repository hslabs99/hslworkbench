import { db, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from './firestore.js'
import { parseEmailAddress } from './emailAddress.js'
import { asFirestoreError } from './firestoreErrors.js'

const COLLECTION = 'boardSettings'
export const MAILING_EXCLUSIONS_DOC = 'mailingExclusions'
export const MAILING_UNSUBSCRIBES_DOC = 'mailingUnsubscribes'
const CLIENT_EMAILS_DOC = 'clientEmails'

function normalizeExclusion(row) {
  const email = parseEmailAddress(row?.email)
  if (!email) return null
  return {
    email,
    name: String(row.name || '').trim(),
    source: row.source === 'unsubscribe' ? 'unsubscribe' : row.source || 'manual',
    sendId: row.sendId || '',
    campaignId: row.campaignId || '',
    at: row.at || '',
  }
}

function mergeExclusionDocs(exclData, unsubData) {
  const byEmail = new Map()
  for (const row of [...(unsubData?.items || []), ...(exclData?.items || [])]) {
    const item = normalizeExclusion(row)
    if (!item) continue
    const existing = byEmail.get(item.email)
    byEmail.set(item.email, existing ? { ...existing, ...item, at: item.at || existing.at } : item)
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email))
}

async function readExclusionItems() {
  const [exclSnap, unsubSnap] = await Promise.all([
    getDoc(doc(db, COLLECTION, MAILING_EXCLUSIONS_DOC)),
    getDoc(doc(db, COLLECTION, MAILING_UNSUBSCRIBES_DOC)),
  ])
  return mergeExclusionDocs(exclSnap.data(), unsubSnap.data())
}

async function writeExclusionItems(items) {
  const ref = doc(db, COLLECTION, MAILING_EXCLUSIONS_DOC)
  const snap = await getDoc(ref)
  await setDoc(
    ref,
    {
      items,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  )
}

export async function loadMailingExclusionEmails() {
  try {
    return new Set((await readExclusionItems()).map((row) => row.email))
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function loadMailingExclusions() {
  try {
    return await readExclusionItems()
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export function subscribeMailingExclusions(onChange, onError) {
  const exclRef = doc(db, COLLECTION, MAILING_EXCLUSIONS_DOC)
  const unsubRef = doc(db, COLLECTION, MAILING_UNSUBSCRIBES_DOC)
  let exclData = null
  let unsubData = null
  let exclReady = false
  let unsubReady = false

  const emit = () => {
    if (!exclReady || !unsubReady) return
    onChange(mergeExclusionDocs(exclData, unsubData))
  }

  const unsubA = onSnapshot(
    exclRef,
    (snap) => {
      exclData = snap.data() || { items: [] }
      exclReady = true
      emit()
    },
    (err) => onError?.(asFirestoreError(err)),
  )
  const unsubB = onSnapshot(
    unsubRef,
    (snap) => {
      unsubData = snap.data() || { items: [] }
      unsubReady = true
      emit()
    },
    (err) => onError?.(asFirestoreError(err)),
  )

  return () => {
    unsubA()
    unsubB()
  }
}

async function removeFromMasterListMany(emails) {
  const ids = new Set((emails || []).map((value) => parseEmailAddress(value)).filter(Boolean))
  if (!ids.size) return
  const ref = doc(db, COLLECTION, CLIENT_EMAILS_DOC)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const items = (Array.isArray(snap.data()?.items) ? snap.data().items : []).filter(
    (row) => !ids.has(parseEmailAddress(row.email)),
  )
  await setDoc(ref, { items, updatedAt: serverTimestamp() }, { merge: true })
}

async function removeFromMasterList(email) {
  await removeFromMasterListMany([email])
}

export async function addMailingExclusion({
  email,
  name = '',
  source = 'manual',
  sendId = '',
  campaignId = '',
  removeFromMaster = true,
} = {}) {
  const id = parseEmailAddress(email)
  if (!id) throw new Error('A valid email address is required.')
  try {
    const items = await readExclusionItems()
    const existing = items.find((row) => row.email === id)
    const next = existing
      ? items.map((row) =>
          row.email === id
            ? {
                ...row,
                name: name || row.name,
                source: source || row.source,
                sendId: sendId || row.sendId,
                campaignId: campaignId || row.campaignId,
                at: row.at || new Date().toISOString(),
              }
            : row,
        )
      : [
          ...items,
          {
            email: id,
            name: String(name || '').trim(),
            source: source === 'unsubscribe' ? 'unsubscribe' : 'manual',
            sendId,
            campaignId,
            at: new Date().toISOString(),
          },
        ]
    await writeExclusionItems(next)
    if (removeFromMaster) await removeFromMasterList(id)
    return { created: !existing, email: id }
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function addMailingExclusions(rows, { source = 'manual', removeFromMaster = true } = {}) {
  const incoming = []
  for (const row of rows || []) {
    const email = parseEmailAddress(row?.email || row)
    if (!email) continue
    incoming.push({
      email,
      name: String(row?.name || '').trim(),
      source: source === 'unsubscribe' ? 'unsubscribe' : 'manual',
      sendId: '',
      campaignId: '',
      at: new Date().toISOString(),
    })
  }
  if (!incoming.length) return { added: 0, total: 0 }
  try {
    const items = await readExclusionItems()
    const byEmail = new Map(items.map((row) => [row.email, row]))
    let added = 0
    for (const row of incoming) {
      if (byEmail.has(row.email)) {
        const existing = byEmail.get(row.email)
        byEmail.set(row.email, { ...existing, name: row.name || existing.name })
        continue
      }
      byEmail.set(row.email, row)
      added += 1
    }
    await writeExclusionItems([...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email)))
    if (removeFromMaster) await removeFromMasterListMany(incoming.map((row) => row.email))
    return { added, total: incoming.length }
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function removeMailingExclusion(email) {
  const id = parseEmailAddress(email)
  if (!id) return
  try {
    const items = (await readExclusionItems()).filter((row) => row.email !== id)
    await writeExclusionItems(items)
    const unsubRef = doc(db, COLLECTION, MAILING_UNSUBSCRIBES_DOC)
    const unsubSnap = await getDoc(unsubRef)
    if (unsubSnap.exists()) {
      const leftover = (Array.isArray(unsubSnap.data()?.items) ? unsubSnap.data().items : []).filter(
        (row) => parseEmailAddress(row.email) !== id,
      )
      await setDoc(unsubRef, { items: leftover, updatedAt: serverTimestamp() }, { merge: true })
    }
  } catch (err) {
    throw asFirestoreError(err)
  }
}
