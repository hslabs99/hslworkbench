import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'
import MailFolderPickerModal from './MailFolderPickerModal.jsx'
import { useHarvestExclusions } from './HarvestExclusionsSection.jsx'
import {
  fetchProjectMessages,
  formatMessageDate,
  projectClientMailFolder,
  projectClientContacts,
} from '../graphMail.js'
import { clientMailRootLabel } from '../mailFolderConfig.js'
import { harvestClientEmailsForProject } from '../projectHarvest.js'
import { isProspectLeadProject } from '../unassignedQueue.js'

export default function ProjectCommunications({
  project,
  onUpdateClientMailFolder,
  onUpdateClientContacts,
  onRecordClientMailScan,
}) {
  const { configured, account, getAccessToken, userEmail } = useMicrosoftAuth()
  const { excludeEmails: harvestExclusions } = useHarvestExclusions()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [harvesting, setHarvesting] = useState(false)
  const [error, setError] = useState(null)
  const [harvestResult, setHarvestResult] = useState(null)
  const [scannedAt, setScannedAt] = useState(null)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)

  const clientFolder = useMemo(() => projectClientMailFolder(project), [project])
  const clientContacts = useMemo(() => projectClientContacts(project), [project])

  const scan = useCallback(async () => {
    if (!account || !clientFolder?.id) return
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) return
      const results = await fetchProjectMessages(token, [], {
        folderId: clientFolder.id,
      })
      setMessages(results)
      setScannedAt(new Date())
      if (onRecordClientMailScan) {
        await onRecordClientMailScan(project.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [account, clientFolder, getAccessToken, onRecordClientMailScan, project.id])

  const harvest = useCallback(async () => {
    if (!onUpdateClientContacts) return
    setHarvesting(true)
    setError(null)
    setHarvestResult(null)
    try {
      const token = account ? await getAccessToken() : null
      const result = await harvestClientEmailsForProject(
        token,
        project,
        clientContacts,
        {
          mailboxEmail: userEmail,
          globalExcludeEmails: harvestExclusions,
        },
      )
      if (result.source === 'stored_summaries' && result.messagesMatched === 0) {
        setError('No stored emails for this card — run Communication Summary scan first.')
        return
      }
      if (result.added.length > 0) {
        await onUpdateClientContacts(project.id, result.merged)
      }
      setHarvestResult(result)
      if (onRecordClientMailScan && result.source !== 'stored_summaries') {
        await onRecordClientMailScan(project.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setHarvesting(false)
    }
  }, [
    account,
    clientContacts,
    getAccessToken,
    onUpdateClientContacts,
    onRecordClientMailScan,
    project,
    userEmail,
    harvestExclusions,
  ])

  useEffect(() => {
    setMessages([])
    setError(null)
    setHarvestResult(null)
    setScannedAt(null)
  }, [project?.id, clientFolder?.id])

  async function handleFolderSelect(folder) {
    if (onUpdateClientMailFolder) {
      await onUpdateClientMailFolder(project.id, folder)
    }
  }

  if (!configured) {
    return <p className="muted">Microsoft email is not configured. Check Settings.</p>
  }

  if (!account) {
    return (
      <p className="muted">
        Connect your Microsoft account in <strong>Settings → Microsoft email</strong> to scan mail
        for this project.
      </p>
    )
  }

  if (!clientFolder) {
    return (
      <div className="project-comms project-comms--empty">
        <p className="muted">
          Assign a client folder under <strong>{clientMailRootLabel()}</strong> to scan email for
          this project.
        </p>
        <button
          type="button"
          className="btn-primary btn-small"
          onClick={() => setFolderPickerOpen(true)}
        >
          Choose client folder
        </button>
        <MailFolderPickerModal
          open={folderPickerOpen}
          projectName={project.projectName}
          selectedFolder={null}
          onSelect={handleFolderSelect}
          onClose={() => setFolderPickerOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="project-comms">
      <div className="project-comms-folder">
        <span className="project-comms-folder-label">Scan folder</span>
        <strong>{clientFolder.displayName}</strong>
        <span className="muted project-comms-folder-path">{clientFolder.path}</span>
        {onUpdateClientMailFolder && (
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => setFolderPickerOpen(true)}
          >
            Change folder
          </button>
        )}
      </div>

      <section className="project-comms-contacts" aria-label="Client email addresses">
        <div className="project-comms-contacts-head">
          <h3 className="project-comms-contacts-title">Client email addresses</h3>
          {onUpdateClientContacts && (
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={harvest}
              disabled={harvesting || loading}
            >
              {harvesting ? 'Harvesting…' : 'Harvest emails'}
            </button>
          )}
        </div>
        <p className="muted project-comms-contacts-hint">
          {isProspectLeadProject(project)
            ? 'Addresses from this card\u2019s stored Communication Summary emails are added here.'
            : 'From, To, and Cc addresses found in the client folder are added here — used to match inbound mail in the folder and sent items for summaries.'}{' '}
          Your mailbox and addresses in <strong>Settings → Harvest email exclusions</strong> are
          always skipped.
        </p>
        {clientContacts.length === 0 ? (
          <p className="muted">No client emails yet. Harvest from the folder or add a main contact
          when editing the project.</p>
        ) : (
          <ul className="project-comms-contacts-list">
            {clientContacts.map((c, i) => (
              <li key={`${c.email}-${i}`} className="project-comms-contact">
                <span className="project-comms-contact-email">{c.email || '—'}</span>
                {c.name ? (
                  <span className="muted project-comms-contact-name">{c.name}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {harvestResult && (
          <p className="project-comms-harvest-result">
            {harvestResult.source === 'stored_summaries'
              ? `Used ${harvestResult.messagesMatched} stored email${harvestResult.messagesMatched === 1 ? '' : 's'} for this card`
              : `Scanned ${harvestResult.messagesScanned} message${harvestResult.messagesScanned === 1 ? '' : 's'}`}
            {' — '}
            {harvestResult.added.length === 0
              ? 'no new addresses to add.'
              : `added ${harvestResult.added.length}: ${harvestResult.added.map((c) => c.email).join(', ')}`}
          </p>
        )}
      </section>

      <div className="project-comms-toolbar">
        <button
          type="button"
          className="btn-secondary btn-small"
          onClick={scan}
          disabled={loading || harvesting}
        >
          {loading ? 'Scanning…' : 'Scan folder'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {scannedAt && !loading && (
        <p className="muted project-comms-scanned">
          Last scan: {scannedAt.toLocaleString()} — {messages.length} message
          {messages.length === 1 ? '' : 's'} found
        </p>
      )}

      {messages.length === 0 && scannedAt && !loading && (
        <p className="muted">No messages in this folder (last 100 checked).</p>
      )}

      {messages.length > 0 && (
        <ul className="project-comms-list">
          {messages.map((msg) => (
            <li key={msg.id} className="project-comms-item">
              <div className="project-comms-item-inner">
                <div className="project-comms-item-head">
                  <strong className="project-comms-subject">{msg.subject || '(no subject)'}</strong>
                  {!msg.isRead && <span className="project-comms-unread">Unread</span>}
                </div>
                <p className="muted project-comms-meta">
                  {formatMessageDate(msg.receivedDateTime)} · from{' '}
                  {msg.from?.emailAddress?.address || '—'}
                </p>
                {msg.bodyPreview && <p className="project-comms-preview">{msg.bodyPreview}</p>}
                {msg.webLink && (
                  <a
                    href={msg.webLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="project-comms-link"
                  >
                    Open in Outlook
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <MailFolderPickerModal
        open={folderPickerOpen}
        projectName={project.projectName}
        selectedFolder={clientFolder}
        onSelect={handleFolderSelect}
        onClose={() => setFolderPickerOpen(false)}
      />
    </div>
  )
}
