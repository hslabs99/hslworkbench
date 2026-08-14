import { useEffect, useMemo, useState } from 'react'
import { flattenMailboxFolderTree, listMailboxFolderTree } from '../graphMail.js'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'

export default function MailboxFolderPickerModal({ open, selectedFolder, onSelect, onClose }) {
  const { account, getAccessToken } = useMicrosoftAuth()
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pick, setPick] = useState(selectedFolder)

  const folders = useMemo(() => flattenMailboxFolderTree(tree), [tree])

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
        const next = await listMailboxFolderTree(token)
        if (!cancelled) setTree(next)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setTree([])
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

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-panel--folder-picker modal-panel--mailbox-folder-picker"
        role="dialog"
        aria-labelledby="mailbox-folder-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="project-form">
          <h2 id="mailbox-folder-picker-title" className="form-title">
            Select mailbox folder
          </h2>
          <p className="muted mail-folder-picker-intro">
            Choose any folder in your Exchange mailbox. Harvest reads that folder and every nested
            subfolder.
          </p>

          {!account && (
            <p className="form-error">
              Connect your Microsoft account before choosing a folder.
            </p>
          )}

          {error && <p className="form-error">{error}</p>}

          {loading && <p className="muted">Loading folders…</p>}

          {!loading && account && folders.length === 0 && !error && (
            <p className="muted">No mail folders were found in this mailbox.</p>
          )}

          {!loading && folders.length > 0 && (
            <ul className="mail-folder-picker-list" role="listbox" aria-label="Mailbox folders">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={pick?.id === folder.id}
                    className={`mail-folder-picker-option${pick?.id === folder.id ? ' mail-folder-picker-option--selected' : ''}`}
                    style={{ paddingLeft: `${0.75 + folder.depth * 1.1}rem` }}
                    onClick={() => setPick(folder)}
                  >
                    <span className="mail-folder-picker-name">{folder.displayName}</span>
                    <span className="muted mail-folder-picker-meta">
                      {folder.totalItemCount} item{folder.totalItemCount === 1 ? '' : 's'}
                      {folder.childFolderCount
                        ? ` · ${folder.childFolderCount} subfolder${folder.childFolderCount === 1 ? '' : 's'}`
                        : ''}
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
              Select folder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
