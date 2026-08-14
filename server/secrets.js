/** Google Secret Manager — single source for server secrets (local + App Hosting). */
export const OPENAI_SECRET_ID = 'openaiApiKey'
export const SENDGRID_SECRET_ID = 'sendgridApiKey'

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

async function loadRequiredSecret(envKey, secretId, label) {
  if (process.env[envKey]?.trim()) {
    console.log(`[hsl-workbench] ${label} ready (runtime env)`)
    return
  }
  try {
    process.env[envKey] = await accessSecret(secretId)
    console.log(`[hsl-workbench] ${label} loaded from Secret Manager (${secretId})`)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to load ${label} from Secret Manager (${secretId}): ${detail}`)
  }
}

async function loadOptionalSecret(envKey, secretId, label) {
  if (process.env[envKey]?.trim()) {
    console.log(`[hsl-workbench] ${label} ready (runtime env)`)
    return
  }
  try {
    process.env[envKey] = await accessSecret(secretId)
    console.log(`[hsl-workbench] ${label} loaded from Secret Manager (${secretId})`)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.warn(`[hsl-workbench] ${label} not loaded (${secretId}): ${detail}`)
  }
}

async function loadServerSecrets() {
  await loadRequiredSecret('OPENAI_API_KEY', OPENAI_SECRET_ID, 'OpenAI key')
  await loadOptionalSecret('SENDGRID_API_KEY', SENDGRID_SECRET_ID, 'SendGrid key')
}

/** Load server secrets once; safe to call from dev and production entrypoints. */
export function ensureServerSecrets() {
  if (!secretsPromise) {
    secretsPromise = loadServerSecrets()
  }
  return secretsPromise
}
