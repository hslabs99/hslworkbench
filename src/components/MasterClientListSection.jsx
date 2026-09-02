import { useEffect, useMemo, useRef, useState } from 'react'
import {
  emptyClientEmailsCollection,
  lastMailingAt,
  removeClientEmail,
  removeClientEmails,
  saveClientEmail,
  subscribeClientEmails,
} from '../clientEmails.js'
import { addMailingExclusions } from '../mailingExclusions.js'
import {
  addContactsToAudience,
  createMailingAudienceFromContacts,
  loadAudienceMembershipMap,
  subscribeMailingAudiences,
} from '../mailings.js'
import {
  emptyImportExceptions,
  IMPORT_EXCEPTION_REASONS,
  subscribeImportExceptions,
} from '../importExceptions.js'
import ConfirmModal from './ConfirmModal.jsx'
import MasterClientAudienceModal from './MasterClientAudienceModal.jsx'
import MasterClientImportPanel from './MasterClientImportPanel.jsx'
import {
  CONTACT_PROFILE_FIELDS,
  contactFormFromRow,
  contactLinkHref,
  emptyContactForm,
} from '../contactFields.js'

const EMPTY_FORM = emptyContactForm()
const BATCH_COLUMN = { key: 'importBatch', label: 'Batch', muted: true }
const AUDIENCE_COLUMN = { key: 'audiences', label: 'Audiences' }
const OTHER_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  AUDIENCE_COLUMN,
  ...CONTACT_PROFILE_FIELDS.map((field) => ({ key: field.key, label: field.label })),
  { key: 'source', label: 'Source', muted: true },
]
const COLUMNS = [BATCH_COLUMN, ...OTHER_COLUMNS]
const EMPTY_FILTERS = Object.fromEntries(COLUMNS.map((col) => [col.key, '']))
const PAGE_SIZE_OPTIONS = [50, 100, 250, 500]
const DEFAULT_PAGE_SIZE = 100
const NONE_AUDIENCE = '(None)'

