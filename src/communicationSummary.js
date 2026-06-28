import { getRootInboxFolderId, resolveMessageInInbox } from './graphMail.js'
import { isExcludedHarvestEmail } from './harvestExclusionsCleanup.js'
import { normalizeEmailAddress, recipientAddressFromGraph, senderAddressFromGraph } from './emailAddress.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'

const MESSAGE_SELECT =
  'id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,bodyPreview,hasAttachments,webLink,parentFolderId'

function isInRootInbox(message, rootInboxId) {
  if (!rootInboxId || !message.parentFolderId) return false
  return message.parentFolderId === rootInboxId
}

function tagInbound(message, rootInboxId, { inClientFolder = false, clientFolderId } = {}) {
  let inInbox = false
  if (inClientFolder) {
    inInbox = false
  } else if (clientFolderId && message.parentFolderId === clientFolderId) {
    inInbox = false
  } else {
    inInbox = isInRootInbox(message, rootInboxId)
  }
  return {
    ...message,
    direction: 'inbound',
    inInbox,
  }
}

function normalizeEmail(email) {
  return normalizeEmailAddress(email)
}

function isFromExcluded(message, excludeEmails) {
  const from = senderAddressFromGraph(message.from)
  return from && isExcludedHarvestEmail(from, excludeEmails)
}

