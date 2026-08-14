import { parseEmailAddress } from './emailAddress.js'
import {
  isUnsubscribeHref,
  mailingClickUrl,
  mailingOpenPixelUrl,
  mailingUnsubscribeHrefTemplate,
  mailingUnsubscribeUrl,
} from './mailingOrigin.js'

export const MERGE_TAGS = [
  { key: 'name', label: 'Name', sample: 'Alex' },
  { key: 'email', label: 'Email', sample: 'alex@example.com' },
  { key: 'company', label: 'Company', sample: 'Acme Ltd' },
  { key: 'contact', label: 'Contact', sample: 'Alex' },
  { key: 'unsubscribe', label: 'unsubscribe (link)', sample: 'unsubscribe' },
]

export const SAMPLE_MERGE_CONTACT = {
  name: 'Alex',
  contact: 'Alex',
  email: 'alex@example.com',
  company: 'Acme Ltd',
}

export const DEFAULT_TEMPLATE_HTML = `<h1>Hello {{name}},</h1>
<p>A short update from our team. Replace this copy with your campaign message — headings, fonts, colours, links, images, and buttons all come through in the inbox preview on the right.</p>
<p>Kind regards,<br>The team</p>`

const TAG_DEFAULT_STYLES = {
  P: 'margin:0 0 16px 0;font-size:16px;line-height:1.55;color:#222222;font-family:Arial,Helvetica,sans-serif;',
  H1: 'margin:0 0 16px 0;font-size:26px;line-height:1.25;color:#111111;font-family:Arial,Helvetica,sans-serif;font-weight:bold;',
  H2: 'margin:0 0 14px 0;font-size:22px;line-height:1.3;color:#111111;font-family:Arial,Helvetica,sans-serif;font-weight:bold;',
  H3: 'margin:0 0 12px 0;font-size:18px;line-height:1.35;color:#111111;font-family:Arial,Helvetica,sans-serif;font-weight:bold;',
  UL: 'margin:0 0 16px 0;padding:0 0 0 24px;font-size:16px;line-height:1.55;color:#222222;font-family:Arial,Helvetica,sans-serif;',
  OL: 'margin:0 0 16px 0;padding:0 0 0 24px;font-size:16px;line-height:1.55;color:#222222;font-family:Arial,Helvetica,sans-serif;',
  LI: 'margin:0 0 8px 0;',
  A: 'color:#0c66e4;text-decoration:underline;',
  IMG: 'max-width:100%;height:auto;border:0;display:block;',
  BLOCKQUOTE:
    'margin:0 0 16px 0;padding:8px 0 8px 16px;border-left:4px solid #d0d4dc;color:#444444;font-family:Arial,Helvetica,sans-serif;',
  HR: 'border:0;border-top:1px solid #d0d4dc;margin:24px 0;',
}

export function applyMergeTags(text, contact = {}) {
  const name = String(contact.name || contact.contact || '').trim()
  const values = {
    name,
    contact: String(contact.contact || name).trim(),
    email: parseEmailAddress(contact.email) || String(contact.email || '').trim(),
    company: String(contact.company || '').trim(),
  }
  return String(text || '')
    .replace(/\{\{\s*unsubscribe\s*\}\}/gi, '<a href="{{unsubscribe_url}}" class="email-unsubscribe">unsubscribe</a>')
    .replace(/\{\{\s*(name|email|company|contact)\s*\}\}/gi, (_, key) => {
      return values[String(key).toLowerCase()] ?? ''
    })
}

export function applyUnsubscribeUrl(html, url) {
  const href = url || mailingUnsubscribeUrl()
  const withPlaceholder = String(html || '').replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, href)
  const doc = new DOMParser().parseFromString(`<div id="email-root">${withPlaceholder}</div>`, 'text/html')
  const root = doc.getElementById('email-root')
  if (!root) return withPlaceholder
  root.querySelectorAll('a[href]').forEach((el) => {
    const current = el.getAttribute('href') || ''
    const labelledUnsubscribe = String(el.textContent || '').trim().toLowerCase() === 'unsubscribe'
    if (el.classList.contains('email-unsubscribe') || isUnsubscribeHref(current) || labelledUnsubscribe) {
      el.setAttribute('href', href)
      el.classList.add('email-unsubscribe')
    }
  })
  return root.innerHTML
}

/** Rewrite stored unsubscribe links to the hosted URL with a {{email}} placeholder. */
export function normalizeUnsubscribeHrefs(html) {
  return applyUnsubscribeUrl(html, mailingUnsubscribeHrefTemplate())
}

