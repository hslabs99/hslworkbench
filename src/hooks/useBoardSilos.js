import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase.js'
import { DEFAULT_BOARD_SILOS, seedDefaultBoardSilosIfEmpty, COLLECTION } from '../boardSilos.js'
import { formatFirestoreError } from '../firestoreErrors.js'

export function useBoardSilos() {
  const [silos, setSilos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    let seeding = false

    async function ensureSeed() {
      if (seeding) return
      seeding = true
      try {
        await seedDefaultBoardSilosIfEmpty()
      } catch (err) {
        if (!cancelled) {
          setError(formatFirestoreError(err))
          setLoading(false)
        }
      }
    }

    const q = query(collection(db, COLLECTION), orderBy('sortOrder'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (cancelled) return
        if (snap.empty) {
          ensureSeed()
          return
        }
        setSilos(
          snap.docs.map((d) => ({
            id: d.id,
            title: d.data().title ?? '',
            sortOrder: d.data().sortOrder ?? 0,
            archiveOnEntry: Boolean(d.data().archiveOnEntry),
          })),
        )
        setLoading(false)
        setError(null)
      },
      (err) => {
        if (!cancelled) {
          console.error(err)
          setError(formatFirestoreError(err))
          setSilos(DEFAULT_BOARD_SILOS)
          setLoading(false)
        }
      },
    )

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  return { silos, loading, error }
}
