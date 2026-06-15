/** Shared prompt defaults and template rendering (client + server). */

export const BATCH_SIZE = 12

export const PROMPT_VARIANTS = {
  project: 'project',
  prospect: 'prospect',
}

export const PROJECT_USER_PLACEHOLDERS = [
  '{{projectName}}',
  '{{clientCompany}}',
  '{{aiContext}}',
  '{{emails}}',
]

export const PROSPECT_USER_PLACEHOLDERS = ['{{senderEmail}}', '{{emails}}']

export const DEFAULT_PROJECT_SYSTEM_PROMPT = `You classify and summarise client project emails for a workbench table.

INBOUND (client to me):
- Informative: update, answer, confirmation, or material with no clear ask for me to act.
- Request: client asks me to do something, answer, fix, quote, review, decide, or reports a bug or change.

OUTBOUND (me to client):
- Informative: I inform or answer; no new deliverable and no clear ask for the client to act.
- Request: I ask the client to provide, confirm, approve, or act.
- Release: I hand over work to test, review, or use (files, builds, logins, reports, fixes). Prefer Release when attachments look like deliverables, even if the email also explains.

Rules:
- Classify from this message; use project context only if helpful.
- Mixed information and an ask means Request.
- Thanks, received, or looks good with no new ask means Informative.
- Ignore old quoted thread unless needed for the latest message.
- summary: exactly one short sentence (under 30 words) for scanning the pipeline — not a quote of the email.
- type: exactly one allowed label for that direction.

Return valid JSON only.`

export const DEFAULT_PROJECT_USER_PROMPT_TEMPLATE = `Project name: {{projectName}}
Client company: {{clientCompany}}
Project notes: {{aiContext}}

Review each email below and classify it for the workbench pipeline.

{{emails}}

Reply with JSON only: a results array with one entry per email id. Each entry needs id (same as input), summary (one short sentence under 30 words), and type.
Use Informative or Request for inbound. For outbound use Informative, Request, or Release when handing over deliverables.`

export const DEFAULT_PROSPECT_SYSTEM_PROMPT = `You triage prospect and lead-queue emails before a project exists on the workbench.

There is NO project scope, client folder, or delivery context yet. Judge each message on its own merits.

INBOUND (prospect or unknown sender to me):
- New inquiry: first contact, new business opportunity, quote request, or introduction that looks like a potential lead.
- Follow-up: sender chasing a previous enquiry with no project assigned yet.
- Informative: FYI, confirmation, or material with no clear ask for me to act.
- Request: sender asks me to do something specific (call, quote, meeting, send info, fix something).

OUTBOUND (me to prospect or unknown sender):
- Informative: I inform or answer; no clear ask for the sender to act.
- Request: I ask the sender to provide, confirm, approve, or act.

Rules:
- Prefer New inquiry when the message looks like a first-time business enquiry.
- Mixed information and an ask means Request.
- Ignore old quoted thread unless needed for the latest message.
- summary: one short sentence (under 30 words) capturing who they are, what they want, and lead potential — not a quote of the email.
- type: exactly one allowed label for that direction.

Return valid JSON only.`

export const DEFAULT_PROSPECT_USER_PROMPT_TEMPLATE = `Prospect lead queue — no project assigned yet.
Primary sender for this card: {{senderEmail}}

Review each email below and triage it as a potential new lead.

{{emails}}

Reply with JSON only: a results array with one entry per email id. Each entry needs id (same as input), summary (one short sentence under 30 words), and type.
Inbound types: New inquiry, Follow-up, Informative, Request.
Outbound types: Informative, Request.`

const SAMPLE_EMAIL = {
  id: 'example-message-id',
  direction: 'inbound',
  from: 'client@example.com',
  to: 'you@company.com',
  subject: 'RE: Dashboard update',
  bodyPreview: 'Thanks — looks good. Can you also add the export button by Friday?',
  attachments: [],
  date: '26 May 2026, 10:15',
}

const SAMPLE_PROSPECT_EMAIL = {
  id: 'example-lead-message-id',
  direction: 'inbound',
  from: 'prospect@newclient.co.uk',
  to: 'you@company.com',
  subject: 'Website enquiry',
  bodyPreview:
    'Hi, we found your site and would like a quote for a customer portal. Can you call me this week?',
  attachments: [],
  date: '26 May 2026, 09:40',
}

export function normalizePromptVariant(variant) {
  if (variant === 'unassigned' || variant === 'prospect') return PROMPT_VARIANTS.prospect
  return PROMPT_VARIANTS.project
}

function attachmentLabel(attachments) {
  const names = (attachments || []).map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
  return names.length ? names.join(', ') : 'none'
}

