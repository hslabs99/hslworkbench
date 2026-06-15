import { useEffect, useState } from 'react'
import { clientMailRootLabel } from '../mailFolderConfig.js'
import { normalizeScanDays } from '../unassignedQueue.js'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'
import LeadQueueFolderPickerModal from './LeadQueueFolderPickerModal.jsx'

export default function UnassignedColumnSettingsModal({
  open,
  leadQueueFolder,
  scanDays,
  deepScan,
  forceRescan,
  onSave,
  onClose,
  busy,
}) {
  const { configured, account } = useMicrosoftAuth()
  const [folder, setFolder] = useState(leadQueueFolder)
  const [days, setDays] = useState(scanDays)
  const [deep, setDeep] = useState(deepScan)
  const [force, setForce] = useState(forceRescan)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setFolder(leadQueueFolder)
    setDays(scanDays)
    setDeep(deepScan)
    setForce(forceRescan)
    setError(null)
  }, [open, leadQueueFolder, scanDays, deepScan, forceRescan])

  if (!open) return null

  const canPickFolder = configured && account

  async function handleSave() {
    setError(null)
    try {
      await onSave({
        leadQueueFolder: folder,
        scanDays: normalizeScanDays(days),
        deepScan: deep,
        forceRescan: force,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleClearFolder() {
    setFolder(null)
  }

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={onClose}>
        <div
          className="modal-panel unassigned-settings-modal"
          role="dialog"
          aria-labelledby="unassigned-settings-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="project-form">
            <h2 id="unassigned-settings-title" className="form-title">
              Unassigned column settings
            </h2>
            <p className="muted unassigned-settings-intro">
              Lead queue folder and scan options for the system Unassigned list. One card will be
              created per unique sender when scanning runs.
            </p>

            <fieldset className="unassigned-settings-fieldset">
              <legend>Lead queue folder</legend>
              <p className="muted mail-folder-field-hint">
                Subfolder under <strong>{clientMailRootLabel()}</strong> containing inbound leads
                not yet assigned to a client project.
              </p>
              <div className="unassigned-settings-folder-row">
                {folder ? (
                  <div className="unassigned-settings-folder-display">
                    <strong>{folder.displayName}</strong>
                    <span className="muted">{folder.path}</span>
                  </div>
                ) : (
                  <span className="muted">No folder selected</span>
                )}
                <div className="unassigned-settings-folder-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => setFolderPickerOpen(true)}
                    disabled={!canPickFolder || busy}
                  >
                    {folder ? 'Change folder' : 'Choose folder'}
                  </button>
                  {folder && (
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={handleClearFolder}
                      disabled={busy}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {!canPickFolder && (
                <p className="form-error unassigned-settings-connect-hint">
                  Connect Microsoft email in Settings to choose a folder.
                </p>
              )}
            </fieldset>

            <fieldset className="unassigned-settings-fieldset">
              <legend>Scan window</legend>
              <label className="unassigned-settings-days">
                Scan last
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="comm-summary-days-input"
                  disabled={busy}
                  aria-label="Days to scan"
                />
                days
              </label>
              <label className="unassigned-settings-deep">
                <input
                  type="checkbox"
                  checked={deep}
                  onChange={(e) => setDeep(e.target.checked)}
                  disabled={busy}
                />
                Deep scan (full day window, up to 2000 messages in folder)
              </label>
              <label className="unassigned-settings-deep">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  disabled={busy}
                />
                Force rescan (re-analyse emails already stored on next scan)
              </label>
            </fieldset>

            {error && <p className="form-error">{error}</p>}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSave} disabled={busy}>
                {busy ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <LeadQueueFolderPickerModal
        open={folderPickerOpen}
        selectedFolder={folder}
        onSelect={(pick) => setFolder(pick)}
        onClose={() => setFolderPickerOpen(false)}
      />
    </>
  )
}
