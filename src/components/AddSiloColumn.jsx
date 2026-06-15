import { useState } from 'react'

export default function AddSiloColumn({ onAdd, disabled }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const name = title.trim()
    if (!name || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAdd(name)
      setTitle('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function handleCancel() {
    setOpen(false)
    setTitle('')
    setError(null)
  }

  if (!open) {
    return (
      <div className="add-silo-column">
        <button
          type="button"
          className="add-silo-column-trigger"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          + Add list
        </button>
      </div>
    )
  }

  return (
    <div className="add-silo-column add-silo-column--open">
      <form className="add-silo-column-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="add-silo-column-input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setError(null)
          }}
          placeholder="List name"
          aria-label="New list name"
          maxLength={120}
          autoFocus
          disabled={busy}
        />
        {error && <p className="form-error add-silo-column-error">{error}</p>}
        <div className="add-silo-column-actions">
          <button type="submit" className="btn-primary btn-small" disabled={busy || !title.trim()}>
            {busy ? 'Adding…' : 'Add list'}
          </button>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
