/** Google Secret Manager — single source for server secrets (local + App Hosting). */
export const OPENAI_SECRET_ID = 'openaiApiKey'

const DEFAULT_GCP_PROJECT = 'hslworkbench'

let secretsPromise = null

function gcpProjectId() {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    DEFAULT_GCP_PROJECT
  )
}

async function accessSecret(secretId) {
  const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager')
  const client = new SecretManagerServiceClient()
  const name = `projects/${gcpProjectId()}/secrets/${secretId}/versions/latest`
  const [response] = await client.accessSecretVersion({ name })
  const value = response.payload?.data?.toString('utf8').trim() ?? ''
  if (!value) {
    throw new Error(`Secret "${secretId}" is empty.`)
  }
  return value
}

async function loadServerSecrets() {
  if (process.env.OPENAI_API_KEY?.trim()) {
    console.log('[hsl-workbench] OpenAI key ready (runtime env)')
    return
  }

  try {
    process.env.OPENAI_API_KEY = await accessSecret(OPENAI_SECRET_ID)
    console.log(`[hsl-workbench] OpenAI key loaded from Secret Manager (${OPENAI_SECRET_ID})`)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to load OpenAI key from Secret Manager (${OPENAI_SECRET_ID}): ${detail}`,
    )
  }
}

/** Load server secrets once; safe to call from dev and production entrypoints. */
export function ensureServerSecrets() {
  if (!secretsPromise) {
    secretsPromise = loadServerSecrets()
  }
  return secretsPromise
}
