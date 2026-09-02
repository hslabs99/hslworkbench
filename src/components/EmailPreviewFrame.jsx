import { applyMergeTags, previewEmailHtml, SAMPLE_MERGE_CONTACT, normalizeEmailLayout } from '../emailHtml.js'

export default function EmailPreviewFrame({
  html,
  subject = '',
  fromName = 'You',
  fromEmail = '',
  contact = SAMPLE_MERGE_CONTACT,
  layout = 'outlook',
}) {
  const emailLayout = normalizeEmailLayout(layout)
  const srcDoc = previewEmailHtml(html, contact, { layout: emailLayout })
  const mergedSubject = applyMergeTags(subject, contact) || '(no subject)'

  return (
    <div className={`email-preview${emailLayout === 'outlook' ? ' email-preview--outlook' : ''}`}>
      <div className="email-preview-chrome">
        <div className="email-preview-chrome-row">
          <span className="email-preview-label">From</span>
          <span>
            {fromName || 'You'}
            {fromEmail ? ` <${fromEmail}>` : ''}
          </span>
        </div>
        <div className="email-preview-chrome-row">
          <span className="email-preview-label">To</span>
          <span>
            {contact.name || contact.email}
            {contact.name && contact.email ? ` <${contact.email}>` : ''}
          </span>
        </div>
        <div className="email-preview-chrome-row email-preview-chrome-row--subject">
          <span className="email-preview-label">Subject</span>
          <span>{mergedSubject}</span>
        </div>
      </div>
      <iframe
        className={`email-preview-frame${emailLayout === 'outlook' ? ' email-preview-frame--outlook' : ''}`}
        title="Inbox preview"
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
      />
    </div>
  )
}
