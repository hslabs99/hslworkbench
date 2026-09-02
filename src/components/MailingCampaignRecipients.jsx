import { useMemo, useState } from 'react'
import { campaignRecipientRows, formatSendWhen, normalizeBatchSize, toSendDate } from '../mailingSend.js'

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'not_sent', label: 'Not sent' },
  { id: 'failed', label: 'Failed' },
  { id: 'sent', label: 'Sent' },
  { id: 'opened', label: 'Opened' },
  { id: 'clicked', label: 'Clicked' },
  { id: 'unsubscribed', label: 'Unsubscribed' },
  { id: 'excluded', label: 'Excluded' },
]

const STATUS_LABEL = {
  not_sent: 'Not sent',
  queued: 'Queued',
  sent: 'Sent',
  opened: 'Opened',
  clicked: 'Clicked',
  failed: 'Failed',
  unsubscribed: 'Unsubscribed',
  excluded: 'Excluded',
}

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'status', label: 'Status' },
  { key: 'sentAt', label: 'Sent', date: true, muted: true },
  { key: 'openedAt', label: 'Opened', date: true, muted: true },
  { key: 'clickedAt', label: 'Clicked', date: true, muted: true },
  { key: 'unsubscribedAt', label: 'Unsubscribed', date: true, muted: true },
  { key: 'error', label: 'Error', muted: true },
]

const EMPTY_FILTERS = Object.fromEntries(COLUMNS.map((col) => [col.key, '']))

function statusMatches(status, filter) {
  if (filter === 'all') return true
  if (filter === 'not_sent') return status === 'not_sent' || status === 'queued'
  if (filter === 'sent') return status === 'sent' || status === 'opened' || status === 'clicked'
  return status === filter
}

function displayValue(row, key) {
  if (key === 'status') return STATUS_LABEL[row.status] || row.status
  if (key === 'sentAt' || key === 'openedAt' || key === 'clickedAt' || key === 'unsubscribedAt') {
    return formatSendWhen(row[key])
  }
  return String(row[key] || '')
}

function whenCell(value) {
  return formatSendWhen(value) || '—'
}

function compareRows(a, b, key, dir) {
  const col = COLUMNS.find((item) => item.key === key)
  if (col?.date) {
    const av = toSendDate(a[key])?.getTime() || 0
    const bv = toSendDate(b[key])?.getTime() || 0
    if (!av && !bv) return 0
    if (!av) return 1
    if (!bv) return -1
    return dir === 'asc' ? av - bv : bv - av
  }
  const av = displayValue(a, key)
  const bv = displayValue(b, key)
  const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true })
  return dir === 'asc' ? cmp : -cmp
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

