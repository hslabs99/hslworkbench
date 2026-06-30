import { harvestContactsFromStoredSummaries } from './emailSummaries.js'
import {
  harvestClientEmailsFromFolder,
  projectClientMailFolder,
} from './graphMail.js'
import { isProspectLeadProject } from './unassignedQueue.js'

/**
 * Harvest client contacts for a project.
 * Assigned cards: scan the project's client mail folder.
 * Unassigned lead cards: use emails already stored from Communication Summary scan.
 */
export async function harvestClientEmailsForProject(
  accessToken,
  project,
  existingContacts,
  {
    mailboxEmail = '',
    globalExcludeEmails = [],
    maxMessages = 500,
    primaryEmail = '',
  } = {},
) {
  if (isProspectLeadProject(project) && project?.id) {
    return harvestContactsFromStoredSummaries(project.id, existingContacts, {
      mailboxEmail,
      globalExcludeEmails,
      primaryEmail,
    })
  }

  const folder = projectClientMailFolder(project)
  if (!folder?.id) {
    throw new Error('Assign a client mail folder first.')
  }

  return harvestClientEmailsFromFolder(accessToken, folder.id, existingContacts, {
    mailboxEmail,
    globalExcludeEmails,
    maxMessages,
    primaryEmail,
  })
}
