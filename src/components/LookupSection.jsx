import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase.js'
import ReorderableListTable from './ReorderableListTable.jsx'
export default function LookupSection({
  collectionName,
  title,
  intro,
  defaultItems,
  namePlaceholder,
  removeConfirm,
  seedConfirm,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newName, setNewName] = useState('')
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    const q = query(collection(db, collectionName), orderBy('sortOrder'))
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
        setError(err.message || 'Failed to load lookup')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [collectionName])

  useEffect(() => {
    let cancelled = false
    async function seedIfEmpty() {
      const snap = await getDocs(collection(db, collectionName))
      if (cancelled || !snap.empty || defaultItems.length === 0) return
      setSeeding(true)
      try {
        for (let i = 0; i < defaultItems.length; i++) {
          await addDoc(collection(db, collectionName), {
            name: defaultItems[i],
            sortOrder: i,
            createdAt: serverTimestamp(),
          })
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setSeeding(false)
      }
    }
    seedIfEmpty()
    return () => {
      cancelled = true
    }
  }, [collectionName, defaultItems])

  const maxSort = useMemo(
    () => items.reduce((m, x) => Math.max(m, Number(x.sortOrder) || 0), -1),
    [items],
  )

  async function handleAdd(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    await addDoc(collection(db, collectionName), {
      name,
      sortOrder: maxSort + 1,
      createdAt: serverTimestamp(),
    })
    setNewName('')
  }

  async function handleDelete(id) {
    if (!window.confirm(removeConfirm)) return
    await deleteDoc(doc(db, collectionName, id))
  }

  async function handleSeedAgain() {
    if (!window.confirm(seedConfirm)) return
    const existing = new Set(items.map((x) => x.name.toLowerCase()))
    let order = maxSort
    for (const label of defaultItems) {
      if (existing.has(label.toLowerCase())) continue
      order += 1
      await addDoc(collection(db, collectionName), {
        name: label,
        sortOrder: order,
        createdAt: serverTimestamp(),
      })
      existing.add(label.toLowerCase())
    }
  }

  return (
    <section className="lookup-section">
      <h3 className="lookup-section-title">{title}</h3>
      <p className="lookup-section-intro muted">{intro} Drag ⋮⋮ to reorder.</p>
      {(loading || seeding) && <span className="muted">Loading…</span>}
      {error && <span className="error-text">{error}</span>}

      <div className="systems-card">
        <ReorderableListTable
          collectionName={collectionName}
          items={items}
          labelHeader="Name"
          emptyMessage="No entries yet — defaults will appear shortly if configured."
          getRowLabel={(row) => row.name}
          renderActions={(row) => (
            <button
              type="button"
              className="btn-danger btn-small"
              onClick={() => handleDelete(row.id)}
            >
              Remove
            </button>
          )}
        />

        <form className="systems-add-row" onSubmit={handleAdd}>          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={namePlaceholder}
            aria-label={namePlaceholder}
          />
          <button type="submit" className="btn-primary" disabled={!newName.trim()}>
            Add option
          </button>
          <button type="button" className="btn-secondary" onClick={handleSeedAgain}>
            Add missing defaults
          </button>
        </form>
      </div>
    </section>
  )
}
