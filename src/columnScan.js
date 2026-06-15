import { partitionScannableProjects, scanProjectCommunications } from './projectCommunicationScan.js'

/**
 * Scan every configured project in a column (Summarise new per card).
 */
export async function runColumnCommunicationScan({
  projects,
  accessToken,
  excludeEmails = [],
  days = 30,
  deepScan = true,
  batchSize = 12,
  onRecordClientMailScan,
  onProgress,
  isCancelled,
  promptOverrides = null,
}) {
  const { scannable, skipped: skippedProjects } = partitionScannableProjects(projects)
  const cardTotal = scannable.length

  const summary = {
    cardTotal: projects.length,
    cardsScanned: 0,
    cardsSkipped: skippedProjects.length,
    newEmails: 0,
    emailsAlreadyStored: 0,
    errors: [],
    cancelled: false,
  }

  if (cardTotal === 0) {
    return summary
  }

  for (let cardIndex = 0; cardIndex < cardTotal; cardIndex += 1) {
    throwIfCancelled(isCancelled)

    const project = scannable[cardIndex]
    const cardName = project.projectName || 'Untitled'

    onProgress?.({
      cardIndex: cardIndex + 1,
      cardTotal,
      cardName,
      phase: 'fetching',
      emailIndex: 0,
      emailTotal: 0,
      emailSubject: '',
      percent: Math.round((cardIndex / cardTotal) * 100),
    })

    try {
      const result = await scanProjectCommunications({
        accessToken,
        project,
        excludeEmails,
        days,
        deepScan,
        batchSize,
        onRecordClientMailScan,
        isCancelled,
        promptOverrides,
        onProgress: (p) => {
          const emailIndex = p.emailDone ?? 0
          const emailTotal = p.emailTotal ?? 0
          const cardBase = cardIndex / cardTotal
          const cardSlice = 1 / cardTotal
          let inner = 0
          if (p.phase === 'fetching') inner = 0.1
          else if (p.phase === 'locations') inner = 0.2
          else if (p.phase === 'ai' && emailTotal > 0) inner = 0.25 + (0.55 * emailIndex) / emailTotal
          else if (p.phase === 'saving') inner = 0.85
          else if (p.phase === 'done') inner = 1

          onProgress?.({
            cardIndex: cardIndex + 1,
            cardTotal,
            cardName,
            phase: p.phase,
            emailIndex,
            emailTotal,
            emailSubject: p.emailSubject || '',
            percent: Math.min(99, Math.round((cardBase + inner * cardSlice) * 100)),
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
    cardIndex: cardTotal,
    cardTotal,
    cardName: '',
    phase: 'complete',
    emailIndex: 0,
    emailTotal: 0,
    emailSubject: '',
    percent: 100,
  })

  return summary
}

function throwIfCancelled(isCancelled) {
  if (isCancelled?.()) {
    throw new Error('Scan cancelled')
  }
}
