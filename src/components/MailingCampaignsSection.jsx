import { useEffect, useState } from 'react'
import { parseEmailAddress } from '../emailAddress.js'
import { emailLayoutLabel } from '../emailHtml.js'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'
import { graphSendScopes } from '../msalConfig.js'
import { eligibleAudienceMembers, fetchMailingConfig, normalizeBatchSize, sendMailingCampaign, sendTestEmail, unsentAudienceMembers } from '../mailingSend.js'
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
  uniqueMembers,
  updateMailingCampaign,
} from '../mailings.js'
import ConfirmModal from './ConfirmModal.jsx'
import MailingCampaignAnalytics from './MailingCampaignAnalytics.jsx'
import MailingCampaignPreview from './MailingCampaignPreview.jsx'
import MailingCampaignRecipients from './MailingCampaignRecipients.jsx'
import MailingCampaignSendModal from './MailingCampaignSendModal.jsx'
import MailingTestSendMenu, { testRecipientFromInput } from './MailingTestSendMenu.jsx'
import MailingTestSendModal from './MailingTestSendModal.jsx'
import MicrosoftConnectCard from './MicrosoftConnectCard.jsx'

const EMPTY = {
  name: '',
  description: '',
  templateId: '',
  audienceId: '',
  fromEmail: '',
  fromName: '',
  sendVia: 'graph',
  batchSize: 5,
  deliveryReceiptRequested: false,
  readReceiptRequested: false,
}

