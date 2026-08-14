import { useEffect, useMemo, useState } from 'react'
import { subscribeClientEmails, upsertMasterContacts } from '../clientEmails.js'
import { parseEmailAddress } from '../emailAddress.js'
import { subscribeMailingExclusions } from '../mailingExclusions.js'
import { parseContactRows } from '../mailingCsv.js'
import {
  createMailingAudience,
  deleteMailingAudience,
  getMailingAudience,
  subscribeMailingAudiences,
  uniqueMembers,
  updateMailingAudience,
} from '../mailings.js'
import ConfirmModal from './ConfirmModal.jsx'

const EMPTY = { name: '', description: '', members: [] }

export default function MailingAudiencesSection() {
  const [audiences, setAudiences] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [manual, setManual] = useState({ name: '', email: '', company: '' })
  const [importText, setImportText] = useState('')
  const [addToMaster, setAddToMaster] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [excludedEmails, setExcludedEmails] = useState(() => new Set())

  useEffect(() => {
    const unsubA = subscribeMailingAudiences(
      (rows) => {
        setAudiences(rows)
        setLoading(false)
      },
      (err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )
    const unsubC = subscribeClientEmails(
      setClients,
      (err) => setError(err instanceof Error ? err.message : String(err)),
    )
    const unsubX = subscribeMailingExclusions(
      (rows) => setExcludedEmails(new Set(rows.map((row) => row.email))),
      (err) => setError(err instanceof Error ? err.message : String(err)),
    )
    return () => {
      unsubA()
      unsubC()
      unsubX()
    }
  }, [])

  const pickerRows = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    const known = new Set((form.members || []).map((m) => m.email))
    return clients.filter((row) => {
      if (known.has(row.email)) return false
      if (!q) return true
      return [row.name, row.email, row.company].join(' ').toLowerCase().includes(q)
    })
  }, [clients, form.members, pickerQuery])

  function startNew() {
    setEditing('new')
    setForm({ ...EMPTY })
    setImportText('')
    setAddToMaster(true)
    setError(null)
  }

  async function startEdit(row) {
    setImportText('')
    setAddToMaster(true)
    setError(null)
    try {
      const full = (await getMailingAudience(row.id)) || row
      setEditing(full.id)
      setForm({
        name: full.name || '',
        description: full.description || '',
        members: uniqueMembers(full.members),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function addMembers(rows, source) {
    setForm((current) => ({
      ...current,
      members: uniqueMembers([
        ...current.members,
        ...rows.map((row) => ({ ...row, source: row.source || source })),
      ]),
    }))
  }

  async function maybeAddToMaster(rows) {
    if (!addToMaster || !rows.length) return
    await upsertMasterContacts(rows, { source: 'import' })
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim() || 'Untitled audience',
        description: form.description.trim(),
        members: uniqueMembers(form.members),
      }
      if (editing === 'new') await createMailingAudience(payload)
      else await updateMailingAudience(editing, payload)
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteMailingAudience(deleteTarget.id)
      if (editing === deleteTarget.id) setEditing(null)
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function applyImport() {
    const rows = parseContactRows(importText)
    if (!rows.length) {
      setError('No valid emails found in the import.')
      return
    }
    addMembers(rows, 'import')
    maybeAddToMaster(rows).catch((err) => setError(err instanceof Error ? err.message : String(err)))
    setImportText('')
  }

  function applyManual(e) {
    e?.preventDefault?.()
    const rows = parseContactRows(`${manual.name},${manual.email},${manual.company}`)
    if (!rows.length) {
      setError('Enter a valid email to add manually.')
      return
    }
    addMembers(rows, 'manual')
    maybeAddToMaster(rows).catch((err) => setError(err instanceof Error ? err.message : String(err)))
    setManual({ name: '', email: '', company: '' })
  }

  function applyPicked() {
    const rows = clients.filter((row) => picked.has(row.email))
    addMembers(rows.map((row) => ({ ...row, source: 'master' })), 'master')
    setPicked(new Set())
    setPickerOpen(false)
  }

  if (editing) {
    return (
      <section className="lookup-section mailing-section">
        <div className="mailing-editor-head">
          <h3 className="lookup-section-title">{editing === 'new' ? 'New audience' : 'Edit audience'}</h3>
          <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
            Back to list
          </button>
        </div>
        <form className="systems-card mailing-wide-card mailing-form" onSubmit={handleSave}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className="full-width">
            Description
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>

          <div className="mailing-audience-tools">
            <button type="button" className="btn-secondary" onClick={() => setPickerOpen(true)}>
              Add from master list
            </button>
            <label className="mailing-check">
              <input
                type="checkbox"
                checked={addToMaster}
                onChange={(e) => setAddToMaster(e.target.checked)}
              />
              Add to master if not already
            </label>
          </div>

          <div className="mailing-subcard">
            <h4>Add manually</h4>
            <div className="mailing-inline-form">
              <input
                placeholder="Name"
                value={manual.name}
                onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
              />
              <input
                placeholder="Email"
                value={manual.email}
                onChange={(e) => setManual((m) => ({ ...m, email: e.target.value }))}
              />
              <input
                placeholder="Company"
                value={manual.company}
                onChange={(e) => setManual((m) => ({ ...m, company: e.target.value }))}
              />
              <button type="button" className="btn-primary" onClick={applyManual}>
                Add
              </button>
            </div>
          </div>

          <div className="mailing-subcard">
            <h4>Import rows</h4>
            <p className="muted">CSV or one email per line. Headers can be name, email, company.</p>
            <textarea
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'name,email,company\nAlex,alex@example.com,Acme'}
            />
            <button type="button" className="btn-secondary" onClick={applyImport} disabled={!importText.trim()}>
              Import into audience
            </button>
          </div>

          <div className="mailing-table-wrap">
            <table className="systems-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(form.members || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No members yet. Pick from the master list, add manually, or import.
                    </td>
                  </tr>
                ) : (
                  form.members.map((row) => {
                    const excluded = excludedEmails.has(parseEmailAddress(row.email))
                    return (
                    <tr key={row.email} className={excluded ? 'mailing-row-excluded' : undefined}>
                      <td>
                        {row.name || '—'}
                        {excluded ? <span className="mailing-pill mailing-pill--muted">Excluded</span> : null}
                      </td>
                      <td>{row.email}</td>
                      <td>{row.company || '—'}</td>
                      <td className="muted">{row.source || '—'}</td>
                      <td className="systems-col-actions">
                        <button
                          type="button"
                          className="btn-danger btn-small"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              members: f.members.filter((m) => m.email !== row.email),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="muted">
            {form.members.length} member{form.members.length === 1 ? '' : 's'}
            {form.members.some((row) => excludedEmails.has(parseEmailAddress(row.email)))
              ? ` · ${form.members.filter((row) => excludedEmails.has(parseEmailAddress(row.email))).length} excluded (ignored on send)`
              : ''}
          </p>

          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save audience'}
            </button>
          </div>
        </form>

        {pickerOpen && (
          <div className="modal-backdrop" onClick={() => setPickerOpen(false)} role="presentation">
            <div
              className="modal-panel mailing-picker-modal"
              role="dialog"
              aria-label="Add from master list"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="form-title">Add from master list</h2>
              <input
                type="search"
                className="mailing-search"
                placeholder="Search master list…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
              />
              <div className="mailing-picker-list">
                {pickerRows.length === 0 ? (
                  <p className="muted">No matching contacts left to add.</p>
                ) : (
                  pickerRows.map((row) => (
                    <label key={row.email} className="mailing-check mailing-picker-row">
                      <input
                        type="checkbox"
                        checked={picked.has(row.email)}
                        onChange={(e) => {
                          setPicked((current) => {
                            const next = new Set(current)
                            if (e.target.checked) next.add(row.email)
                            else next.delete(row.email)
                            return next
                          })
                        }}
                      />
                      <span>
                        <strong>{row.name || row.email}</strong>
                        {row.name ? ` · ${row.email}` : ''}
                        {row.company ? ` · ${row.company}` : ''}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setPickerOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={applyPicked} disabled={picked.size === 0}>
                  Add {picked.size || ''}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="lookup-section mailing-section">
      <div className="mailing-editor-head">
        <div>
          <h3 className="lookup-section-title">Audiences</h3>
          <p className="lookup-section-intro muted">
            A mailing list you can fill from the master client list, by typing addresses, or by
            importing rows.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={startNew}>
          New audience
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      <div className="systems-card mailing-wide-card">
        {loading ? (
          <p className="muted">Loading audiences…</p>
        ) : audiences.length === 0 ? (
          <p className="muted">No audiences yet.</p>
        ) : (
          <table className="systems-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Members</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {audiences.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button type="button" className="mailing-name-btn" onClick={() => startEdit(row)}>
                      {row.name}
                    </button>
                    {row.description ? <div className="muted">{row.description}</div> : null}
                  </td>
                  <td>{row.memberCount ?? (Array.isArray(row.members) ? row.members.length : 0)}</td>
                  <td className="systems-col-actions">
                    <button type="button" className="btn-secondary btn-small" onClick={() => startEdit(row)}>
                      Edit
                    </button>
                    <button type="button" className="btn-danger btn-small" onClick={() => setDeleteTarget(row)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete audience?"
        message={`Delete “${deleteTarget?.name || ''}”? Campaigns that used it keep their last send history.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
