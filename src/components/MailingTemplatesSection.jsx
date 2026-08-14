import { useEffect, useState } from 'react'
import { DEFAULT_TEMPLATE_HTML } from '../emailHtml.js'
import { fetchMailingConfig, sendTestEmail } from '../mailingSend.js'
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
import MailingTestSendModal from './MailingTestSendModal.jsx'

const EMPTY = {
  name: '',
  description: '',
  subject: '',
  htmlBody: DEFAULT_TEMPLATE_HTML,
}

export default function MailingTemplatesSection() {
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
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testReport, setTestReport] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

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

  async function handleTestSend() {
    setTesting(true)
    setError(null)
    setTestReport({
      status: 'running',
      steps: [],
      from: mailConfig.fromEmail,
      fromName: mailConfig.fromName,
      to: mailConfig.testRecipient || mailConfig.fromEmail,
      subject: form.subject ? `[TEST] ${form.subject.trim()}` : '',
    })
    try {
      if (!mailConfig.configured) {
        throw new Error(
          sendGridClientHint(mailConfig) ||
            'SendGrid is not configured.',
        )
      }
      await sendTestEmail({
        toEmail: mailConfig.testRecipient || mailConfig.fromEmail,
        toName: mailConfig.fromName || mailConfig.testRecipient || mailConfig.fromEmail,
        subject: `[TEST] ${form.subject.trim()}`,
        htmlBody: form.htmlBody,
        origin: window.location.origin,
        fromEmail: mailConfig.fromEmail,
        fromName: mailConfig.fromName,
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
            <button type="button" className="btn-secondary" onClick={handleTestSend} disabled={testing || !mailConfig.configured}>
              {testing ? 'Sending test…' : 'Send test to me'}
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>

        {!mailConfig.configured && (
          <p className="form-error">
            {sendGridClientHint(mailConfig)}
          </p>
        )}

        <div className="systems-card mailing-wide-card mailing-form">
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
            /unsubscribe page, with the recipient email in the URL). Host images at public https
            URLs. Enter starts a new paragraph (extra space). Shift+Enter is a line break. Select
            several short lines and click Tight to stack them with no gap. If the template has no
            unsubscribe link, one is added at the bottom of campaign emails. The preview on the
            right is wrapped the same way Outlook will receive it (600px card, inline styles).
          </p>
          <EmailHtmlEditor
            contentKey={editing}
            html={form.htmlBody}
            subject={form.subject}
            fromName={mailConfig.fromName}
            fromEmail={mailConfig.fromEmail}
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
            Subject, body, and merge tags live on the template. No Exchange mailbox connection is
            required here. Use Send test (SendGrid) to preview in your inbox. Campaigns pick which
            template and audience to send.
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
          <p className="muted">No templates yet. Create one and use Send test to me before a campaign.</p>
        ) : (
          <table className="systems-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Subject</th>
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
