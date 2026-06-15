import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { parseEmailAddress } from './emailAddress.js'

/** Short-form email for exclusion matching (never compares long Outlook display strings). */
export function normalizeHarvestEmail(email) {
  return parseEmailAddress(email)
}

export function isExcludedHarvestEmail(email, excludeEmails) {
  const normalized = normalizeHarvestEmail(email)
  if (!normalized) return false
  const exclude = new Set(
    (excludeEmails || []).map(normalizeHarvestEmail).filter(Boolean),
  )
  return exclude.has(normalized)
}

/** Drop clientContacts whose email appears in the exclusion list. */
export function filterClientContactsExcluding(contacts, excludeEmails) {
  const exclude = new Set(
    (excludeEmails || []).map(normalizeHarvestEmail).filter(Boolean),
  )
  if (exclude.size === 0) return Array.isArray(contacts) ? [...contacts] : []

  return (Array.isArray(contacts) ? contacts : []).filter(
    (c) => !exclude.has(normalizeHarvestEmail(c.email)),
  )
}

/**
 * Remove excluded addresses from clientContacts on every project.
 * Returns counts for UI feedback.
 */
export async function removeExcludedEmailsFromAllProjects(excludeEmails) {
  const snap = await getDocs(collection(db, 'projects'))
  const pending = []

  for (const projectDoc of snap.docs) {
    const contacts = projectDoc.data().clientContacts
    if (!Array.isArray(contacts) || contacts.length === 0) continue

    const filtered = filterClientContactsExcluding(contacts, excludeEmails)
    if (filtered.length === contacts.length) continue

    pending.push({
      id: projectDoc.id,
      filtered,
      removed: contacts.length - filtered.length,
    })
  }

  const BATCH_SIZE = 500
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    for (const row of pending.slice(i, i + BATCH_SIZE)) {
      batch.update(doc(db, 'projects', row.id), {
        clientContacts: row.filtered,
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  }

  return {
    projectsUpdated: pending.length,
    contactsRemoved: pending.reduce((sum, row) => sum + row.removed, 0),
  }
}

/**
 * Delete stored communication summaries whose From address is on the exclusion list.
 */
export async function removeExcludedEmailsFromEmailSummaries(excludeEmails) {
  const exclude = new Set(
    (excludeEmails || []).map(normalizeHarvestEmail).filter(Boolean),
  )
  if (exclude.size === 0) return { summariesRemoved: 0 }

  const snap = await getDocs(collection(db, 'email_summaries'))
  const toDelete = []

  for (const summaryDoc of snap.docs) {
    const from = normalizeHarvestEmail(summaryDoc.data().from)
    if (from && exclude.has(from)) toDelete.push(summaryDoc.ref)
  }

  const BATCH_SIZE = 500
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    for (const ref of toDelete.slice(i, i + BATCH_SIZE)) {
      batch.delete(ref)
    }
    await batch.commit()
  }

  return { summariesRemoved: toDelete.length }
}

/** Remove excluded addresses from project contacts and stored email summaries. */
export async function runHarvestExclusionCleanup(excludeEmails) {
  const [projects, summaries] = await Promise.all([
    removeExcludedEmailsFromAllProjects(excludeEmails),
    removeExcludedEmailsFromEmailSummaries(excludeEmails),
  ])
  return { ...projects, summariesRemoved: summaries.summariesRemoved }
}
