import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  orderBy,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const COLLECTION = 'project_history'

export async function recordProjectSiloChange(
  projectId,
  fromSiloId,
  toSiloId,
  { fromStatus, toStatus },
) {
  if (!projectId || fromSiloId === toSiloId) return

  await addDoc(collection(db, COLLECTION), {
    projectId,
    fromSiloId,
    toSiloId,
    fromStatus: fromStatus || fromSiloId,
    toStatus: toStatus || toSiloId,
    changedAt: serverTimestamp(),
  })
}

export function subscribeProjectHistory(projectId, onEntries, onError) {
  if (!projectId) {
    onEntries([])
    return () => {}
  }

  const q = query(
    collection(db, COLLECTION),
    where('projectId', '==', projectId),
    orderBy('changedAt', 'desc'),
  )

  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      onEntries(entries)
    },
    (err) => {
      console.error(err)
      onError?.(err)
    },
  )
}
