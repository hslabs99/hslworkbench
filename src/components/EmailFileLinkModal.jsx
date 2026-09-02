import { useEffect, useRef, useState } from 'react'
import { labelFromFileName, MAX_MAILING_FILE_BYTES, uploadMailingFile } from '../mailingFiles.js'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function copyText(value) {
  const text = String(value || '')
  if (!text) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const input = document.createElement('textarea')
  input.value = text
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
}

export default function EmailFileLinkModal({
  open,
  defaultLabel = '',
  onCancel,
  onInserted,
}) {
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [uploaded, setUploaded] = useState(null)
  const [label, setLabel] = useState(defaultLabel)
  const [asButton, setAsButton] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (!open) return
    setFile(null)
    setUploaded(null)
    setLabel(defaultLabel)
    setAsButton(false)
    setBusy(false)
    setProgress(null)
    setError(null)
    setCopied('')
  }, [open, defaultLabel])

  if (!open) return null

  function chooseFile(next) {
    setError(null)
    setCopied('')
    setUploaded(null)
    if (!next) {
      setFile(null)
      return
    }
    if (next.size > MAX_MAILING_FILE_BYTES) {
      setFile(null)
      setError(`File is too large (${formatBytes(next.size)}). Maximum is ${formatBytes(MAX_MAILING_FILE_BYTES)}.`)
      return
    }
    setFile(next)
    setLabel((current) => current.trim() || labelFromFileName(next.name))
  }

  async function handleUpload() {
    if (!file) {
      setError('Choose a document to upload.')
      return
    }
    setBusy(true)
    setError(null)
    setCopied('')
    setProgress({ loaded: 0, total: file.size || 0 })
    try {
      const result = await uploadMailingFile(file, {
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      })
      setUploaded(result)
      setLabel((current) => current.trim() || labelFromFileName(result.fileName || file.name))
    } catch (err) {
      setUploaded(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function handleCopy(value, which) {
    try {
      await copyText(value)
      setCopied(which)
    } catch {
      setCopied('')
      setError('Could not copy. Select the path and copy it manually.')
    }
  }

  function handleInsert() {
    if (!uploaded?.url) {
      setError('Upload the file first so the Firebase URL is available.')
      return
    }
    const displayName = label.trim() || labelFromFileName(uploaded.fileName || file?.name)
    onInserted?.({
      href: uploaded.url,
      label: displayName,
      asButton,
      fileName: uploaded.fileName || file?.name,
      storagePath: uploaded.storagePath,
      gsPath: uploaded.gsPath,
    })
  }

  const pct =
    progress?.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0

  return (
    <div className="modal-backdrop confirm-modal-backdrop" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="modal-panel confirm-modal email-file-modal"
        role="dialog"
        aria-labelledby="email-file-modal-title"
        aria-busy={busy}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="email-file-modal-title" className="confirm-modal-title">
          Upload a document and embed a link
        </h2>
        <p className="confirm-modal-message">
          Upload the file to Firebase Storage. The full path and URL stay visible here. The email shows
          your own link text, not the long URL.
        </p>

        <div className="mailing-form email-file-modal-form">
          <label>
            Document
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
              disabled={busy}
              onChange={(e) => chooseFile(e.target.files?.[0] || null)}
            />
          </label>
          {file ? (
            <p className="muted email-file-modal-file">
              {file.name} · {formatBytes(file.size)}
            </p>
          ) : null}

          {uploaded ? (
            <div className="email-file-modal-paths">
              <label>
                Firebase path
                <div className="email-file-modal-path-row">
                  <input
                    value={uploaded.gsPath || uploaded.storagePath || ''}
                    readOnly
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleCopy(uploaded.gsPath || uploaded.storagePath, 'path')}
                  >
                    {copied === 'path' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </label>
              <label>
                Full URL
                <div className="email-file-modal-path-row">
                  <textarea
                    className="email-file-modal-url"
                    value={uploaded.url || ''}
                    readOnly
                    rows={3}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleCopy(uploaded.url, 'url')}
                  >
                    {copied === 'url' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </label>
            </div>
          ) : null}

          <label>
            Link text shown in the email
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Download the white paper"
              disabled={busy}
              autoComplete="off"
            />
          </label>
          <label className="email-file-modal-check">
            <input
              type="checkbox"
              checked={asButton}
              disabled={busy}
              onChange={(e) => setAsButton(e.target.checked)}
            />
            Insert as a button
          </label>
        </div>

        {busy && progress ? (
          <div className="email-file-modal-progress">
            <div className="email-file-modal-progress-label">Uploading… {pct}%</div>
            <div className="email-file-modal-progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="email-file-modal-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="form-actions confirm-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          {uploaded ? (
            <button type="button" className="btn-primary" onClick={handleInsert} disabled={busy}>
              Insert link
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={handleUpload} disabled={busy || !file}>
              {busy ? 'Uploading…' : 'Upload to Firebase'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
