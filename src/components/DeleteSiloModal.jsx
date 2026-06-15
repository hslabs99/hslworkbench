import { useEffect, useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'

export default function DeleteSiloModal({
  open,
  silo,
  silos,
  projectCount,
  onConfirm,
  onCancel,
  busy,
}) {
  const [moveToSiloId, setMoveToSiloId] = useState('')

  const otherSilos = (silos || []).filter((s) => s.id !== silo?.id)

  useEffect(() => {
    if (!open) return
    setMoveToSiloId(otherSilos[0]?.id ?? '')
  }, [open, silo?.id, otherSilos])

  if (!open || !silo) return null

  const needsMove = projectCount > 0

  if (!needsMove) {
    return (
      <ConfirmModal
        open={open}
        title="Delete list?"
        message={`Delete "${silo.title}"? This list is empty.`}
        confirmLabel="Delete list"
        danger
        busy={busy}
        onConfirm={() => onConfirm(null)}
        onCancel={onCancel}
      />
    )
  }

  return (
    <div className="modal-backdrop confirm-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-panel confirm-modal delete-silo-modal"
        role="alertdialog"
        aria-labelledby="delete-silo-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-silo-title" className="confirm-modal-title">
          Delete &ldquo;{silo.title}&rdquo;?
        </h2>
        <p className="confirm-modal-message">
          This list has {projectCount} card{projectCount === 1 ? '' : 's'}. Move them to another
          list, then delete.
        </p>
        <label className="delete-silo-move-label">
          Move cards to
          <select
            value={moveToSiloId}
            onChange={(e) => setMoveToSiloId(e.target.value)}
            disabled={busy || otherSilos.length === 0}
            className="delete-silo-move-select"
          >
            {otherSilos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions confirm-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy || !moveToSiloId}
            onClick={() => onConfirm(moveToSiloId)}
          >
            {busy ? 'Deleting…' : 'Move cards & delete list'}
          </button>
        </div>
      </div>
    </div>
  )
}
