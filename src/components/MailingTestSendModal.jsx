function statusMark(status) {
  if (status === 'ok') return '✓'
  if (status === 'fail') return '✕'
  return '…'
}

function statusLabel(status) {
  if (status === 'ok') return 'Complete'
  if (status === 'fail') return 'Failed'
  return 'Running'
}

export default function MailingTestSendModal({ open, report, onClose }) {
  if (!open || !report) return null

  const running = report.status === 'running'
  const failed = report.status === 'fail'
  const done = report.status === 'ok'

  return (
    <div
      className="modal-backdrop confirm-modal-backdrop"
      role="presentation"
      onClick={running ? undefined : onClose}
    >
      <div
        className="modal-panel confirm-modal mailing-test-modal"
        role="dialog"
        aria-labelledby="mailing-test-title"
        aria-busy={running}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="mailing-test-title" className="confirm-modal-title">
          {running ? 'Sending test email…' : done ? 'Test email sent' : 'Test email failed'}
        </h2>
        <p className="confirm-modal-message">
          {running
            ? `Running each send step so you can confirm compose and ${
                report.provider === 'graph' ? 'Outlook Graph' : 'SendGrid'
              } delivery all completed.`
            : done
              ? report.provider === 'graph'
                ? `Outlook Graph sent the test${report.to ? ` to ${report.to}` : ''}. Check that inbox and Sent Items.`
                : `SendGrid accepted the message for SMTP delivery${report.to ? ` to ${report.to}` : ''}. Check that inbox.`
              : report.error || 'The test send did not complete.'}
        </p>

        <dl className="mailing-test-meta">
          <div>
            <dt>From</dt>
            <dd>
              {report.fromName && report.from ? `${report.fromName} <${report.from}>` : report.from || '—'}
            </dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>
              {report.toName && report.to && report.toName !== report.to
                ? `${report.toName} <${report.to}>`
                : report.to || '—'}
            </dd>
          </div>
          <div>
            <dt>Via</dt>
            <dd>{report.provider === 'graph' ? 'Outlook Graph' : 'SendGrid'}</dd>
          </div>
          <div>
            <dt>Subject</dt>
            <dd>{report.subject || '—'}</dd>
          </div>
          {report.messageId ? (
            <div>
              <dt>Message id</dt>
              <dd className="mailing-test-mono">{report.messageId}</dd>
            </div>
          ) : null}
          {report.statusCode ? (
            <div>
              <dt>SendGrid HTTP</dt>
              <dd>{report.statusCode}</dd>
            </div>
          ) : null}
        </dl>

        <ol className="mailing-test-steps">
          {(report.steps || []).map((step, index) => (
            <li
              key={`${step.id}-${index}`}
              className={`mailing-test-step mailing-test-step--${step.status || 'running'}`}
            >
              <span className="mailing-test-step-mark" aria-hidden="true">
                {statusMark(step.status)}
              </span>
              <span>
                <span className="mailing-test-step-label">
                  {step.label}
                  <span className="sr-only"> — {statusLabel(step.status)}</span>
                </span>
                {step.detail ? <span className="mailing-test-step-detail">{step.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>

        <div className="form-actions confirm-modal-actions">
          <button type="button" className="btn-primary" onClick={onClose} disabled={running}>
            {running ? 'Sending…' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