async function graphGet(accessToken, url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Graph request failed (${res.status})`)
  }
  return res.json()
}

function formatAddressList(recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) return '—'
  return recipients
    .map((r) => recipientAddressFromGraph(r))
    .filter(Boolean)
    .join(', ')
}

function messageAddresses(message) {
  const addrs = []
  const from = senderAddressFromGraph(message.from)
  if (from) addrs.push(from)
  for (const r of message.toRecipients || []) {
    const a = recipientAddressFromGraph(r)
    if (a) addrs.push(a)
  }
  for (const r of message.ccRecipients || []) {
    const a = recipientAddressFromGraph(r)
    if (a) addrs.push(a)
  }
  return addrs
}

function messageDate(message) {
  if (message.direction === 'outbound') {
    return message.sentDateTime || message.receivedDateTime || null
  }
  return message.receivedDateTime || message.sentDateTime || null
}

function recipientAddresses(message) {
  const addrs = []
  for (const r of message.toRecipients || []) {
    const a = recipientAddressFromGraph(r)
    if (a) addrs.push(a)
  }
  for (const r of message.ccRecipients || []) {
    const a = recipientAddressFromGraph(r)
    if (a) addrs.push(a)
  }
  for (const r of message.bccRecipients || []) {
    const a = recipientAddressFromGraph(r)
    if (a) addrs.push(a)
  }
  return addrs
}

function outboundMatchesClientEmails(message, clientEmails) {
  const clientSet = new Set(clientEmails.map(normalizeEmail).filter(Boolean))
  if (!clientSet.size) return false
  return recipientAddresses(message).some((a) => clientSet.has(a))
}

/** Inbound: skip when sender is excluded. Outbound: skip when a client recipient is excluded. */
function isCommunicationExcluded(message, clientEmails, excludeEmails, { outbound = false } = {}) {
  if (outbound) {
    const clientSet = new Set(clientEmails.map(normalizeEmail).filter(Boolean))
    return recipientAddresses(message).some(
      (a) => clientSet.has(a) && isExcludedHarvestEmail(a, excludeEmails),
    )
  }
  return isFromExcluded(message, excludeEmails)
}

function messageMatchesClientEmails(message, clientEmails) {
  const clientSet = new Set(clientEmails.map(normalizeEmail).filter(Boolean))
  if (!clientSet.size) return false
  return messageAddresses(message).some((a) => clientSet.has(a))
}

function isFromClientEmail(message, clientEmails, excludeEmails = []) {
  const from = normalizeEmail(senderAddressFromGraph(message.from))
  if (!from || isExcludedHarvestEmail(from, excludeEmails)) return false
  const clientSet = new Set(clientEmails.map(normalizeEmail).filter(Boolean))
  return clientSet.has(from)
}

const DEFAULT_MAX_PER_SOURCE = 250
const DEEP_SCAN_MAX_PER_SOURCE = 2000

function messageTimestampMs(message, { preferSent = false } = {}) {
  const sent = message.sentDateTime ? new Date(message.sentDateTime).getTime() : NaN
  const received = message.receivedDateTime ? new Date(message.receivedDateTime).getTime() : NaN
  if (preferSent) {
    if (!Number.isNaN(sent)) return sent
    if (!Number.isNaN(received)) return received
  } else {
    if (!Number.isNaN(received)) return received
    if (!Number.isNaN(sent)) return sent
  }
  return 0
}

function messageMeetsCutoff(message, sinceMs, options = {}) {
  const t = messageTimestampMs(message, options)
  return t >= sinceMs
}

/** OData DateTimeOffset literal for Graph $filter (unquoted — quoted values are Edm.String). */
function toGraphODataDateTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function fetchMessagesSincePaged(accessToken, folderId, {
  sinceIso,
  sinceMs,
  maxMessages,
  dateField,
  preferSent,
}) {
  const cap = maxMessages
  const messages = []
  const url = new URL(`${GRAPH}/me/mailFolders/${folderId}/messages`)
  url.searchParams.set('$top', '100')
  url.searchParams.set('$orderby', `${dateField} desc`)
  url.searchParams.set('$select', MESSAGE_SELECT)

  const filterDate = sinceIso ? toGraphODataDateTime(sinceIso) : null
  if (filterDate) {
    url.searchParams.set('$filter', `${dateField} ge ${filterDate}`)
  }

  let next = url.toString()
  while (next && messages.length < cap) {
    const data = await graphGet(accessToken, next)
    const batch = data.value || []
    for (const msg of batch) {
      if (sinceMs && !messageMeetsCutoff(msg, sinceMs, { preferSent })) continue
      messages.push(msg)
      if (messages.length >= cap) break
    }
    if (messages.length >= cap) break
    next = data['@odata.nextLink'] || null
  }

  return messages.slice(0, cap)
}

export async function fetchMessagesSince(
  accessToken,
  folderId,
  sinceIso,
  {
    maxMessages = DEFAULT_MAX_PER_SOURCE,
    dateField = 'receivedDateTime',
    deepScan = false,
  } = {},
) {
  const cap = deepScan ? DEEP_SCAN_MAX_PER_SOURCE : maxMessages
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : 0
  const preferSent = dateField === 'sentDateTime'
  const opts = { sinceIso, sinceMs, maxMessages: cap, dateField, preferSent }

  if (!sinceIso) {
    return fetchMessagesSincePaged(accessToken, folderId, opts)
  }

  try {
    return await fetchMessagesSincePaged(accessToken, folderId, opts)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const filterFailed =
      msg.includes('Invalid filter') ||
      msg.includes('Incompatible types') ||
      msg.includes('binary operator')
    if (!filterFailed) throw err
    return fetchMessagesSincePaged(accessToken, folderId, { ...opts, sinceIso: null })
  }
}

async function fetchSentMessagesSince(accessToken, sinceIso, sinceMs, fetchOpts) {
  const opts = { ...fetchOpts, dateField: 'sentDateTime' }
  try {
    return await fetchMessagesSince(accessToken, 'sentitems', sinceIso, opts)
  } catch {
    const batch = await fetchMessagesSince(accessToken, 'sentitems', null, opts)
    return batch.filter((msg) => messageMeetsCutoff(msg, sinceMs, { preferSent: true }))
  }
}

async function fetchMessageAttachments(accessToken, messageId) {
  const data = await graphGet(
    accessToken,
    `${GRAPH}/me/messages/${messageId}/attachments?$select=name,contentType,size`,
  )
  return (data.value || [])
    .map((a) => a.name)
    .filter(Boolean)
}

const REQUEST_PATTERN =
  /\?|please (send|provide|confirm|review|advise|let me know)|could you|can you|would you|need you to|waiting for|action required|follow up|asap|urgent/i

/** Classify per inbound/outbound taxonomy from project comms spec. */
export function classifyCommunicationType(message, direction) {
  const text = `${message.subject || ''} ${message.bodyPreview || ''}`
  const hasAttachments = Boolean(message.hasAttachments)
  const looksLikeRequest = REQUEST_PATTERN.test(text)

  if (direction === 'outbound') {
    if (hasAttachments) return 'Release'
    if (looksLikeRequest) return 'Request'
    return 'Informative'
  }

  if (looksLikeRequest) return 'Request'
  return 'Informative'
}

export function buildCommunicationSummaryText(message) {
  const preview = (message.bodyPreview || '').trim().replace(/\s+/g, ' ')
  if (preview) return preview.length > 320 ? `${preview.slice(0, 317)}…` : preview
  return (message.subject || '').trim() || '(No preview available)'
}

export function formatCommunicationTypeLabel(direction, type, { inInbox = false } = {}) {
  const dir =
    direction === 'outbound' ? 'Outbound' : inInbox ? 'Inbound (Inbox)' : 'Inbound'
  return `${dir} · ${type}`
}

function buildSummaryRow(msg, attachmentNames) {
  const type = classifyCommunicationType(msg, msg.direction)
  return {
    id: msg.id,
    direction: msg.direction,
    inInbox: Boolean(msg.inInbox),
    from: senderAddressFromGraph(msg.from) || '—',
    to: formatAddressList(msg.toRecipients),
    cc: formatAddressList(msg.ccRecipients),
    bcc: formatAddressList(msg.bccRecipients),
    subject: msg.subject || '(no subject)',
    bodyPreview: buildCommunicationSummaryText(msg),
    summary: buildCommunicationSummaryText(msg),
    type,
    typeLabel: formatCommunicationTypeLabel(msg.direction, type, {
      inInbox: msg.inInbox,
    }),
    attachments: attachmentNames,
    webLink: msg.webLink || null,
    date: messageDate(msg),
    dateDisplay: messageDate(msg)
      ? new Date(messageDate(msg)).toLocaleString()
      : '—',
  }
}

/**
 * Fetch inbound (client folder), unfiled inbox (from client, not in folder), and outbound (Sent Items).
 */
export async function fetchCommunicationSummaryRows(
  accessToken,
  {
    clientFolderId,
    clientEmails,
    excludeEmails = [],
    days = 30,
    maxPerSource = DEFAULT_MAX_PER_SOURCE,
    deepScan = false,
  },
) {
  const emails = [...new Set((clientEmails || []).map((e) => e.trim()).filter(Boolean))]
  if (!clientFolderId) throw new Error('Assign a client mail folder first (Email Settings tab).')
  if (!emails.length) throw new Error('Add client email addresses first (Email Settings tab).')

  const since = new Date()
  since.setDate(since.getDate() - Math.max(1, Number(days) || 30))
  since.setHours(0, 0, 0, 0)
  const sinceIso = since.toISOString()
  const sinceMs = since.getTime()

  const fetchOpts = {
    maxMessages: maxPerSource,
    deepScan,
  }

  const rootInboxId = await getRootInboxFolderId(accessToken)

  const [folderMessages, inboxMessages, sentMessages, allFolderIds] = await Promise.all([
    fetchMessagesSince(accessToken, clientFolderId, sinceIso, {
      ...fetchOpts,
      dateField: 'receivedDateTime',
    }),
    fetchMessagesSince(accessToken, 'inbox', sinceIso, {
      ...fetchOpts,
      dateField: 'receivedDateTime',
    }),
    fetchSentMessagesSince(accessToken, sinceIso, sinceMs, fetchOpts),
    fetchMessagesSince(accessToken, clientFolderId, null, {
      maxMessages: deepScan ? DEEP_SCAN_MAX_PER_SOURCE : 500,
      deepScan: false,
    }),
  ])

  const inWindow = (msg, { preferSent = false } = {}) =>
    messageMeetsCutoff(msg, sinceMs, { preferSent })

  const filedIds = new Set(allFolderIds.map((m) => m.id))

  const inboundFiled = folderMessages
    .filter((msg) => inWindow(msg))
    .filter((msg) => isFromClientEmail(msg, emails, excludeEmails))
    .filter((msg) => !isFromExcluded(msg, excludeEmails))
    .map((msg) => tagInbound(msg, rootInboxId, { inClientFolder: true, clientFolderId }))

  const inboundInbox = inboxMessages
    .filter((msg) => inWindow(msg))
    .filter((msg) => isFromClientEmail(msg, emails, excludeEmails))
    .filter((msg) => !isFromExcluded(msg, excludeEmails))
    .filter((msg) => !filedIds.has(msg.id))
    .map((msg) => tagInbound(msg, rootInboxId, { clientFolderId }))
    .filter((msg) => msg.inInbox)

  const outbound = sentMessages
    .filter((msg) => inWindow(msg, { preferSent: true }))
    .filter((msg) => outboundMatchesClientEmails(msg, emails))
    .filter((msg) => !isCommunicationExcluded(msg, emails, excludeEmails, { outbound: true }))
    .map((msg) => ({ ...msg, direction: 'outbound', inInbox: false }))

  const combinedRaw = [...inboundFiled, ...inboundInbox, ...outbound]
  const combinedById = new Map()
  for (const msg of combinedRaw) {
    const existing = combinedById.get(msg.id)
    if (!existing) {
      combinedById.set(msg.id, msg)
      continue
    }
    if (existing.inInbox && !msg.inInbox) {
      combinedById.set(msg.id, msg)
    }
  }
  const combined = [...combinedById.values()]
  const attachmentLists = await Promise.all(
    combined.map(async (msg) => {
      if (!msg.hasAttachments) return []
      try {
        return await fetchMessageAttachments(accessToken, msg.id)
      } catch {
        return []
      }
    }),
  )

  const rows = combined.map((msg, i) => buildSummaryRow(msg, attachmentLists[i]))

  rows.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0
    const tb = b.date ? new Date(b.date).getTime() : 0
    return tb - ta
  })

  return {
    rows,
    stats: {
      inbound: inboundFiled.length,
      inboundInbox: inboundInbox.length,
      outbound: outbound.length,
      days: Math.max(1, Number(days) || 30),
      sinceIso,
      rootInboxId,
      clientFolderId,
      deepScan,
      maxPerSource: deepScan ? DEEP_SCAN_MAX_PER_SOURCE : maxPerSource,
      /** All message ids in the client folder (filed mail — not root Inbox). */
      filedMessageIds: [...filedIds],
    },
  }
}

