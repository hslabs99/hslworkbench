const PHASE_LABELS = {
  discovering: 'Scanning lead queue folder',
  creating: 'Creating prospect cards',
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

export function ScanAllConfirmModal({
  open,
  stageOptions,
  selectedUnassigned,
  selectedColumnIds,
  days,
  deepScan,
  forceRescan,
  onToggleUnassigned,
  onToggleColumn,
  onSelectAll,
  onSelectNone,
  onDaysChange,
  onDeepScanChange,
  onForceRescanChange,
  onConfirm,
  onCancel,
}) {
  if (!open || !stageOptions) return null

  const { unassigned, columns } = stageOptions
  const selectedColumnCount = columns.filter((c) => selectedColumnIds.has(c.id)).length
  const includeUnassigned = selectedUnassigned && unassigned.configured
  const stageCount = selectedColumnCount + (includeUnassigned ? 1 : 0)
  const totalScannable =
    columns.reduce(
      (sum, c) => sum + (selectedColumnIds.has(c.id) ? c.scannableCount : 0),
      0,
    ) + (includeUnassigned ? unassigned.scannableCount : 0)

  return (
    <div className="modal-backdrop confirm-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-panel confirm-modal column-scan-confirm-modal scan-all-confirm-modal"
        role="alertdialog"
        aria-labelledby="scan-all-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="scan-all-confirm-title" className="confirm-modal-title">
          Scan all before review
        </h2>
        <div className="column-scan-confirm-body">
          <p className="confirm-modal-message">
            Choose which lists to scan. Runs lead-queue discovery (if selected), then summarises new
            emails on each configured card.
          </p>

          <div className="scan-all-list-actions">
            <button type="button" className="btn-secondary btn-small" onClick={onSelectAll}>
              Select all
            </button>
            <button type="button" className="btn-secondary btn-small" onClick={onSelectNone}>
              Select none
            </button>
          </div>

          <fieldset className="scan-all-lists">
            <legend className="scan-all-lists-legend">Lists to scan</legend>

            <label
              className={`scan-all-list-item ${!unassigned.configured ? 'scan-all-list-item--disabled' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedUnassigned}
                disabled={!unassigned.configured}
                onChange={(e) => onToggleUnassigned(e.target.checked)}
              />
              <span className="scan-all-list-label">
                <strong>{unassigned.title}</strong>
                {unassigned.configured ? (
                  <span className="muted scan-all-list-meta">
                    {unassigned.folderLabel} · {unassigned.scannableCount} existing card
                    {unassigned.scannableCount === 1 ? '' : 's'} + new prospects from{' '}
                    {unassigned.folderCount === 1 ? 'folder' : `${unassigned.folderCount} folders`}
                  </span>
                ) : (
                  <span className="muted scan-all-list-meta">
                    Choose lead queue folders in Unassigned column settings first
                  </span>
                )}
              </span>
            </label>

            {columns.map((col) => (
              <label key={col.id} className="scan-all-list-item">
                <input
                  type="checkbox"
                  checked={selectedColumnIds.has(col.id)}
                  onChange={(e) => onToggleColumn(col.id, e.target.checked)}
                />
                <span className="scan-all-list-label">
                  <strong>{col.title}</strong>
                  <span className="muted scan-all-list-meta">
                    {col.scannableCount} scannable
                    {col.skippedCount > 0
                      ? ` · ${col.skippedCount} skipped (no folder or contacts)`
                      : ''}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="scan-all-options">
            <legend className="scan-all-options-legend">Scan options</legend>
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
            <label className="column-scan-confirm-deep">
              <input
                type="checkbox"
                checked={forceRescan}
                onChange={(e) => onForceRescanChange(e.target.checked)}
              />
              Force rescan on Unassigned (re-analyse emails already stored)
            </label>
          </fieldset>

          <p className="muted column-scan-confirm-note scan-all-confirm-note">
            {stageCount} list{stageCount === 1 ? '' : 's'}, {totalScannable} configured card
            {totalScannable === 1 ? '' : 's'}. OpenAI credits apply for new emails only.
          </p>
        </div>
        <div className="form-actions confirm-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={stageCount === 0}>
            Start scan all
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ScanAllProgressModal({ open, progress, summary, error, onCancel }) {
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
        className="modal-panel column-scan-modal scan-all-progress-modal"
        role="dialog"
        aria-labelledby="scan-all-progress-title"
        aria-busy={running}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="scan-all-progress-title" className="column-scan-title">
          {running ? 'Scanning all lists' : error ? 'Scan all failed' : 'Scan all complete'}
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

            {progress.stageTotal > 0 && (
              <div className="column-scan-level column-scan-level--stage">
                <span className="column-scan-level-label">List</span>
                <span className="column-scan-level-value">
                  {progress.stageIndex} of {progress.stageTotal}
                </span>
                <span className="column-scan-level-detail">{progress.stageName}</span>
              </div>
            )}

            {progress.cardTotal > 0 && (
              <div className="column-scan-level column-scan-level--card">
                <span className="column-scan-level-label">Card</span>
                <span className="column-scan-level-value">
                  {progress.cardIndex} of {progress.cardTotal}
                </span>
                <span className="column-scan-level-detail">{progress.cardName}</span>
              </div>
            )}

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
              <>
                <ul className="column-scan-summary-list scan-all-summary-totals">
                  <li>
                    {summary.totalCardsScanned} card{summary.totalCardsScanned === 1 ? '' : 's'}{' '}
                    scanned across {summary.stages.length} list
                    {summary.stages.length === 1 ? '' : 's'}
                  </li>
                  <li>
                    {summary.totalNewEmails} new email{summary.totalNewEmails === 1 ? '' : 's'}{' '}
                    summarised
                  </li>
                  {summary.totalEmailsAlreadyStored > 0 && (
                    <li>{summary.totalEmailsAlreadyStored} already in database</li>
                  )}
                </ul>
                <ul className="column-scan-summary-list scan-all-summary-stages">
                  {summary.stages.map((stage) => (
                    <li key={stage.id}>
                      <strong>{stage.title}</strong>
                      {stage.skipped ? (
                        <span className="muted"> — skipped ({stage.reason})</span>
                      ) : stage.type === 'unassigned' ? (
                        <span className="muted">
                          {' '}
                          — {stage.cardsScanned ?? 0} scanned, {stage.newEmails ?? 0} new
                          {stage.cardsCreated > 0 ? `, ${stage.cardsCreated} created` : ''}
                        </span>
                      ) : (
                        <span className="muted">
                          {' '}
                          — {stage.cardsScanned ?? 0} scanned, {stage.newEmails ?? 0} new
                          {(stage.cardsSkipped ?? 0) > 0
                            ? `, ${stage.cardsSkipped} skipped`
                            : ''}
                        </span>
                      )}
                      {stage.errors?.length > 0 && (
                        <ul>
                          {stage.errors.map((e) => (
                            <li key={e.projectId}>
                              {e.cardName}: {e.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </>
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
