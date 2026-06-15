/**
 * Dev server proxies to Vite plugin (OPENAI_API_KEY in .env.local, not exposed to browser).
 */

const DEFAULT_BATCH_SIZE = 12

export async function fetchAiConfig() {
  const res = await fetch('/api/ai-config')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Failed to load AI config (${res.status})`)
  }
  return data
}

export async function testOpenAIConnection() {
  const res = await fetch('/api/test-openai', { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `OpenAI test failed (${res.status})`)
  }
  return data
}

export async function enrichRowsWithOpenAI(
  rows,
  context,
  { promptVariant = 'project', promptOverrides = null } = {},
) {
  const res = await fetch('/api/summarise-communications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows,
      projectName: context.projectName || '',
      clientCompany: context.clientCompany || '',
      aiContext: context.aiContext || '',
      senderEmail: context.senderEmail || '',
      promptVariant: context.promptVariant || promptVariant,
      promptOverrides: context.promptOverrides || promptOverrides || undefined,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `OpenAI summarise failed (${res.status})`)
  }
  return data.rows || rows
}

/**
 * Process emails in batches so the UI can show progress (matches server BATCH_SIZE).
 * onProgress({ done, total, batchIndex, batchCount })
 */
export async function enrichRowsWithOpenAIBatched(
  rows,
  context,
  {
    onProgress,
    batchSize = DEFAULT_BATCH_SIZE,
    promptVariant = 'project',
    promptOverrides = null,
  } = {},
) {
  const size = Math.max(1, batchSize)
  const batchCount = Math.ceil(rows.length / size) || 0
  const all = []

  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size)
    const batchIndex = Math.floor(i / size) + 1
    const part = await enrichRowsWithOpenAI(batch, context, { promptVariant, promptOverrides })
    all.push(...part)
    const done = Math.min(i + batch.length, rows.length)
    onProgress?.({ done, total: rows.length, batchIndex, batchCount })
  }

  return all
}
