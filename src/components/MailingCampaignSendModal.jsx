function rowMark(status) {
  if (status === 'sent') return '✓'
  if (status === 'failed') return '✕'
  if (status === 'sending') return '…'
  return '·'
}

export default function MailingCampaignSendModal({
  open,
  phase = 'confirm',
  campaignName = '',
  fromName = '',
  fromEmail = '',
  sendVia = 'graph',
  batchSize = 5,
  remaining = 0,
  alreadySent = 0,
  targeted = 0,
  rows = [],
  error = '',
  onStart,
  onSendMore,
  onClose,
}) {
  if (!open) return null

  const running = phase === 'sending'
  const confirming = phase === 'confirm'
  const done = phase === 'done'
  const viaLabel = sendVia === 'sendgrid' ? 'SendGrid' : 'Outlook Graph'
  const batchSent = rows.filter((row) => row.status === 'sent').length
  const batchFailed = rows.filter((row) => row.status === 'failed').length
  const current = rows.find((row) => row.status === 'sending')
  const numericSize = Number(batchSize)
  const take =
    batchSize === 'all'
      ? rows.length || remaining
      : Math.min(Number.isFinite(numericSize) && numericSize > 0 ? numericSize : rows.length || 0, remaining || rows.length)
  const leftover = done ? remaining : Math.max(0, remaining - (running ? 0 : take))
  const nextSize = Number.isFinite(numericSize) && numericSize > 0 ? numericSize : 5
  const nextTake = Math.min(nextSize, leftover)

  let title = 'Send this batch?'
  if (running) title = current ? `Sending to ${current.name || current.email}…` : 'Sending batch…'
  if (done) title = leftover ? 'Batch complete' : 'Campaign send complete'

  return (
    <div
      className="modal-backdrop confirm-modal-backdrop"
      role="presentation"
      onClick={running ? undefined : onClose}
    >
      <div
        className="modal-panel confirm-modal mailing-test-modal mailing-campaign-send-modal"
        role="dialog"
        aria-labelledby="mailing-campaign-send-title"
        aria-busy={running}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="mailing-campaign-send-title" className="confirm-modal-title">
          {title}
        </h2>
        <p className="confirm-modal-message">
          {confirming
            ? `Send the next ${take} unsent ${take === 1 ? 'email' : 'emails'} for “${campaignName || 'this campaign'}” via ${viaLabel}. Already sent: ${alreadySent} of ${targeted || alreadySent + remaining}.`
            : running
              ? `Live send — ${batchSent + batchFailed} of ${rows.length} in this batch. Watch each address complete before the next one starts.`
              : leftover
                ? `${batchSent} sent, ${batchFailed} failed in this batch. ${leftover} still unsent.`
                : `${batchSent} sent, ${batchFailed} failed. Everyone sendable has been mailed.`}
        </p>

        <dl className="mailing-test-meta">
          <div>
            <dt>From</dt>
            <dd>
              {fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail || '—'}
            </dd>
          </div>
          <div>
            <dt>Via</dt>
            <dd>{viaLabel}</dd>
          </div>
          <div>
            <dt>This batch</dt>
            <dd>
              {rows.length} · {alreadySent} already sent · {done ? leftover : remaining} remaining
            </dd>
          </div>
        </dl>

        <div className="mailing-send-progress" aria-hidden="true">
          <span
            className="mailing-send-progress-bar"
            style={{
              width: `${rows.length ? Math.round(((batchSent + batchFailed) / rows.length) * 100) : 0}%`,
            }}
          />
        </div>

        <ol className="mailing-campaign-send-rows">
          {rows.map((row) => (
            <li
              key={row.email}
              className={`mailing-campaign-send-row mailing-campaign-send-row--${row.status || 'pending'}`}
            >
              <span className="mailing-test-step-mark" aria-hidden="true">
                {rowMark(row.status)}
              </span>
              <span>
                <span className="mailing-test-step-label">
                  {row.name ? `${row.name} · ${row.email}` : row.email}
                </span>
                <span className="mailing-test-step-detail">
                  {row.status === 'sending'
                    ? 'Sending now…'
                    : row.status === 'sent'
                      ? 'Sent'
                      : row.status === 'failed'
                        ? row.error || 'Failed'
                        : 'Waiting'}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="form-actions confirm-modal-actions mailing-campaign-send-actions">
          {confirming ? (
            <>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={onStart}>
                Start sending
              </button>
            </>
          ) : running ? (
            <button type="button" className="btn-primary" disabled>
              Sending…
            </button>
          ) : (
            <>
              {leftover > 0 ? (
                <button type="button" className="btn-secondary" onClick={() => onSendMore?.(nextSize)}>
                  Send next {nextTake}
                </button>
              ) : null}
              <button type="button" className="btn-primary" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
