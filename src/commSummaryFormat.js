/** Compact display helpers for Communication Summary table. */

/** Parse ISO strings, Date, or Firestore Timestamp. */
export function coerceToDate(value) {
  if (value == null) return null
  if (typeof value.toDate === 'function') {
    try {
      const d = value.toDate()
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
    } catch {
      return null
    }
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatSummaryDate(iso) {
  const d = coerceToDate(iso)
  if (!d) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${min}`
}

/** dd/mm for project cards */
export function formatCardDateOnly(iso) {
  const d = coerceToDate(iso)
  if (!d) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

/** Whole days between message date and today (0 = today). */
export function daysAgoFromIso(iso) {
  const d = coerceToDate(iso)
  if (!d) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const then = new Date(d)
  then.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today - then) / 86400000))
}

/** Days since a Firestore timestamp or ISO date (for folder scan age on cards). */
export function daysSinceTimestamp(ts) {
  const d = coerceToDate(ts)
  if (!d) return null
  return daysAgoFromIso(d.toISOString())
}

export function formatFolderScanAge(days) {
  if (days == null) return '—'
  return `${days}d`
}

export function formatMailScanTooltip(ts) {
  if (ts == null) {
    return 'Client folder not scanned yet — harvest or summarise emails'
  }
  const when = formatHistoryTimestamp(ts)
  return when === '—' ? 'Last client folder scan' : `Last client folder scan: ${when}`
}

export function formatHistoryTimestamp(ts) {
  const d = coerceToDate(ts)
  if (!d) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${min}`
}

export function formatDirectionLabel(direction) {
  if (direction === 'outbound') return 'Outbound'
  if (direction === 'inbound') return 'Inbound'
  return direction || '—'
}

function line(label, value) {
  const v = (value || '').trim()
  if (!v || v === '—') return `${label}: —`
  return `${label}: ${v}`
}

/** Hover tooltip for Direction column (From / To / Cc / Bcc on outbound). */
export function directionTooltip(row) {
  if (!row) return undefined

  const lines = [
    line('FROM', row.from),
    line('TO', row.to),
    line('CC', row.cc),
  ]

  if (row.inInbox) {
    lines.unshift('Still in Inbox — not filed to client folder')
  }

  if (row.direction === 'outbound') {
    lines.push(line('BCC', row.bcc))
  }

  return lines.join('\n')
}

/** Most recent direction for project card highlight: 'in' | 'out' | null */
export function recentEmailDirectionHighlight(inbound, outbound) {
  const inT = inbound?.t ?? 0
  const outT = outbound?.t ?? 0
  if (!inT && !outT) return null
  if (inT >= outT) return 'in'
  return 'out'
}
