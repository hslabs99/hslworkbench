import { graphSendScopes } from './msalConfig.js'
import { parseEmailAddress } from './emailAddress.js'
import { applyMergeTags, buildCampaignEmail } from './emailHtml.js'
import { sendGraphMail } from './graphMailSend.js'
import { loadMailingExclusionEmails } from './mailingExclusions.js'
import { mailingUnsubscribeUrl } from './mailingOrigin.js'
import {
  createMailingSend,
  uniqueMembers,
  updateMailingCampaign,
  updateMailingSend,
} from './mailings.js'

export function eligibleAudienceMembers(members, unsubscribed) {
  return uniqueMembers(members).filter((row) => {
    const email = parseEmailAddress(row.email)
    if (!email) return false
    if (unsubscribed?.has(email)) return false
    return true
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

function createTestReport({ onReport } = {}) {
  const report = {
    status: 'running',
    provider: 'sendgrid',
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
  onReport,
} = {}) {
  const { report, start, finish, emit } = createTestReport({ onReport })
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
    finish('recipient', 'fail', 'From address is missing. Set SENDGRID_FROM_EMAIL.')
    report.status = 'fail'
    report.error = 'From address is missing. Set SENDGRID_FROM_EMAIL.'
    emit()
    const err = new Error(report.error)
    err.report = report
    throw err
  }
  if (!to) {
    finish('recipient', 'fail', 'Set SENDGRID_TEST_RECIPIENT or SENDGRID_FROM_EMAIL.')
    report.status = 'fail'
    report.error = 'Set SENDGRID_TEST_RECIPIENT or SENDGRID_FROM_EMAIL.'
    emit()
    const err = new Error(report.error)
    err.report = report
    throw err
  }
  finish('recipient', 'ok', `From ${from} → ${to}`)

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
  const recipients = eligibleAudienceMembers(audience?.members, excluded)
  if (!recipients.length) {
    throw new Error('This audience has no sendable addresses (empty, invalid, or on the exclusions list).')
  }

  await updateMailingCampaign(campaign.id, {
    status: 'sending',
    sendVia,
    fromEmail: parseEmailAddress(fromEmail),
    fromName: fromName || '',
    'stats.targeted': recipients.length,
    'stats.sent': 0,
    'stats.failed': 0,
    templateName: template.name || campaign.templateName || '',
    audienceName: audience.name || campaign.audienceName || '',
  })

  let sent = 0
  let failed = 0
  const pauseMs = sendVia === 'graph' ? 750 : 180

  for (let i = 0; i < recipients.length; i += 1) {
    const recipient = recipients[i]
    onProgress?.({
      index: i + 1,
      total: recipients.length,
      email: recipient.email,
      sent,
      failed,
    })

    const sendId = await createMailingSend({
      campaignId: campaign.id,
      email: recipient.email,
      name: recipient.name,
      company: recipient.company,
      status: 'queued',
    })

    try {
      const html = buildCampaignEmail({
        htmlBody: template.htmlBody,
        contact: recipient,
        sendId,
        origin,
      })
      const subject = applyMergeTags(template.subject, recipient)
      if (sendVia === 'graph') {
        await sendGraphMail(graphToken, {
          toEmail: recipient.email,
          toName: recipient.name,
          subject,
          html,
        })
      } else {
        await sendViaSendGrid({
          toEmail: recipient.email,
          toName: recipient.name,
          subject,
          html,
          fromEmail,
          fromName,
          customArgs: {
            campaign_id: campaign.id,
            send_id: sendId,
            contact_email: recipient.email,
          },
        })
      }
      await updateMailingSend(sendId, { status: 'sent', error: '', sendVia })
      sent += 1
    } catch (err) {
      failed += 1
      await updateMailingSend(sendId, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        sendVia,
      })
    }

    await updateMailingCampaign(campaign.id, {
      'stats.sent': sent,
      'stats.failed': failed,
    })
    if (i < recipients.length - 1) await sleep(pauseMs)
  }

  const status = sent === 0 ? 'failed' : 'sent'
  await updateMailingCampaign(campaign.id, {
    status,
    sentAt: new Date().toISOString(),
    'stats.sent': sent,
    'stats.failed': failed,
    'stats.targeted': recipients.length,
  })

  onProgress?.({
    index: recipients.length,
    total: recipients.length,
    sent,
    failed,
    done: true,
  })

  return { sent, failed, targeted: recipients.length, status, sendVia }
}
