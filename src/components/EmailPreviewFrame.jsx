import { applyMergeTags, previewEmailHtml, SAMPLE_MERGE_CONTACT } from '../emailHtml.js'

export default function EmailPreviewFrame({
  html,
  subject = '',
  fromName = 'You',
  fromEmail = '',
  contact = SAMPLE_MERGE_CONTACT,
}) {
  const srcDoc = previewEmailHtml(html, contact)
  const mergedSubject = applyMergeTags(subject, contact) || '(no subject)'

  return (
    <div className="email-preview">
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
        className="email-preview-frame"
        title="Inbox preview"
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
      />
    </div>
  )
}
