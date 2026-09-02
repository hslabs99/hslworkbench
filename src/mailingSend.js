import { graphSendScopes } from './msalConfig.js'
import { appendContactMailing } from './clientEmails.js'
import { parseEmailAddress } from './emailAddress.js'
import { applyMergeTags, buildCampaignEmail } from './emailHtml.js'
import { sendGraphMail } from './graphMailSend.js'
import { loadMailingExclusionEmails } from './mailingExclusions.js'
import { mailingUnsubscribeUrl } from './mailingOrigin.js'
import {
  createMailingSend,
  listSendsForCampaign,
  uniqueMembers,
  updateMailingCampaign,
  updateMailingSend,
} from './mailings.js'

const COUNTED_AS_SENT = new Set(['sent', 'opened', 'clicked', 'unsubscribed'])

export function eligibleAudienceMembers(members, unsubscribed) {
  return uniqueMembers(members).filter((row) => {
    const email = parseEmailAddress(row.email)
    if (!email) return false
    if (unsubscribed?.has(email)) return false
    return true
  })
}

export function sentEmailsFromSends(sends) {
  return new Set(
    (sends || [])
      .filter((row) => COUNTED_AS_SENT.has(row.status))
      .map((row) => parseEmailAddress(row.email))
      .filter(Boolean),
  )
}

export function unsentAudienceMembers(members, excluded, sends) {
  const alreadySent = sentEmailsFromSends(sends)
  return eligibleAudienceMembers(members, excluded).filter(
    (row) => !alreadySent.has(parseEmailAddress(row.email)),
  )
}

export const DEFAULT_BATCH_SIZE = 5
export const MAX_BATCH_SIZE = 100

export function normalizeBatchSize(value, fallback = DEFAULT_BATCH_SIZE) {
  const size = Math.floor(Number(value))
  if (!Number.isFinite(size) || size < 1) return fallback
  return Math.min(MAX_BATCH_SIZE, size)
}

export function resolveBatchSize(value, remaining) {
  if (value === 'all') return Math.max(0, remaining)
  return Math.min(normalizeBatchSize(value), Math.max(0, remaining))
}

