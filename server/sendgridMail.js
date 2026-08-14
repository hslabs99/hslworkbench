import { parseEmailAddress } from '../src/emailAddress.js'
import { loadLocalEnv } from './loadLocalEnv.js'

const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send'

function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function failWithDiagnostics(message, diagnostics) {
  const err = new Error(message)
  err.diagnostics = diagnostics
  throw err
}

export function getSendGridConfig(env = process.env) {
  loadLocalEnv()
  const apiKey = String(env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY || '').trim()
  const fromEmail = parseEmailAddress(env.SENDGRID_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || '')
  const fromName = String(env.SENDGRID_FROM_NAME || process.env.SENDGRID_FROM_NAME || '').trim()
  const testRecipient = parseEmailAddress(
    env.SENDGRID_TEST_RECIPIENT || process.env.SENDGRID_TEST_RECIPIENT || fromEmail,
  )
  return {
    configured: Boolean(apiKey && fromEmail),
    apiKey,
    fromEmail,
    fromName,
    testRecipient,
  }
}

export async function sendSendGridMail({
  toEmail,
  toName,
  subject,
  html,
  fromEmail,
  fromName,
  customArgs = {},
}) {
  const steps = []
  const started = Date.now()
  const mark = (id, label, status, detail) => {
    const existing = steps.find((row) => row.id === id)
    const row = existing || { id, label, status: 'running', detail: '' }
    row.label = label
    row.status = status
    row.detail = detail || ''
    if (!existing) steps.push(row)
  }

  const config = getSendGridConfig()
  mark(
    'credentials',
    'Load SendGrid credentials',
    config.apiKey && config.fromEmail ? 'ok' : 'fail',
    config.apiKey && config.fromEmail
      ? `API key present (${config.apiKey.length} chars) · default From ${config.fromEmail}`
      : !config.apiKey
        ? 'SENDGRID_API_KEY is missing.'
        : 'SENDGRID_FROM_EMAIL is missing.',
  )
  if (!config.apiKey) {
    failWithDiagnostics('SendGrid is not configured. Set SENDGRID_API_KEY in .env.local.', {
      ok: false,
      steps,
      durationMs: Date.now() - started,
    })
  }

  const to = parseEmailAddress(toEmail)
  const from = parseEmailAddress(fromEmail) || config.fromEmail
  const htmlBytes = Buffer.byteLength(String(html || ''), 'utf8')
  const text = htmlToPlainText(html) || subject

  if (!to) {
    mark('validate', 'Validate From, To, and subject', 'fail', 'Recipient email is missing.')
    failWithDiagnostics('Recipient email is missing.', { ok: false, steps, durationMs: Date.now() - started })
  }
  if (!subject) {
    mark('validate', 'Validate From, To, and subject', 'fail', 'Email subject is missing.')
    failWithDiagnostics('Email subject is missing.', { ok: false, steps, durationMs: Date.now() - started })
  }
  if (!from) {
    mark('validate', 'Validate From, To, and subject', 'fail', 'From address is missing.')
    failWithDiagnostics('From address is missing. Set it on the campaign or SENDGRID_FROM_EMAIL.', {
      ok: false,
      steps,
      durationMs: Date.now() - started,
    })
  }

  mark(
    'validate',
    'Validate From, To, and subject',
    'ok',
    `From ${from} → ${to} · ${htmlBytes} byte HTML · ${text.length} char plain-text part`,
  )

  const args = {}
  for (const [key, value] of Object.entries(customArgs)) {
    if (value == null || value === '') continue
    args[key] = String(value)
  }

  mark(
    'connect',
    'Connect to SendGrid mail API (SMTP delivery)',
    'running',
    `HTTPS POST ${SENDGRID_URL}`,
  )

  let res
  const connectStarted = Date.now()
  try {
    res = await fetch(SENDGRID_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: to, name: toName || to }],
            ...(Object.keys(args).length ? { custom_args: args } : {}),
          },
        ],
        from: {
          email: from,
          name: fromName || config.fromName || from,
        },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
        tracking_settings: {
          click_tracking: { enable: true, enable_text: false },
          open_tracking: { enable: true },
          subscription_tracking: { enable: false },
        },
      }),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    mark(
      'connect',
      'Connect to SendGrid mail API (SMTP delivery)',
      'fail',
      `Could not reach api.sendgrid.com: ${detail}`,
    )
    failWithDiagnostics(`Could not connect to SendGrid: ${detail}`, {
      ok: false,
      steps,
      from,
      to,
      subject,
      htmlBytes,
      endpoint: SENDGRID_URL,
      durationMs: Date.now() - started,
    })
  }

  const connectMs = Date.now() - connectStarted
  mark(
    'connect',
    'Connect to SendGrid mail API (SMTP delivery)',
    res.ok ? 'ok' : 'fail',
    res.ok
      ? `Connected · HTTP ${res.status} ${res.statusText || 'Accepted'} in ${connectMs}ms`
      : `HTTP ${res.status} ${res.statusText || ''} in ${connectMs}ms`,
  )

  const messageId = res.headers.get('x-message-id') || ''

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const detail = err.errors?.[0]?.message || err.message || `SendGrid send failed (${res.status})`
    mark('accepted', 'SendGrid accepted the message for SMTP delivery', 'fail', detail)
    failWithDiagnostics(detail, {
      ok: false,
      steps,
      from,
      to,
      subject,
      htmlBytes,
      statusCode: res.status,
      messageId,
      endpoint: SENDGRID_URL,
      durationMs: Date.now() - started,
    })
  }

  mark(
    'accepted',
    'SendGrid accepted the message for SMTP delivery',
    'ok',
    messageId
      ? `HTTP ${res.status} Accepted · message id ${messageId}`
      : `HTTP ${res.status} Accepted · queued for SMTP delivery`,
  )

  return {
    ok: true,
    steps,
    from,
    fromName: fromName || config.fromName || from,
    to,
    toName: toName || to,
    subject,
    htmlBytes,
    statusCode: res.status,
    messageId,
    endpoint: SENDGRID_URL,
    durationMs: Date.now() - started,
  }
}