function localDateKey(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function sentBatchToday(lastBatchAt) {
  return Boolean(lastBatchAt) && localDateKey(lastBatchAt) === localDateKey()
}

function lastBatchLine(lastBatchAt) {
  if (!lastBatchAt) return ''
  const date = new Date(lastBatchAt)
  if (Number.isNaN(date.getTime())) return ''
  if (sentBatchToday(lastBatchAt)) return `A batch already went out today (${date.toLocaleTimeString()}).`
  return `Last batch ${date.toLocaleString()}.`
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
  const [testing, setTesting] = useState(false)
  const [testReport, setTestReport] = useState(null)
  const [sends, setSends] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [sendSession, setSendSession] = useState(null)
  const [unsubscribed, setUnsubscribed] = useState(() => new Set())
  const [fullTemplate, setFullTemplate] = useState(null)
  const [fullAudience, setFullAudience] = useState(null)
  const [campaignTab, setCampaignTab] = useState('campaign')
  const [selectedEmails, setSelectedEmails] = useState(() => new Set())
  const [previewMembers, setPreviewMembers] = useState(null)

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
    setSelectedEmails(new Set())
    setPreviewMembers(null)
  }, [editing, form.audienceId])

  useEffect(() => {
    if (!userEmail) return
    setForm((f) => {
      if (f.sendVia === 'sendgrid') return f
      const nextName = f.fromName.trim() ? f.fromName : userName || f.fromName
      if (f.fromEmail === userEmail && nextName === f.fromName) return f
      return { ...f, fromEmail: userEmail, fromName: nextName }
    })
  }, [userEmail, userName])

  const selectedTemplate = fullTemplate || templates.find((t) => t.id === form.templateId) || null
  const selectedAudience = fullAudience || audiences.find((a) => a.id === form.audienceId) || null
  const sendableCount = eligibleAudienceMembers(fullAudience?.members, unsubscribed).length
  const remainingMembers = unsentAudienceMembers(fullAudience?.members, unsubscribed, sends)
  const remainingCount = remainingMembers.length
  const alreadySentCount = Math.max(0, sendableCount - remainingCount)
  const sendVia = form.sendVia === 'sendgrid' ? 'sendgrid' : 'graph'
  const batchSize = normalizeBatchSize(form.batchSize)
  const todayTake = Math.min(batchSize, remainingCount || batchSize)
  const graphReady = Boolean(account && userEmail)
  const sendgridReady = Boolean(mailConfig.configured && form.fromEmail.trim())
  const fromReady = sendVia === 'graph' ? graphReady : sendgridReady
  const canTest =
    !testing &&
    !sending &&
    Boolean(selectedTemplate?.htmlBody) &&
    Boolean(String(selectedTemplate?.subject || '').trim()) &&
    fromReady
  const canBatch =
    !sending &&
    !testing &&
    editing !== 'new' &&
    Boolean(form.templateId) &&
    Boolean(form.audienceId) &&
    remainingCount > 0 &&
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
    setSendSession(null)
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
      batchSize: normalizeBatchSize(row.batchSize),
      fromEmail:
        nextVia === 'graph'
          ? userEmail || row.fromEmail || ''
          : row.fromEmail || mailConfig.fromEmail || '',
      fromName: row.fromName || (nextVia === 'graph' ? userName : mailConfig.fromName) || '',
      deliveryReceiptRequested: Boolean(row.deliveryReceiptRequested),
      readReceiptRequested: Boolean(row.readReceiptRequested),
    })
    setSendSession(null)
    setError(null)
    setCampaignTab('recipients')
    listSendsForCampaign(row.id)
      .then(setSends)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  function handleSendViaChange(next) {
    setForm((f) => {
      const nextForm = { ...f, sendVia: next }
      if (next === 'graph') {
        if (userEmail) nextForm.fromEmail = userEmail
      } else if (!f.fromEmail || f.fromEmail === userEmail) {
        nextForm.fromEmail = mailConfig.fromEmail || f.fromEmail
        if (!f.fromName.trim() || f.fromName === userName) {
          nextForm.fromName = mailConfig.fromName || f.fromName
        }
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
        batchSize,
        deliveryReceiptRequested: Boolean(form.deliveryReceiptRequested),
        readReceiptRequested: Boolean(form.readReceiptRequested),
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

  async function handleTestSend(recipientRaw) {
    setTesting(true)
    setError(null)
    const fromEmail = sendVia === 'graph' ? userEmail : form.fromEmail.trim()
    const fromName = form.fromName.trim() || (sendVia === 'graph' ? userName || userEmail : '')
    const meEmail = parseEmailAddress(userEmail || mailConfig.testRecipient || '')
    const { email: toEmail, name: toName } = testRecipientFromInput(recipientRaw, {
      meEmail,
      meName: fromName || userName || meEmail,
    })
    setTestReport({
      status: 'running',
      provider: sendVia,
      steps: [],
      from: fromEmail,
      fromName,
      to: toEmail,
      toName,
      subject: selectedTemplate?.subject ? `[TEST] ${selectedTemplate.subject}` : '',
    })
    try {
      if (sendVia === 'graph' && !graphReady) {
        throw new Error('Connect your Microsoft account to send a test via Outlook Graph.')
      }
      if (sendVia === 'sendgrid' && !mailConfig.configured) {
        throw new Error(sendGridClientHint(mailConfig) || 'SendGrid is not configured.')
      }
      if (!toEmail) throw new Error('Enter an email address to send the test to.')
      const template = (await getMailingTemplate(form.templateId)) || selectedTemplate
      if (!template?.htmlBody) throw new Error('Select an email template with a body.')
      if (!String(template.subject || '').trim()) throw new Error('The email template needs a subject.')
      await sendTestEmail({
        sendVia,
        toEmail,
        toName: toName || toEmail,
        subject: `[TEST] ${template.subject.trim()}`,
        htmlBody: template.htmlBody,
        origin: window.location.origin,
        fromEmail,
        fromName,
        layout: template.layout,
        deliveryReceiptRequested: Boolean(form.deliveryReceiptRequested),
        readReceiptRequested: Boolean(form.readReceiptRequested),
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

  function openSendBatch(batchSize) {
    if (!canBatch) return
    const take = batchSize === 'all' ? remainingMembers.length : Math.min(Number(batchSize), remainingMembers.length)
    const preview = remainingMembers.slice(0, take).map((row) => ({
      email: row.email,
      name: row.name || '',
      status: 'pending',
      error: '',
    }))
    setError(null)
    setSendSession({
      open: true,
      phase: 'confirm',
      batchSize,
      selectedEmails: null,
      rows: preview,
      remaining: remainingCount,
      alreadySent: alreadySentCount,
      targeted: sendableCount,
      error: '',
    })
  }

  function openSendSelected() {
    const members = remainingMembers.filter((row) => selectedEmails.has(row.email))
    if (!members.length) {
      setError('Select one or more unsent contacts to send.')
      return
    }
    const preview = members.map((row) => ({
      email: row.email,
      name: row.name || '',
      status: 'pending',
      error: '',
    }))
    setError(null)
    setCampaignTab('recipients')
    setSendSession({
      open: true,
      phase: 'confirm',
      batchSize: members.length,
      selectedEmails: members.map((row) => row.email),
      rows: preview,
      remaining: remainingCount,
      alreadySent: alreadySentCount,
      targeted: sendableCount,
      error: '',
    })
  }

  function openPreview(members) {
    if (Array.isArray(members) && members.length) {
      setPreviewMembers(members)
    } else if (selectedEmails.size) {
      setPreviewMembers(
        uniqueMembers(fullAudience?.members).filter((row) => selectedEmails.has(row.email)),
      )
    } else {
      setPreviewMembers(null)
    }
    setCampaignTab('preview')
  }

  async function handleSend(size = sendSession?.batchSize ?? batchSize) {
    if (editing === 'new') {
      setError('Save the campaign before sending.')
      return
    }

    const id = editing
    const picked = sendSession?.selectedEmails || null
    setSending(true)
    setError(null)
    setSendSession((prev) =>
      prev
        ? { ...prev, open: true, phase: 'sending', error: '', batchSize: size }
        : {
            open: true,
            phase: 'sending',
            batchSize: size,
            rows: [],
            remaining: remainingCount,
            alreadySent: alreadySentCount,
            targeted: sendableCount,
            error: '',
          },
    )
    try {
      if (sendVia === 'graph' && !graphReady) {
        throw new Error('Connect your Microsoft account to send via Outlook Graph.')
      }
      if (sendVia === 'sendgrid' && !mailConfig.configured) {
        throw new Error(sendGridClientHint(mailConfig) || 'SendGrid is not configured.')
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
        campaign: {
          id,
          name: form.name,
          templateName: selectedTemplate?.name,
          stats: current?.stats,
          deliveryReceiptRequested: Boolean(form.deliveryReceiptRequested),
          readReceiptRequested: Boolean(form.readReceiptRequested),
        },
        template,
        audience,
        sendVia,
        fromEmail: form.fromEmail.trim(),
        fromName: form.fromName.trim(),
        origin: window.location.origin,
        getAccessToken,
        batchSize: size,
        selectedEmails: picked,
        onProgress: (event) => {
          setSendSession((prev) => {
            const base = prev || {
              open: true,
              phase: 'sending',
              batchSize: size,
              rows: [],
              remaining: remainingCount,
              alreadySent: alreadySentCount,
              targeted: sendableCount,
              error: '',
            }
            if (event.phase === 'start') {
              return {
                ...base,
                open: true,
                phase: 'sending',
                rows: event.rows || base.rows,
                remaining: event.remaining,
                alreadySent: event.alreadySent,
                targeted: event.targeted,
              }
            }
            if (event.phase === 'recipient') {
              return {
                ...base,
                open: true,
                phase: 'sending',
                remaining: event.remaining,
                alreadySent: event.alreadySent,
                rows: (base.rows || []).map((row) =>
                  row.email === event.email
                    ? {
                        ...row,
                        status: event.status,
                        error: event.error || '',
                        at: event.at || row.at,
                      }
                    : row,
                ),
              }
            }
            if (event.phase === 'done') {
              return {
                ...base,
                open: true,
                phase: 'done',
                remaining: event.remaining,
                alreadySent: event.alreadySent,
                targeted: event.targeted,
              }
            }
            return base
          })
        },
      })
      const rows = await listSendsForCampaign(id)
      setSends(rows)
      setSelectedEmails(new Set())
      setSendSession((prev) =>
        prev
          ? {
              ...prev,
              open: true,
              phase: 'done',
              remaining: result.remaining,
              alreadySent: result.alreadySent,
              targeted: result.targeted,
            }
          : prev,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setSendSession((prev) =>
        prev ? { ...prev, phase: prev.phase === 'confirm' ? 'confirm' : 'done', error: message } : prev,
      )
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
      hint="Connect Outlook to drip-feed from this mailbox. Stay signed in on this desktop — click Send today's batch once a day. Mail.Send consent is requested when you send."
    />
  )

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
            <button type="button" className="btn-secondary" onClick={handleSave} disabled={saving || sending || testing}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <MailingTestSendMenu
              disabled={!canTest}
              busy={testing}
              meEmail={parseEmailAddress(userEmail || mailConfig.testRecipient || '')}
              onSend={handleTestSend}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={() => openSendBatch(batchSize)}
              disabled={!canBatch}
            >
              Send today's {todayTake}
            </button>
            {remainingCount > batchSize ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => openSendBatch('all')}
                disabled={!canBatch}
              >
                Send remaining {remainingCount}
              </button>
            ) : null}
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
            aria-selected={campaignTab === 'recipients'}
            onClick={() => setCampaignTab('recipients')}
          >
            Recipients
            {fullAudience?.members?.length ? ` (${fullAudience.members.length})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            className="detail-tab"
            aria-selected={campaignTab === 'preview'}
            onClick={() => openPreview()}
          >
            Preview
          </button>
          <button
            type="button"
            role="tab"
            className="detail-tab"
            aria-selected={campaignTab === 'analytics'}
            onClick={() => setCampaignTab('analytics')}
          >
            Analytics
          </button>
        </div>

        {campaignTab === 'preview' ? (
          <MailingCampaignPreview
            template={fullTemplate}
            audience={fullAudience}
            fromName={form.fromName}
            fromEmail={form.fromEmail}
            excludedEmails={unsubscribed}
            members={previewMembers}
          />
        ) : campaignTab === 'recipients' ? (
          <>
            {error ? <p className="form-error">{error}</p> : null}
            <MailingCampaignRecipients
              audience={fullAudience}
              sends={sends}
              excludedEmails={unsubscribed}
              selectedEmails={selectedEmails}
              batchSize={batchSize}
              canSend={
                !sending &&
                editing !== 'new' &&
                Boolean(form.templateId) &&
                Boolean(form.audienceId) &&
                fromReady
              }
              sending={sending}
              onSelectedChange={setSelectedEmails}
              onSendSelected={openSendSelected}
              onPreviewSelected={(members) => openPreview(members)}
            />
          </>
        ) : campaignTab === 'analytics' ? (
          <MailingCampaignAnalytics
            sends={sends}
            remainingCount={remainingCount}
            sendableCount={sendableCount}
            campaignName={form.name}
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
            {selectedTemplate ? (
              <small className="muted">
                Format: {emailLayoutLabel(fullTemplate?.layout || selectedTemplate.layout)}. Change this on
                the Email templates tab.
              </small>
            ) : null}
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
                  <small>Send from the connected mailbox. Inbox From name is the Microsoft 365 display name, not this form.</small>
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
                  <small>API send from an authenticated domain. Use this when you need a branded From name such as XLS Experts.</small>
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
                  ? 'Used if you switch to SendGrid'
                  : mailConfig.fromName || 'Display name'
              }
            />
            {sendVia === 'graph' && (
              <small className="muted">
                Outlook will still show{' '}
                <strong>{userName || 'the Microsoft 365 display name'}</strong>, not this field.
              </small>
            )}
          </label>
          <div className="mailing-send-via full-width">
            <span>Tracking</span>
            <div className="mailing-send-via-options" role="group" aria-label="Tracking">
              <label
                className={`mailing-send-via-option${form.deliveryReceiptRequested ? ' is-selected' : ''}${
                  sendVia !== 'graph' ? ' is-disabled' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(form.deliveryReceiptRequested)}
                  disabled={sendVia !== 'graph'}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryReceiptRequested: e.target.checked }))}
                />
                <span>
                  Request a delivery receipt
                  <small>
                    Confirm the message was delivered to the recipient&apos;s email server. Receipts arrive in
                    this Outlook mailbox.
                  </small>
                </span>
              </label>
              <label
                className={`mailing-send-via-option${form.readReceiptRequested ? ' is-selected' : ''}${
                  sendVia !== 'graph' ? ' is-disabled' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(form.readReceiptRequested)}
                  disabled={sendVia !== 'graph'}
                  onChange={(e) => setForm((f) => ({ ...f, readReceiptRequested: e.target.checked }))}
                />
                <span>
                  Request a read receipt
                  <small>
                    Ask the recipient&apos;s email app to confirm they viewed the message. They can decline.
                  </small>
                </span>
              </label>
            </div>
            {sendVia !== 'graph' ? (
              <small className="muted">Delivery and read receipts are Outlook Graph options, same as in Outlook Options → Tracking.</small>
            ) : null}
          </div>

          <label>
            Emails per day
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={form.batchSize}
              onChange={(e) => setForm((f) => ({ ...f, batchSize: e.target.value }))}
              onBlur={() => setForm((f) => ({ ...f, batchSize: normalizeBatchSize(f.batchSize) }))}
            />
          </label>
          {sendVia === 'graph' && (
            <p className="muted full-width">
              Outlook Graph always sends from the connected mailbox
              ({userEmail || 'sign in to Outlook'}). Microsoft overwrites the From name with the
              mailbox display name in Microsoft 365 — currently{' '}
              <strong>{userName || 'the connected account'}</strong>. A test to yourself will keep
              showing that directory name. To appear as a brand (for example XLS Experts), send via
              SendGrid, or rename the mailbox in Microsoft 365. Click{' '}
              <strong>Send today&apos;s {todayTake}</strong> once a day while this app is open.
            </p>
          )}
          {sendVia === 'sendgrid' && (
            <p className="muted full-width">
              Click <strong>Send today&apos;s {todayTake}</strong> once a day. SendGrid is optional here;
              use it if you want API delivery instead of the Outlook mailbox.
            </p>
          )}

          {selectedTemplate && (
            <p className="muted">
              Subject: <strong>{selectedTemplate.subject || '(none)'}</strong>
            </p>
          )}
          {selectedAudience && (
            <p className="muted">
              {alreadySentCount} sent · {remainingCount} remaining of {sendableCount} sendable
              ({fullAudience?.members?.length || selectedAudience.memberCount || 0} in audience, exclusions
              skipped)
              {remainingCount > 0
                ? ` · about ${Math.ceil(remainingCount / batchSize)} day${Math.ceil(remainingCount / batchSize) === 1 ? '' : 's'} at ${batchSize} per day.`
                : '.'}
            </p>
          )}

          {current && (
            <div className="mailing-stats">
              <strong>{current.status || 'draft'}</strong>
              <span>{sendViaLabel(current.sendVia)}</span>
              <span>{batchSize} per day</span>
              {form.deliveryReceiptRequested ? <span>Delivery receipt</span> : null}
              {form.readReceiptRequested ? <span>Read receipt</span> : null}
              <span>{statsLine(current.stats)}</span>
            </div>
          )}
          {lastBatchLine(current?.lastBatchAt) ? (
            <p className={`muted${sentBatchToday(current?.lastBatchAt) ? ' mailing-batch-today' : ''}`}>
              {lastBatchLine(current?.lastBatchAt)}
            </p>
          ) : null}

          {remainingCount === 0 && sendableCount > 0 && (
            <p className="harvest-client-emails-result">All sendable contacts have been mailed this campaign.</p>
          )}

          {error && <p className="form-error">{error}</p>}
        </form>
          </>
        )}

        <MailingCampaignSendModal
          open={Boolean(sendSession?.open)}
          phase={sendSession?.phase || 'confirm'}
          campaignName={form.name}
          fromName={form.fromName}
          fromEmail={form.fromEmail}
          sendVia={sendVia}
          batchSize={sendSession?.batchSize || batchSize}
          remaining={sendSession?.remaining ?? remainingCount}
          alreadySent={sendSession?.alreadySent ?? alreadySentCount}
          targeted={sendSession?.targeted ?? sendableCount}
          rows={sendSession?.rows || []}
          error={sendSession?.error || ''}
          onStart={() => handleSend(sendSession?.batchSize ?? batchSize)}
          onSendMore={(size) => {
            openSendBatch(size ?? batchSize)
          }}
          onClose={() => !sending && setSendSession(null)}
        />
        <MailingTestSendModal
          open={Boolean(testReport)}
          report={testReport}
          onClose={() => !testing && setTestReport(null)}
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
            Name a send, pick a template and an audience, set how many emails to send each day, then
            click Send today&apos;s batch while this app is open. Already-sent contacts are skipped.
            Each send is stored on the contact in the master client list.
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
                <th>Batch</th>
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
                  <td className="muted">{row.batchSize || 5} / day</td>
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
