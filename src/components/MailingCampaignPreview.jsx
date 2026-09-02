import { useEffect, useMemo, useState } from 'react'
import { parseEmailAddress } from '../emailAddress.js'
import { uniqueMembers } from '../mailings.js'
import EmailPreviewFrame from './EmailPreviewFrame.jsx'

function membersInGivenOrder(rows) {
  const seen = new Set()
  const list = []
  for (const row of rows || []) {
    const email = parseEmailAddress(row.email)
    if (!email || seen.has(email)) continue
    seen.add(email)
    list.push({
      email,
      name: String(row.name || '').trim(),
      company: String(row.company || '').trim(),
    })
  }
  return list
}

export default function MailingCampaignPreview({
  template,
  audience,
  fromName = '',
  fromEmail = '',
  excludedEmails,
  members: membersOverride,
}) {
  const [index, setIndex] = useState(0)
  const audienceMembers = useMemo(() => uniqueMembers(audience?.members), [audience])
  const members = useMemo(() => {
    if (Array.isArray(membersOverride) && membersOverride.length) {
      return membersInGivenOrder(membersOverride)
    }
    return audienceMembers
  }, [membersOverride, audienceMembers])
  const excluded = excludedEmails || new Set()
  const scoped = Array.isArray(membersOverride) && membersOverride.length > 0
  const memberKey = members.map((row) => row.email).join('\n')

  useEffect(() => {
    setIndex(0)
  }, [audience?.id, template?.id, memberKey])

  useEffect(() => {
    if (index >= members.length) setIndex(Math.max(0, members.length - 1))
  }, [index, members.length])

  if (!template?.htmlBody) {
    return (
      <div className="systems-card mailing-wide-card">
        <p className="muted">Choose an email template on the Campaign tab to preview sends.</p>
      </div>
    )
  }

  if (!members.length) {
    return (
      <div className="systems-card mailing-wide-card">
        <p className="muted">
          {scoped
            ? 'No selected recipients to preview. Select contacts on the Recipients tab, then preview again.'
            : 'Choose an audience with members on the Campaign tab to step through each email.'}
        </p>
      </div>
    )
  }

  const safeIndex = Math.min(index, members.length - 1)
  const contact = members[safeIndex]
  const skipped = excluded.has(parseEmailAddress(contact.email))
  const canPrev = safeIndex > 0
  const canNext = safeIndex < members.length - 1

  function go(delta) {
    setIndex((current) => Math.min(members.length - 1, Math.max(0, current + delta)))
  }

  return (
    <div className="systems-card mailing-wide-card campaign-preview">
      <div className="campaign-preview-stepper">
        <button type="button" className="btn-secondary" onClick={() => go(-1)} disabled={!canPrev}>
          Previous
        </button>
        <label className="campaign-preview-position">
          <span>
            {safeIndex + 1} of {members.length}
            {scoped ? ' selected' : ''}
          </span>
          <select
            aria-label="Preview recipient"
            value={String(safeIndex)}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {members.map((row, i) => (
              <option key={row.email} value={i}>
                {row.name ? `${row.name} · ${row.email}` : row.email}
                {excluded.has(parseEmailAddress(row.email)) ? ' (excluded)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-secondary" onClick={() => go(1)} disabled={!canNext}>
          Next
        </button>
      </div>

      <p className="muted">
        {scoped
          ? `Previewing ${members.length} selected recipient${members.length === 1 ? '' : 's'} in table order.`
          : `Previewing the full audience (${members.length}). Select a batch on Recipients to preview only those emails.`}
      </p>

      {skipped ? (
        <p className="form-error">
          This address is on the exclusions list and will not be sent.
        </p>
      ) : null}

      <EmailPreviewFrame
        html={template.htmlBody}
        subject={template.subject || ''}
        fromName={fromName}
        fromEmail={fromEmail}
        contact={contact}
        layout={template.layout}
      />
    </div>
  )
}
