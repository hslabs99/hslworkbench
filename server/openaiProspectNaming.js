import OpenAI from 'openai'
import { DEFAULT_PROSPECT_NAME_SYSTEM_PROMPT } from '../src/prospectProjectNaming.js'
import { formatOpenAIError } from './openaiErrors.js'

function sanitizeProjectName(raw) {
  let name = String(raw || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ')
  if (!name) return ''
  if (name.length > 72) name = `${name.slice(0, 71)}…`
  return name
}

export async function suggestProspectProjectName(
  { senderEmail, senderName, subject, body, promptOverrides = {} },
  env = process.env,
) {
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env.local and restart npm run dev.',
    )
  }

  const systemPrompt =
    (promptOverrides.prospectNameSystemPrompt || '').trim() ||
    DEFAULT_PROSPECT_NAME_SYSTEM_PROMPT

  const userLines = [
    `Sender: ${senderName || '—'} <${senderEmail || '—'}>`,
    `Subject: ${subject || '(no subject)'}`,
    'Body:',
    body || '(empty)',
  ]

  const client = new OpenAI({ apiKey })
  const model = env.OPENAI_MODEL || 'gpt-4o-mini'

  let response
  try {
    response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userLines.join('\n') },
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

  return {
    projectName: sanitizeProjectName(parsed.projectName),
    description: String(parsed.description || '').trim(),
  }
}
