import { CLIENT_MAIL_ROOT_SEGMENTS } from './mailFolderConfig.js'
import { parseEmailAddress, recipientAddressFromGraph, senderAddressFromGraph } from './emailAddress.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'

function normalizeEmail(email) {
  return parseEmailAddress(email)
}

async function graphGet(accessToken, url, { headers: extraHeaders } = {}) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...extraHeaders,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Graph request failed (${res.status})`)
  }
  return res.json()
}

export async function getRootInboxFolderId(accessToken) {
  const data = await graphGet(
    accessToken,
    `${GRAPH}/me/mailFolders/inbox?$select=id`,
  )
  return data.id
}

export async function getMessageParentFolderId(accessToken, messageId) {
  const data = await graphGet(
    accessToken,
    `${GRAPH}/me/messages/${encodeURIComponent(messageId)}?$select=parentFolderId`,
  )
  return data.parentFolderId || null
}

/** All Graph message ids in a mail folder (paginated, id only). */
export async function fetchMailFolderMessageIds(
  accessToken,
  folderId,
  { maxMessages = 2000 } = {},
) {
  const ids = []
  let url = new URL(`${GRAPH}/me/mailFolders/${folderId}/messages`)
  url.searchParams.set('$top', '100')
  url.searchParams.set('$orderby', 'receivedDateTime desc')
  url.searchParams.set('$select', 'id')

  while (url && ids.length < maxMessages) {
    const data = await graphGet(accessToken, url.toString())
    for (const msg of data.value || []) {
      if (msg.id) ids.push(msg.id)
    }
    url = ids.length >= maxMessages ? null : data['@odata.nextLink'] || null
  }

  return ids
}

/** True only when the message sits in the root Inbox folder (not a client subfolder). */
export async function isMessageInRootInbox(accessToken, messageId, rootInboxId) {
  return resolveMessageInInbox(accessToken, messageId, { rootInboxId })
}

/** True when the message is still in the root Inbox (not filed to the client folder). */
export async function resolveMessageInInbox(
  accessToken,
  messageId,
  { rootInboxId, clientFolderId } = {},
) {
  const rootId = rootInboxId || (await getRootInboxFolderId(accessToken))
  const parentId = await getMessageParentFolderId(accessToken, messageId)
  if (!parentId) return false
  if (clientFolderId && parentId === clientFolderId) return false
  return parentId === rootId
}

async function listChildFoldersRaw(accessToken, parentFolderId) {
  const folders = []
  let url = `${GRAPH}/me/mailFolders/${parentFolderId}/childFolders?$top=100&$select=id,displayName,totalItemCount,childFolderCount`

  while (url) {
    const data = await graphGet(accessToken, url)
    folders.push(...(data.value || []))
    url = data['@odata.nextLink'] || null
  }

  return folders
}

function findFolderByName(folders, name) {
  const target = name.trim().toLowerCase()
  return folders.find((f) => (f.displayName || '').trim().toLowerCase() === target)
}

/** Resolve a nested folder path starting from the well-known Inbox folder. */
export async function resolveMailFolderPath(accessToken, segments) {
  if (!segments?.length) throw new Error('Folder path is empty.')

  let folderId = 'inbox'
  let path = segments[0]

  for (let i = 1; i < segments.length; i += 1) {
    const children = await listChildFoldersRaw(accessToken, folderId)
    const match = findFolderByName(children, segments[i])
    if (!match) {
      throw new Error(`Outlook folder not found: ${segments.slice(0, i + 1).join('/')}`)
    }
    folderId = match.id
    path = `${path}/${match.displayName}`
  }

  return { id: folderId, path }
}

/** List client subfolders under Inbox/DEV QUEUE for the folder picker. */
export async function listClientMailFolders(accessToken) {
  const root = await resolveMailFolderPath(accessToken, CLIENT_MAIL_ROOT_SEGMENTS)
  const children = await listChildFoldersRaw(accessToken, root.id)

  return children
    .map((f) => ({
      id: f.id,
      displayName: f.displayName,
      path: `${root.path}/${f.displayName}`,
      totalItemCount: f.totalItemCount ?? 0,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** Lead queue folder options: DEV QUEUE root plus its subfolders. */
export async function listLeadQueueFolderOptions(accessToken) {
  const root = await resolveMailFolderPath(accessToken, CLIENT_MAIL_ROOT_SEGMENTS)
  const rootMeta = await graphGet(
    accessToken,
    `${GRAPH}/me/mailFolders/${root.id}?$select=id,displayName,totalItemCount`,
  )
  const children = await listChildFoldersRaw(accessToken, root.id)

  const parentOption = {
    id: rootMeta.id,
    displayName: rootMeta.displayName || root.path.split('/').pop() || 'DEV QUEUE',
    path: root.path,
    totalItemCount: rootMeta.totalItemCount ?? 0,
    isQueueRoot: true,
  }

  const childOptions = children
    .map((f) => ({
      id: f.id,
      displayName: f.displayName,
      path: `${root.path}/${f.displayName}`,
      totalItemCount: f.totalItemCount ?? 0,
      isQueueRoot: false,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  return [parentOption, ...childOptions]
}

export function projectClientMailFolder(project) {
  const folder = project?.clientMailFolder
  if (!folder?.id) return null
  return {
    id: folder.id,
    displayName: folder.displayName || '',
    path: folder.path || folder.displayName || '',
  }
}

/** True when the card has no dedicated client subfolder under DEV QUEUE (queue-only or unset). */
export function projectNeedsClientFolder(project) {
  const folder = project?.clientMailFolder
  if (!folder?.id) return true
  const path = (folder.path || folder.displayName || '').trim()
  if (!path) return true
  const segments = path.split(/[/\\]/).map((s) => s.trim()).filter(Boolean)
  const queueIdx = segments.findIndex((s) => s.toLowerCase() === 'dev queue')
  if (queueIdx === -1) return false
  return queueIdx >= segments.length - 1
}

export function projectContactEmails(project) {
  const contacts = Array.isArray(project?.clientContacts) ? project.clientContacts : []
  const emails = contacts.map((c) => normalizeEmail(c.email)).filter(Boolean)
  const prospect = project?.prospectEmail ? normalizeEmail(project.prospectEmail) : ''
  if (prospect) emails.push(prospect)
  return [...new Set(emails)]
}

export function projectClientContacts(project) {
  return Array.isArray(project?.clientContacts) ? project.clientContacts : []
}

function recipientEntries(message, fields) {
  const entries = []
  for (const field of fields) {
    for (const r of message[field] || []) {
      const address = recipientAddressFromGraph(r)
      if (!address) continue
      entries.push({
        email: address,
        name: (r.emailAddress?.name || '').trim(),
      })
    }
  }
  return entries
}

/** Fetch messages from a folder with pagination (for harvest). */
export async function fetchFolderMessages(accessToken, folderId, { maxMessages = 500 } = {}) {
  const messages = []
  let url = new URL(`${GRAPH}/me/mailFolders/${folderId}/messages`)
  url.searchParams.set('$top', '100')
  url.searchParams.set('$orderby', 'receivedDateTime desc')
  url.searchParams.set('$select', 'id,toRecipients,ccRecipients,from')

  while (url && messages.length < maxMessages) {
    const data = await graphGet(accessToken, url.toString())
    messages.push(...(data.value || []))
    url = data['@odata.nextLink'] || null
  }

  return messages.slice(0, maxMessages)
}

function fromEntry(message) {
  const address = senderAddressFromGraph(message.from)
  if (!address) return []
  return [
    {
      email: address,
      name: (message.from?.emailAddress?.name || '').trim(),
    },
  ]
}

/**
 * Collect unique From, To, and Cc addresses from folder messages.
 * Excludes the signed-in mailbox and addresses already on the project.
 */
export function harvestToCcAddresses(messages, { excludeEmails = [] } = {}) {
  const exclude = new Set(excludeEmails.map(normalizeEmail).filter(Boolean))
  const byEmail = new Map()

  for (const msg of messages) {
    const entries = [
      ...fromEntry(msg),
      ...recipientEntries(msg, ['toRecipients', 'ccRecipients']),
    ]
    for (const entry of entries) {
      const key = normalizeEmail(entry.email)
      if (!key || exclude.has(key)) continue
      if (!byEmail.has(key)) {
        byEmail.set(key, { email: entry.email, name: entry.name })
      } else if (entry.name && !byEmail.get(key).name) {
        byEmail.get(key).name = entry.name
      }
    }
  }

  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email))
}

/**
 * Best-guess primary client contact from folder mail — prefers the most frequent external sender.
 */
export function pickPrimaryContactFromFolderMessages(messages, { excludeEmails = [] } = {}) {
  const exclude = new Set(excludeEmails.map(normalizeEmail).filter(Boolean))
  const fromCounts = new Map()
  const fromNames = new Map()
  const allCounts = new Map()
  const allNames = new Map()

  function bump(map, names, key, entry) {
    if (!key || exclude.has(key)) return
    map.set(key, (map.get(key) || 0) + 1)
    if (entry.name && !names.get(key)) names.set(key, entry.name)
  }

  for (const msg of messages) {
    for (const entry of fromEntry(msg)) {
      const key = normalizeEmail(entry.email)
      bump(fromCounts, fromNames, key, entry)
      bump(allCounts, allNames, key, entry)
    }
    for (const entry of recipientEntries(msg, ['toRecipients', 'ccRecipients'])) {
      const key = normalizeEmail(entry.email)
      bump(allCounts, allNames, key, entry)
    }
  }

  function pickBest(counts, names) {
    let best = null
    for (const [key, count] of counts) {
      if (
        !best ||
        count > best.count ||
        (count === best.count && key.localeCompare(best.email) < 0)
      ) {
        best = { email: key, count, name: names.get(key) || '' }
      }
    }
    if (!best) return null
    return { email: best.email, name: best.name }
  }

  return pickBest(fromCounts, fromNames) || pickBest(allCounts, allNames)
}

/** Best display name for a specific address from folder messages (prefers inbound sender name). */
function pickNameForEmail(messages, email) {
  const key = normalizeEmail(email)
  if (!key) return null

  for (const msg of messages) {
    const from = senderAddressFromGraph(msg.from)
    if (normalizeEmail(from) === key) {
      return { email: key, name: (msg.from?.emailAddress?.name || '').trim() }
    }
  }

  for (const msg of messages) {
    for (const entry of recipientEntries(msg, ['toRecipients', 'ccRecipients'])) {
      if (normalizeEmail(entry.email) === key) {
        return { email: key, name: entry.name || '' }
      }
    }
  }

  return { email: key, name: '' }
}

/** Append harvested addresses to clientContacts without duplicating by email. */
export function mergeHarvestedClientContacts(existingContacts, harvested) {
  const existing = Array.isArray(existingContacts) ? existingContacts : []
  const known = new Set(existing.map((c) => normalizeEmail(c.email)).filter(Boolean))
  const added = []

  const merged = [...existing]
  for (const h of harvested) {
    const key = normalizeEmail(h.email)
    if (!key || known.has(key)) continue
    known.add(key)
    const contact = { name: h.name || '', email: h.email, role: '', phone: '' }
    merged.push(contact)
    added.push(contact)
  }

  return { merged, added }
}

export async function harvestClientEmailsFromFolder(
  accessToken,
  folderId,
  existingContacts,
  {
    mailboxEmail = '',
    globalExcludeEmails = [],
    maxMessages = 500,
    /** When set, only messages involving these addresses are used (e.g. shared lead queue). */
    filterContactEmails = [],
    /** When set, primary contact is this address and its display name from matching mail. */
    primaryEmail = '',
  } = {},
) {
  const allMessages = await fetchFolderMessages(accessToken, folderId, { maxMessages })
  const contactFilter = [
    ...new Set((filterContactEmails || []).map(normalizeEmail).filter(Boolean)),
  ]
  let messages = allMessages
  if (contactFilter.length > 0) {
    messages = allMessages.filter((msg) => messageMatchesContacts(msg, contactFilter))
  }

  const existingEmails = (Array.isArray(existingContacts) ? existingContacts : []).map(
    (c) => c.email,
  )
  const excludeEmails = [
    ...existingEmails,
    mailboxEmail,
    ...globalExcludeEmails,
  ].filter(Boolean)
  const harvested = harvestToCcAddresses(messages, { excludeEmails })
  const { merged, added } = mergeHarvestedClientContacts(existingContacts, harvested)

  const primaryKey = normalizeEmail(primaryEmail)
  const primary = primaryKey
    ? pickNameForEmail(messages, primaryKey)
    : pickPrimaryContactFromFolderMessages(messages, { excludeEmails })

  return {
    merged,
    added,
    messagesScanned: allMessages.length,
    messagesMatched: messages.length,
    contactFilterApplied: contactFilter.length > 0,
    primary,
    harvested,
  }
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

function messageMatchesContacts(message, contactEmails) {
  const contactSet = new Set(contactEmails.map(normalizeEmail).filter(Boolean))
  if (!contactSet.size) return false
  return messageAddresses(message).some((addr) => contactSet.has(normalizeEmail(addr)))
}

/**
 * Fetch recent messages from a project's assigned client folder.
 * Optionally filters to messages involving contact emails when provided.
 */
export async function fetchProjectMessages(
  accessToken,
  contactEmails,
  { top = 100, folderId = null } = {},
) {
  const emails = contactEmails.map(normalizeEmail).filter(Boolean)

  const base = folderId
    ? `${GRAPH}/me/mailFolders/${folderId}/messages`
    : `${GRAPH}/me/messages`

  const url = new URL(base)
  url.searchParams.set('$top', String(top))
  url.searchParams.set('$orderby', 'receivedDateTime desc')
  url.searchParams.set(
    '$select',
    'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,webLink',
  )

  const data = await graphGet(accessToken, url.toString())
  const messages = data.value || []

  if (!emails.length) return messages
  return messages.filter((msg) => messageMatchesContacts(msg, emails))
}

export function formatMessageDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function normalizePlainText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function looksLikeHtml(text) {
  return (
    /<\/?[a-z][\s\S]*>/i.test(text) ||
    /<!--[\s\S]*?-->/.test(text) ||
    /@font-face/i.test(text)
  )
}

function htmlToPlainText(html) {
  const cleaned = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')

  const div = document.createElement('div')
  div.innerHTML = cleaned
  return normalizePlainText(div.textContent || div.innerText || '')
}

function bodyContentToPlainText(body) {
  if (!body?.content) return ''
  const content = body.content.trim()
  if (body.contentType === 'text' && !looksLikeHtml(content)) {
    return normalizePlainText(content)
  }
  return htmlToPlainText(content)
}

/** Fetch full message body as plain text (for in-app email preview). */
export async function fetchMessageBodyText(accessToken, messageId) {
  const url = `${GRAPH}/me/messages/${encodeURIComponent(messageId)}?$select=body`
  try {
    const data = await graphGet(accessToken, url, {
      headers: { Prefer: 'outlook.body-content-type="text"' },
    })
    return bodyContentToPlainText(data.body)
  } catch {
    const data = await graphGet(accessToken, url)
    return bodyContentToPlainText(data.body)
  }
}
