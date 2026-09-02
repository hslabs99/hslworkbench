import { useMemo } from 'react'
import { parseEmailAddress } from '../emailAddress.js'

const SLICES = [
  { key: 'clicked', label: 'Clicked', color: '#6a4c93' },
  { key: 'opened', label: 'Opened', color: '#216e4e' },
  { key: 'sent', label: 'Sent', color: '#0c66e4' },
  { key: 'failed', label: 'Failed', color: '#c9372c' },
  { key: 'queued', label: 'Queued', color: '#8b7355' },
  { key: 'remaining', label: 'Not yet sent', color: '#d0d4dc' },
  { key: 'unsubscribed', label: 'Unsubscribed', color: '#974f0c' },
]

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate()
    } catch {
      return null
    }
  }
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatWhen(value) {
  const date = toDate(value)
  return date ? date.toLocaleString() : '—'
}

function latestByEmail(sends) {
  const byEmail = new Map()
  for (const row of sends || []) {
    const email = parseEmailAddress(row.email)
    if (!email) continue
    const current = byEmail.get(email)
    const at = toDate(row.sentAt || row.updatedAt || row.createdAt)?.getTime() || 0
    const currentAt = toDate(current?.sentAt || current?.updatedAt || current?.createdAt)?.getTime() || 0
    if (!current || at >= currentAt) byEmail.set(email, row)
  }
  return byEmail
}

function outcomeForSend(row) {
  const events = Array.isArray(row.events) ? row.events : []
  if (events.some((event) => event.type === 'unsubscribed') || row.status === 'unsubscribed') {
    return 'unsubscribed'
  }
  if (row.status === 'clicked' || row.clickedAt || events.some((event) => event.type === 'clicked')) {
    return 'clicked'
  }
  if (row.status === 'opened' || row.openedAt || events.some((event) => event.type === 'opened')) {
    return 'opened'
  }
  if (row.status === 'failed') return 'failed'
  if (row.status === 'queued') return 'queued'
  if (row.status === 'sent') return 'sent'
  return row.status || 'queued'
}

export function campaignAnalyticsSlices(sends, { remainingCount = 0, sendableCount = 0 } = {}) {
  const counts = {
    clicked: 0,
    opened: 0,
    sent: 0,
    failed: 0,
    queued: 0,
    remaining: 0,
    unsubscribed: 0,
  }
  const seen = latestByEmail(sends)
  for (const row of seen.values()) {
    const outcome = outcomeForSend(row)
    if (counts[outcome] != null) counts[outcome] += 1
  }
  counts.remaining = Math.max(0, sendableCount - seen.size)
  const slices = SLICES.map((item) => ({ ...item, value: counts[item.key] })).filter((item) => item.value > 0)
  const total = slices.reduce((sum, item) => sum + item.value, 0)
  return { slices, total, counts }
}

function polar(cx, cy, radius, angle) {
  const rad = ((angle - 90) * Math.PI) / 180
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]
}

function slicePath(cx, cy, radius, startAngle, endAngle) {
  const [x1, y1] = polar(cx, cy, radius, startAngle)
  const [x2, y2] = polar(cx, cy, radius, endAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`
}

function eventsLine(row) {
  const events = Array.isArray(row.events) ? row.events : []
  if (!events.length) {
    const bits = []
    if (row.openedAt) bits.push(`opened ${formatWhen(row.openedAt)}`)
    if (row.clickedAt) bits.push(`clicked ${formatWhen(row.clickedAt)}`)
    return bits.join(' · ') || '—'
  }
  return events
    .map((event) => {
      const when = formatWhen(event.at)
      const extra = event.url ? ` ${event.url}` : ''
      return `${event.type || 'event'} ${when}${extra}`
    })
    .join(' · ')
}

export default function MailingCampaignAnalytics({
  sends = [],
  remainingCount = 0,
  sendableCount = 0,
  campaignName = '',
}) {
  const { slices, total, counts } = useMemo(
    () => campaignAnalyticsSlices(sends, { remainingCount, sendableCount }),
    [sends, remainingCount, sendableCount],
  )

  const logRows = useMemo(() => {
    return [...sends].sort((a, b) => {
      const at = toDate(b.sentAt || b.createdAt)?.getTime() || 0
      const bt = toDate(a.sentAt || a.createdAt)?.getTime() || 0
      return at - bt
    })
  }, [sends])

  const cx = 120
  const cy = 120
  const radius = 104
  let cursor = 0

  return (
    <div className="mailing-analytics">
      <div className="systems-card mailing-analytics-chart">
        <h4>Campaign results</h4>
        <p className="muted">
          {campaignName ? `“${campaignName}” · ` : ''}
          {sendableCount} sendable · {counts.sent + counts.opened + counts.clicked} delivered ·{' '}
          {remainingCount} still to send
        </p>
        {total === 0 ? (
          <p className="muted">No sends yet. After a batch goes out, this pie fills in from the live log.</p>
        ) : (
          <div className="mailing-analytics-chart-body">
            <svg viewBox="0 0 240 240" className="mailing-pie" role="img" aria-label="Campaign outcome pie chart">
              {slices.length === 1 ? (
                <circle cx={cx} cy={cy} r={radius} fill={slices[0].color} />
              ) : (
                slices.map((slice) => {
                  const sweep = (slice.value / total) * 360
                  const start = cursor
                  const end = cursor + sweep
                  cursor = end
                  return (
                    <path
                      key={slice.key}
                      d={slicePath(cx, cy, radius, start, end)}
                      fill={slice.color}
                    >
                      <title>
                        {slice.label}: {slice.value}
                      </title>
                    </path>
                  )
                })
              )}
              <circle cx={cx} cy={cy} r={58} fill="#fff" />
              <text x={cx} y={cy - 6} textAnchor="middle" className="mailing-pie-total">
                {total}
              </text>
              <text x={cx} y={cy + 16} textAnchor="middle" className="mailing-pie-total-label">
                contacts
              </text>
            </svg>
            <ul className="mailing-pie-legend">
              {SLICES.map((item) => (
                <li key={item.key}>
                  <span className="mailing-pie-swatch" style={{ background: item.color }} />
                  <span>
                    {item.label}
                    <strong> {counts[item.key] || 0}</strong>
                    {total ? ` · ${Math.round(((counts[item.key] || 0) / total) * 100)}%` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="systems-card mailing-analytics-log">
        <h4>Transaction log</h4>
        <p className="muted">Every send attempt for this campaign, newest first.</p>
        {logRows.length === 0 ? (
          <p className="muted">No transactions yet.</p>
        ) : (
          <div className="mailing-table-wrap">
            <table className="systems-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Subject</th>
                  <th>Via</th>
                  <th>Events</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {logRows.map((row) => (
                  <tr key={row.id}>
                    <td className="muted">{formatWhen(row.sentAt || row.createdAt)}</td>
                    <td>
                      {row.name ? `${row.name} · ` : ''}
                      {row.email}
                    </td>
                    <td>{outcomeForSend(row)}</td>
                    <td>{row.subject || '—'}</td>
                    <td className="muted">{row.sendVia === 'sendgrid' ? 'SendGrid' : 'Outlook'}</td>
                    <td className="muted">{eventsLine(row)}</td>
                    <td className="muted">{row.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
