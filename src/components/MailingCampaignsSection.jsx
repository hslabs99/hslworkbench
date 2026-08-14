import { useEffect, useState } from 'react'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'
import { graphSendScopes } from '../msalConfig.js'
import { eligibleAudienceMembers, fetchMailingConfig, sendMailingCampaign } from '../mailingSend.js'
import { sendGridClientHint } from '../runtimeMode.js'
import {
  createMailingCampaign,
  deleteMailingCampaign,
  EMPTY_CAMPAIGN_STATS,
  getMailingAudience,
  getMailingTemplate,
  listSendsForCampaign,
  loadUnsubscribedEmails,
  subscribeMailingAudiences,
  subscribeMailingCampaigns,
  subscribeMailingTemplates,
  updateMailingCampaign,
} from '../mailings.js'
import ConfirmModal from './ConfirmModal.jsx'
import MailingCampaignPreview from './MailingCampaignPreview.jsx'
import MicrosoftConnectCard from './MicrosoftConnectCard.jsx'

const EMPTY = {
  name: '',
  description: '',
  templateId: '',
  audienceId: '',
  fromEmail: '',
  fromName: '',
  sendVia: 'graph',
}

function statsLine(stats = EMPTY_CAMPAIGN_STATS) {
  return `${stats.sent || 0} sent · ${stats.opened || 0} opened · ${stats.clicked || 0} clicked · ${stats.failed || 0} failed · ${stats.unsubscribed || 0} unsubscribed`
}

function sendViaLabel(value) {
  return value === 'sendgrid' ? 'SendGrid' : 'Outlook Graph'
}

