import { runColumnCommunicationScan } from './columnScan.js'
import { partitionScannableProjects } from './projectCommunicationScan.js'
import { runUnassignedQueueScan } from './unassignedQueueScan.js'
import { normalizeScanDays, UNASSIGNED_SILO_ID, hasLeadQueueFolders, formatLeadQueueFoldersLabel } from './unassignedQueue.js'

function throwIfCancelled(isCancelled) {
  if (isCancelled?.()) {
    throw new Error('Scan cancelled')
  }
}

function mapStageProgress(stageIndex, stageTotal, stageName, stageType, inner) {
  const stageBase = stageIndex / stageTotal
  const stageSlice = 1 / stageTotal
  const innerPct = (inner?.percent ?? 0) / 100

  return {
    stageIndex: stageIndex + 1,
    stageTotal,
    stageName,
    stageType,
    phase: inner?.phase || 'fetching',
    cardIndex: inner?.cardIndex ?? 0,
    cardTotal: inner?.cardTotal ?? 0,
    cardName: inner?.cardName || '',
    emailIndex: inner?.emailIndex ?? 0,
    emailTotal: inner?.emailTotal ?? 0,
    emailSubject: inner?.emailSubject || '',
    percent: Math.min(99, Math.round((stageBase + innerPct * stageSlice) * 100)),
  }
}

/**
 * Run unassigned lead-queue scan then column scans for each selected list.
 */
export async function runScanAll({
  includeUnassigned = false,
  unassignedProjects = [],
  allProjects = [],
  leadQueueFolders = [],
  leadQueueFolder = null,
  columnSilos = [],
  accessToken,
  excludeEmails = [],
  userEmail = '',
  days = 30,
  deepScan = true,
  forceRescan = false,
  batchSize = 12,
  promptOverrides = null,
  onRecordClientMailScan,
  onUpdateQueueSettings,
  onProgress,
  isCancelled,
}) {
  const normalizedDays = normalizeScanDays(days)
  const stages = []

  if (includeUnassigned) {
    stages.push({ type: 'unassigned', id: 'unassigned', title: 'Unassigned lead queue' })
  }
  for (const silo of columnSilos) {
    stages.push({
      type: 'column',
      id: silo.id,
      title: silo.title,
      projects: silo.projects || [],
    })
  }

  const summary = {
    stages: [],
    cancelled: false,
    totalNewEmails: 0,
    totalEmailsAlreadyStored: 0,
    totalCardsScanned: 0,
  }

  const stageTotal = stages.length
  if (stageTotal === 0) {
    onProgress?.({
      stageIndex: 0,
      stageTotal: 0,
      stageName: '',
      stageType: 'complete',
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

  for (let stageIndex = 0; stageIndex < stageTotal; stageIndex += 1) {
    throwIfCancelled(isCancelled)
    const stage = stages[stageIndex]

    if (stage.type === 'unassigned') {
      const folders = leadQueueFolders.length
        ? leadQueueFolders
        : leadQueueFolder?.id
          ? [leadQueueFolder]
          : []
      if (!hasLeadQueueFolders(folders)) {
        summary.stages.push({
          type: 'unassigned',
          id: stage.id,
          title: stage.title,
          skipped: true,
          reason: 'No lead queue folders configured',
        })
        continue
      }

      if (forceRescan) {
        await onUpdateQueueSettings?.({ forceRescan: true })
      }

      const result = await runUnassignedQueueScan({
        accessToken,
        leadQueueFolders: folders,
        existingProjects: allProjects,
        excludeEmails,
        userEmail,
        days: normalizedDays,
        deepScan,
        forceReanalyse: forceRescan,
        batchSize,
        promptOverrides,
        onRecordClientMailScan,
        isCancelled,
        onProgress: (inner) => {
          onProgress?.(
            mapStageProgress(stageIndex, stageTotal, stage.title, 'unassigned', inner),
          )
        },
      })

      if (result.cancelled) {
        summary.cancelled = true
        summary.stages.push({ type: 'unassigned', id: stage.id, title: stage.title, ...result })
        return summary
      }

      summary.stages.push({ type: 'unassigned', id: stage.id, title: stage.title, ...result })
      summary.totalNewEmails += result.newEmails ?? 0
      summary.totalEmailsAlreadyStored += result.emailsAlreadyStored ?? 0
      summary.totalCardsScanned += result.cardsScanned ?? 0
      continue
    }

    const { scannable } = partitionScannableProjects(stage.projects)
    if (scannable.length === 0) {
      summary.stages.push({
        type: 'column',
        id: stage.id,
        title: stage.title,
        cardsScanned: 0,
        cardsSkipped: stage.projects?.length ?? 0,
        newEmails: 0,
        emailsAlreadyStored: 0,
        errors: [],
        skipped: true,
        reason: 'No configured cards',
      })
      continue
    }

    const result = await runColumnCommunicationScan({
      projects: stage.projects,
      accessToken,
      excludeEmails,
      days: normalizedDays,
      deepScan,
      batchSize,
      onRecordClientMailScan,
      promptOverrides,
      isCancelled,
      onProgress: (inner) => {
        onProgress?.(mapStageProgress(stageIndex, stageTotal, stage.title, 'column', inner))
      },
    })

    if (result.cancelled) {
      summary.cancelled = true
      summary.stages.push({ type: 'column', id: stage.id, title: stage.title, ...result })
      return summary
    }

    summary.stages.push({ type: 'column', id: stage.id, title: stage.title, ...result })
    summary.totalNewEmails += result.newEmails ?? 0
    summary.totalEmailsAlreadyStored += result.emailsAlreadyStored ?? 0
    summary.totalCardsScanned += result.cardsScanned ?? 0
  }

  onProgress?.({
    stageIndex: stageTotal,
    stageTotal,
    stageName: '',
    stageType: 'complete',
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

export function buildScanAllStageOptions({ silos, bySilo, resolveSiloTitle, leadQueueFolders, leadQueueFolder }) {
  const folders = leadQueueFolders?.length
    ? leadQueueFolders
    : leadQueueFolder?.id
      ? [leadQueueFolder]
      : []
  const unassignedProjects = bySilo?.[UNASSIGNED_SILO_ID] || []
  const { scannable: unassignedScannable } = partitionScannableProjects(unassignedProjects)

  const columns = (silos || []).map((silo) => {
    const projects = bySilo?.[silo.id] || []
    const { scannable, skipped } = partitionScannableProjects(projects)
    return {
      id: silo.id,
      title: resolveSiloTitle(silo.id),
      projectCount: projects.length,
      scannableCount: scannable.length,
      skippedCount: skipped.length,
    }
  })

  return {
    unassigned: {
      id: 'unassigned',
      title: 'Unassigned lead queue',
      configured: hasLeadQueueFolders(folders),
      folderLabel: formatLeadQueueFoldersLabel(folders),
      folderCount: folders.length,
      projectCount: unassignedProjects.length,
      scannableCount: unassignedScannable.length,
    },
    columns,
  }
}
