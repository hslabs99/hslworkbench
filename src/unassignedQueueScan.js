import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { fetchMessagesSince, buildCommunicationSummaryText } from './communicationSummary.js'
import { db } from './firebase.js'
import { normalizeEmailAddress, senderAddressFromGraph } from './emailAddress.js'
import { isExcludedHarvestEmail } from './harvestExclusionsCleanup.js'
import {
  isGenericProspectProjectName,
  resolveProspectProjectName,
} from './prospectProjectNaming.js'
import {
  indexProjectsByProspectEmail,
  isUnassignedSiloId,
  UNASSIGNED_SILO,
  UNASSIGNED_SILO_ID,
} from './unassignedQueue.js'
import { projectNeedsClientFolder } from './graphMail.js'
import { scanProjectCommunications } from './projectCommunicationScan.js'

function throwIfCancelled(isCancelled) {
  if (isCancelled?.()) throw new Error('Scan cancelled')
}

export async function discoverLeadQueueProspects(accessToken, {
  leadQueueFolders = [],
  leadQueueFolderId,
  excludeEmails = [],
  userEmail = '',
  days = 30,
  deepScan = false,
}) {
  const folders = leadQueueFolders.length
    ? leadQueueFolders.filter((f) => f?.id)
    : leadQueueFolderId
      ? [{ id: leadQueueFolderId }]
      : []
  if (!folders.length) {
    throw new Error('Choose at least one lead queue folder in Column settings.')
  }

  const since = new Date()
  since.setDate(since.getDate() - Math.max(1, Number(days) || 30))
  since.setHours(0, 0, 0, 0)
  const sinceIso = since.toISOString()

  const exclude = new Set(
    [
      ...excludeEmails.map((e) => normalizeEmailAddress(e)),
      normalizeEmailAddress(userEmail),
    ].filter(Boolean),
  )

  const byEmail = new Map()

  for (const folder of folders) {
    const messages = await fetchMessagesSince(accessToken, folder.id, sinceIso, {
      dateField: 'receivedDateTime',
      deepScan,
    })

    for (const msg of messages) {
      const from = normalizeEmailAddress(senderAddressFromGraph(msg.from))
      if (!from || exclude.has(from) || isExcludedHarvestEmail(from, excludeEmails)) continue
      const name = (msg.from?.emailAddress?.name || '').trim()
      const subject = (msg.subject || '').trim()
      const leadBody = buildCommunicationSummaryText(msg)
      const received = msg.receivedDateTime ? new Date(msg.receivedDateTime).getTime() : 0
      const sourceFolder = folder.displayName
        ? folder
        : { id: folder.id, displayName: '', path: '' }

      if (!byEmail.has(from)) {
        byEmail.set(from, {
          email: from,
          name,
          leadSubject: subject,
          leadBody,
          leadDate: received,
          sourceFolder,
        })
      } else {
        const entry = byEmail.get(from)
        if (name && !entry.name) entry.name = name
        if (received >= (entry.leadDate || 0)) {
          entry.leadSubject = subject
          entry.leadBody = leadBody
          entry.leadDate = received
          entry.sourceFolder = sourceFolder
        }
      }
    }
  }

  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email))
}

async function buildProspectProjectPatch(
  prospect,
  existing,
  leadQueueFolder,
  { promptOverrides, refreshGenericName = false },
) {
  const email = normalizeEmailAddress(prospect.email)
  const contactName = prospect.name || ''
  const patch = {}

  if (
    leadQueueFolder?.id &&
    projectNeedsClientFolder(existing) &&
    existing.clientMailFolder?.id !== leadQueueFolder.id
  ) {
    patch.clientMailFolder = leadQueueFolder
  }

  const resolvedContactName = contactName || existing.clientContacts?.[0]?.name || ''
  if (resolvedContactName && resolvedContactName !== existing.clientContacts?.[0]?.name) {
    patch.clientContacts = [{ name: resolvedContactName, email, role: '', phone: '' }]
  }

  const shouldName =
    refreshGenericName ||
    isGenericProspectProjectName(existing.projectName, email, resolvedContactName)
  if (shouldName && (prospect.leadSubject || prospect.leadBody)) {
    const named = await resolveProspectProjectName(prospect, { promptOverrides })
    if (
      named.projectName &&
      !isGenericProspectProjectName(named.projectName, email, resolvedContactName)
    ) {
      patch.projectName = named.projectName
      if (named.description && !existing.description) {
        patch.description = named.description
      }
    }
  }

  return patch
}

