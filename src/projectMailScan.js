import { db, doc, serverTimestamp, updateDoc } from './firestore.js'

/** Record that the project's client mail folder was scanned (harvest or summarise). */
export async function recordProjectClientMailScan(projectId) {
  if (!projectId) return
  await updateDoc(doc(db, 'projects', projectId), {
    lastClientMailScanAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
