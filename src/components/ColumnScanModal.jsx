const PHASE_LABELS = {
  fetching: 'Fetching mail from Outlook',
  locations: 'Updating folder locations',
  filtering: 'Checking database',
  ai: 'Analysing with AI',
  saving: 'Saving summaries',
  done: 'Finishing card',
  complete: 'Complete',
}

function truncate(str, max = 72) {
  const s = (str || '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export function ColumnScanConfirmModal({
  open,
  siloTitle,
  scannableCount,
  skippedCount,
  days,
  deepScan,
  onDaysChange,
  onDeepScanChange,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <div className="modal-backdrop confirm-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-panel confirm-modal column-scan-confirm-modal"
        role="alertdialog"
        aria-labelledby="column-scan-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="column-scan-confirm-title" className="confirm-modal-title">
          Scan all cards in {siloTitle}?
        </h2>
        <div className="column-scan-confirm-body">
          <p className="confirm-modal-message">
            Runs <strong>Summarise new emails</strong> on each configured card ({scannableCount}{' '}
            card{scannableCount === 1 ? '' : 's'}).
            {skippedCount > 0
              ? ` ${skippedCount} card${skippedCount === 1 ? '' : 's'} skipped (no client folder or emails).`
              : ''}
          </p>
          <label className="column-scan-confirm-days">
            Last
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => onDaysChange(e.target.value)}
              className="comm-summary-days-input"
              aria-label="Days to scan"
            />
            days
          </label>
          <label className="column-scan-confirm-deep">
            <input
              type="checkbox"
              checked={deepScan}
              onChange={(e) => onDeepScanChange(e.target.checked)}
            />
            Deep scan (full day window, up to 2000 messages per folder)
          </label>
          <p className="muted column-scan-confirm-note">
            Uses each card&apos;s client folder, contacts, and AI context. OpenAI credits apply for
            new emails only.
          </p>
        </div>
        <div className="form-actions confirm-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={scannableCount === 0}>
            Start scan
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ColumnScanProgressModal({
  open,
  siloTitle,
  progress,
  summary,
  error,
  onCancel,
}) {
  if (!open) return null

  const running = Boolean(progress && progress.phase !== 'complete' && !summary && !error)
  const phaseLabel = PHASE_LABELS[progress?.phase] || 'Working…'

  return (
    <div
      className="modal-backdrop column-scan-backdrop"
      role="presentation"
      onClick={running ? undefined : onCancel}
    >
      <div
        className="modal-panel column-scan-modal"
        role="dialog"
        aria-labelledby="column-scan-title"
        aria-busy={running}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="column-scan-title" className="column-scan-title">
          {running ? `Scanning: ${siloTitle}` : error ? 'Scan failed' : 'Scan complete'}
        </h2>

        {error && <p className="form-error column-scan-error">{error}</p>}

        {progress && running && (
          <div className="column-scan-progress" role="status" aria-live="polite">
            <progress
              className="column-scan-progress-bar"
              value={progress.percent ?? 0}
              max={100}
            />
            <p className="column-scan-percent">{progress.percent ?? 0}%</p>

            <div className="column-scan-level column-scan-level--card">
              <span className="column-scan-level-label">Card</span>
              <span className="column-scan-level-value">
                {progress.cardIndex} of {progress.cardTotal}
              </span>
              <span className="column-scan-level-detail">{progress.cardName}</span>
            </div>

            <div className="column-scan-level column-scan-level--phase">
              <span className="column-scan-level-label">Phase</span>
              <span className="column-scan-level-value">{phaseLabel}</span>
            </div>

            {progress.emailTotal > 0 && (
              <div className="column-scan-level column-scan-level--email">
                <span className="column-scan-level-label">Email</span>
                <span className="column-scan-level-value">
                  {progress.emailIndex} of {progress.emailTotal}
                </span>
                {progress.emailSubject ? (
                  <span className="column-scan-level-detail" title={progress.emailSubject}>
                    {truncate(progress.emailSubject)}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        )}

        {summary && !running && (
          <div className="column-scan-summary">
            {summary.cancelled ? (
              <p>Scan cancelled.</p>
            ) : (
              <ul className="column-scan-summary-list">
                <li>
                  {summary.cardsScanned} card{summary.cardsScanned === 1 ? '' : 's'} scanned
                </li>
                {summary.cardsSkipped > 0 && (
                  <li>
                    {summary.cardsSkipped} skipped (not configured)
                  </li>
                )}
                <li>
                  {summary.newEmails} new email{summary.newEmails === 1 ? '' : 's'} summarised
                </li>
                {summary.emailsAlreadyStored > 0 && (
                  <li>{summary.emailsAlreadyStored} already in database</li>
                )}
                {summary.errors?.length > 0 && (
                  <li className="column-scan-summary-errors">
                    {summary.errors.length} error{summary.errors.length === 1 ? '' : 's'}:
                    <ul>
                      {summary.errors.map((e) => (
                        <li key={e.projectId}>
                          {e.cardName}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        <div className="form-actions column-scan-actions">
          {running ? (
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={onCancel}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
