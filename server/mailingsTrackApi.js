import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { parseEmailAddress } from '../src/emailAddress.js'
import { getServerFirestore } from './firebaseApp.js'
import { readJsonBody, sendJson } from './httpUtils.js'
import { getSendGridConfig, sendSendGridMail } from './sendgridMail.js'

const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

const SETTINGS = 'boardSettings'

function sendRef(db, sendId) {
  return doc(db, SETTINGS, `mailingSend_${sendId}`)
}

function campaignRef(db, campaignId) {
  return doc(db, SETTINGS, `mailingCampaign_${campaignId}`)
}

function queryParams(req) {
  const host = req.headers.host || 'localhost'
  const proto = req.headers['x-forwarded-proto'] || 'http'
  return new URL(req.url || '/', `${proto}://${host}`).searchParams
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function sendHtml(res, status, html) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(html)
}

async function loadSend(db, sendId) {
  if (!sendId) return null
  const snap = await getDoc(sendRef(db, sendId))
  if (!snap.exists()) return null
  return { id: sendId, ...snap.data() }
}

function alreadyHasEvent(send, type) {
  return Array.isArray(send.events) && send.events.some((e) => e.type === type)
}

async function appendEvent(db, send, type, extra = {}) {
  const events = Array.isArray(send.events) ? send.events.slice(-40) : []
  events.push({ type, at: new Date().toISOString(), ...extra })
  const patch = {
    events,
    updatedAt: serverTimestamp(),
  }
  if (type === 'opened' && send.status !== 'clicked') {
    patch.status = send.status === 'failed' ? send.status : 'opened'
    if (!send.openedAt) patch.openedAt = serverTimestamp()
  }
  if (type === 'clicked') {
    patch.status = 'clicked'
    patch.lastClickUrl = extra.url || send.lastClickUrl || ''
    if (!send.clickedAt) patch.clickedAt = serverTimestamp()
    if (!send.openedAt) patch.openedAt = serverTimestamp()
  }
  await updateDoc(sendRef(db, send.id), patch)
}

