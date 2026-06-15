/** Compact display helpers for Communication Summary table. */

export function formatSummaryDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${min}`
}

/** dd/mm for project cards */
export function formatCardDateOnly(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

/** Whole days between message date and today (0 = today). */
export function daysAgoFromIso(iso) {
  if (!iso) return 0
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const then = new Date(d)
  then.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today - then) / 86400000))
}

/** Days since a Firestore timestamp or ISO date (for folder scan age on cards). */
export function daysSinceTimestamp(ts) {
  if (ts == null) return null
  let d
  if (typeof ts.toDate === 'function') {
    try {
      d = ts.toDate()
    } catch {
      return null
    }
  } else {
    d = new Date(ts)
  }
  if (Number.isNaN(d.getTime())) return null
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
  if (ts == null) return '—'
  let d
  if (typeof ts.toDate === 'function') {
    try {
      d = ts.toDate()
    } catch {
      return '—'
    }
  } else {
    d = new Date(ts)
  }
  if (Number.isNaN(d.getTime())) return '—'
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
