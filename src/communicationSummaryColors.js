import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const COLLECTION = 'communication_summary_colors'

export const DEFAULT_COMM_SUMMARY_COLORS = {
  inbound: '#fafcff',
  outbound: '#fffdf8',
}

const DEFAULT_ROWS = [
  { id: 'inbound', label: 'Inbound', backgroundColor: DEFAULT_COMM_SUMMARY_COLORS.inbound, sortOrder: 0 },
  { id: 'outbound', label: 'Outbound', backgroundColor: DEFAULT_COMM_SUMMARY_COLORS.outbound, sortOrder: 1 },
]

function normalizeHex(hex, fallback) {
  const h = String(hex || '').trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h
  return fallback
}

export function colorsFromDocs(docs) {
  const colors = { ...DEFAULT_COMM_SUMMARY_COLORS }
  for (const d of docs) {
    const id = d.id
    if (id === 'inbound' || id === 'outbound') {
      colors[id] = normalizeHex(d.data().backgroundColor, DEFAULT_COMM_SUMMARY_COLORS[id])
    }
  }
  return colors
}

export async function ensureCommunicationSummaryColorDefaults() {
  const snap = await getDocs(collection(db, COLLECTION))
  const existing = new Set(snap.docs.map((d) => d.id))
  const missing = DEFAULT_ROWS.filter((row) => !existing.has(row.id))
  if (!missing.length) return

  await Promise.all(
    missing.map((row) =>
      setDoc(doc(db, COLLECTION, row.id), {
        label: row.label,
        backgroundColor: row.backgroundColor,
        sortOrder: row.sortOrder,
        updatedAt: serverTimestamp(),
      }),
    ),
  )
}

export function subscribeCommunicationSummaryColors(onColors, onRows, onError) {
  const q = collection(db, COLLECTION)
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({
          id: d.id,
          label: d.data().label || d.id,
          backgroundColor: normalizeHex(
            d.data().backgroundColor,
            DEFAULT_COMM_SUMMARY_COLORS[d.id] || '#ffffff',
          ),
          sortOrder: Number(d.data().sortOrder) || 0,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder)
      onRows?.(rows)
      onColors(colorsFromDocs(snap.docs))
    },
    (err) => {
      console.error(err)
      onError?.(err)
    },
  )
}

export async function updateCommunicationSummaryColor(id, backgroundColor) {
  const fallback = DEFAULT_COMM_SUMMARY_COLORS[id] || '#ffffff'
  const hex = normalizeHex(backgroundColor, fallback)
  const label = id === 'inbound' ? 'Inbound' : id === 'outbound' ? 'Outbound' : id
  const sortOrder = id === 'inbound' ? 0 : id === 'outbound' ? 1 : 99
  await setDoc(
    doc(db, COLLECTION, id),
    {
      label,
      backgroundColor: hex,
      sortOrder,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function resetCommunicationSummaryColor(id) {
  const hex = DEFAULT_COMM_SUMMARY_COLORS[id]
  if (!hex) return
  await updateCommunicationSummaryColor(id, hex)
}

export async function resetAllCommunicationSummaryColors() {
  await Promise.all(
    Object.keys(DEFAULT_COMM_SUMMARY_COLORS).map((id) => resetCommunicationSummaryColor(id)),
  )
}
