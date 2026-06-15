import {
  fetchMailFolderMessageIds,
  getRootInboxFolderId,
  resolveMessageInInbox,
} from './graphMail.js'
import { syncEmailSummaryLocations } from './emailSummaries.js'

/**
 * Re-score Inbox vs client-folder for every stored summary on a project.
 * Does not depend on the day-window fetch or "already summarised" skip logic.
 */
export async function rescoreProjectSummaryLocations(
  accessToken,
  projectId,
  { clientFolderId, formatTypeLabel },
) {
  if (!accessToken || !projectId || !clientFolderId) {
    return { updated: 0, ids: [], filedCount: 0 }
  }

  const [rootInboxId, filedMessageIds] = await Promise.all([
    getRootInboxFolderId(accessToken),
    fetchMailFolderMessageIds(accessToken, clientFolderId),
  ])

  const result = await syncEmailSummaryLocations(projectId, [], {
    formatTypeLabel,
    filedMessageIds,
    resolveInInboxForMessageId: (messageId) =>
      resolveMessageInInbox(accessToken, messageId, { rootInboxId, clientFolderId }),
  })

  return { ...result, filedCount: filedMessageIds.length, rootInboxId }
}
