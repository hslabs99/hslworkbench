import { useEffect, useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { reorderListItems } from '../listReorder.js'

async function persistListSortOrder(collectionName, orderedItems) {
  if (!collectionName || !orderedItems.length) return

  const batch = writeBatch(db)
  orderedItems.forEach((item, index) => {
    batch.update(doc(db, collectionName, item.id), { sortOrder: index * 1000 })
  })
  await batch.commit()
}

/**
 * Settings lookup table with drag-handle reordering (persists sortOrder to Firestore).
 */
export default function ReorderableListTable({
  collectionName,
  items,
  labelHeader,
  emptyMessage,
  getRowLabel,
  renderActions,
}) {
  const [dropIndicator, setDropIndicator] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [reordering, setReordering] = useState(false)

  useEffect(() => {
    function clear() {
      setDropIndicator(null)
      setDraggingId(null)
    }
    document.addEventListener('dragend', clear)
    return () => document.removeEventListener('dragend', clear)
  }, [])

  async function handleDrop(dragId, targetId, insertBefore) {
    if (!dragId || !targetId || dragId === targetId) return

    const reordered = reorderListItems(items, dragId, targetId, insertBefore)
    const prev = items.map((i) => i.id).join(',')
    const next = reordered.map((i) => i.id).join(',')
    if (prev === next) return

    setReordering(true)
    try {
      await persistListSortOrder(collectionName, reordered)
    } finally {
      setReordering(false)
      setDropIndicator(null)
      setDraggingId(null)
    }
  }

  function handleRowDragOver(e, targetId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    setDropIndicator({ targetId, before })
  }

  const colCount = 3

  return (
    <table className={`systems-table reorderable-list-table${reordering ? ' reorderable-list-table--busy' : ''}`}>
      <thead>
        <tr>
          <th scope="col" className="reorderable-list-col-handle" aria-label="Reorder" />
          <th scope="col">{labelHeader}</th>
          <th scope="col" className="systems-col-actions">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr>
            <td colSpan={colCount} className="muted">
              {emptyMessage}
            </td>
          </tr>
        )}
        {items.map((row) => {
          const label = getRowLabel(row)
          const slot =
            dropIndicator?.targetId === row.id
              ? dropIndicator.before
                ? 'before'
                : 'after'
              : null

          return (
            <tr
              key={row.id}
              className={[
                'reorderable-list-row',
                draggingId === row.id ? 'reorderable-list-row--dragging' : '',
                slot === 'before' ? 'reorderable-list-row--drop-before' : '',
                slot === 'after' ? 'reorderable-list-row--drop-after' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={(e) => handleRowDragOver(e, row.id)}
              onDrop={(e) => {
                e.preventDefault()
                const dragId = e.dataTransfer.getData('text/plain')
                if (!dragId) return
                const rect = e.currentTarget.getBoundingClientRect()
                const before = e.clientY < rect.top + rect.height / 2
                handleDrop(dragId, row.id, before)
              }}
            >
              <td className="reorderable-list-col-handle">
                <span
                  className="list-drag-handle"
                  draggable={!reordering}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', row.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingId(row.id)
                  }}
                  aria-label={`Drag to reorder ${label}`}
                  title="Drag to reorder"
                >
                  ⋮⋮
                </span>
              </td>
              <td>{label}</td>
              <td className="systems-col-actions">{renderActions(row)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
