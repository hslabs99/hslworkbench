import { useEffect, useState } from 'react'
import { listClientMailFolders } from '../graphMail.js'
import { clientMailRootLabel } from '../mailFolderConfig.js'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'

export default function MailFolderPickerModal({
  open,
  projectName,
  selectedFolder,
  onSelect,
  onClose,
}) {
  const { account, getAccessToken } = useMicrosoftAuth()
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pick, setPick] = useState(selectedFolder)

  useEffect(() => {
    if (!open) return
    setPick(selectedFolder)
  }, [open, selectedFolder])

  useEffect(() => {
    if (!open || !account) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return
        const list = await listClientMailFolders(token)
        if (!cancelled) setFolders(list)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setFolders([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, account, getAccessToken])

  if (!open) return null

  function handleConfirm() {
    onSelect(pick)
    onClose()
  }

  function handleClear() {
    onSelect(null)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-panel--folder-picker"
        role="dialog"
        aria-labelledby="mail-folder-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="project-form">
          <h2 id="mail-folder-picker-title" className="form-title">
            Client mail folder
          </h2>
          {projectName && (
            <p className="muted mail-folder-picker-subtitle">{projectName}</p>
          )}
          <p className="muted mail-folder-picker-intro">
            Choose a subfolder under <strong>{clientMailRootLabel()}</strong>. Communications
            scans will read messages from that folder only.
          </p>

          {!account && (
            <p className="form-error">
              Connect your Microsoft account in Settings before choosing a folder.
            </p>
          )}

          {error && <p className="form-error">{error}</p>}

          {loading && <p className="muted">Loading folders…</p>}

          {!loading && account && folders.length === 0 && !error && (
            <p className="muted">
              No subfolders found under {clientMailRootLabel()}. Create client folders in Outlook
              first.
            </p>
          )}

          {!loading && folders.length > 0 && (
            <ul className="mail-folder-picker-list" role="listbox" aria-label="Client mail folders">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={pick?.id === folder.id}
                    className={`mail-folder-picker-option${pick?.id === folder.id ? ' mail-folder-picker-option--selected' : ''}`}
                    onClick={() => setPick(folder)}
                  >
                    <span className="mail-folder-picker-name">{folder.displayName}</span>
                    <span className="muted mail-folder-picker-meta">
                      {folder.totalItemCount} item{folder.totalItemCount === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="form-actions mail-folder-picker-actions">
            {selectedFolder && (
              <button type="button" className="btn-danger btn-small" onClick={handleClear}>
                Clear folder
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirm}
              disabled={!pick}
            >
              Select folder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
