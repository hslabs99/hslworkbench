import OpenAI from 'openai'
import {
  BATCH_SIZE,
  normalizePromptVariant,
  resolvePromptSet,
} from './aiPrompts.js'
import { formatOpenAIError } from './openaiErrors.js'

function formatTypeLabelAfterAi(row, type) {
  const dir = row.direction === 'outbound' ? 'Outbound' : row.inInbox ? 'Inbound (Inbox)' : 'Inbound'
  return `${dir} · ${type}`
}

const VALID_INBOUND = new Set(['Informative', 'Request'])
const VALID_OUTBOUND = new Set(['Informative', 'Request', 'Release'])
const VALID_PROSPECT_INBOUND = new Set(['New inquiry', 'Follow-up', 'Informative', 'Request'])
const VALID_PROSPECT_OUTBOUND = new Set(['Informative', 'Request'])

function normalizeType(type, direction, hasAttachments, { promptVariant = 'project' } = {}) {
  const t = String(type || '').trim()
  const variant = normalizePromptVariant(promptVariant)
  if (variant === 'prospect') {
    if (direction === 'outbound') {
      if (VALID_PROSPECT_OUTBOUND.has(t)) return t
      return 'Informative'
    }
    if (VALID_PROSPECT_INBOUND.has(t)) return t
    return 'New inquiry'
  }
  if (direction === 'outbound') {
    if (VALID_OUTBOUND.has(t)) return t
    if (hasAttachments) return 'Release'
    return 'Informative'
  }
  if (VALID_INBOUND.has(t)) return t
  return 'Informative'
}

export async function summariseEmailBatch(
  batch,
  context,
  { apiKey, model, promptVariant = 'project', promptOverrides = {} },
) {
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env.local and restart npm run dev.',
    )
  }

  const promptSet = resolvePromptSet(promptVariant, promptOverrides)

  const client = new OpenAI({ apiKey })
  let response
  try {
    response = await client.chat.completions.create({
      model: model || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: promptSet.systemPrompt },
        { role: 'user', content: promptSet.renderUserPrompt(batch, context) },
      ],
    })
  } catch (err) {
    throw new Error(formatOpenAIError(err))
  }

  const raw = response.choices[0]?.message?.content
  if (!raw) throw new Error('OpenAI returned an empty response.')

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('OpenAI returned invalid JSON.')
  }

  const results = Array.isArray(parsed.results) ? parsed.results : parsed
  if (!Array.isArray(results)) {
    throw new Error('OpenAI JSON missing results array.')
  }

  const byId = new Map(results.map((r) => [r.id, r]))
  return batch.map((row) => {
    const ai = byId.get(row.id)
    const type = normalizeType(ai?.type, row.direction, (row.attachments || []).length > 0, {
      promptVariant,
    })
    const summary = (ai?.summary || row.summary || '').trim() || row.summary
    return {
      id: row.id,
      summary,
      type,
      typeLabel: formatTypeLabelAfterAi(row, type),
    }
  })
}

export async function summariseAllEmails(rows, context, env = process.env, options = {}) {
  const apiKey = env.OPENAI_API_KEY
  const model = env.OPENAI_MODEL || 'gpt-4o-mini'
  const promptVariant = options.promptVariant || context.promptVariant || 'project'
  const promptOverrides = options.promptOverrides || context.promptOverrides || {}

  const input = rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    inInbox: row.inInbox,
    from: row.from,
    to: row.to,
    subject: row.subject,
    bodyPreview: row.bodyPreview || row.summary || '',
    attachments: row.attachments,
    date: row.dateDisplay,
    summary: row.summary,
  }))

  const enriched = []
  for (let i = 0; i < input.length; i += BATCH_SIZE) {
    const batch = input.slice(i, i + BATCH_SIZE)
    const part = await summariseEmailBatch(batch, context, {
      apiKey,
      model,
      promptVariant,
      promptOverrides,
    })
    enriched.push(...part)
  }

  const byId = new Map(enriched.map((r) => [r.id, r]))
  return rows.map((row) => {
    const ai = byId.get(row.id)
    if (!ai) return row
    return {
      ...row,
      summary: ai.summary,
      type: ai.type,
      typeLabel: ai.typeLabel,
    }
  })
}