export async function ensureProspectProject(
  prospect,
  leadQueueFolder,
  { unassignedByEmail, assignedEmails, projectByEmail, promptOverrides, refreshGenericName = false },
) {
  const email = normalizeEmailAddress(prospect.email)
  if (!email) {
    return { project: null, created: false, skipped: true, reason: 'no_email' }
  }

  if (assignedEmails.has(email)) {
    const existing = projectByEmail?.get(email)
    if (!existing) {
      return { project: null, created: false, skipped: true, reason: 'already_assigned' }
    }

    const patch = await buildProspectProjectPatch(prospect, existing, leadQueueFolder, {
      promptOverrides,
      refreshGenericName,
    })

    if (Object.keys(patch).length) {
      await updateDoc(doc(db, 'projects', existing.id), {
        ...patch,
        updatedAt: serverTimestamp(),
      })
      const updated = { ...existing, ...patch }
      projectByEmail?.set(email, updated)
      return { project: updated, created: false, skipped: false, reason: 'already_assigned' }
    }

    return { project: existing, created: false, skipped: false, reason: 'already_assigned' }
  }

  const contactName = prospect.name || ''
  const existing = unassignedByEmail.get(email)
  if (existing) {
    const patch = await buildProspectProjectPatch(prospect, existing, leadQueueFolder, {
      promptOverrides,
      refreshGenericName,
    })

    if (Object.keys(patch).length) {
      await updateDoc(doc(db, 'projects', existing.id), {
        ...patch,
        updatedAt: serverTimestamp(),
      })
      const updated = { ...existing, ...patch }
      unassignedByEmail.set(email, updated)
      projectByEmail?.set(email, updated)
      return { project: updated, created: false, skipped: false }
    }
    return { project: existing, created: false, skipped: false }
  }

  // Another card may already own this email outside the unassigned map.
  const owned = projectByEmail?.get(email)
  if (owned) {
    return { project: owned, created: false, skipped: false, reason: 'already_assigned' }
  }

  const named = await resolveProspectProjectName(prospect, { promptOverrides })
  const displayName = named.projectName || contactName || email
  const docData = {
    projectName: displayName,
    clientCompany: contactName || '',
    description: named.description || '',
    isProspectLead: true,
    prospectEmail: email,
    clientContacts: [{ name: prospect.name || '', email, role: '', phone: '' }],
    clientMailFolder: leadQueueFolder,
    siloId: UNASSIGNED_SILO_ID,
    status: UNASSIGNED_SILO.title,
    sortOrder: Date.now(),
    archived: false,
    visibleOnWorkbench: true,
    techStack: [],
    sectors: [],
    attention: 'clear',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const ref = await addDoc(collection(db, 'projects'), docData)
  const project = { id: ref.id, ...docData }
  unassignedByEmail.set(email, project)
  projectByEmail?.set(email, project)
  return { project, created: true, skipped: false }
}

/**
 * Scan lead queue folder(s) + Sent Items per prospect card (one card per unique sender).
 */
export async function runUnassignedQueueScan({
  accessToken,
  leadQueueFolders = [],
  leadQueueFolder,
  existingProjects = [],
  excludeEmails = [],
  userEmail = '',
  days = 30,
  deepScan = false,
  forceReanalyse = false,
  batchSize = 12,
  promptOverrides = null,
  onRecordClientMailScan,
  onProgress,
  isCancelled,
}) {
  const folders = leadQueueFolders.length
    ? leadQueueFolders.filter((f) => f?.id)
    : leadQueueFolder?.id
      ? [leadQueueFolder]
      : []
  if (!folders.length) {
    throw new Error('Choose at least one lead queue folder in Column settings.')
  }

  const summary = {
    prospectsFound: 0,
    cardsCreated: 0,
    cardsSkippedAssigned: 0,
    cardsScanned: 0,
    newEmails: 0,
    emailsAlreadyStored: 0,
    errors: [],
    cancelled: false,
  }

  throwIfCancelled(isCancelled)
  onProgress?.({
    phase: 'discovering',
    cardIndex: 0,
    cardTotal: 0,
    cardName: '',
    emailIndex: 0,
    emailTotal: 0,
    emailSubject: '',
    percent: 2,
  })

  const prospects = await discoverLeadQueueProspects(accessToken, {
    leadQueueFolders: folders,
    excludeEmails,
    userEmail,
    days,
    deepScan,
  })
  summary.prospectsFound = prospects.length

  const { unassignedByEmail, assignedEmails, projectByEmail } =
    indexProjectsByProspectEmail(existingProjects)
  const projectsToScan = []
  const scanIds = new Set()

  throwIfCancelled(isCancelled)
  onProgress?.({
    phase: 'creating',
    cardIndex: 0,
    cardTotal: prospects.length,
    cardName: '',
    emailIndex: 0,
    emailTotal: 0,
    emailSubject: '',
    percent: 8,
  })

  for (let i = 0; i < prospects.length; i += 1) {
    throwIfCancelled(isCancelled)
    const prospect = prospects[i]
    const prospectFolder = prospect.sourceFolder || folders[0]
    const result = await ensureProspectProject(prospect, prospectFolder, {
      unassignedByEmail,
      assignedEmails,
      projectByEmail,
      promptOverrides,
      refreshGenericName: forceReanalyse,
    })
    if (result.skipped && !result.project) {
      if (result.reason === 'already_assigned') summary.cardsSkippedAssigned += 1
      continue
    }
    if (result.project) {
      if (result.reason === 'already_assigned') summary.cardsSkippedAssigned += 1
      else if (result.created) summary.cardsCreated += 1
      if (!scanIds.has(result.project.id)) {
        scanIds.add(result.project.id)
        projectsToScan.push(result.project)
      }
    }
    onProgress?.({
      phase: 'creating',
      cardIndex: i + 1,
      cardTotal: prospects.length,
      cardName: prospect.email,
      emailIndex: 0,
      emailTotal: 0,
      emailSubject: '',
      percent: 8 + Math.round(((i + 1) / Math.max(prospects.length, 1)) * 12),
    })
  }

  for (const p of existingProjects || []) {
    if (!isUnassignedSiloId(p.siloId) || !p.id || scanIds.has(p.id)) continue
    const email = normalizeEmailAddress(p.prospectEmail || p.clientContacts?.[0]?.email)
    if (email && assignedEmails.has(email)) continue
    scanIds.add(p.id)
    projectsToScan.push(p)
  }

  const cardTotal = projectsToScan.length
  if (cardTotal === 0) {
    onProgress?.({
      phase: 'complete',
      cardIndex: 0,
      cardTotal: 0,
      cardName: '',
      emailIndex: 0,
      emailTotal: 0,
      emailSubject: '',
      percent: 100,
    })
    return summary
  }

  for (let cardIndex = 0; cardIndex < cardTotal; cardIndex += 1) {
    throwIfCancelled(isCancelled)
    const project = projectsToScan[cardIndex]
    const cardName = project.projectName || project.prospectEmail || 'Prospect'

    onProgress?.({
      phase: 'fetching',
      cardIndex: cardIndex + 1,
      cardTotal,
      cardName,
      emailIndex: 0,
      emailTotal: 0,
      emailSubject: '',
      percent: 20 + Math.round((cardIndex / cardTotal) * 75),
    })

    try {
      const result = await scanProjectCommunications({
        accessToken,
        project,
        excludeEmails,
        days,
        deepScan,
        batchSize,
        forceReanalyse,
        promptOverrides,
        onRecordClientMailScan,
        isCancelled,
        onProgress: (p) => {
          const cardBase = 20 + (cardIndex / cardTotal) * 75
          const cardSlice = 75 / cardTotal
          let inner = 0
          if (p.phase === 'fetching') inner = 0.1
          else if (p.phase === 'locations') inner = 0.2
          else if (p.phase === 'ai' && p.emailTotal > 0) {
            inner = 0.25 + (0.55 * (p.emailDone || 0)) / p.emailTotal
          } else if (p.phase === 'saving') inner = 0.85
          else if (p.phase === 'done') inner = 1

          onProgress?.({
            phase: p.phase,
            cardIndex: cardIndex + 1,
            cardTotal,
            cardName,
            emailIndex: p.emailDone ?? 0,
            emailTotal: p.emailTotal ?? 0,
            emailSubject: p.emailSubject || '',
            percent: Math.min(99, Math.round(cardBase + inner * cardSlice)),
          })
        },
      })

      summary.cardsScanned += 1
      summary.newEmails += result.newProcessed ?? 0
      summary.emailsAlreadyStored += result.skippedEmails ?? 0
    } catch (err) {
      if (err instanceof Error && err.message === 'Scan cancelled') {
        summary.cancelled = true
        return summary
      }
      summary.errors.push({
        projectId: project.id,
        cardName,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  onProgress?.({
    phase: 'complete',
    cardIndex: cardTotal,
    cardTotal,
    cardName: '',
    emailIndex: 0,
    emailTotal: 0,
    emailSubject: '',
    percent: 100,
  })

  return summary
}