function formatWhen(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

function sourceLabel(row) {
  return [row.source, row.sourceFolder].filter(Boolean).join(' · ')
}

function audienceMemberships(row, membershipMap) {
  return membershipMap?.get(row.email) || []
}

function rowValue(row, key, membershipMap) {
  if (key === 'source') return sourceLabel(row)
  if (key === 'audiences') return audienceMemberships(row, membershipMap).map((item) => item.name).join(', ')
  return String(row[key] || '')
}

function uniqueValues(items, key, membershipMap) {
  return [...new Set(items.map((row) => rowValue(row, key, membershipMap)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

function matchesAudienceFilter(row, query, audiences, membershipMap) {
  const q = String(query || '').trim()
  if (!q) return true
  const members = audienceMemberships(row, membershipMap)
  if (q.toLowerCase() === NONE_AUDIENCE.toLowerCase()) return members.length === 0
  const qLower = q.toLowerCase()
  const exact = audiences.filter((item) => String(item.name || '').toLowerCase() === qLower)
  if (exact.length) return exact.some((item) => members.some((member) => member.id === item.id))
  return members.some((item) => item.name.toLowerCase().includes(qLower))
}

function ColumnFilter({ col, value, options, onChange }) {
  const exact = value !== '' && options.includes(value)
  return (
    <div className="mailing-col-filter-combo">
      <select
        className="mailing-col-filter mailing-col-filter-select"
        value={exact ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Filter ${col.label} by value`}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <input
        type="search"
        className="mailing-col-filter"
        placeholder="Contains"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Filter ${col.label}`}
      />
    </div>
  )
}

function SortableHeader({ col, sort, onSort }) {
  const active = sort.key === col.key
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="mailing-sort-btn" onClick={() => onSort(col.key)}>
        {col.label}
        <span className="mailing-sort-indicator" aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  )
}

function DataCell({ row, col, membershipMap }) {
  return (
    <td
      className={[
        col.muted ? 'muted' : '',
        col.key === 'name' || col.key === 'audiences' ? '' : 'mailing-cell-clip',
      ]
        .filter(Boolean)
        .join(' ') || undefined}
    >
      <CellValue row={row} col={col} membershipMap={membershipMap} />
    </td>
  )
}

function CellValue({ row, col, membershipMap }) {
  if (col.key === 'audiences') {
    const memberships = audienceMemberships(row, membershipMap)
    if (!memberships.length) return '—'
    return (
      <span
        className="mailing-audience-pills"
        title={memberships.map((item) => item.name).join(', ')}
      >
        {memberships.map((item) => (
          <span key={item.id} className="mailing-pill mailing-pill--audience">
            {item.name}
          </span>
        ))}
      </span>
    )
  }
  const value = rowValue(row, col.key, membershipMap)
  if (col.key === 'name') {
    return (
      <>
        {value || '—'}
        {row.unsubscribed ? (
          <span className="mailing-pill mailing-pill--muted">Unsubscribed</span>
        ) : null}
      </>
    )
  }
  if (!value) return '—'
  const href = contactLinkHref(value, col.key)
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="mailing-cell-link" title={value}>
        {value}
      </a>
    )
  }
  return <span title={value}>{value}</span>
}

export default function MasterClientListSection() {
  const [items, setItems] = useState([])
  const [exceptions, setExceptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listTab, setListTab] = useState('list')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState({ key: 'email', dir: 'asc' })
  const [form, setForm] = useState(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState(null)
  const [editingEmail, setEditingEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false)
  const [emptying, setEmptying] = useState(false)
  const [emptyExceptionsOpen, setEmptyExceptionsOpen] = useState(false)
  const [emptyingExceptions, setEmptyingExceptions] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkAction, setBulkAction] = useState(null)
  const [historyContact, setHistoryContact] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [audiences, setAudiences] = useState([])
  const [membershipMap, setMembershipMap] = useState(() => new Map())
  const [audienceModalOpen, setAudienceModalOpen] = useState(false)
  const [audienceModalError, setAudienceModalError] = useState(null)
  const [audienceNotice, setAudienceNotice] = useState('')
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
    return subscribeImportExceptions(
      setExceptions,
      (err) => console.error(err),
    )
  }, [])

  useEffect(() => {
    return subscribeMailingAudiences(setAudiences, (err) => {
      console.error(err)
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [])

  const membershipKey = audiences.map((row) => `${row.id}:${row.name}:${row.memberCount || 0}`).join('|')
  const audiencesForMembership = useMemo(() => audiences, [membershipKey])

  useEffect(() => {
    if (!audiencesForMembership.length) {
      setMembershipMap(new Map())
      return undefined
    }
    let cancelled = false
    loadAudienceMembershipMap(audiencesForMembership)
      .then((map) => {
        if (!cancelled) setMembershipMap(map)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err)
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [audiencesForMembership])

  useEffect(() => {
    const known = new Set(items.map((row) => row.email))
    setSelected((prev) => {
      const next = new Set([...prev].filter((email) => known.has(email)))
      if (next.size === prev.size) return prev
      return next
    })
  }, [items])

  const distinctByKey = useMemo(() => {
    const map = {}
    for (const col of COLUMNS) {
      if (col.key === 'audiences') {
        const names = audiences
          .map((row) => row.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        map[col.key] = [NONE_AUDIENCE, ...names]
        continue
      }
      map[col.key] = uniqueValues(items, col.key, membershipMap)
    }
    return map
  }, [items, audiences, membershipMap])
  const batchOptions = distinctByKey.importBatch || []

  const hasFilters = useMemo(
    () => Object.values(filters).some((value) => String(value).trim()),
    [filters],
  )

  const visible = useMemo(() => {
    const active = Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, String(value).trim()]),
    )
    const filtered = items.filter((row) =>
      COLUMNS.every((col) => {
        const q = active[col.key]
        if (!q) return true
        if (col.key === 'audiences') return matchesAudienceFilter(row, q, audiences, membershipMap)
        return rowValue(row, col.key, membershipMap).toLowerCase().includes(q.toLowerCase())
      }),
    )
    const dir = sort.dir === 'desc' ? -1 : 1
    return [...filtered].sort((a, b) => {
      const av = rowValue(a, sort.key, membershipMap)
      const bv = rowValue(b, sort.key, membershipMap)
      const n = av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
      if (n !== 0) return n * dir
      return a.email.localeCompare(b.email) * dir
    })
  }, [items, filters, sort, audiences, membershipMap])

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  const pageStart = (safePage - 1) * pageSize
  const pageRows = useMemo(
    () => visible.slice(pageStart, pageStart + pageSize),
    [visible, pageStart, pageSize],
  )

  useEffect(() => {
    setPage(1)
  }, [filters, sort, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const selectedRows = useMemo(
    () => items.filter((row) => selected.has(row.email)),
    [items, selected],
  )
  const historyLive = historyContact
    ? items.find((row) => row.email === historyContact.email) || historyContact
    : null
  const pageSelectedCount = useMemo(
    () => pageRows.filter((row) => selected.has(row.email)).length,
    [pageRows, selected],
  )
  const allPageSelected = pageRows.length > 0 && pageSelectedCount === pageRows.length
  const allMatchingSelected = visible.length > 0 && selected.size === visible.length && visible.every((row) => selected.has(row.email))

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = pageSelectedCount > 0 && !allPageSelected
    }
  }, [pageSelectedCount, allPageSelected])

  function toggleSelected(email, shiftKey = false) {
    const pageEmails = pageRows.map((row) => row.email)
    if (shiftKey && lastClickedRef.current) {
      const from = pageEmails.indexOf(lastClickedRef.current)
      const to = pageEmails.indexOf(email)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        const range = pageEmails.slice(start, end + 1)
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

  function toggleSelectAllPage() {
    const pageEmails = pageRows.map((row) => row.email)
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageEmails.forEach((email) => next.delete(email))
      } else {
        pageEmails.forEach((email) => next.add(email))
      }
      return next
    })
  }

  function selectAllMatching() {
    setSelected(new Set(visible.map((row) => row.email)))
  }

  async function handleAudienceSubmit(choice) {
    if (!selectedRows.length) return
    setBulkBusy(true)
    setAudienceModalError(null)
    setError(null)
    try {
      const result =
        choice.mode === 'new'
          ? await createMailingAudienceFromContacts(
              { name: choice.name, description: choice.description },
              selectedRows,
            )
          : await addContactsToAudience(choice.audienceId, selectedRows)
      const skipNote = result.skipped
        ? ` · ${result.skipped} already in this audience`
        : ''
      setAudienceNotice(
        result.added
          ? `Added ${result.added} contact${result.added === 1 ? '' : 's'} to “${result.name}”${skipNote}.`
          : `No new contacts added to “${result.name}”${skipNote}.`,
      )
      setAudienceModalOpen(false)
      setSelected(new Set())
    } catch (err) {
      setAudienceModalError(err instanceof Error ? err.message : String(err))
    } finally {
      setBulkBusy(false)
    }
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

  function openAdd() {
    setForm(emptyContactForm())
    setEditingEmail('')
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(row) {
    setForm(contactFormFromRow(row))
    setEditingEmail(row.email)
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setForm(emptyContactForm())
    setEditingEmail('')
    setFormError(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await saveClientEmail({
        ...form,
        source: editingEmail ? undefined : 'manual',
      })
      setFormOpen(false)
      setForm(EMPTY_FORM)
      setEditingEmail('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
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

  async function confirmEmptyExceptions() {
    setEmptyingExceptions(true)
    setError(null)
    try {
      await emptyImportExceptions()
      setEmptyExceptionsOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setEmptyingExceptions(false)
    }
  }

  return (
    <section className="lookup-section mailing-section">
      <h3 className="lookup-section-title">Master client list</h3>
      <p className="lookup-section-intro muted">
        Filter or search, select the matching rows, then add them to an audience. Contacts can
        belong to more than one audience. Campaigns send to the audience you pick.
      </p>

      <div className="detail-tabs settings-tabs" role="tablist" aria-label="Master client list sections">
        <button
          type="button"
          role="tab"
          className="detail-tab"
          aria-selected={listTab === 'list'}
          onClick={() => setListTab('list')}
        >
          List
        </button>
        <button
          type="button"
          role="tab"
          className="detail-tab"
          aria-selected={listTab === 'import'}
          onClick={() => setListTab('import')}
        >
          Import
        </button>
        <button
          type="button"
          role="tab"
          className="detail-tab"
          aria-selected={listTab === 'exceptions'}
          onClick={() => setListTab('exceptions')}
        >
          Exceptions{exceptions.length ? ` (${exceptions.length})` : ''}
        </button>
      </div>

      {error && listTab !== 'import' ? <p className="form-error">{error}</p> : null}

      {listTab === 'import' && (
        <MasterClientImportPanel
          items={items}
          batchOptions={batchOptions}
          onImported={(summary) => {
            if (summary?.exceptions) setListTab('exceptions')
            else setListTab('list')
          }}
        />
      )}

      {listTab === 'exceptions' && (
        <div className="systems-card mailing-wide-card">
          <p className="muted">
            Rows that were not imported. Existing master-list emails are listed here so you can see
            overlap with a harvested file without changing those contacts.
          </p>
          <div className="mailing-toolbar">
            <span className="muted mailing-toolbar-grow">
              {exceptions.length
                ? `${exceptions.length} exception${exceptions.length === 1 ? '' : 's'}`
                : 'No exceptions yet'}
            </span>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setEmptyExceptionsOpen(true)}
              disabled={emptyingExceptions || exceptions.length === 0}
            >
              Clear exceptions
            </button>
          </div>
          {exceptions.length === 0 ? (
            <p className="muted">Import a CSV to record skipped emails here.</p>
          ) : (
            <div className="mailing-table-wrap mailing-table-wrap--frozen">
              <table className="systems-table">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Name</th>
                    <th scope="col">Company</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Import batch</th>
                    <th scope="col">Already in batch</th>
                    <th scope="col">File</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((row, index) => (
                    <tr key={`${row.email}-${row.at}-${index}`}>
                      <td>{row.email || '—'}</td>
                      <td>{row.name || '—'}</td>
                      <td>{row.company || '—'}</td>
                      <td>{IMPORT_EXCEPTION_REASONS[row.reason] || row.reason}</td>
                      <td className="muted">{row.batch || '—'}</td>
                      <td className="muted">{row.existingBatch || '—'}</td>
                      <td className="muted">{row.fileName || '—'}</td>
                      <td className="muted">{formatWhen(row.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {listTab === 'list' && (
      <div className="systems-card mailing-wide-card">
        <div className="mailing-toolbar">
          <button type="button" className="btn-primary" onClick={openAdd}>
            Add contact
          </button>
          {!allMatchingSelected && visible.length > 0 ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={selectAllMatching}
              disabled={bulkBusy}
            >
              {hasFilters
                ? `Select all matching (${visible.length})`
                : `Select all (${visible.length})`}
            </button>
          ) : null}
          {selected.size > 0 ? (
            <>
              <span className="muted mailing-toolbar-grow">
                {selected.size} selected
                {pageSelectedCount !== selected.size ? ` (${pageSelectedCount} on this page)` : ''}
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
                onClick={() => {
                  setAudienceModalError(null)
                  setAudienceNotice('')
                  setAudienceModalOpen(true)
                }}
                disabled={bulkBusy}
              >
                Add to audience
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
            <span className="mailing-toolbar-grow" />
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
        {audienceNotice ? <p className="muted">{audienceNotice}</p> : null}

        {loading ? (
          <p className="muted">Loading client list…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            No contacts yet. Import a CSV or add someone with Add contact.
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
                  <th scope="col" className="mailing-col-num">
                    #
                  </th>
                  <SortableHeader col={BATCH_COLUMN} sort={sort} onSort={toggleSort} />
                  <th scope="col" className="mailing-col-check">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAllPage}
                      aria-label="Select all contacts on this page"
                    />
                  </th>
                  {OTHER_COLUMNS.map((col) => (
                    <SortableHeader key={col.key} col={col} sort={sort} onSort={toggleSort} />
                  ))}
                  <th scope="col">Last mailed</th>
                  <th scope="col" className="systems-col-actions">
                    Actions
                  </th>
                </tr>
                <tr className="mailing-filter-row">
                  <th className="mailing-col-num" />
                  <th scope="col">
                    <ColumnFilter
                      col={BATCH_COLUMN}
                      value={filters.importBatch}
                      options={distinctByKey.importBatch || []}
                      onChange={(next) => setFilters((current) => ({ ...current, importBatch: next }))}
                    />
                  </th>
                  <th className="mailing-col-check" />
                  {OTHER_COLUMNS.map((col) => (
                    <th key={col.key} scope="col">
                      <ColumnFilter
                        col={col}
                        value={filters[col.key]}
                        options={distinctByKey[col.key] || []}
                        onChange={(next) => setFilters((current) => ({ ...current, [col.key]: next }))}
                      />
                    </th>
                  ))}
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => (
                  <tr key={row.id} className={selected.has(row.email) ? 'mailing-row-selected' : undefined}>
                    <td className="mailing-col-num">{pageStart + index + 1}</td>
                    <DataCell row={row} col={BATCH_COLUMN} membershipMap={membershipMap} />
                    <td className="mailing-col-check">
                      <input
                        type="checkbox"
                        checked={selected.has(row.email)}
                        onChange={(e) => toggleSelected(row.email, e.nativeEvent.shiftKey)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${row.email}`}
                      />
                    </td>
                    {OTHER_COLUMNS.map((col) => (
                      <DataCell key={col.key} row={row} col={col} membershipMap={membershipMap} />
                    ))}
                    <td className="muted">{formatWhen(lastMailingAt(row))}</td>
                    <td className="systems-col-actions">
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => setHistoryContact(row)}
                      >
                        History
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => openEdit(row)}
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
          </div>
        )}
        {!loading && items.length > 0 && (
          <div className="mailing-pagination">
            <p className="muted harvest-client-emails-count">
              {visible.length === 0
                ? '0 contacts'
                : `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, visible.length)} of ${visible.length}${
                    visible.length === items.length ? '' : ` (${items.length} total)`
                  }`}
              {selected.size ? ` · ${selected.size} selected` : ''}
              {hasFilters ? (
                <>
                  {' · '}
                  <button type="button" className="mailing-show-all-link" onClick={showAll}>
                    Show all
                  </button>
                </>
              ) : null}
            </p>
            {visible.length > 0 ? (
              <div className="mailing-pagination-controls">
                <label className="mailing-page-size">
                  Per page
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    aria-label="Rows per page"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="muted">
                  Page {safePage} of {pageCount}
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
      )}

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
      <ConfirmModal
        open={emptyExceptionsOpen}
        title="Clear import exceptions?"
        message={`Remove all ${exceptions.length} exception row${exceptions.length === 1 ? '' : 's'}? This does not change the master client list.`}
        confirmLabel="Clear exceptions"
        danger
        busy={emptyingExceptions}
        onConfirm={confirmEmptyExceptions}
        onCancel={() => !emptyingExceptions && setEmptyExceptionsOpen(false)}
      />
      {audienceModalOpen ? (
        <MasterClientAudienceModal
          contacts={selectedRows}
          audiences={audiences}
          membershipMap={membershipMap}
          busy={bulkBusy}
          error={audienceModalError}
          onCancel={() => {
            if (bulkBusy) return
            setAudienceModalOpen(false)
            setAudienceModalError(null)
          }}
          onSubmit={handleAudienceSubmit}
        />
      ) : null}
      {formOpen ? (
        <div className="modal-backdrop confirm-modal-backdrop" role="presentation" onClick={closeForm}>
          <div
            className="modal-panel mailing-contact-modal"
            role="dialog"
            aria-labelledby="mailing-contact-form-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mailing-contact-form-title" className="confirm-modal-title">
              {editingEmail ? 'Edit contact' : 'Add contact'}
            </h2>
            <form className="mailing-contact-form" onSubmit={handleSave}>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    autoFocus={!editingEmail}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    disabled={Boolean(editingEmail)}
                    autoFocus={Boolean(editingEmail)}
                  />
                </label>
                <label className="full-width">
                  Company
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  />
                </label>
                {CONTACT_PROFILE_FIELDS.map((field) => {
                  const long = field.key === 'evidence' || field.key === 'personalization'
                  return (
                    <label key={field.key} className={long ? 'full-width' : undefined}>
                      {field.label}
                      {long ? (
                        <textarea
                          rows={3}
                          value={form[field.key] || ''}
                          onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                        />
                      ) : (
                        <input
                          type="text"
                          value={form[field.key] || ''}
                          onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                        />
                      )}
                    </label>
                  )
                })}
              </div>
              {formError ? <p className="form-error">{formError}</p> : null}
              <div className="form-actions confirm-modal-actions">
                <button type="button" className="btn-secondary" onClick={closeForm} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editingEmail ? 'Save' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {historyLive ? (
        <div className="modal-backdrop confirm-modal-backdrop" role="presentation" onClick={() => setHistoryContact(null)}>
          <div
            className="modal-panel confirm-modal mailing-history-modal"
            role="dialog"
            aria-labelledby="mailing-history-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mailing-history-title" className="confirm-modal-title">
              Campaign history
            </h2>
            <p className="confirm-modal-message">
              {historyLive.name ? `${historyLive.name} · ` : ''}
              {historyLive.email}
            </p>
            {(historyLive.mailings || []).length === 0 ? (
              <p className="muted">No campaigns have been sent to this contact yet.</p>
            ) : (
              <ul className="mailing-history-list">
                {[...(historyLive.mailings || [])].reverse().map((item, index) => (
                  <li key={`${item.sendId || item.at}-${index}`}>
                    <strong>{item.campaignName || 'Campaign'}</strong>
                    <span className="muted">
                      {formatWhen(item.at)}
                      {item.templateName ? ` · ${item.templateName}` : ''}
                      {item.subject ? ` · ${item.subject}` : ''}
                      {' · '}
                      {item.status === 'failed' ? 'Failed' : 'Sent'}
                      {item.sendVia === 'sendgrid' ? ' via SendGrid' : ' via Outlook'}
                    </span>
                    {item.error ? <span className="form-error">{item.error}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="form-actions confirm-modal-actions">
              <button type="button" className="btn-primary" onClick={() => setHistoryContact(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
