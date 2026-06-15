/** Reorder a list of { id } items by dragging one row before/after another. */
export function reorderListItems(items, dragId, targetId, insertBefore) {
  if (!dragId || !targetId || dragId === targetId) return items

  const fromIdx = items.findIndex((i) => i.id === dragId)
  const targetIdx = items.findIndex((i) => i.id === targetId)
  if (fromIdx === -1 || targetIdx === -1) return items

  const dragged = items[fromIdx]
  const without = items.filter((i) => i.id !== dragId)
  const anchorIdx = without.findIndex((i) => i.id === targetId)
  if (anchorIdx === -1) return items

  const insertAt = insertBefore ? anchorIdx : anchorIdx + 1
  return [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)]
}
