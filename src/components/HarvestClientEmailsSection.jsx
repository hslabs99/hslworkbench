import { useState } from 'react'
import { harvestClientEmailsFromFolderTree } from '../graphMail.js'
import { mergeHarvestedClientEmails } from '../clientEmails.js'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'
import { useHarvestExclusions } from './HarvestExclusionsSection.jsx'
import MailboxFolderPickerModal from './MailboxFolderPickerModal.jsx'
import MicrosoftConnectCard from './MicrosoftConnectCard.jsx'

export default function HarvestClientEmailsSection() {
  const { configured, account, getAccessToken, userEmail } = useMicrosoftAuth()
  const { excludeEmails: harvestExclusions } = useHarvestExclusions()

  const [error, setError] = useState(null)
  const [folder, setFolder] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [harvesting, setHarvesting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [harvestResult, setHarvestResult] = useState(null)

  async function handleHarvest() {
    if (!folder?.id) {
      setError('Select a mailbox folder first.')
      return
    }
    if (!account) {
      setError('Connect your Microsoft account before harvesting.')
      return
    }

    setHarvesting(true)
    setError(null)
    setHarvestResult(null)
    setProgress({ listing: true })

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Microsoft sign-in required.')

      const result = await harvestClientEmailsFromFolderTree(token, folder, {
        mailboxEmail: userEmail,
        globalExcludeEmails: harvestExclusions,
        onProgress: setProgress,
      })

      const merged = await mergeHarvestedClientEmails(result.harvested)
      setHarvestResult({
        foldersScanned: result.foldersScanned,
        messagesScanned: result.messagesScanned,
        found: result.harvested.length,
        added: merged.added,
        skipped: merged.skipped,
        skippedExcluded: merged.skippedExcluded,
        namesFilled: merged.namesFilled,
        folderPath: folder.path || folder.displayName,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setHarvesting(false)
      setProgress(null)
    }
  }

  const canHarvest = Boolean(configured && account && folder?.id && !harvesting)

  return (
    <section className="lookup-section harvest-client-emails-section">
      <h3 className="lookup-section-title">Harvest emails</h3>
      <p className="lookup-section-intro muted">
        Pull names and addresses from an Exchange folder (and nested subfolders) into the master
        client list. Duplicates are skipped, and addresses on the Exclusions list are never added.
        Review and edit the results on the Master client list tab.
      </p>

      <MicrosoftConnectCard hint="Connect here to browse folders and harvest from this mailbox. Wix / Wix CRM reply addresses are ignored when the real client email is in the display name." />

      <div className="systems-card harvest-client-emails-card">
        <div className="mail-folder-field-row">
          <div className="mail-folder-field-display">
            {folder ? (
              <>
                <strong>{folder.displayName}</strong>
                {folder.path && folder.path !== folder.displayName ? (
                  <span className="muted mail-folder-field-path">{folder.path}</span>
                ) : null}
              </>
            ) : (
              <span className="muted">No folder selected</span>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => setPickerOpen(true)}
            disabled={!account || harvesting}
          >
            {folder ? 'Change folder' : 'Select folder'}
          </button>
        </div>

        <div className="harvest-client-emails-actions">
          <button type="button" className="btn-primary" onClick={handleHarvest} disabled={!canHarvest}>
            {harvesting ? 'Harvesting…' : 'Harvest into master list'}
          </button>
        </div>

        {harvesting && progress && (
          <p className="muted harvest-client-emails-progress">
            {progress.listing && !progress.folderCount
              ? 'Listing folders…'
              : `Scanning folder ${progress.folderIndex} of ${progress.folderCount}${
                  progress.folder?.displayName ? ` — ${progress.folder.displayName}` : ''
                } (${progress.messagesScanned} message${progress.messagesScanned === 1 ? '' : 's'} so far)`}
          </p>
        )}

        {harvestResult && (
          <p className="harvest-client-emails-result">
            Scanned {harvestResult.foldersScanned} folder
            {harvestResult.foldersScanned === 1 ? '' : 's'} in {harvestResult.folderPath} (
            {harvestResult.messagesScanned} message
            {harvestResult.messagesScanned === 1 ? '' : 's'}). Found {harvestResult.found} unique
            address{harvestResult.found === 1 ? '' : 'es'} — added {harvestResult.added} to the master
            list, skipped {harvestResult.skipped} duplicate{harvestResult.skipped === 1 ? '' : 's'}
            {harvestResult.skippedExcluded
              ? `, skipped ${harvestResult.skippedExcluded} on the exclusions list`
              : ''}
            {harvestResult.namesFilled
              ? `, filled ${harvestResult.namesFilled} missing name${harvestResult.namesFilled === 1 ? '' : 's'}`
              : ''}
            .
          </p>
        )}

        {error && <p className="form-error">{error}</p>}
      </div>

      <MailboxFolderPickerModal
        open={pickerOpen}
        selectedFolder={folder}
        onSelect={setFolder}
        onClose={() => setPickerOpen(false)}
      />
    </section>
  )
}
