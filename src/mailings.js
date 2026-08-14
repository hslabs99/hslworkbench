import { db, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from './firestore.js'
import { parseEmailAddress } from './emailAddress.js'
import { asFirestoreError } from './firestoreErrors.js'
import { loadMailingExclusionEmails } from './mailingExclusions.js'

/** Stored as boardSettings docs so this uses the existing Firestore rules. */
const COLLECTION = 'boardSettings'
export const MAILING_INDEX_DOC = 'mailingIndex'

function newId() {
  return crypto.randomUUID().replace(/-/g, '')
}

function templateDocId(id) {
  return `mailingTemplate_${id}`
}
function audienceDocId(id) {
  return `mailingAudience_${id}`
}
function campaignDocId(id) {
  return `mailingCampaign_${id}`
}
function sendDocId(id) {
  return `mailingSend_${id}`
}

function mapDoc(id, data) {
  return { id, ...(data || {}) }
}

function sortByUpdated(items) {
  return [...items].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

function emptyIndex() {
  return {
    templates: [],
    audiences: [],
    campaigns: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

async function ensureIndex() {
  const ref = doc(db, COLLECTION, MAILING_INDEX_DOC)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, emptyIndex())
  }
  return ref
}

async function upsertIndexItem(listKey, item) {
  const ref = await ensureIndex()
  const snap = await getDoc(ref)
  const data = snap.data() || {}
  const list = Array.isArray(data[listKey]) ? data[listKey] : []
  const next = sortByUpdated([{ ...item, updatedAt: item.updatedAt || new Date().toISOString() }, ...list.filter((row) => row.id !== item.id)])
  await setDoc(
    ref,
    {
      [listKey]: next,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  )
}

async function removeIndexItem(listKey, id) {
  const ref = await ensureIndex()
  const snap = await getDoc(ref)
  const data = snap.data() || {}
  const list = Array.isArray(data[listKey]) ? data[listKey] : []
  await setDoc(
    ref,
    {
      [listKey]: list.filter((row) => row.id !== id),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

function subscribeIndexList(listKey, onChange, onError) {
  const ref = doc(db, COLLECTION, MAILING_INDEX_DOC)
  let creating = false
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange([])
        if (creating) return
        creating = true
        ensureIndex().catch((err) => {
          creating = false
          onError?.(asFirestoreError(err))
        })
        return
      }
      const list = Array.isArray(snap.data()?.[listKey]) ? snap.data()[listKey] : []
      onChange(sortByUpdated(list))
    },
    (err) => onError?.(asFirestoreError(err)),
  )
}

export function subscribeMailingTemplates(onChange, onError) {
  return subscribeIndexList('templates', onChange, onError)
}

export function subscribeMailingAudiences(onChange, onError) {
  return subscribeIndexList('audiences', onChange, onError)
}

export function subscribeMailingCampaigns(onChange, onError) {
  return subscribeIndexList('campaigns', onChange, onError)
}

function templateSummary(id, data) {
  return {
    id,
    name: data.name || 'Untitled template',
    description: data.description || '',
    subject: data.subject || '',
    updatedAt: new Date().toISOString(),
  }
}

function audienceSummary(id, data) {
  return {
    id,
    name: data.name || 'Untitled audience',
    description: data.description || '',
    memberCount: Array.isArray(data.members) ? data.members.length : 0,
    updatedAt: new Date().toISOString(),
  }
}

export const EMPTY_CAMPAIGN_STATS = {
  targeted: 0,
  sent: 0,
  opened: 0,
  clicked: 0,
  failed: 0,
  unsubscribed: 0,
}

function campaignSummary(id, data) {
  return {
    id,
    name: data.name || 'Untitled campaign',
    description: data.description || '',
    templateId: data.templateId || '',
    templateName: data.templateName || '',
    audienceId: data.audienceId || '',
    audienceName: data.audienceName || '',
    fromEmail: data.fromEmail || '',
    fromName: data.fromName || '',
    sendVia: data.sendVia === 'sendgrid' ? 'sendgrid' : 'graph',
    status: data.status || 'draft',
    stats: { ...EMPTY_CAMPAIGN_STATS, ...(data.stats || {}) },
    sentAt: data.sentAt || null,
    updatedAt: new Date().toISOString(),
  }
}

export async function createMailingTemplate(data) {
  try {
    const id = newId()
    const payload = {
      name: String(data.name || 'Untitled template').trim() || 'Untitled template',
      description: String(data.description || '').trim(),
      subject: String(data.subject || '').trim(),
      htmlBody: String(data.htmlBody || ''),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(doc(db, COLLECTION, templateDocId(id)), payload)
    await upsertIndexItem('templates', templateSummary(id, payload))
    return id
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function updateMailingTemplate(id, data) {
  try {
    const ref = doc(db, COLLECTION, templateDocId(id))
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
    const snap = await getDoc(ref)
    await upsertIndexItem('templates', templateSummary(id, snap.data() || data))
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function deleteMailingTemplate(id) {
  try {
    await deleteDoc(doc(db, COLLECTION, templateDocId(id)))
    await removeIndexItem('templates', id)
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export function normalizeAudienceMember(row) {
  const email = parseEmailAddress(row?.email)
  if (!email) return null
  return {
    email,
    name: String(row.name || '').trim(),
    company: String(row.company || '').trim(),
    source: row.source || 'manual',
  }
}

export function uniqueMembers(rows) {
  const byEmail = new Map()
  for (const row of rows || []) {
    const member = normalizeAudienceMember(row)
    if (!member) continue
    const existing = byEmail.get(member.email)
    if (existing) {
      byEmail.set(member.email, {
        ...existing,
        name: existing.name || member.name,
        company: existing.company || member.company,
      })
    } else {
      byEmail.set(member.email, member)
    }
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email))
}

export async function createMailingAudience(data) {
  try {
    const id = newId()
    const payload = {
      name: String(data.name || 'Untitled audience').trim() || 'Untitled audience',
      description: String(data.description || '').trim(),
      members: uniqueMembers(data.members),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(doc(db, COLLECTION, audienceDocId(id)), payload)
    await upsertIndexItem('audiences', audienceSummary(id, payload))
    return id
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function updateMailingAudience(id, data) {
  try {
    const payload = { ...data, updatedAt: serverTimestamp() }
    if (data.members) payload.members = uniqueMembers(data.members)
    const ref = doc(db, COLLECTION, audienceDocId(id))
    await updateDoc(ref, payload)
    const snap = await getDoc(ref)
    await upsertIndexItem('audiences', audienceSummary(id, snap.data() || payload))
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function deleteMailingAudience(id) {
  try {
    await deleteDoc(doc(db, COLLECTION, audienceDocId(id)))
    await removeIndexItem('audiences', id)
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function createMailingCampaign(data) {
  try {
    const id = newId()
    const payload = {
      name: String(data.name || 'Untitled campaign').trim() || 'Untitled campaign',
      description: String(data.description || '').trim(),
      templateId: data.templateId || '',
      templateName: data.templateName || '',
      audienceId: data.audienceId || '',
      audienceName: data.audienceName || '',
      fromEmail: parseEmailAddress(data.fromEmail) || '',
      fromName: String(data.fromName || '').trim(),
      sendVia: data.sendVia === 'sendgrid' ? 'sendgrid' : 'graph',
      status: 'draft',
      stats: { ...EMPTY_CAMPAIGN_STATS },
      sendIds: [],
      sentAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(doc(db, COLLECTION, campaignDocId(id)), payload)
    await upsertIndexItem('campaigns', campaignSummary(id, payload))
    return id
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function updateMailingCampaign(id, data) {
  try {
    const ref = doc(db, COLLECTION, campaignDocId(id))
    const snap = await getDoc(ref)
    const current = snap.data() || {}
    const stats = { ...EMPTY_CAMPAIGN_STATS, ...(current.stats || {}) }
    const payload = { updatedAt: serverTimestamp() }
    for (const [key, value] of Object.entries(data || {})) {
      if (key.startsWith('stats.')) {
        stats[key.slice('stats.'.length)] = value
      } else {
        payload[key] = value
      }
    }
    payload.stats = stats
    await setDoc(ref, payload, { merge: true })
    await upsertIndexItem('campaigns', campaignSummary(id, { ...current, ...payload, stats }))
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function deleteMailingCampaign(id) {
  try {
    const snap = await getDoc(doc(db, COLLECTION, campaignDocId(id)))
    const sendIds = Array.isArray(snap.data()?.sendIds) ? snap.data().sendIds : []
    for (const sendId of sendIds) {
      await deleteDoc(doc(db, COLLECTION, sendDocId(sendId)))
    }
    await deleteDoc(doc(db, COLLECTION, campaignDocId(id)))
    await removeIndexItem('campaigns', id)
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function getMailingTemplate(id) {
  const snap = await getDoc(doc(db, COLLECTION, templateDocId(id)))
  if (!snap.exists()) return null
  return mapDoc(id, snap.data())
}

export async function getMailingAudience(id) {
  const snap = await getDoc(doc(db, COLLECTION, audienceDocId(id)))
  if (!snap.exists()) return null
  return mapDoc(id, snap.data())
}

export async function getMailingCampaign(id) {
  const snap = await getDoc(doc(db, COLLECTION, campaignDocId(id)))
  if (!snap.exists()) return null
  return mapDoc(id, snap.data())
}

export async function createMailingSend(data) {
  try {
    const id = newId()
    await setDoc(doc(db, COLLECTION, sendDocId(id)), {
      campaignId: data.campaignId,
      email: parseEmailAddress(data.email),
      name: data.name || '',
      company: data.company || '',
      status: data.status || 'queued',
      error: '',
      openedAt: null,
      clickedAt: null,
      lastClickUrl: '',
      events: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    const campRef = doc(db, COLLECTION, campaignDocId(data.campaignId))
    const campSnap = await getDoc(campRef)
    const sendIds = [...(campSnap.data()?.sendIds || []), id]
    await setDoc(campRef, { sendIds, updatedAt: serverTimestamp() }, { merge: true })
    return id
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function updateMailingSend(id, data) {
  try {
    await updateDoc(doc(db, COLLECTION, sendDocId(id)), {
      ...data,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function listSendsForCampaign(campaignId) {
  try {
    const camp = await getMailingCampaign(campaignId)
    const sendIds = Array.isArray(camp?.sendIds) ? camp.sendIds : []
    const rows = []
    for (const id of sendIds) {
      const snap = await getDoc(doc(db, COLLECTION, sendDocId(id)))
      if (snap.exists()) rows.push(mapDoc(id, snap.data()))
    }
    return rows.reverse()
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function loadUnsubscribedEmails() {
  return loadMailingExclusionEmails()
}

export { templateDocId, audienceDocId, campaignDocId, sendDocId }
