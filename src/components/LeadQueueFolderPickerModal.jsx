import { useEffect, useState } from 'react'
import { listLeadQueueFolderOptions } from '../graphMail.js'
import { clientMailRootLabel } from '../mailFolderConfig.js'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'

export default function LeadQueueFolderPickerModal({
  open,
  selectedFolder,
  excludeFolderIds,
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
    if (!open || loading || !folders.length) return
    const excluded =
      excludeFolderIds instanceof Set ? excludeFolderIds : new Set(excludeFolderIds || [])
    const available = folders.filter((folder) => !excluded.has(folder.id))
    setPick((prev) => {
      if (prev?.id && !excluded.has(prev.id)) return prev
      return available[0] ?? null
    })
  }, [open, loading, folders, excludeFolderIds])

  useEffect(() => {
    if (!open || !account) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return
        const list = await listLeadQueueFolderOptions(token)
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

  const excluded = excludeFolderIds instanceof Set ? excludeFolderIds : new Set(excludeFolderIds || [])
  const availableFolders = folders.filter((folder) => !excluded.has(folder.id))

  function handleConfirm() {
    onSelect(pick)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-panel--folder-picker"
        role="dialog"
        aria-labelledby="lead-queue-folder-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="project-form">
          <h2 id="lead-queue-folder-picker-title" className="form-title">
            Add lead queue folder
          </h2>
          <p className="muted mail-folder-picker-intro">
            Choose an Outlook folder under <strong>{clientMailRootLabel()}</strong> to include when
            scanning for unassigned leads. You can add multiple folders — for example the queue root
            and an Unassigned subfolder.
          </p>

          {!account && (
            <p className="form-error">
              Connect your Microsoft account in Settings before choosing a folder.
            </p>
          )}

          {error && <p className="form-error">{error}</p>}

          {loading && <p className="muted">Loading folders…</p>}

          {!loading && account && availableFolders.length === 0 && !error && (
            <p className="muted">
              {folders.length === 0
                ? `No folders found under ${clientMailRootLabel()}.`
                : 'All available folders are already selected.'}
            </p>
          )}

          {!loading && availableFolders.length > 0 && (
            <ul className="mail-folder-picker-list" role="listbox" aria-label="Lead queue folders">
              {availableFolders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={pick?.id === folder.id}
                    className={`mail-folder-picker-option${pick?.id === folder.id ? ' mail-folder-picker-option--selected' : ''}`}
                    onClick={() => setPick(folder)}
                  >
                    <span className="mail-folder-picker-name">
                      {folder.displayName}
                      {folder.isQueueRoot ? (
                        <span className="mail-folder-picker-tag">queue root</span>
                      ) : null}
                    </span>
                    <span className="muted mail-folder-picker-meta">
                      {folder.path} · {folder.totalItemCount} item
                      {folder.totalItemCount === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="form-actions mail-folder-picker-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirm}
              disabled={!pick}
            >
              Add folder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
