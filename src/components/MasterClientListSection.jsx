import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createImportBatchRef,
  emptyClientEmailsCollection,
  removeClientEmail,
  removeClientEmails,
  saveClientEmail,
  subscribeClientEmails,
  upsertMasterContacts,
} from '../clientEmails.js'
import { addMailingExclusions } from '../mailingExclusions.js'
import {
  dedupeContactRows,
  downloadContactTemplateXls,
  parseContactImportFile,
  parseContactImportText,
} from '../mailingCsv.js'
import ConfirmModal from './ConfirmModal.jsx'

const EMPTY_FORM = { name: '', email: '', company: '' }
const EMPTY_FILTERS = { name: '', email: '', company: '', source: '', importBatch: '' }

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'source', label: 'Source' },
  { key: 'importBatch', label: 'Batch' },
]

function sourceLabel(row) {
  return [row.source, row.sourceFolder].filter(Boolean).join(' · ')
}

function rowValue(row, key) {
  if (key === 'source') return sourceLabel(row)
  return String(row[key] || '')
}

function uniqueValues(items, key) {
  return [...new Set(items.map((row) => rowValue(row, key)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

export default function MasterClientListSection() {
  const fileInputRef = useRef(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState({ key: 'email', dir: 'asc' })
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingEmail, setEditingEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false)
  const [emptying, setEmptying] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [batchLabel, setBatchLabel] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkAction, setBulkAction] = useState(null)
  const lastClickedRef = useRef(null)
  const selectAllRef = useRef(null)

  useEffect(() => {
    const unsub = subscribeClientEmails(
      (rows) => {
        setItems(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    const known = new Set(items.map((row) => row.email))
    setSelected((prev) => {
      const next = new Set([...prev].filter((email) => known.has(email)))
      if (next.size === prev.size) return prev
      return next
    })
  }, [items])

  const sourceOptions = useMemo(() => uniqueValues(items, 'source'), [items])
  const batchOptions = useMemo(() => uniqueValues(items, 'importBatch'), [items])

  const hasFilters = useMemo(
    () => Object.values(filters).some((value) => String(value).trim()),
    [filters],
  )

  const visible = useMemo(() => {
    const active = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, String(value).trim().toLowerCase()]),
    )
    const filtered = items.filter((row) =>
      COLUMNS.every((col) => {
        const q = active[col.key]
        if (!q) return true
        return rowValue(row, col.key).toLowerCase().includes(q)
      }),
    )
    const dir = sort.dir === 'desc' ? -1 : 1
    return [...filtered].sort((a, b) => {
      const av = rowValue(a, sort.key)
      const bv = rowValue(b, sort.key)
      const n = av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
      if (n !== 0) return n * dir
      return a.email.localeCompare(b.email) * dir
    })
  }, [items, filters, sort])

  const selectedRows = useMemo(
    () => items.filter((row) => selected.has(row.email)),
    [items, selected],
  )
  const visibleSelectedCount = useMemo(
    () => visible.filter((row) => selected.has(row.email)).length,
    [visible, selected],
  )
  const allVisibleSelected = visible.length > 0 && visibleSelectedCount === visible.length

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected
    }
  }, [visibleSelectedCount, allVisibleSelected])

  function toggleSelected(email, shiftKey = false) {
    const visibleEmails = visible.map((row) => row.email)
    if (shiftKey && lastClickedRef.current) {
      const from = visibleEmails.indexOf(lastClickedRef.current)
      const to = visibleEmails.indexOf(email)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        const range = visibleEmails.slice(start, end + 1)
        setSelected((prev) => {
          const next = new Set(prev)
          range.forEach((value) => next.add(value))
          return next
        })
        lastClickedRef.current = email
        return
      }
    }
    lastClickedRef.current = email
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  function toggleSelectAllVisible() {
    const visibleEmails = visible.map((row) => row.email)
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleEmails.forEach((email) => next.delete(email))
      } else {
        visibleEmails.forEach((email) => next.add(email))
      }
      return next
    })
  }

  async function confirmBulkAction() {
    if (!bulkAction || selectedRows.length === 0) return
    setBulkBusy(true)
    setError(null)
    try {
      if (bulkAction === 'exclude') {
        await addMailingExclusions(selectedRows, { source: 'manual' })
      } else if (bulkAction === 'delete') {
        await removeClientEmails(selectedRows.map((row) => row.email))
      }
      setSelected(new Set())
      setBulkAction(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBulkBusy(false)
    }
  }

  function toggleSort(key) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )
  }

  function showAll() {
    setFilters(EMPTY_FILTERS)
  }

  function resolvedBatchRef() {
    return createImportBatchRef(batchLabel)
  }

  async function importRows(rows, origin) {
    const { rows: unique, duplicates } = dedupeContactRows(rows)
    if (!unique.length) {
      setError('No valid emails found. Use Name and Email columns (CSV or paste from Excel).')
      setImportResult(null)
      return
    }

    const importBatch = resolvedBatchRef()
    setImporting(true)
    setError(null)
    try {
      const result = await upsertMasterContacts(unique, {
        source: 'import',
        fillBlanks: false,
        importBatch,
      })
      setImportResult({
        origin,
        batch: importBatch,
        added: result.added,
        skipped: result.skipped,
        duplicates,
      })
      setPasteText('')
      setBatchLabel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  async function handleCsvFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const rows = await parseContactImportFile(file)
      await importRows(rows, file.name || 'CSV file')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handlePasteImport() {
    try {
      await importRows(parseContactImportText(pasteText), 'paste')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await saveClientEmail({
        ...form,
        source: editingEmail ? undefined : 'manual',
      })
      setForm(EMPTY_FORM)
      setEditingEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function confirmEmpty() {
    setEmptying(true)
    setError(null)
    try {
      await emptyClientEmailsCollection()
      setEmptyConfirmOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setEmptying(false)
    }
  }

  return (
    <section className="lookup-section mailing-section">
      <h3 className="lookup-section-title">Master client list</h3>
      <p className="lookup-section-intro muted">
        The contact store for marketing. Harvest, manual add, CSV import, and paste all land here.
        Duplicates are keyed by email. Imports are tagged with a batch reference. Tick rows to add
        them to the exclusions list or remove them in bulk.
      </p>

      <div className="systems-card mailing-wide-card">
        <form className="mailing-inline-form" onSubmit={handleSave}>
          <input
            type="text"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            aria-label="Name"
          />
          <input
            type="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            aria-label="Email"
            disabled={Boolean(editingEmail)}
          />
          <input
            type="text"
            placeholder="Company"
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            aria-label="Company"
          />
          <button type="submit" className="btn-primary" disabled={saving}>
            {editingEmail ? 'Save' : 'Add'}
          </button>
          {editingEmail ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setForm(EMPTY_FORM)
                setEditingEmail('')
              }}
            >
              Cancel
            </button>
          ) : null}
        </form>

        <div className="mailing-subcard">
          <h4>Import contacts</h4>
          <p className="muted">
            Download the Excel template, fill Name and Email, then upload a CSV or paste the two
            columns. Existing emails are skipped. New rows are tagged with a batch reference
            (IMP-date-time, plus your label if you add one).
          </p>
          <div className="mailing-toolbar mailing-import-toolbar">
            <button type="button" className="btn-secondary" onClick={downloadContactTemplateXls}>
              Download template (XLS)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.xls,text/csv,text/plain"
              className="sr-only"
              onChange={handleCsvFile}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              Import CSV
            </button>
          </div>
          <div className="mailing-inline-form mailing-batch-form">
            <input
              type="text"
              placeholder="Optional batch label (e.g. Trade show Aug 2026)"
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
              aria-label="Optional batch label"
            />
          </div>
          <textarea
            className="mailing-paste-area"
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'Name\tEmail\nJane Example\tjane@example.com'}
            aria-label="Paste name and email columns"
          />
          <div className="mailing-toolbar">
            <button
              type="button"
              className="btn-primary"
              onClick={handlePasteImport}
              disabled={importing || !pasteText.trim()}
            >
              {importing ? 'Importing…' : 'Import pasted rows'}
            </button>
          </div>
          {importResult ? (
            <p className="harvest-client-emails-result">
              Batch {importResult.batch}: added {importResult.added}, skipped {importResult.skipped}{' '}
              already on the list
              {importResult.duplicates
                ? `, ignored ${importResult.duplicates} duplicate${importResult.duplicates === 1 ? '' : 's'} in the ${importResult.origin}`
                : ''}
              .
            </p>
          ) : null}
        </div>

        <div className="mailing-toolbar">
          {selected.size > 0 ? (
            <>
              <span className="muted mailing-toolbar-grow">
                {selected.size} selected
                {visibleSelectedCount !== selected.size ? ` (${visibleSelectedCount} in this filter)` : ''}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelected(new Set())}
                disabled={bulkBusy}
              >
                Clear selection
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setBulkAction('exclude')}
                disabled={bulkBusy}
              >
                Add to exclusions
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => setBulkAction('delete')}
                disabled={bulkBusy}
              >
                Remove selected
              </button>
            </>
          ) : (
            <span className="muted mailing-toolbar-grow">
              Filter and sort the table below. Tick contacts, or Shift-click to select a range.
            </span>
          )}
          {hasFilters ? (
            <button type="button" className="btn-secondary" onClick={showAll}>
              Show all
            </button>
          ) : null}
          <button
            type="button"
            className="btn-danger"
            onClick={() => setEmptyConfirmOpen(true)}
            disabled={emptying || loading || items.length === 0}
          >
            Empty list
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        {loading ? (
          <p className="muted">Loading client list…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            No contacts yet. Harvest a mailbox folder, import a CSV, paste rows, or add someone
            manually.
          </p>
        ) : visible.length === 0 ? (
          <div className="mailing-empty-filter">
            <p className="muted">No contacts match these filters.</p>
            <button type="button" className="btn-primary" onClick={showAll}>
              Show all
            </button>
          </div>
        ) : (
          <div className="mailing-table-wrap mailing-table-wrap--frozen">
            <table className="systems-table mailing-table--sortable">
              <thead>
                <tr>
                  <th scope="col" className="mailing-col-check">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible contacts"
                    />
                  </th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} scope="col" aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="mailing-sort-btn" onClick={() => toggleSort(col.key)}>
                        {col.label}
                        <span className="mailing-sort-indicator" aria-hidden="true">
                          {sort.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="systems-col-actions">
                    Actions
                  </th>
                </tr>
                <tr className="mailing-filter-row">
                  <th className="mailing-col-check" />
                  {COLUMNS.map((col) => (
                    <th key={col.key} scope="col">
                      <input
                        type="search"
                        className="mailing-col-filter"
                        placeholder="Filter"
                        value={filters[col.key]}
                        onChange={(e) => setFilters((current) => ({ ...current, [col.key]: e.target.value }))}
                        aria-label={`Filter ${col.label}`}
                        list={col.key === 'source' ? 'master-source-list' : col.key === 'importBatch' ? 'master-batch-list' : undefined}
                      />
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className={selected.has(row.email) ? 'mailing-row-selected' : undefined}>
                    <td className="mailing-col-check">
                      <input
                        type="checkbox"
                        checked={selected.has(row.email)}
                        onChange={(e) => toggleSelected(row.email, e.nativeEvent.shiftKey)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${row.email}`}
                      />
                    </td>
                    <td>
                      {row.name || '—'}
                      {row.unsubscribed ? (
                        <span className="mailing-pill mailing-pill--muted">Unsubscribed</span>
                      ) : null}
                    </td>
                    <td>{row.email}</td>
                    <td>{row.company || '—'}</td>
                    <td className="muted">{sourceLabel(row) || '—'}</td>
                    <td className="muted">{row.importBatch || '—'}</td>
                    <td className="systems-col-actions">
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => {
                          setEditingEmail(row.email)
                          setForm({
                            name: row.name || '',
                            email: row.email,
                            company: row.company || '',
                          })
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-danger btn-small"
                        onClick={() => {
                          if (window.confirm(`Remove ${row.email} from the master list?`)) {
                            removeClientEmail(row.email).catch((err) =>
                              setError(err instanceof Error ? err.message : String(err)),
                            )
                          }
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="master-source-list">
              {sourceOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <datalist id="master-batch-list">
              {batchOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
        )}
        {!loading && items.length > 0 && (
          <p className="muted harvest-client-emails-count">
            {visible.length === items.length
              ? `${items.length} contact${items.length === 1 ? '' : 's'}`
              : `${visible.length} of ${items.length} contacts`}
            {selected.size ? ` · ${selected.size} selected` : ''}
            {hasFilters ? (
              <>
                {' · '}
                <button type="button" className="mailing-show-all-link" onClick={showAll}>
                  Show all
                </button>
              </>
            ) : ''}
          </p>
        )}
      </div>

      <ConfirmModal
        open={Boolean(bulkAction)}
        title={bulkAction === 'exclude' ? 'Add to exclusions list?' : 'Remove selected contacts?'}
        message={
          bulkAction === 'exclude'
            ? `Add ${selectedRows.length} address${selectedRows.length === 1 ? '' : 'es'} to the exclusions list and remove them from the master client list? Harvest will not add them back, and campaigns will skip them.`
            : `Remove ${selectedRows.length} address${selectedRows.length === 1 ? '' : 'es'} from the master client list? Audiences already created keep their members.`
        }
        confirmLabel={bulkAction === 'exclude' ? 'Add to exclusions' : 'Remove selected'}
        danger={bulkAction === 'delete'}
        busy={bulkBusy}
        onConfirm={confirmBulkAction}
        onCancel={() => !bulkBusy && setBulkAction(null)}
      />
      <ConfirmModal
        open={emptyConfirmOpen}
        title="Empty master client list?"
        message={`Remove all ${items.length} address${items.length === 1 ? '' : 'es'} from the master list? Audiences already created keep their members.`}
        confirmLabel="Empty list"
        danger
        busy={emptying}
        onConfirm={confirmEmpty}
        onCancel={() => !emptying && setEmptyConfirmOpen(false)}
      />
    </section>
  )
}
