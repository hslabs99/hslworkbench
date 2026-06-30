import { formatSummaryDate } from '../commSummaryFormat.js'

export default function EmailBodyModal({ open, row, bodyText, loading, error, onClose }) {
  if (!open || !row) return null

  const displayText = bodyText || row.bodyPreview || ''

  return (
    <div
      className="modal-backdrop email-body-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-panel email-body-modal"
        role="dialog"
        aria-labelledby="email-body-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="email-body-modal-header">
          <h2 id="email-body-modal-title" className="email-body-modal-title">
            {row.subject || '(no subject)'}
          </h2>
          <button type="button" className="btn-secondary btn-small" onClick={onClose}>
            Close
          </button>
        </div>

        <dl className="email-body-modal-meta">
          <div>
            <dt>Date</dt>
            <dd>{formatSummaryDate(row.date || row.messageDate)}</dd>
          </div>
          <div>
            <dt>From</dt>
            <dd>{row.from || '—'}</dd>
          </div>
          {row.to ? (
            <div>
              <dt>To</dt>
              <dd>{row.to}</dd>
            </div>
          ) : null}
          {row.cc ? (
            <div>
              <dt>Cc</dt>
              <dd>{row.cc}</dd>
            </div>
          ) : null}
        </dl>

        <div className="email-body-modal-body-wrap">
          {loading && <p className="muted email-body-modal-loading">Loading full email…</p>}
          {error && (
            <p className="form-error email-body-modal-error">
              {error} Showing saved preview only.
            </p>
          )}
          {displayText ? (
            <pre className="email-body-modal-text">{displayText}</pre>
          ) : (
            <p className="muted">No email text available.</p>
          )}
        </div>

        {row.webLink ? (
          <div className="email-body-modal-footer">
            <a href={row.webLink} target="_blank" rel="noopener noreferrer">
              Open in Outlook
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}