export function formatEmailsAsText(batch) {
  return (batch || [])
    .map((row, index) => {
      const lines = [
        `--- Email ${index + 1} ---`,
        `ID: ${row.id}`,
        `Direction: ${row.direction || 'inbound'}`,
        `From: ${row.from || '—'}`,
        `To: ${row.to || '—'}`,
        `Subject: ${row.subject || '—'}`,
        `Date: ${row.date || row.dateDisplay || '—'}`,
        `Attachments: ${attachmentLabel(row.attachments)}`,
        'Body:',
        row.bodyPreview || row.body || row.summary || '(empty)',
      ]
      return lines.join('\n')
    })
    .join('\n\n')
}

function applyTemplate(template, replacements) {
  let text = template || ''
  for (const [key, value] of Object.entries(replacements)) {
    text = text.split(key).join(value ?? '')
  }
  return text
}

export function renderProjectUserPrompt(batch, context, userPromptTemplate) {
  const template = userPromptTemplate || DEFAULT_PROJECT_USER_PROMPT_TEMPLATE
  return applyTemplate(template, {
    '{{projectName}}': context.projectName || 'Untitled',
    '{{clientCompany}}': context.clientCompany || '—',
    '{{aiContext}}': context.aiContext || '(none)',
    '{{emails}}': formatEmailsAsText(batch),
  })
}

export function renderProspectUserPrompt(batch, context, userPromptTemplate) {
  const template = userPromptTemplate || DEFAULT_PROSPECT_USER_PROMPT_TEMPLATE
  const sender =
    context.senderEmail || batch?.[0]?.from || 'See From field on each email below.'
  return applyTemplate(template, {
    '{{senderEmail}}': sender,
    '{{emails}}': formatEmailsAsText(batch),
  })
}

export function resolvePromptSet(variant, overrides = {}) {
  const key = normalizePromptVariant(variant)
  if (key === PROMPT_VARIANTS.prospect) {
    return {
      variant: key,
      systemPrompt: overrides.prospectSystemPrompt || DEFAULT_PROSPECT_SYSTEM_PROMPT,
      userPromptTemplate:
        overrides.prospectUserPromptTemplate || DEFAULT_PROSPECT_USER_PROMPT_TEMPLATE,
      renderUserPrompt: (batch, context) =>
        renderProspectUserPrompt(batch, context, overrides.prospectUserPromptTemplate),
    }
  }
  return {
    variant: key,
    systemPrompt: overrides.projectSystemPrompt || DEFAULT_PROJECT_SYSTEM_PROMPT,
    userPromptTemplate: overrides.projectUserPromptTemplate || DEFAULT_PROJECT_USER_PROMPT_TEMPLATE,
    renderUserPrompt: (batch, context) =>
      renderProjectUserPrompt(batch, context, overrides.projectUserPromptTemplate),
  }
}

export function getDefaultPromptConfig() {
  const sampleContext = {
    projectName: 'Example project',
    clientCompany: 'Example Client Ltd',
    aiContext: 'Optional notes about the project for the model.',
  }
  const prospectSampleContext = {
    senderEmail: 'prospect@newclient.co.uk',
  }

  return {
    project: {
      systemPrompt: DEFAULT_PROJECT_SYSTEM_PROMPT,
      userPromptTemplate: DEFAULT_PROJECT_USER_PROMPT_TEMPLATE,
      userPromptExample: renderProjectUserPrompt([SAMPLE_EMAIL], sampleContext),
      placeholders: PROJECT_USER_PLACEHOLDERS,
    },
    prospect: {
      systemPrompt: DEFAULT_PROSPECT_SYSTEM_PROMPT,
      userPromptTemplate: DEFAULT_PROSPECT_USER_PROMPT_TEMPLATE,
      userPromptExample: renderProspectUserPrompt(
        [SAMPLE_PROSPECT_EMAIL],
        prospectSampleContext,
      ),
      placeholders: PROSPECT_USER_PLACEHOLDERS,
    },
  }
}

export function mergePromptOverrides(stored = {}) {
  const pick = (value, fallback) => {
    const trimmed = (value || '').trim()
    return trimmed || fallback
  }
  return {
    projectSystemPrompt: pick(stored.projectSystemPrompt, DEFAULT_PROJECT_SYSTEM_PROMPT),
    projectUserPromptTemplate: pick(
      stored.projectUserPromptTemplate,
      DEFAULT_PROJECT_USER_PROMPT_TEMPLATE,
    ),
    prospectSystemPrompt: pick(stored.prospectSystemPrompt, DEFAULT_PROSPECT_SYSTEM_PROMPT),
    prospectUserPromptTemplate: pick(
      stored.prospectUserPromptTemplate,
      DEFAULT_PROSPECT_USER_PROMPT_TEMPLATE,
    ),
  }
}

