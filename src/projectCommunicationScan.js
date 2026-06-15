import {
  fetchCommunicationSummaryRows,
  formatCommunicationTypeLabel,
} from './communicationSummary.js'
import {
  getSummarisedMessageIds,
  saveEmailSummaries,
} from './emailSummaries.js'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from './firebase.js'
import { enrichRowsWithOpenAIBatched } from './openaiCommunicationSummary.js'
import { projectClientMailFolder, projectContactEmails } from './graphMail.js'
import {
  isGenericProspectProjectName,
  pickProspectTitleFromSummaries,
} from './prospectProjectNaming.js'
import { isProspectLeadProject } from './unassignedQueue.js'
import { rescoreProjectSummaryLocations } from './summaryLocationRescore.js'

export function projectCanScanCommunications(project) {
  const folder = projectClientMailFolder(project)
  const emails = projectContactEmails(project)
  return Boolean(project?.id && folder?.id && emails.length > 0)
}

export function partitionScannableProjects(projects) {
  const scannable = []
  const skipped = []
  for (const p of projects || []) {
    if (projectCanScanCommunications(p)) scannable.push(p)
    else skipped.push(p)
  }
  return { scannable, skipped }
}

function mergeEnrichedIntoRows(originalRows, enriched) {
  const byId = new Map(enriched.map((r) => [r.id, r]))
  return originalRows.map((row) => {
    const ai = byId.get(row.id)
    if (!ai) return row
    return {
      ...row,
      summary: ai.summary,
      type: ai.type,
      typeLabel: formatCommunicationTypeLabel(row.direction, ai.type, {
        inInbox: row.inInbox,
      }),
    }
  })
}

function throwIfCancelled(isCancelled) {
  if (isCancelled?.()) {
    throw new Error('Scan cancelled')
  }
}

async function maybeUpdateProspectProjectName(project, mergedRows) {
  if (!isProspectLeadProject(project)) return
  const email = projectContactEmails(project)[0] || project.prospectEmail || ''
  const contactName = project.clientContacts?.[0]?.name || ''
  if (!isGenericProspectProjectName(project.projectName, email, contactName)) return

  const title = pickProspectTitleFromSummaries(mergedRows)
  if (!title || isGenericProspectProjectName(title, email, contactName)) return

  await updateDoc(doc(db, 'projects', project.id), {
    projectName: title,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Summarise new emails for one project (same pipeline as Communication Summary tab).
 * onProgress({ phase, emailDone, emailTotal, emailSubject, fetched, newProcessed, skipped })
 */
export async function scanProjectCommunications({
  accessToken,
  project,
  excludeEmails = [],
  days = 30,
  deepScan = false,
  batchSize = 12,
  forceReanalyse = false,
  locationsOnly = false,
  onRecordClientMailScan,
  onProgress,
  isCancelled,
  promptOverrides = null,
}) {
  const projectId = project.id
  const clientFolder = projectClientMailFolder(project)
  const clientEmails = projectContactEmails(project)
  if (!clientFolder?.id || !clientEmails.length) {
    return { skipped: true, reason: 'not_configured' }
  }

  const formatTypeLabel = (direction, type, { inInbox }) =>
    formatCommunicationTypeLabel(direction, type, { inInbox })

  throwIfCancelled(isCancelled)

  if (locationsOnly) {
    onProgress?.({ phase: 'locations' })
    const locationSync = await rescoreProjectSummaryLocations(accessToken, projectId, {
      clientFolderId: clientFolder.id,
      formatTypeLabel,
    })
    if (onRecordClientMailScan) await onRecordClientMailScan(projectId)
    return {
      skipped: false,
      locationsOnly: true,
      locationsUpdated: locationSync.updated,
      newProcessed: 0,
      fetched: 0,
      skippedEmails: 0,
    }
  }

  onProgress?.({ phase: 'fetching' })
  throwIfCancelled(isCancelled)

  const result = await fetchCommunicationSummaryRows(accessToken, {
    clientFolderId: clientFolder.id,
    clientEmails,
    excludeEmails,
    days: Number(days) || 30,
    deepScan,
  })

  if (onRecordClientMailScan) await onRecordClientMailScan(projectId)

  onProgress?.({ phase: 'locations' })
  throwIfCancelled(isCancelled)

  const locationSync = await rescoreProjectSummaryLocations(accessToken, projectId, {
    clientFolderId: clientFolder.id,
    formatTypeLabel,
  })

  const existingIds = forceReanalyse ? new Set() : await getSummarisedMessageIds(projectId)
  const toProcess = forceReanalyse
    ? result.rows
    : result.rows.filter((row) => !existingIds.has(row.id))
  const skippedEmails = result.rows.length - toProcess.length

  if (toProcess.length === 0) {
    onProgress?.({ phase: 'done', emailDone: 0, emailTotal: 0 })
    return {
      skipped: false,
      fetched: result.rows.length,
      newProcessed: 0,
      skippedEmails,
      locationsUpdated: locationSync.updated,
      stats: result.stats,
    }
  }

  const context = {
    projectName: project.projectName,
    clientCompany: project.clientCompany,
    aiContext: project.aiContext,
    senderEmail: clientEmails[0] || '',
    promptVariant: isProspectLeadProject(project) ? 'prospect' : 'project',
    promptOverrides,
  }

  onProgress?.({
    phase: 'ai',
    emailDone: 0,
    emailTotal: toProcess.length,
    emailSubject: toProcess[0]?.subject,
  })

  const enriched = await enrichRowsWithOpenAIBatched(toProcess, context, {
    batchSize,
    promptVariant: context.promptVariant,
    promptOverrides,
    onProgress: ({ done, total }) => {
      throwIfCancelled(isCancelled)
      const row = toProcess[Math.min(done, toProcess.length - 1)]
      onProgress?.({
        phase: done >= total ? 'saving' : 'ai',
        emailDone: done,
        emailTotal: total,
        emailSubject: row?.subject,
      })
    },
  })

  throwIfCancelled(isCancelled)

  const merged = mergeEnrichedIntoRows(toProcess, enriched)
  await saveEmailSummaries(projectId, merged)
  await maybeUpdateProspectProjectName(project, merged)

  onProgress?.({
    phase: 'done',
    emailDone: toProcess.length,
    emailTotal: toProcess.length,
  })

  return {
    skipped: false,
    fetched: result.rows.length,
    newProcessed: toProcess.length,
    skippedEmails,
    locationsUpdated: locationSync.updated,
    stats: result.stats,
  }
}