function htmlHasUnsubscribe(html) {
  const s = String(html || '')
  if (/email-unsubscribe/i.test(s)) return true
  if (/\/unsubscribe(\?|"|'|#|\s|>)/i.test(s)) return true
  if (/#unsubscribe/i.test(s)) return true
  return false
}

export function htmlToPlainText(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(String(html), 'text/html')
  return (doc.body?.textContent || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function convertCtasToTables(root, doc) {
  root.querySelectorAll('a.email-cta').forEach((el) => {
    const href = el.getAttribute('href') || 'https://'
    const label = el.textContent || 'Learn more'
    const color = el.getAttribute('data-color') || '#0c66e4'
    const wrapper = doc.createElement('div')
    wrapper.innerHTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto;">
  <tr>
    <td align="center" bgcolor="${color}" style="background-color:${color};border-radius:4px;">
      <a href="${href}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
    </td>
  </tr>
</table>`
    const table = wrapper.firstElementChild
    const parent = el.parentElement
    if (parent && parent.tagName === 'P' && parent.children.length === 1) {
      parent.replaceWith(table)
    } else {
      el.replaceWith(table)
    }
  })
}

function prependStyle(el, extra) {
  if (!el || !extra) return
  const current = el.getAttribute('style') || ''
  el.setAttribute('style', current ? `${extra}${current}` : extra)
}

function inlineEmailFragment(html) {
  const doc = new DOMParser().parseFromString(`<div id="email-root">${html || ''}</div>`, 'text/html')
  const root = doc.getElementById('email-root')
  if (!root) return html || ''

  convertCtasToTables(root, doc)

  root.querySelectorAll('*').forEach((el) => {
    const defaults = TAG_DEFAULT_STYLES[el.tagName]
    if (defaults) prependStyle(el, defaults)
    if (el.tagName === 'IMG') {
      el.setAttribute('border', '0')
      if (!el.getAttribute('alt')) el.setAttribute('alt', '')
    }
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || ''
      if (href.includes('{{')) {
        /* merge placeholders such as {{unsubscribe_url}} stay until send */
      } else if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('#') && !href.startsWith('mailto:')) {
        el.setAttribute('href', `https://${href}`)
      }
    }
    if (el.tagName === 'TABLE') {
      el.setAttribute('role', el.getAttribute('role') || 'presentation')
      el.setAttribute('cellpadding', el.getAttribute('cellpadding') || '0')
      el.setAttribute('cellspacing', el.getAttribute('cellspacing') || '0')
      el.setAttribute('border', el.getAttribute('border') || '0')
    }
  })

  return root.innerHTML
}

function rewriteTrackedLinks(html, sendId) {
  if (!sendId) return html
  const doc = new DOMParser().parseFromString(`<div id="email-root">${html || ''}</div>`, 'text/html')
  const root = doc.getElementById('email-root')
  if (!root) return html || ''

  root.querySelectorAll('a[href]').forEach((el) => {
    const href = el.getAttribute('href') || ''
    if (!href) return
    if (href.includes('/api/mailings/track/')) return
    if (isUnsubscribeHref(href)) return
    if (href.includes('{{')) return
    if (el.classList.contains('email-unsubscribe')) return
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return
    const tracked = mailingClickUrl(sendId, href)
    el.setAttribute('href', tracked)
  })

  return root.innerHTML
}

export function wrapEmailHtml(innerHtml, { pixelUrl = '', unsubscribeUrl = '' } = {}) {
  const fragment = inlineEmailFragment(innerHtml)
  const pixel = pixelUrl
    ? `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;" />`
    : ''
  const footer =
    unsubscribeUrl && !htmlHasUnsubscribe(fragment)
      ? `<p style="margin:24px 0 0 0;font-size:12px;line-height:1.4;color:#6b7280;font-family:Arial,Helvetica,sans-serif;"><a href="${unsubscribeUrl}" class="email-unsubscribe" style="color:#6b7280;text-decoration:underline;">unsubscribe</a></p>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title></title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f5f7;width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;">
          <tr>
            <td style="padding:32px 28px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#222222;">
              ${fragment}
              ${footer}
              ${pixel}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildCampaignEmail({ htmlBody, contact, sendId, origin, unsubscribeUrl: unsubscribeUrlRaw } = {}) {
  const unsubUrl =
    unsubscribeUrlRaw || mailingUnsubscribeUrl({ sendId, email: contact?.email || '' })
  const merged = applyUnsubscribeUrl(applyMergeTags(htmlBody, contact), unsubUrl)
  const pixelUrl = sendId ? mailingOpenPixelUrl(sendId) : ''
  const tracked = rewriteTrackedLinks(merged, sendId)
  return wrapEmailHtml(tracked, { pixelUrl, unsubscribeUrl: unsubUrl })
}

export function previewEmailHtml(htmlBody, contact = SAMPLE_MERGE_CONTACT) {
  const previewUnsub = mailingUnsubscribeUrl({ email: contact.email || '' })
  const merged = applyUnsubscribeUrl(applyMergeTags(htmlBody, contact), previewUnsub)
  return wrapEmailHtml(merged, { unsubscribeUrl: previewUnsub })
}

export function emailCtaButtonHtml({ href = 'https://', label = 'Learn more', color = '#0c66e4' } = {}) {
  const safeHref = href || 'https://'
  const safeLabel = label || 'Learn more'
  const safeColor = color || '#0c66e4'
  return `<p style="margin:16px 0;text-align:center;"><a href="${safeHref}" class="email-cta" data-color="${safeColor}" style="display:inline-block;padding:12px 24px;background-color:${safeColor};color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;border-radius:4px;">${safeLabel}</a></p>`
}
