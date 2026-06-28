import { getAiPromptConfig } from './aiPrompts.js'
import { openAiKeyMissingMessage } from './envHints.js'
import { readJsonBody, sendJson } from './httpUtils.js'
import { formatOpenAIError } from './openaiErrors.js'
import { suggestProspectProjectName } from './openaiProspectNaming.js'
import { summariseAllEmails } from './openaiSummarise.js'

/**
 * Handle OpenAI-related /api routes. Returns true if the request was handled.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function handleOpenAiApi(req, res, pathname, env = process.env) {
  if (pathname === '/api/ai-config' && req.method === 'GET') {
    sendJson(res, 200, getAiPromptConfig(env))
    return true
  }

  if (pathname === '/api/test-openai' && req.method === 'POST') {
    try {
      const apiKey = env.OPENAI_API_KEY
      if (!apiKey) {
        sendJson(res, 500, { error: openAiKeyMissingMessage() })
        return true
      }

      const { default: OpenAI } = await import('openai')
      const client = new OpenAI({ apiKey })
      const model = env.OPENAI_MODEL || 'gpt-4o-mini'
      let completion
      try {
        completion = await client.chat.completions.create({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Reply with exactly the word OK.' }],
        })
      } catch (err) {
        sendJson(res, 500, { error: formatOpenAIError(err) })
        return true
      }
      const reply = completion.choices[0]?.message?.content?.trim() || ''
      sendJson(res, 200, { ok: true, model, reply })
    } catch (err) {
      sendJson(res, 500, { error: formatOpenAIError(err) })
    }
    return true
  }

  if (pathname === '/api/suggest-prospect-name' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const { senderEmail, senderName, subject, body: emailBody, promptOverrides } = body
      if (!senderEmail && !subject && !emailBody) {
        sendJson(res, 400, { error: 'No lead email content to name from.' })
        return true
      }
      const result = await suggestProspectProjectName(
        {
          senderEmail,
          senderName,
          subject,
          body: emailBody,
          promptOverrides: promptOverrides || {},
        },
        env,
      )
      sendJson(res, 200, result)
    } catch (err) {
      sendJson(res, 500, { error: formatOpenAIError(err) })
    }
    return true
  }

  if (pathname === '/api/summarise-communications' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const {
        rows,
        projectName,
        clientCompany,
        aiContext,
        senderEmail,
        promptVariant,
        promptOverrides,
      } = body

      if (!Array.isArray(rows) || rows.length === 0) {
        sendJson(res, 400, { error: 'No emails to summarise.' })
        return true
      }

      const enriched = await summariseAllEmails(
        rows,
        {
          projectName,
          clientCompany,
          aiContext,
          senderEmail,
          promptVariant,
          promptOverrides,
        },
        env,
        { promptVariant: promptVariant || 'project', promptOverrides: promptOverrides || {} },
      )

      sendJson(res, 200, { rows: enriched })
    } catch (err) {
      sendJson(res, 500, { error: formatOpenAIError(err) })
    }
    return true
  }

  return false
}