export function toSendDate(value) {
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

export function formatSendWhen(value) {
  const date = toSendDate(value)
  return date ? date.toLocaleString() : ''
}

export function latestSendByEmail(sends) {
  const byEmail = new Map()
  for (const row of sends || []) {
    const email = parseEmailAddress(row.email)
    if (!email) continue
    const current = byEmail.get(email)
    const at = toSendDate(row.sentAt || row.updatedAt || row.createdAt)?.getTime() || 0
    const currentAt = toSendDate(current?.sentAt || current?.updatedAt || current?.createdAt)?.getTime() || 0
    if (!current || at >= currentAt) byEmail.set(email, row)
  }
  return byEmail
}

export function sendOutcome(row) {
  const events = Array.isArray(row?.events) ? row.events : []
  if (!row) return 'not_sent'
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

function eventAt(send, type) {
  if (!send) return null
  if (type === 'opened' && send.openedAt) return send.openedAt
  if (type === 'clicked' && send.clickedAt) return send.clickedAt
  const events = Array.isArray(send.events) ? send.events : []
  const match = [...events].reverse().find((event) => event.type === type)
  return match?.at || null
}

export function campaignRecipientRows(members, sends, excluded) {
  const byEmail = latestSendByEmail(sends)
  return uniqueMembers(members).map((member) => {
    const email = parseEmailAddress(member.email)
    const send = byEmail.get(email) || null
    const excludedNow = Boolean(excluded?.has(email))
    const outcome = send ? sendOutcome(send) : 'not_sent'
    const status = excludedNow && outcome === 'not_sent' ? 'excluded' : outcome
    const selectable =
      !excludedNow && (status === 'not_sent' || status === 'failed' || status === 'queued')
    return {
      email,
      name: member.name || '',
      company: member.company || '',
      status,
      selectable,
      sentAt: send?.sentAt || (outcome === 'not_sent' ? null : send?.createdAt) || null,
      openedAt: eventAt(send, 'opened'),
      clickedAt: eventAt(send, 'clicked'),
      unsubscribedAt: eventAt(send, 'unsubscribed'),
      error: send?.error || '',
      sendVia: send?.sendVia || '',
      subject: send?.subject || '',
    }
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeSendVia(value) {
  return value === 'sendgrid' ? 'sendgrid' : 'graph'
}

export async function fetchMailingConfig() {
  const res = await fetch('/api/mailings/config')
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload.error || `Mailing config failed (${res.status})`)
  }
  return payload
}

async function sendViaSendGrid({ toEmail, toName, subject, html, fromEmail, fromName, customArgs }) {
  const res = await fetch('/api/mailings/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toEmail,
      toName,
      subject,
      html,
      fromEmail,
      fromName,
      customArgs,
    }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(payload.error || `SendGrid send failed (${res.status})`)
    err.diagnostics = payload.diagnostics || null
    throw err
  }
  return payload
}

function createTestReport({ onReport, provider = 'sendgrid' } = {}) {
  const report = {
    status: 'running',
    provider: provider === 'sendgrid' ? 'sendgrid' : 'graph',
    steps: [],
    from: '',
    fromName: '',
    to: '',
    toName: '',
    subject: '',
    unsubscribeUrl: '',
    htmlBytes: 0,
    messageId: '',
    statusCode: null,
    durationMs: 0,
    error: '',
  }
  const started = Date.now()
  const emit = () => {
    report.durationMs = Date.now() - started
    onReport?.({ ...report, steps: report.steps.map((step) => ({ ...step })) })
  }
  const start = (id, label, detail = '') => {
    report.steps.push({ id, label, status: 'running', detail })
    emit()
  }
  const finish = (id, status, detail = '') => {
    const step = report.steps.find((row) => row.id === id)
    if (step) {
      step.status = status
      step.detail = detail
    }
    emit()
  }
  return { report, start, finish, emit }
}

export async function sendTestEmail({
  toEmail,
  toName,
  subject,
  htmlBody,
  origin,
  fromEmail,
  fromName,
  layout,
  deliveryReceiptRequested = false,
  readReceiptRequested = false,
  sendVia: sendViaRaw,
  getAccessToken,
  onReport,
} = {}) {
  const sendVia = normalizeSendVia(sendViaRaw)
  const { report, start, finish, emit } = createTestReport({ onReport, provider: sendVia })
  const to = parseEmailAddress(toEmail)
  const from = parseEmailAddress(fromEmail)
  report.to = to
  report.toName = toName || to
  report.from = from
  report.fromName = fromName || from
  report.subject = subject || ''
  emit()

  start('recipient', 'Resolve test recipient and From address')
  if (!from) {
    const missingFrom =
      sendVia === 'sendgrid'
        ? 'From address is missing. Set SENDGRID_FROM_EMAIL.'
        : 'Connect Outlook so the test has a From address.'
    finish('recipient', 'fail', missingFrom)
    report.status = 'fail'
    report.error = missingFrom
    emit()
    const err = new Error(report.error)
    err.report = report
    throw err
  }
  if (!to) {
    const missingTo =
      sendVia === 'sendgrid'
        ? 'Set SENDGRID_TEST_RECIPIENT or SENDGRID_FROM_EMAIL.'
        : 'Connect Outlook so the test has a recipient.'
    finish('recipient', 'fail', missingTo)
    report.status = 'fail'
    report.error = missingTo
    emit()
    const err = new Error(report.error)
    err.report = report
    throw err
  }
  finish('recipient', 'ok', `From ${from} → ${to} via ${sendVia === 'sendgrid' ? 'SendGrid' : 'Outlook Graph'}`)

  start('subject', 'Check subject line')
  if (!String(subject || '').trim()) {
    finish('subject', 'fail', 'Add a subject before sending a test.')
    report.status = 'fail'
    report.error = 'Add a subject before sending a test.'
    emit()
    const err = new Error(report.error)
    err.report = report
    throw err
  }
  const mergedSubject = applyMergeTags(subject, { name: toName || to, email: to })
  report.subject = mergedSubject
  finish('subject', 'ok', mergedSubject)

  start('compose', 'Apply merge tags and wrap the email HTML')
  const unsubscribeUrl = mailingUnsubscribeUrl({ email: to })
  report.unsubscribeUrl = unsubscribeUrl
  const html = buildCampaignEmail({
    htmlBody,
    contact: { name: toName || to, email: to, company: '', contact: toName || to },
    origin,
    layout,
  })
  report.htmlBytes = new TextEncoder().encode(html).length
  const hasUnsub = /\/unsubscribe/i.test(html)
  finish(
    'compose',
    hasUnsub ? 'ok' : 'fail',
    hasUnsub
      ? `${report.htmlBytes.toLocaleString()} bytes · unsubscribe ${unsubscribeUrl}`
      : 'HTML was built but no unsubscribe link was found.',
  )
  if (!hasUnsub) {
    report.status = 'fail'
    report.error = 'The test email is missing an unsubscribe link.'
    emit()
    const err = new Error(report.error)
    err.report = report
    throw err
  }

  if (sendVia === 'graph') {
    start('graph', 'Send via Outlook Graph (connected mailbox)')
    try {
      if (!getAccessToken) throw new Error('Connect your Microsoft account to send via Outlook Graph.')
      const graphToken = await getAccessToken(graphSendScopes)
      if (!graphToken) throw new Error('Microsoft sign-in required. Reconnect and consent to Mail.Send.')
      await sendGraphMail(graphToken, {
        toEmail: to,
        toName: toName || to,
        subject: mergedSubject,
        html,
        fromEmail: from,
        fromName: fromName || from,
        deliveryReceiptRequested,
        readReceiptRequested,
      })
      const receiptNote = [
        deliveryReceiptRequested ? 'delivery receipt requested' : '',
        readReceiptRequested ? 'read receipt requested' : '',
      ]
        .filter(Boolean)
        .join(' · ')
      finish(
        'graph',
        'ok',
        `Sent from ${from} to ${to} via Outlook Graph${receiptNote ? ` · ${receiptNote}` : ''}`,
      )
      report.status = 'ok'
      emit()
      return report
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      finish('graph', 'fail', message)
      report.status = 'fail'
      report.error = message
      emit()
      const wrapped = new Error(report.error)
      wrapped.report = report
      throw wrapped
    }
  }

  start('api', 'Call this app’s send endpoint (/api/mailings/send)')
  try {
    const result = await sendViaSendGrid({
      toEmail: to,
      toName: toName || to,
      subject: mergedSubject,
      html,
      fromEmail: from,
      fromName: fromName || from,
      customArgs: { kind: 'test' },
    })
    finish('api', 'ok', 'Server received the test send request')
    if (Array.isArray(result.steps)) {
      report.steps.push(...result.steps)
    }
    report.messageId = result.messageId || ''
    report.statusCode = result.statusCode ?? 202
    report.from = result.from || from
    report.to = result.to || to
    report.status = 'ok'
    emit()
    return report
  } catch (err) {
    finish('api', 'fail', err instanceof Error ? err.message : String(err))
    const extra = err?.diagnostics
    if (Array.isArray(extra?.steps)) {
      report.steps.push(...extra.steps)
    }
    report.messageId = extra?.messageId || ''
    report.statusCode = extra?.statusCode ?? null
    report.status = 'fail'
    report.error = err instanceof Error ? err.message : String(err)
    emit()
    const wrapped = new Error(report.error)
    wrapped.report = report
    throw wrapped
  }
}

export async function sendMailingCampaign({
  campaign,
  template,
  audience,
  origin,
  fromEmail,
  fromName,
  sendVia: sendViaRaw,
  getAccessToken,
  batchSize = 5,
  selectedEmails,
  onProgress,
}) {
  if (!campaign?.id) throw new Error('Campaign is missing.')
  if (!template?.htmlBody) throw new Error('Choose an email template with a body.')
  if (!template?.subject) throw new Error('The email template needs a subject.')

  const sendVia = normalizeSendVia(sendViaRaw)
  if (!parseEmailAddress(fromEmail)) {
    throw new Error(
      sendVia === 'sendgrid'
        ? 'Set a From email on the campaign (a SendGrid-authenticated address).'
        : 'Connect Outlook so the campaign has a From address.',
    )
  }

  let graphToken = null
  if (sendVia === 'graph') {
    if (!getAccessToken) throw new Error('Connect your Microsoft account to send via Outlook.')
    graphToken = await getAccessToken(graphSendScopes)
    if (!graphToken) throw new Error('Microsoft sign-in required. Reconnect and consent to Mail.Send.')
  }

  const excluded = await loadMailingExclusionEmails()
  const existingSends = await listSendsForCampaign(campaign.id)
  const eligible = eligibleAudienceMembers(audience?.members, excluded)
  const remaining = unsentAudienceMembers(audience?.members, excluded, existingSends)
  const selectedSet = new Set(
    (selectedEmails || []).map((value) => parseEmailAddress(value)).filter(Boolean),
  )
  const recipients = selectedSet.size
    ? remaining.filter((row) => selectedSet.has(parseEmailAddress(row.email)))
    : remaining.slice(0, resolveBatchSize(batchSize, remaining.length))
  if (!recipients.length) {
    throw new Error(
      selectedSet.size
        ? 'None of the selected contacts can be sent. They may already have been mailed or sit on the exclusions list.'
        : 'Everyone sendable in this audience has already been sent this campaign.',
    )
  }

  const alreadySent = eligible.length - remaining.length
  const campaignName = campaign.name || template.name || 'Campaign'
  const templateName = template.name || campaign.templateName || ''

  const campaignPatch = {
    status: 'sending',
    sendVia,
    fromEmail: parseEmailAddress(fromEmail),
    fromName: fromName || '',
    deliveryReceiptRequested: Boolean(campaign.deliveryReceiptRequested),
    readReceiptRequested: Boolean(campaign.readReceiptRequested),
    'stats.targeted': eligible.length,
    templateName,
    audienceName: audience.name || campaign.audienceName || '',
  }
  if (!selectedSet.size && batchSize !== 'all') campaignPatch.batchSize = normalizeBatchSize(batchSize)
  await updateMailingCampaign(campaign.id, campaignPatch)

  onProgress?.({
    phase: 'start',
    batchTotal: recipients.length,
    remaining: remaining.length,
    alreadySent,
    targeted: eligible.length,
    rows: recipients.map((row) => ({
      email: row.email,
      name: row.name || '',
      status: 'pending',
      error: '',
    })),
  })

  let batchSent = 0
  let batchFailed = 0
  const pauseMs = sendVia === 'graph' ? 750 : 180

  for (let i = 0; i < recipients.length; i += 1) {
    const recipient = recipients[i]
    const email = parseEmailAddress(recipient.email)
    onProgress?.({
      phase: 'recipient',
      index: i + 1,
      batchTotal: recipients.length,
      email,
      name: recipient.name || '',
      status: 'sending',
      remaining: remaining.length - i,
      alreadySent,
    })

    const sendId = await createMailingSend({
      campaignId: campaign.id,
      email,
      name: recipient.name,
      company: recipient.company,
      status: 'queued',
    })

    const subject = applyMergeTags(template.subject, recipient)
    const sentAt = new Date().toISOString()
    let status = 'sent'
    let error = ''

    try {
      const html = buildCampaignEmail({
        htmlBody: template.htmlBody,
        contact: recipient,
        sendId,
        origin,
        layout: template.layout,
      })
      if (sendVia === 'graph') {
        await sendGraphMail(graphToken, {
          toEmail: email,
          toName: recipient.name,
          subject,
          html,
          fromEmail,
          fromName,
          deliveryReceiptRequested: Boolean(campaign.deliveryReceiptRequested),
          readReceiptRequested: Boolean(campaign.readReceiptRequested),
        })
      } else {
        await sendViaSendGrid({
          toEmail: email,
          toName: recipient.name,
          subject,
          html,
          fromEmail,
          fromName,
          customArgs: {
            campaign_id: campaign.id,
            send_id: sendId,
            contact_email: email,
          },
        })
      }
      await updateMailingSend(sendId, { status: 'sent', error: '', sendVia, sentAt, subject })
      batchSent += 1
    } catch (err) {
      status = 'failed'
      error = err instanceof Error ? err.message : String(err)
      batchFailed += 1
      await updateMailingSend(sendId, {
        status: 'failed',
        error,
        sendVia,
        sentAt,
        subject,
      })
    }

    try {
      await appendContactMailing(email, {
        at: sentAt,
        campaignId: campaign.id,
        campaignName,
        templateName,
        subject,
        status,
        sendVia,
        sendId,
        error,
      })
    } catch {
      /* master-list history is best-effort */
    }

    onProgress?.({
      phase: 'recipient',
      index: i + 1,
      batchTotal: recipients.length,
      email,
      name: recipient.name || '',
      status,
      error,
      at: sentAt,
      batchSent,
      batchFailed,
      remaining: remaining.length - i - 1,
      alreadySent: alreadySent + batchSent,
    })

    if (i < recipients.length - 1) await sleep(pauseMs)
  }

  const allSends = await listSendsForCampaign(campaign.id)
  const leftover = unsentAudienceMembers(audience?.members, excluded, allSends).length
  const uniqueSent = sentEmailsFromSends(allSends)
  const uniqueFailed = new Set(
    allSends
      .filter((row) => row.status === 'failed' && !uniqueSent.has(parseEmailAddress(row.email)))
      .map((row) => parseEmailAddress(row.email))
      .filter(Boolean),
  )
  const totalSent = uniqueSent.size
  const campaignStatus = leftover > 0 ? 'partial' : totalSent === 0 ? 'failed' : 'sent'
  await updateMailingCampaign(campaign.id, {
    status: campaignStatus,
    sentAt: new Date().toISOString(),
    lastBatchAt: new Date().toISOString(),
    'stats.targeted': eligible.length,
    'stats.sent': totalSent,
    'stats.failed': uniqueFailed.size,
  })

  onProgress?.({
    phase: 'done',
    batchTotal: recipients.length,
    batchSent,
    batchFailed,
    remaining: leftover,
    alreadySent: totalSent,
    targeted: eligible.length,
    done: true,
  })

  return {
    sent: batchSent,
    failed: batchFailed,
    targeted: eligible.length,
    remaining: leftover,
    alreadySent: totalSent,
    status: campaignStatus,
    sendVia,
    batchSize: recipients.length,
  }
}
