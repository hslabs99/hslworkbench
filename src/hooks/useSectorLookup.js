import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase.js'

export function useSectorLookup() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'sectorLookup'), orderBy('sortOrder'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name ?? '',
            sortOrder: d.data().sortOrder ?? 0,
          })),
        )
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Failed to load sectors')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  return { items, loading, error }
}
