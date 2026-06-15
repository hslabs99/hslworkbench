import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { asFirestoreError } from './firestoreErrors.js'
import { isUnassignedSiloId, UNASSIGNED_SILO } from './unassignedQueue.js'

export const COLLECTION = 'boardSilos'

/** Default columns seeded when boardSilos is empty (matches original hardcoded board). */
export const DEFAULT_BOARD_SILOS = [
  { id: 'waiting-client', title: 'Waiting on Client', sortOrder: 0, archiveOnEntry: false },
  { id: 'mike-action', title: 'Mike 2 Action', sortOrder: 1, archiveOnEntry: false },
  { id: 'active', title: 'Active / In Progress', sortOrder: 2, archiveOnEntry: false },
  { id: 'review', title: 'Review / Meeting Needed', sortOrder: 3, archiveOnEntry: false },
  { id: 'parked', title: 'Parked', sortOrder: 4, archiveOnEntry: false },
  { id: 'done', title: 'Done / Archived', sortOrder: 5, archiveOnEntry: true },
]

export function defaultSiloId(silos) {
  if (!silos?.length) return 'active'
  const active = silos.find((s) => s.id === 'active')
  return active?.id ?? silos[0].id
}

export function normalizeProjectSiloId(project, silos) {
  if (isUnassignedSiloId(project?.siloId)) return UNASSIGNED_SILO.id
  const fallback = defaultSiloId(silos)
  if (!silos?.length) return project?.siloId || fallback
  const ids = new Set(silos.map((s) => s.id))
  return project?.siloId && ids.has(project.siloId) ? project.siloId : fallback
}

export function findSilo(silos, siloId) {
  return silos?.find((s) => s.id === siloId) ?? null
}

export function siloArchivesOnEntry(silo) {
  return Boolean(silo?.archiveOnEntry)
}

export function resolveSiloTitle(siloId, silos, titleOverrides = {}) {
  if (isUnassignedSiloId(siloId)) return UNASSIGNED_SILO.title
  if (titleOverrides[siloId]) return titleOverrides[siloId]
  const silo = findSilo(silos, siloId)
  return silo?.title ?? siloId
}

export async function seedDefaultBoardSilosIfEmpty() {
  try {
    const snap = await getDocs(collection(db, COLLECTION))
    if (!snap.empty) return false

    const batch = writeBatch(db)
    for (const row of DEFAULT_BOARD_SILOS) {
      const ref = doc(db, COLLECTION, row.id)
      batch.set(ref, {
        title: row.title,
        sortOrder: row.sortOrder,
        archiveOnEntry: row.archiveOnEntry,
        createdAt: serverTimestamp(),
      })
    }
    await batch.commit()
    return true
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function createBoardSilo(title) {
  const trimmed = (title || '').trim()
  if (!trimmed) throw new Error('Enter a list name.')

  try {
    const snap = await getDocs(query(collection(db, COLLECTION), orderBy('sortOrder')))
    const maxSort = snap.docs.reduce(
      (m, d) => Math.max(m, Number(d.data().sortOrder) || 0),
      -1,
    )

    const ref = await addDoc(collection(db, COLLECTION), {
      title: trimmed,
      sortOrder: maxSort + 1,
      archiveOnEntry: false,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function updateBoardSiloTitle(siloId, title) {
  const trimmed = (title || '').trim()
  if (!siloId || !trimmed) return
  try {
    await updateDoc(doc(db, COLLECTION, siloId), {
      title: trimmed,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    throw asFirestoreError(err)
  }
}

/**
 * Delete a list. If it has projects, move them to moveToSiloId first.
 */
export async function deleteBoardSilo(
  siloId,
  { moveToSiloId, projectsInSilo = [], targetSilo = null } = {},
) {
  if (!siloId) return

  try {
    if (projectsInSilo.length > 0) {
      if (!moveToSiloId || moveToSiloId === siloId) {
        throw new Error('Choose another list to move cards to.')
      }
      const batch = writeBatch(db)
      const moveTarget = moveToSiloId
      const archived = siloArchivesOnEntry(targetSilo)
      const status = targetSilo?.title ?? ''
      projectsInSilo.forEach((p, i) => {
        batch.update(doc(db, 'projects', p.id), {
          siloId: moveTarget,
          status,
          archived,
          sortOrder: Date.now() + i,
          updatedAt: serverTimestamp(),
        })
      })
      await batch.commit()
    }

    await deleteDoc(doc(db, COLLECTION, siloId))
  } catch (err) {
    if (err instanceof Error && err.message === 'Choose another list to move cards to.') {
      throw err
    }
    throw asFirestoreError(err)
  }
}