export default function MailingCampaignRecipients({
  audience,
  sends = [],
  excludedEmails,
  selectedEmails,
  batchSize = 5,
  canSend = false,
  sending = false,
  onSelectedChange,
  onSendSelected,
  onPreviewSelected,
}) {
  const [chip, setChip] = useState('all')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState({ key: 'email', dir: 'asc' })
  const rows = useMemo(
    () => campaignRecipientRows(audience?.members, sends, excludedEmails),
    [audience?.members, sends, excludedEmails],
  )
  const selected = selectedEmails || new Set()
  const take = normalizeBatchSize(batchSize)

  const distinctByKey = useMemo(() => {
    const next = {}
    for (const col of COLUMNS) {
      next[col.key] = [
        ...new Set(rows.map((row) => displayValue(row, col.key)).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    }
    return next
  }, [rows])

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (!statusMatches(row.status, chip)) return false
      return COLUMNS.every((col) => {
        const query = String(filters[col.key] || '').trim()
        if (!query) return true
        const value = displayValue(row, col.key)
        if (value === query) return true
        return value.toLowerCase().includes(query.toLowerCase())
      })
    })
    return [...filtered].sort((a, b) => compareRows(a, b, sort.key, sort.dir))
  }, [rows, chip, filters, sort])

  const selectedVisible = visible.filter((row) => selected.has(row.email))
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length
  const selectedCount = selected.size
  const sendableSelected = rows.filter((row) => selected.has(row.email) && row.selectable).length
  const counts = useMemo(() => {
    const next = { all: rows.length }
    for (const row of rows) {
      next[row.status] = (next[row.status] || 0) + 1
    }
    next.not_sent = (next.not_sent || 0) + (next.queued || 0)
    next.sent = (next.sent || 0) + (next.opened || 0) + (next.clicked || 0)
    return next
  }, [rows])

  if (!audience) {
    return (
      <div className="systems-card mailing-wide-card">
        <p className="muted">Choose an audience on the Campaign tab to see every recipient.</p>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="systems-card mailing-wide-card">
        <p className="muted">This audience has no contacts yet.</p>
      </div>
    )
  }

  function toggle(email) {
    const next = new Set(selected)
    if (next.has(email)) next.delete(email)
    else next.add(email)
    onSelectedChange?.(next)
  }

  function toggleAllVisible() {
    const next = new Set(selected)
    if (allVisibleSelected) {
      for (const row of visible) next.delete(row.email)
    } else {
      for (const row of visible) next.add(row.email)
    }
    onSelectedChange?.(next)
  }

  function selectNextBatch() {
    const pool = visible.filter((row) => row.selectable)
    const next = new Set()
    for (const row of pool.slice(0, take)) next.add(row.email)
    onSelectedChange?.(next)
  }

  function selectUnsent() {
    const next = new Set()
    for (const row of visible) {
      if (row.selectable) next.add(row.email)
    }
    onSelectedChange?.(next)
  }

  function toggleSort(key) {
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )
  }

  function previewSelected() {
    const members = (selectedCount ? visible.filter((row) => selected.has(row.email)) : visible).map((row) => ({
      email: row.email,
      name: row.name,
      company: row.company,
    }))
    onPreviewSelected?.(members)
  }

  return (
    <div className="systems-card mailing-wide-card">
      <div className="mailing-toolbar mailing-recipients-toolbar">
        <div className="mailing-status-filters" role="tablist" aria-label="Recipient status">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`mailing-status-filter${chip === item.id ? ' is-selected' : ''}`}
              aria-selected={chip === item.id}
              onClick={() => setChip(item.id)}
            >
              {item.label}
              <span className="muted"> {counts[item.id] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mailing-toolbar">
        <button type="button" className="btn-secondary" onClick={selectNextBatch} disabled={sending}>
          Select next {Math.min(take, visible.filter((row) => row.selectable).length || take)}
        </button>
        <button type="button" className="btn-secondary" onClick={selectUnsent} disabled={sending}>
          Select all unsent
        </button>
        {selectedCount > 0 ? (
          <button type="button" className="btn-secondary" onClick={() => onSelectedChange?.(new Set())} disabled={sending}>
            Clear selection
          </button>
        ) : null}
        <span className="muted mailing-toolbar-grow">
          {selectedCount
            ? `${selectedCount} selected · ${visible.length} shown of ${rows.length}`
            : `${visible.length} shown of ${rows.length}`}
        </span>
        <button
          type="button"
          className="btn-secondary"
          onClick={previewSelected}
          disabled={sending || (!selectedCount && !visible.length)}
        >
          Preview {selectedCount || visible.length}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onSendSelected?.()}
          disabled={!canSend || sending || sendableSelected === 0}
        >
          {sending ? 'Sending…' : `Send selected (${sendableSelected || selectedCount})`}
        </button>
      </div>

      <div className="mailing-table-wrap mailing-table-wrap--frozen mailing-recipients-table">
        <table className="systems-table mailing-table--sortable">
          <thead>
            <tr>
              <th className="mailing-check-col">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={visible.length === 0 || sending}
                  onChange={toggleAllVisible}
                  aria-label="Select all recipients shown"
                />
              </th>
              {COLUMNS.map((col) => (
                <SortableHeader key={col.key} col={col} sort={sort} onSort={toggleSort} />
              ))}
            </tr>
            <tr className="mailing-filter-row">
              <th className="mailing-check-col" />
              {COLUMNS.map((col) => (
                <th key={col.key} scope="col">
                  <ColumnFilter
                    col={col}
                    value={filters[col.key]}
                    options={distinctByKey[col.key] || []}
                    onChange={(next) => setFilters((current) => ({ ...current, [col.key]: next }))}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const checked = selected.has(row.email)
              return (
                <tr
                  key={row.email}
                  className={`${checked ? 'mailing-row-selected' : ''}${row.selectable ? '' : ' mailing-row-excluded'}`}
                >
                  <td className="mailing-check-col">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={sending}
                      onChange={() => toggle(row.email)}
                      aria-label={`Select ${row.email}`}
                    />
                  </td>
                  <td>{row.name || '—'}</td>
                  <td>{row.email}</td>
                  <td>{row.company || '—'}</td>
                  <td>
                    <span className={`mailing-status mailing-status--${row.status}`}>
                      {STATUS_LABEL[row.status] || row.status}
                    </span>
                  </td>
                  <td className="muted">{whenCell(row.sentAt)}</td>
                  <td className="muted">{whenCell(row.openedAt)}</td>
                  <td className="muted">{whenCell(row.clickedAt)}</td>
                  <td className="muted">{whenCell(row.unsubscribedAt)}</td>
                  <td className="muted">{row.error || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