export default function MailingCampaignsSection() {
  const { account, getAccessToken, userEmail, userName } = useMicrosoftAuth()
  const [campaigns, setCampaigns] = useState([])
  const [templates, setTemplates] = useState([])
  const [audiences, setAudiences] = useState([])
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
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(null)
  const [sends, setSends] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [sendConfirm, setSendConfirm] = useState(false)
  const [unsubscribed, setUnsubscribed] = useState(() => new Set())
  const [fullTemplate, setFullTemplate] = useState(null)
  const [fullAudience, setFullAudience] = useState(null)
  const [campaignTab, setCampaignTab] = useState('campaign')

  useEffect(() => {
    const unsubC = subscribeMailingCampaigns(
      (rows) => {
        setCampaigns(rows)
        setLoading(false)
      },
      (err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )
    const unsubT = subscribeMailingTemplates(setTemplates, (err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
    const unsubA = subscribeMailingAudiences(setAudiences, (err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
    loadUnsubscribedEmails()
      .then(setUnsubscribed)
      .catch(() => {})
    fetchMailingConfig()
      .then(setMailConfig)
      .catch((err) => {
        setMailConfig((prev) => ({
          ...prev,
          configured: false,
          setupHint: err instanceof Error ? err.message : String(err),
        }))
      })
    return () => {
      unsubC()
      unsubT()
      unsubA()
    }
  }, [])

  useEffect(() => {
    if (!form.templateId) {
      setFullTemplate(null)
      return
    }
    let cancelled = false
    getMailingTemplate(form.templateId)
      .then((row) => {
        if (!cancelled) setFullTemplate(row)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [form.templateId])

  useEffect(() => {
    if (!form.audienceId) {
      setFullAudience(null)
      return
    }
    let cancelled = false
    getMailingAudience(form.audienceId)
      .then((row) => {
        if (!cancelled) setFullAudience(row)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [form.audienceId])

  useEffect(() => {
    if (!userEmail) return
    setForm((f) => {
      if (f.sendVia === 'sendgrid') return f
      if (f.fromEmail === userEmail && (!userName || f.fromName === userName)) return f
      return { ...f, fromEmail: userEmail, fromName: userName || f.fromName }
    })
  }, [userEmail, userName])

  const selectedTemplate = fullTemplate || templates.find((t) => t.id === form.templateId) || null
  const selectedAudience = fullAudience || audiences.find((a) => a.id === form.audienceId) || null
  const sendableCount = eligibleAudienceMembers(fullAudience?.members, unsubscribed).length
  const sendVia = form.sendVia === 'sendgrid' ? 'sendgrid' : 'graph'
  const graphReady = Boolean(account && userEmail)
  const sendgridReady = Boolean(mailConfig.configured && form.fromEmail.trim())
  const fromReady = sendVia === 'graph' ? graphReady : sendgridReady
  const canSend =
    !sending &&
    editing !== 'new' &&
    Boolean(form.templateId) &&
    Boolean(form.audienceId) &&
    sendableCount > 0 &&
    fromReady

  const current = editing && editing !== 'new' ? campaigns.find((c) => c.id === editing) : null

  function startNew() {
    setEditing('new')
    setForm({
      ...EMPTY,
      sendVia: 'graph',
      fromEmail: userEmail || '',
      fromName: userName || '',
    })
    setSends([])
    setProgress(null)
    setError(null)
    setCampaignTab('campaign')
  }

  function startEdit(row) {
    const nextVia = row.sendVia === 'sendgrid' ? 'sendgrid' : 'graph'
    setEditing(row.id)
    setForm({
      name: row.name || '',
      description: row.description || '',
      templateId: row.templateId || '',
      audienceId: row.audienceId || '',
      sendVia: nextVia,
      fromEmail:
        nextVia === 'graph'
          ? userEmail || row.fromEmail || ''
          : row.fromEmail || mailConfig.fromEmail || '',
      fromName:
        nextVia === 'graph'
          ? userName || row.fromName || ''
          : row.fromName || mailConfig.fromName || '',
    })
    setProgress(null)
    setError(null)
    setCampaignTab('campaign')
    listSendsForCampaign(row.id)
      .then(setSends)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  function handleSendViaChange(next) {
    setForm((f) => {
      const nextForm = { ...f, sendVia: next }
      if (next === 'graph') {
        if (userEmail) {
          nextForm.fromEmail = userEmail
          nextForm.fromName = userName || f.fromName
        }
      } else if (!f.fromEmail || f.fromEmail === userEmail) {
        nextForm.fromEmail = mailConfig.fromEmail || f.fromEmail
        nextForm.fromName = mailConfig.fromName || f.fromName
      }
      return nextForm
    })
  }

  async function handleSave(e) {
    e?.preventDefault?.()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim() || 'Untitled campaign',
        description: form.description.trim(),
        templateId: form.templateId,
        templateName: selectedTemplate?.name || '',
        audienceId: form.audienceId,
        audienceName: selectedAudience?.name || '',
        sendVia,
        fromEmail: form.fromEmail.trim(),
        fromName: form.fromName.trim(),
      }
      if (editing === 'new') {
        const id = await createMailingCampaign(payload)
        setEditing(id)
      } else {
        await updateMailingCampaign(editing, payload)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSend() {
    setSendConfirm(false)
    if (editing === 'new') {
      setError('Save the campaign before sending.')
      return
    }

    const id = editing
    setSending(true)
    setError(null)
    try {
      if (sendVia === 'graph' && !graphReady) {
        throw new Error('Connect your Microsoft account to send via Outlook Graph.')
      }
      if (sendVia === 'sendgrid' && !mailConfig.configured) {
        throw new Error(
          sendGridClientHint(mailConfig) ||
            'SendGrid is not configured.',
        )
      }
      if (!form.fromEmail.trim()) {
        throw new Error(
          sendVia === 'sendgrid'
            ? 'Set a From email on this campaign.'
            : 'Connect Outlook so the campaign has a From address.',
        )
      }
      const template = (await getMailingTemplate(form.templateId)) || fullTemplate
      const audience = (await getMailingAudience(form.audienceId)) || fullAudience
      if (!template?.htmlBody) throw new Error('Select an email template.')
      if (!audience) throw new Error('Select an audience.')
      const result = await sendMailingCampaign({
        campaign: { id, name: form.name },
        template,
        audience,
        sendVia,
        fromEmail: form.fromEmail.trim(),
        fromName: form.fromName.trim(),
        origin: window.location.origin,
        getAccessToken,
        onProgress: setProgress,
      })
      const rows = await listSendsForCampaign(id)
      setSends(rows)
      setProgress({
        done: true,
        sent: result.sent,
        failed: result.failed,
        total: result.targeted,
        index: result.targeted,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteMailingCampaign(deleteTarget.id)
      if (editing === deleteTarget.id) setEditing(null)
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const connectCard = (
    <MicrosoftConnectCard
      scopes={graphSendScopes}
      hint="Campaigns can send from this Outlook mailbox (safer drip-feed for clients) or via SendGrid. Connect here to use Outlook Graph — Mail.Send consent is requested when you send."
    />
  )

  const sendConfirmMessage =
    sendVia === 'graph'
      ? `Send ${sendableCount} email${sendableCount === 1 ? '' : 's'} from your Outlook mailbox (${form.fromName || form.fromEmail} <${form.fromEmail}>) using “${selectedTemplate?.name || 'the selected template'}” to “${selectedAudience?.name || 'the selected audience'}”? Messages go one-by-one via Microsoft Graph with a short pause between each.`
      : `Send ${sendableCount} email${sendableCount === 1 ? '' : 's'} from ${form.fromName || form.fromEmail || 'SendGrid'} <${form.fromEmail}> using “${selectedTemplate?.name || 'the selected template'}” to “${selectedAudience?.name || 'the selected audience'}”? Each recipient is sent individually via SendGrid.`

  if (editing) {
    return (
      <section className="lookup-section mailing-section">
        <div className="mailing-editor-head">
          <h3 className="lookup-section-title">
            {editing === 'new' ? 'New campaign' : 'Campaign'}
          </h3>
          <div className="mailing-editor-head-actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Back to list
            </button>
            <button type="button" className="btn-secondary" onClick={handleSave} disabled={saving || sending}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setSendConfirm(true)}
              disabled={!canSend}
            >
              {sending ? 'Sending…' : `Send to ${sendableCount}`}
            </button>
          </div>
        </div>

        {connectCard}

        {sendVia === 'graph' && !graphReady && (
          <p className="form-error">Connect your Microsoft account to send this campaign via Outlook Graph.</p>
        )}
        {sendVia === 'sendgrid' && !mailConfig.configured && (
          <p className="form-error">
            {sendGridClientHint(mailConfig)}
          </p>
        )}

        <div className="detail-tabs settings-tabs" role="tablist" aria-label="Campaign sections">
          <button
            type="button"
            role="tab"
            className="detail-tab"
            aria-selected={campaignTab === 'campaign'}
            onClick={() => setCampaignTab('campaign')}
          >
            Campaign
          </button>
          <button
            type="button"
            role="tab"
            className="detail-tab"
            aria-selected={campaignTab === 'preview'}
            onClick={() => setCampaignTab('preview')}
          >
            Preview
          </button>
        </div>

        {campaignTab === 'preview' ? (
          <MailingCampaignPreview
            template={fullTemplate}
            audience={fullAudience}
            fromName={form.fromName}
            fromEmail={form.fromEmail}
            excludedEmails={unsubscribed}
          />
        ) : (
          <>
        <form className="systems-card mailing-wide-card mailing-form" onSubmit={handleSave}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className="full-width">
            Description
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label>
            Email template
            <select
              value={form.templateId}
              onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
              required
            >
              <option value="">Select template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.subject ? ` — ${t.subject}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Audience
            <select
              value={form.audienceId}
              onChange={(e) => setForm((f) => ({ ...f, audienceId: e.target.value }))}
              required
            >
              <option value="">Select audience…</option>
              {audiences.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.memberCount ?? 0})
                </option>
              ))}
            </select>
          </label>

          <div className="mailing-send-via full-width">
            <span>Send via</span>
            <div className="mailing-send-via-options" role="radiogroup" aria-label="Send via">
              <label className={`mailing-send-via-option${sendVia === 'graph' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="sendVia"
                  value="graph"
                  checked={sendVia === 'graph'}
                  onChange={() => handleSendViaChange('graph')}
                />
                <span>
                  Outlook Graph
                  <small>Drip-feed from the connected mailbox. Safer for client campaigns.</small>
                </span>
              </label>
              <label className={`mailing-send-via-option${sendVia === 'sendgrid' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="sendVia"
                  value="sendgrid"
                  checked={sendVia === 'sendgrid'}
                  onChange={() => handleSendViaChange('sendgrid')}
                />
                <span>
                  SendGrid
                  <small>API send from an authenticated domain. Faster for larger lists.</small>
                </span>
              </label>
            </div>
          </div>

          <label>
            From email
            <input
              type="email"
              value={form.fromEmail}
              onChange={(e) => setForm((f) => ({ ...f, fromEmail: e.target.value }))}
              placeholder={
                sendVia === 'graph'
                  ? userEmail || 'Connect Outlook…'
                  : mailConfig.fromEmail || 'you@example.com'
              }
              required
              readOnly={sendVia === 'graph'}
            />
          </label>
          <label>
            From name
            <input
              value={form.fromName}
              onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
              placeholder={
                sendVia === 'graph'
                  ? userName || 'Mailbox display name'
                  : mailConfig.fromName || 'Display name'
              }
              readOnly={sendVia === 'graph'}
            />
          </label>
          {sendVia === 'graph' && (
            <p className="muted full-width">
              Outlook Graph always sends as the connected mailbox. From name and address come from
              that account.
            </p>
          )}

          {selectedTemplate && (
            <p className="muted">
              Subject: <strong>{selectedTemplate.subject || '(none)'}</strong>
            </p>
          )}
          {selectedAudience && (
            <p className="muted">
              {sendableCount} sendable of {fullAudience?.members?.length || selectedAudience.memberCount || 0} members (exclusions
              skipped).
            </p>
          )}

          {current && (
            <div className="mailing-stats">
              <strong>{current.status || 'draft'}</strong>
              <span>{sendViaLabel(current.sendVia)}</span>
              <span>{statsLine(current.stats)}</span>
            </div>
          )}

          {progress && (
            <p className={progress.done ? 'harvest-client-emails-result' : 'muted'}>
              {progress.done
                ? `Finished: ${progress.sent} sent, ${progress.failed} failed (${progress.total} targeted).`
                : `Sending ${progress.index} of ${progress.total} — ${progress.email || ''}`}
            </p>
          )}

          {error && <p className="form-error">{error}</p>}
        </form>

        {sends.length > 0 && (
          <div className="systems-card mailing-wide-card">
            <h4>Send log</h4>
            <div className="mailing-table-wrap">
              <table className="systems-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {sends.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.name ? `${row.name} · ` : ''}
                        {row.email}
                      </td>
                      <td>{row.status}</td>
                      <td className="muted">{row.error || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
          </>
        )}

        <ConfirmModal
          open={sendConfirm}
          title="Send campaign?"
          message={sendConfirmMessage}
          confirmLabel={`Send ${sendableCount}`}
          busy={sending}
          onConfirm={handleSend}
          onCancel={() => setSendConfirm(false)}
        />
      </section>
    )
  }

  return (
    <section className="lookup-section mailing-section">
      <div className="mailing-editor-head">
        <div>
          <h3 className="lookup-section-title">Campaigns</h3>
          <p className="lookup-section-intro muted">
            Name a send, pick a template and an audience, then choose Outlook Graph or SendGrid on
            the campaign. Graph drip-feeds from the connected mailbox; SendGrid uses your
            authenticated domain.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={startNew}>
          New campaign
        </button>
      </div>
      {connectCard}
      {error && <p className="form-error">{error}</p>}
      <div className="systems-card mailing-wide-card">
        {loading ? (
          <p className="muted">Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <p className="muted">No campaigns yet.</p>
        ) : (
          <table className="systems-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Template</th>
                <th>Audience</th>
                <th>Send via</th>
                <th>Status</th>
                <th>Metrics</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button type="button" className="mailing-name-btn" onClick={() => startEdit(row)}>
                      {row.name}
                    </button>
                    {row.description ? <div className="muted">{row.description}</div> : null}
                  </td>
                  <td>{row.templateName || '—'}</td>
                  <td>{row.audienceName || '—'}</td>
                  <td>{sendViaLabel(row.sendVia)}</td>
                  <td>{row.status || 'draft'}</td>
                  <td className="muted">{statsLine(row.stats)}</td>
                  <td className="systems-col-actions">
                    <button type="button" className="btn-secondary btn-small" onClick={() => startEdit(row)}>
                      Open
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
        title="Delete campaign?"
        message={`Delete “${deleteTarget?.name || ''}” and its send log?`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
