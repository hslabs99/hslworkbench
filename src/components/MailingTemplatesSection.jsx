import { useEffect, useState } from 'react'
import { parseEmailAddress } from '../emailAddress.js'
import { DEFAULT_TEMPLATE_HTML, emailLayoutLabel, normalizeEmailLayout } from '../emailHtml.js'
import { fetchMailingConfig, sendTestEmail } from '../mailingSend.js'
import { graphSendScopes } from '../msalConfig.js'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'
import { sendGridClientHint } from '../runtimeMode.js'
import {
  createMailingTemplate,
  deleteMailingTemplate,
  getMailingTemplate,
  subscribeMailingTemplates,
  updateMailingTemplate,
} from '../mailings.js'
import ConfirmModal from './ConfirmModal.jsx'
import EmailHtmlEditor from './EmailHtmlEditor.jsx'
import MailingTestSendMenu, { testRecipientFromInput } from './MailingTestSendMenu.jsx'
import MailingTestSendModal from './MailingTestSendModal.jsx'
import MicrosoftConnectCard from './MicrosoftConnectCard.jsx'

const EMPTY = {
  name: '',
  description: '',
  subject: '',
  htmlBody: DEFAULT_TEMPLATE_HTML,
  layout: 'outlook',
}

export default function MailingTemplatesSection() {
  const { account, getAccessToken, userEmail, userName } = useMicrosoftAuth()
  const [templates, setTemplates] = useState([])
  const [mailConfig, setMailConfig] = useState({
    configured: false,
    fromEmail: '',
    fromName: '',
    testRecipient: '',
    setupHint: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [sendVia, setSendVia] = useState('graph')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testReport, setTestReport] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const graphReady = Boolean(account && userEmail)
  const sendgridReady = Boolean(mailConfig.configured)
  const testReady = sendVia === 'graph' ? graphReady : sendgridReady
  const testFromEmail = sendVia === 'graph' ? userEmail : mailConfig.fromEmail
  const testFromName = sendVia === 'graph' ? userName || userEmail : mailConfig.fromName
  const layout = normalizeEmailLayout(form.layout)

  useEffect(() => {
    fetchMailingConfig()
      .then(setMailConfig)
      .catch((err) => {
        setMailConfig((prev) => ({
          ...prev,
          configured: false,
          setupHint: err instanceof Error ? err.message : String(err),
        }))
      })
    return subscribeMailingTemplates(
      (rows) => {
        setTemplates(rows)
        setLoading(false)
      },
      (err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )
  }, [])

  function startNew() {
    setEditing('new')
    setForm({ ...EMPTY })
    setError(null)
    setTestReport(null)
  }

  async function startEdit(row) {
    setError(null)
    setTestReport(null)
    try {
      const full = (await getMailingTemplate(row.id)) || row
      setEditing(full.id)
      setForm({
        name: full.name || '',
        description: full.description || '',
        subject: full.subject || '',
        htmlBody: full.htmlBody || DEFAULT_TEMPLATE_HTML,
        layout: normalizeEmailLayout(full.layout),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSave(e) {
    e?.preventDefault?.()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim() || 'Untitled template',
        description: form.description.trim(),
        subject: form.subject.trim(),
        htmlBody: form.htmlBody,
        layout: normalizeEmailLayout(form.layout),
      }
      if (editing === 'new') {
        const id = await createMailingTemplate(payload)
        setEditing(id)
      } else {
        await updateMailingTemplate(editing, payload)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleTestSend(recipientRaw) {
    setTesting(true)
    setError(null)
    const layout = normalizeEmailLayout(form.layout)
    const meEmail = parseEmailAddress(userEmail || mailConfig.testRecipient || '')
    const { email: toEmail, name: toName } = testRecipientFromInput(recipientRaw, {
      meEmail,
      meName: testFromName || userName || meEmail,
    })
    setTestReport({
      status: 'running',
      provider: sendVia,
      steps: [],
      from: testFromEmail,
      fromName: testFromName,
      to: toEmail,
      toName,
      subject: form.subject ? `[TEST] ${form.subject.trim()}` : '',
    })
    try {
      if (sendVia === 'graph' && !graphReady) {
        throw new Error('Connect your Microsoft account to send a test via Outlook Graph.')
      }
      if (sendVia === 'sendgrid' && !mailConfig.configured) {
        throw new Error(sendGridClientHint(mailConfig) || 'SendGrid is not configured.')
      }
      if (!toEmail) throw new Error('Enter an email address to send the test to.')
      await sendTestEmail({
        sendVia,
        toEmail,
        toName: toName || toEmail,
        subject: `[TEST] ${form.subject.trim()}`,
        htmlBody: form.htmlBody,
        origin: window.location.origin,
        fromEmail: testFromEmail,
        fromName: testFromName,
        layout,
        getAccessToken,
        onReport: setTestReport,
      })
    } catch (err) {
      if (err?.report) {
        setTestReport(err.report)
      } else {
        setTestReport((prev) => ({
          ...(prev || {}),
          status: 'fail',
          error: err instanceof Error ? err.message : String(err),
          steps: prev?.steps || [],
        }))
      }
    } finally {
      setTesting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteMailingTemplate(deleteTarget.id)
      if (editing === deleteTarget.id) setEditing(null)
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (editing) {
    return (
      <section className="lookup-section mailing-section">
        <div className="mailing-editor-head">
          <h3 className="lookup-section-title">
            {editing === 'new' ? 'New email template' : 'Edit email template'}
          </h3>
          <div className="mailing-editor-head-actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Back to list
            </button>
            <MailingTestSendMenu
              disabled={testing || !testReady}
              busy={testing}
              meEmail={parseEmailAddress(userEmail || mailConfig.testRecipient || '')}
              onSend={handleTestSend}
            />
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>

        <MicrosoftConnectCard
          scopes={graphSendScopes}
          hint="Connect Outlook to send a test from this mailbox. SendGrid remains available as the other test method."
        />

        {sendVia === 'graph' && !graphReady && (
          <p className="form-error">Connect your Microsoft account to send a test via Outlook Graph.</p>
        )}
        {sendVia === 'sendgrid' && !mailConfig.configured && (
          <p className="form-error">{sendGridClientHint(mailConfig)}</p>
        )}

        <div className="systems-card mailing-wide-card mailing-form">
          <div className="mailing-send-via full-width">
            <span>Send test via</span>
            <div className="mailing-send-via-options" role="radiogroup" aria-label="Send test via">
              <label className={`mailing-send-via-option${sendVia === 'graph' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="templateSendVia"
                  value="graph"
                  checked={sendVia === 'graph'}
                  onChange={() => setSendVia('graph')}
                />
                <span>
                  Outlook Graph
                  <small>Send the test from the connected mailbox, same as a campaign Graph send.</small>
                </span>
              </label>
              <label className={`mailing-send-via-option${sendVia === 'sendgrid' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="templateSendVia"
                  value="sendgrid"
                  checked={sendVia === 'sendgrid'}
                  onChange={() => setSendVia('sendgrid')}
                />
                <span>
                  SendGrid
                  <small>API send from the authenticated domain, same as a campaign SendGrid send.</small>
                </span>
              </label>
            </div>
          </div>
          <div className="mailing-send-via full-width">
            <span>Email format</span>
            <div className="mailing-send-via-options" role="radiogroup" aria-label="Email format">
              <label className={`mailing-send-via-option${layout === 'outlook' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="templateLayout"
                  value="outlook"
                  checked={layout === 'outlook'}
                  onChange={() => setForm((f) => ({ ...f, layout: 'outlook' }))}
                />
                <span>
                  Outlook message
                  <small>White page, Calibri, ordinary links — looks like a personal email from Outlook.</small>
                </span>
              </label>
              <label className={`mailing-send-via-option${layout === 'card' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="templateLayout"
                  value="card"
                  checked={layout === 'card'}
                  onChange={() => setForm((f) => ({ ...f, layout: 'card' }))}
                />
                <span>
                  Marketing card
                  <small>600px white panel on grey, campaign-style layout with tracking.</small>
                </span>
              </label>
            </div>
          </div>
          <div className="mailing-template-meta">
            <label>
              Template name
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Subject
              <input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Can include {{name}} or {{company}}"
              />
            </label>
            <label className="full-width">
              Description
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
          </div>
          <p className="muted mailing-merge-hint">
            Merge tags: {'{{name}}'}, {'{{email}}'}, {'{{company}}'}, {'{{contact}}'}, and
            {' {{unsubscribe}}'} (inserts a link labelled unsubscribe to the hosted
            /unsubscribe page, with the recipient email in the URL). Use File to upload a
            document and insert a named link. Enter starts a new paragraph (extra space).
            Shift+Enter is a line break. Select several short lines and click Tight to stack
            them with no gap. If the template has no unsubscribe link, one is added at the
            bottom of campaign emails. The preview matches the format above
            ({layout === 'outlook' ? 'plain Outlook message' : '600px marketing card'}).
          </p>
          <EmailHtmlEditor
            contentKey={editing}
            html={form.htmlBody}
            subject={form.subject}
            fromName={testFromName || mailConfig.fromName}
            fromEmail={testFromEmail || mailConfig.fromEmail}
            layout={layout}
            onChange={(htmlBody) => setForm((f) => ({ ...f, htmlBody }))}
          />
          {error && <p className="form-error">{error}</p>}
        </div>
        <MailingTestSendModal
          open={Boolean(testReport)}
          report={testReport}
          onClose={() => setTestReport(null)}
        />
      </section>
    )
  }

  return (
    <section className="lookup-section mailing-section">
      <div className="mailing-editor-head">
        <div>
          <h3 className="lookup-section-title">Email templates</h3>
          <p className="lookup-section-intro muted">
            Subject, body, format, and merge tags live on the template. Use Send test via Outlook
            Graph or SendGrid — the same methods campaigns use. Campaigns pick which template and
            audience to send.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={startNew}>
          New template
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="systems-card mailing-wide-card">
        {loading ? (
          <p className="muted">Loading templates…</p>
        ) : templates.length === 0 ? (
          <p className="muted">No templates yet. Create one and use Send test before a campaign.</p>
        ) : (
          <table className="systems-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Subject</th>
                <th>Format</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button type="button" className="mailing-name-btn" onClick={() => startEdit(row)}>
                      {row.name}
                    </button>
                    {row.description ? <div className="muted">{row.description}</div> : null}
                  </td>
                  <td>{row.subject || '—'}</td>
                  <td>{emailLayoutLabel(row.layout)}</td>
                  <td className="systems-col-actions">
                    <button type="button" className="btn-secondary btn-small" onClick={() => startEdit(row)}>
                      Edit
                    </button>
                    <button type="button" className="btn-danger btn-small" onClick={() => setDeleteTarget(row)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete template?"
        message={`Delete “${deleteTarget?.name || ''}”? Existing campaigns keep a copy of what they already sent.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
