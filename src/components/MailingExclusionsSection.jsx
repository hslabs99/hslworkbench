import { useEffect, useState } from 'react'
import {
  addMailingExclusion,
  removeMailingExclusion,
  subscribeMailingExclusions,
} from '../mailingExclusions.js'
import ConfirmModal from './ConfirmModal.jsx'

function sourceLabel(source) {
  return source === 'unsubscribe' ? 'Unsubscribed' : 'Manual'
}

function formatWhen(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export default function MailingExclusionsSection() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    return subscribeMailingExclusions(
      (rows) => {
        setItems(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addMailingExclusion({ email, name, source: 'manual' })
      setEmail('')
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await removeMailingExclusion(deleteTarget.email)
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="lookup-section mailing-section">
      <div className="mailing-editor-head">
        <div>
          <h3 className="lookup-section-title">Exclusions list</h3>
          <p className="lookup-section-intro muted">
            People who unsubscribe from an XLS Experts campaign land here automatically, and we
            remove them from the master client list. Harvest will not add them back. Campaign sends
            skip these addresses even if they are still on an audience.
          </p>
        </div>
      </div>

      <form className="systems-card mailing-wide-card mailing-inline-form" onSubmit={handleAdd}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          aria-label="Email to exclude"
          required
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          aria-label="Name"
        />
        <button type="submit" className="btn-primary" disabled={saving || !email.trim()}>
          {saving ? 'Adding…' : 'Add exclusion'}
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      <div className="systems-card mailing-wide-card">
        {loading ? (
          <p className="muted">Loading exclusions…</p>
        ) : items.length === 0 ? (
          <p className="muted">No exclusions yet. Unsubscribes from campaign emails appear here.</p>
        ) : (
          <div className="mailing-table-wrap">
            <table className="systems-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.email}>
                    <td>
                      <strong>{row.email}</strong>
                    </td>
                    <td>{row.name || '—'}</td>
                    <td>{sourceLabel(row.source)}</td>
                    <td className="muted">{formatWhen(row.at)}</td>
                    <td className="systems-col-actions">
                      <button
                        type="button"
                        className="btn-danger btn-small"
                        onClick={() => setDeleteTarget(row)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove exclusion?"
        message={`Remove ${deleteTarget?.email || ''} from the exclusions list? They will not be added back to the master list automatically.`}
        confirmLabel="Remove"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
