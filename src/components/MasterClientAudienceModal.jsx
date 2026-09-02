import { useMemo, useState } from 'react'

export default function MasterClientAudienceModal({
  contacts = [],
  audiences = [],
  membershipMap,
  busy = false,
  error = null,
  onCancel,
  onSubmit,
}) {
  const [mode, setMode] = useState(audiences.length ? 'existing' : 'new')
  const [audienceId, setAudienceId] = useState(audiences[0]?.id || '')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const selectedAudience = useMemo(
    () => audiences.find((row) => row.id === audienceId) || null,
    [audiences, audienceId],
  )
  const alreadyIn = useMemo(() => {
    if (mode !== 'existing' || !audienceId) return 0
    return contacts.filter((row) =>
      (membershipMap?.get(row.email) || []).some((item) => item.id === audienceId),
    ).length
  }, [mode, audienceId, contacts, membershipMap])
  const willAdd = mode === 'existing' ? Math.max(0, contacts.length - alreadyIn) : contacts.length
  const canSubmit =
    contacts.length > 0 &&
    !busy &&
    (mode === 'new' ? Boolean(name.trim()) : Boolean(audienceId) && willAdd > 0)

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    if (mode === 'new') {
      onSubmit({ mode: 'new', name: name.trim(), description: description.trim() })
      return
    }
    onSubmit({ mode: 'existing', audienceId })
  }

  return (
    <div className="modal-backdrop confirm-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-panel mailing-contact-modal"
        role="dialog"
        aria-labelledby="mailing-audience-add-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="mailing-audience-add-title" className="confirm-modal-title">
          Add to audience
        </h2>
        <p className="confirm-modal-message">
          {contacts.length} selected contact{contacts.length === 1 ? '' : 's'}. Duplicate emails
          already in the audience are skipped.
        </p>
        <form className="mailing-form mailing-contact-form" onSubmit={handleSubmit}>
          <div className="mailing-send-via">
            <span>Destination</span>
            <div className="mailing-send-via-options" role="radiogroup" aria-label="Audience destination">
              <label className={`mailing-send-via-option${mode === 'existing' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="audience-mode"
                  checked={mode === 'existing'}
                  onChange={() => setMode('existing')}
                  disabled={busy || audiences.length === 0}
                />
                <span>
                  Existing audience
                  <small className="muted">Add these contacts to a list you already use in campaigns.</small>
                </span>
              </label>
              <label className={`mailing-send-via-option${mode === 'new' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="audience-mode"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                  disabled={busy}
                />
                <span>
                  New audience
                  <small className="muted">Create a list from this selection, then pick it on a campaign.</small>
                </span>
              </label>
            </div>
          </div>

          {mode === 'existing' ? (
            audiences.length === 0 ? (
              <p className="muted">No audiences yet. Create a new one from this selection.</p>
            ) : (
              <label>
                Audience
                <select
                  value={audienceId}
                  onChange={(e) => setAudienceId(e.target.value)}
                  disabled={busy}
                  required
                >
                  {audiences.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                      {typeof row.memberCount === 'number' ? ` (${row.memberCount})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : (
            <>
              <label>
                Name
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={busy}
                  autoFocus
                />
              </label>
              <label className="full-width">
                Description
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                />
              </label>
            </>
          )}

          <p className="muted">
            {mode === 'existing' && selectedAudience
              ? willAdd
                ? `${willAdd} will be added to “${selectedAudience.name}”${
                    alreadyIn ? ` · ${alreadyIn} already in this audience` : ''
                  }.`
                : `All selected contacts are already in “${selectedAudience.name}”.`
              : `${willAdd} unique contact${willAdd === 1 ? '' : 's'} will be added.`}
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions confirm-modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              {busy ? 'Saving…' : mode === 'new' ? 'Create audience' : 'Add to audience'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