async function bumpCampaign(db, campaignId, field) {
  if (!campaignId) return
  try {
    const ref = campaignRef(db, campaignId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const stats = { ...(snap.data().stats || {}) }
    await updateDoc(ref, {
      [`stats.${field}`]: (Number(stats[field]) || 0) + 1,
      updatedAt: serverTimestamp(),
    })
  } catch {
    /* campaign may have been deleted */
  }
}

async function handleOpen(req, res, db) {
  const sid = queryParams(req).get('sid') || ''
  const send = await loadSend(db, sid)
  if (send && !alreadyHasEvent(send, 'opened')) {
    await appendEvent(db, send, 'opened')
    await bumpCampaign(db, send.campaignId, 'opened')
  }
  res.statusCode = 200
  res.setHeader('Content-Type', 'image/gif')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  res.end(PIXEL_GIF)
}

async function handleClick(req, res, db) {
  const params = queryParams(req)
  const sid = params.get('sid') || ''
  const url = params.get('url') || ''
  const send = await loadSend(db, sid)
  const safeUrl = /^https?:\/\//i.test(url) ? url : ''
  if (send && safeUrl && !alreadyHasEvent(send, 'clicked')) {
    await appendEvent(db, send, 'clicked', { url: safeUrl })
    await bumpCampaign(db, send.campaignId, 'clicked')
  }
  res.statusCode = 302
  res.setHeader('Location', safeUrl || '/')
  res.end()
}

function mailingUnsubscribePage({ title, heading, bodyHtml, form = '', done = false }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin:0; background:#f4f5f7; color:#172b4d; font-family:Arial,Helvetica,sans-serif; }
    .wrap { max-width:32rem; margin:0 auto; padding:3rem 1.25rem; }
    .card { background:#fff; border:1px solid #dfe1e6; border-radius:8px; padding:1.75rem 1.6rem 1.6rem; }
    .brand { margin:0 0 1rem; font-size:0.85rem; font-weight:700; letter-spacing:0.08em; color:#253858; }
    h1 { margin:0 0 0.85rem; font-size:1.45rem; line-height:1.3; }
    p { margin:0 0 0.85rem; line-height:1.55; }
    .muted { color:#5e6c84; font-size:0.9rem; }
    .btn { display:inline-block; margin-top:0.5rem; padding:0.65rem 1.1rem; background:#0c66e4; color:#fff; border:0; border-radius:4px; font:inherit; font-weight:700; cursor:pointer; }
    .btn:hover { background:#0055cc; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <p class="brand">XLS EXPERTS</p>
      <h1>${escapeHtml(heading)}</h1>
      ${bodyHtml}
      ${form}
      ${done ? '' : '<p class="muted">If you did not mean to unsubscribe, close this page. You will stay on the list.</p>'}
    </div>
  </div>
</body>
</html>`
}

async function readRequestParams(req) {
  const params = Object.fromEntries(queryParams(req).entries())
  if (req.method !== 'POST') return params
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  const ctype = String(req.headers['content-type'] || '')
  if (ctype.includes('application/json')) {
    try {
      return { ...params, ...(raw ? JSON.parse(raw) : {}) }
    } catch {
      return params
    }
  }
  return { ...params, ...Object.fromEntries(new URLSearchParams(raw).entries()) }
}

async function addToExclusionsAndRemoveFromMaster(db, { email, sendId, campaignId, name }) {
  const exclRef = doc(db, SETTINGS, 'mailingExclusions')
  const exclSnap = await getDoc(exclRef)
  const items = Array.isArray(exclSnap.data()?.items) ? exclSnap.data().items.slice() : []
  if (!items.some((row) => parseEmailAddress(row.email) === email)) {
    items.push({
      email,
      name: name || '',
      source: 'unsubscribe',
      sendId: sendId || '',
      campaignId: campaignId || '',
      at: new Date().toISOString(),
    })
  }
  await setDoc(
    exclRef,
    {
      items,
      updatedAt: serverTimestamp(),
      ...(exclSnap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  )

  try {
    const masterRef = doc(db, SETTINGS, 'clientEmails')
    const masterSnap = await getDoc(masterRef)
    if (masterSnap.exists()) {
      const masterItems = Array.isArray(masterSnap.data()?.items) ? masterSnap.data().items : []
      const next = masterItems.filter((row) => parseEmailAddress(row.email) !== email)
      await setDoc(masterRef, { items: next, updatedAt: serverTimestamp() }, { merge: true })
    }
  } catch {
    /* master list update is best-effort */
  }
}

function asEmail(value) {
  const parsed = parseEmailAddress(value)
  return parsed.includes('@') ? parsed : ''
}

/** Accept ?email=addr, ?addr, or a query key that is itself an email. */
function resolveUnsubscribeEmail(params, req) {
  const named = asEmail(params.email)
  if (named) return named

  const url = String(req.url || '')
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
  const firstPart = q.split('&')[0] || ''
  if (firstPart && !firstPart.includes('=')) {
    try {
      const bare = asEmail(decodeURIComponent(firstPart))
      if (bare) return bare
    } catch {
      /* ignore malformed encoding */
    }
  }

  for (const [key, value] of Object.entries(params)) {
    if (key === 'sid') continue
    const fromKey = asEmail(key)
    if (fromKey) return fromKey
    const fromVal = asEmail(value)
    if (fromVal) return fromVal
  }
  return ''
}

async function handleUnsubscribe(req, res, db) {
  const params = await readRequestParams(req)
  const sid = String(params.sid || '')
  const send = await loadSend(db, sid)
  const email = resolveUnsubscribeEmail(params, req) || asEmail(send?.email)

  if (req.method !== 'POST') {
    const emailLine = email
      ? `<p>This will unsubscribe <strong>${escapeHtml(email)}</strong> from marketing emails sent by XLS Experts.</p>`
      : '<p>This will unsubscribe you from marketing emails sent by XLS Experts.</p>'
    const form = email
      ? `<form method="post" action="/unsubscribe">
           <input type="hidden" name="sid" value="${escapeHtml(sid)}">
           <input type="hidden" name="email" value="${escapeHtml(email)}">
           <button class="btn" type="submit">Confirm unsubscribe</button>
         </form>`
      : `<form method="post" action="/unsubscribe">
           <input type="hidden" name="sid" value="${escapeHtml(sid)}">
           <p><label for="unsub-email">Email address</label></p>
           <p><input id="unsub-email" type="email" name="email" required placeholder="you@example.com" style="width:100%;max-width:20rem;padding:0.5rem 0.65rem;font:inherit;border:1px solid #dfe1e6;border-radius:4px;"></p>
           <button class="btn" type="submit">Confirm unsubscribe</button>
         </form>`
    sendHtml(
      res,
      200,
      mailingUnsubscribePage({
        title: 'Unsubscribe — XLS Experts',
        heading: 'You are unsubscribing from XLS Experts emails',
        bodyHtml: `${emailLine}
          <p>After you confirm, we will stop sending campaign emails to this address and remove it from our master client list. You may still hear from us about existing project work if we are already in contact with you.</p>`,
        form,
      }),
    )
    return
  }

  if (!email) {
    sendHtml(
      res,
      400,
      mailingUnsubscribePage({
        title: 'Unsubscribe — XLS Experts',
        heading: 'We could not complete the unsubscribe',
        bodyHtml: '<p>This link is missing the email address. Please use the unsubscribe link from the bottom of an XLS Experts email.</p>',
        done: true,
      }),
    )
    return
  }

  await addToExclusionsAndRemoveFromMaster(db, {
    email,
    sendId: sid,
    campaignId: send?.campaignId || '',
    name: send?.name || '',
  })

  if (send && !alreadyHasEvent(send, 'unsubscribed')) {
    await appendEvent(db, send, 'unsubscribed')
    await bumpCampaign(db, send.campaignId, 'unsubscribed')
  }

  sendHtml(
    res,
    200,
    mailingUnsubscribePage({
      title: 'Unsubscribed — XLS Experts',
      heading: 'You have been unsubscribed',
      bodyHtml: `<p>You will no longer receive marketing emails from XLS Experts${email ? ` at <strong>${escapeHtml(email)}</strong>` : ''}.</p>
        <p class="muted">If this was a mistake, contact us at mike@xlsexperts.co.nz and we can add you back.</p>`,
      done: true,
    }),
  )
}

/** Handle /unsubscribe and /api/mailings/*. Returns true if handled. */
export async function handleMailingsApi(req, res, pathname, env = process.env) {
  const isPublicUnsubscribe = pathname === '/unsubscribe'
  if (!pathname.startsWith('/api/mailings/') && !isPublicUnsubscribe) return false

  try {
    if (isPublicUnsubscribe && (req.method === 'GET' || req.method === 'POST')) {
      const db = getServerFirestore(env)
      await handleUnsubscribe(req, res, db)
      return true
    }
    if (pathname === '/api/mailings/config' && req.method === 'GET') {
      const config = getSendGridConfig(env)
      sendJson(res, 200, {
        configured: config.configured,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        testRecipient: config.testRecipient,
        setupHint: config.setupHint || '',
        runtime: config.runtime || 'local',
      })
      return true
    }

    if (pathname === '/api/mailings/send' && req.method === 'POST') {
      const body = await readJsonBody(req)
      try {
        const result = await sendSendGridMail({
          toEmail: body.toEmail,
          toName: body.toName,
          subject: body.subject,
          html: body.html,
          fromEmail: body.fromEmail,
          fromName: body.fromName,
          customArgs: body.customArgs || {},
        })
        sendJson(res, 200, result)
      } catch (err) {
        sendJson(res, 502, {
          error: err instanceof Error ? err.message : String(err),
          diagnostics: err.diagnostics || null,
        })
      }
      return true
    }

    const db = getServerFirestore(env)
    if (pathname === '/api/mailings/track/open' && req.method === 'GET') {
      await handleOpen(req, res, db)
      return true
    }
    if (pathname === '/api/mailings/track/click' && req.method === 'GET') {
      await handleClick(req, res, db)
      return true
    }
    if (
      pathname === '/api/mailings/unsubscribe' &&
      (req.method === 'GET' || req.method === 'POST')
    ) {
      await handleUnsubscribe(req, res, db)
      return true
    }
    sendJson(res, 404, { error: 'Mailings API route not found.' })
    return true
  } catch (err) {
    if (pathname.includes('/track/open')) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'image/gif')
      res.end(PIXEL_GIF)
      return true
    }
    if (isPublicUnsubscribe) {
      sendHtml(
        res,
        500,
        mailingUnsubscribePage({
          title: 'Unsubscribe — XLS Experts',
          heading: 'Unsubscribe is temporarily unavailable',
          bodyHtml: '<p>Please try again in a few minutes, or contact us at mike@xlsexperts.co.nz.</p>',
          done: true,
        }),
      )
      return true
    }
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    return true
  }
}
