import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase.js'
import { normalizeEmailAddress } from './emailAddress.js'
import { projectContactEmails } from './graphMail.js'
import { asFirestoreError } from './firestoreErrors.js'

/** Fixed system list — not stored in boardSilos and not user-deletable. */
export const UNASSIGNED_SILO_ID = 'unassigned'

export const UNASSIGNED_SILO = {
  id: UNASSIGNED_SILO_ID,
  title: 'Unassigned',
  sortOrder: -1,
  archiveOnEntry: false,
  system: true,
}

export const BOARD_SETTINGS_DOC = 'unassignedQueue'
const COLLECTION = 'boardSettings'

export const DEFAULT_UNASSIGNED_SCAN_DAYS = 30

export function isUnassignedSiloId(siloId) {
  return siloId === UNASSIGNED_SILO_ID
}

export function boardSilosWithUnassigned(silos) {
  return [UNASSIGNED_SILO, ...(silos || [])]
}

export function normalizeLeadQueueFolder(raw) {
  if (!raw?.id) return null
  return {
    id: raw.id,
    displayName: raw.displayName || '',
    path: raw.path || raw.displayName || '',
  }
}

export function normalizeScanDays(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_UNASSIGNED_SCAN_DAYS
  return Math.min(365, Math.max(1, Math.round(n)))
}

export function isProspectLeadProject(project) {
  return Boolean(project?.isProspectLead) || isUnassignedSiloId(project?.siloId)
}

export function prospectEmailFromProject(project) {
  if (project?.prospectEmail) return normalizeEmailAddress(project.prospectEmail)
  if (isProspectLeadProject(project)) {
    return projectContactEmails(project)[0] || ''
  }
  return ''
}

/** Map prospect email → existing unassigned project; set of emails on assigned projects. */
export function indexProjectsByProspectEmail(projects) {
  const unassignedByEmail = new Map()
  const assignedEmails = new Set()

  for (const p of projects || []) {
    const emails = new Set()
    const primary = prospectEmailFromProject(p)
    if (primary) emails.add(primary)
    for (const c of p.clientContacts || []) {
      const e = normalizeEmailAddress(c.email)
      if (e) emails.add(e)
    }

    for (const email of emails) {
      if (isUnassignedSiloId(p.siloId)) {
        if (!unassignedByEmail.has(email)) unassignedByEmail.set(email, p)
      } else {
        assignedEmails.add(email)
      }
    }
  }

  return { unassignedByEmail, assignedEmails }
}

export function normalizeUnassignedQueueSettings(data = {}) {
  return {
    leadQueueFolder: normalizeLeadQueueFolder(data.leadQueueFolder),
    scanDays: normalizeScanDays(data.scanDays),
    deepScan: data.deepScan !== false,
    forceRescan: Boolean(data.forceRescan),
  }
}

export function subscribeUnassignedQueueSettings(onData, onError) {
  const ref = doc(db, COLLECTION, BOARD_SETTINGS_DOC)
  return onSnapshot(
    ref,
    (snap) => {
      onData(normalizeUnassignedQueueSettings(snap.data() || {}))
    },
    onError,
  )
}

async function writeUnassignedQueueSettings(patch) {
  const ref = doc(db, COLLECTION, BOARD_SETTINGS_DOC)
  const payload = {
    ...patch,
    updatedAt: serverTimestamp(),
  }
  try {
    try {
      await updateDoc(ref, payload)
    } catch (err) {
      if (err?.code === 'not-found') {
        await setDoc(ref, { ...payload, createdAt: serverTimestamp() })
        return
      }
      throw err
    }
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function updateLeadQueueFolder(folder) {
  await writeUnassignedQueueSettings({
    leadQueueFolder: normalizeLeadQueueFolder(folder),
  })
}

export async function updateUnassignedQueueSettings({
  leadQueueFolder,
  scanDays,
  deepScan,
  forceRescan,
} = {}) {
  const patch = {}
  if (leadQueueFolder !== undefined) {
    patch.leadQueueFolder = normalizeLeadQueueFolder(leadQueueFolder)
  }
  if (scanDays !== undefined) {
    patch.scanDays = normalizeScanDays(scanDays)
  }
  if (deepScan !== undefined) {
    patch.deepScan = Boolean(deepScan)
  }
  if (forceRescan !== undefined) {
    patch.forceRescan = Boolean(forceRescan)
  }
  if (!Object.keys(patch).length) return
  await writeUnassignedQueueSettings(patch)
}
