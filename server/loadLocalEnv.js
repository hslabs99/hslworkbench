import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')

const FILE_OVERRIDE_KEYS = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
  'SENDGRID_FROM_NAME',
  'SENDGRID_TEST_RECIPIENT',
]

let loaded = false
let loadedFrom = []

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  try {
    return parseEnv(raw)
  } catch {
    return {}
  }
}

/**
 * Load `.env` then `.env.local` from the project root into process.env.
 * `.env.local` always wins for FIREBASE_* so empty shell vars cannot hide the file.
 */
export function loadLocalEnv(root = PROJECT_ROOT) {
  if (loaded) return process.env

  const files = [path.join(root, '.env'), path.join(root, '.env.local')]
  const merged = {}
  loadedFrom = []

  for (const filePath of files) {
    const parsed = readEnvFile(filePath)
    if (!Object.keys(parsed).length) continue
    loadedFrom.push(path.basename(filePath))
    Object.assign(merged, parsed)
  }

  for (const [key, value] of Object.entries(merged)) {
    if (value == null) continue
    const override = FILE_OVERRIDE_KEYS.includes(key)
    const current = process.env[key]
    if (override || current == null || current === '') {
      process.env[key] = String(value)
    }
  }

  loaded = true
  const projectId = process.env.FIREBASE_PROJECT_ID || '(missing)'
  const source = loadedFrom.length ? loadedFrom.join(' + ') : 'process env only'
  console.log(`[hsl-workbench] Env loaded (${source}). Firestore project "${projectId}". SendGrid ${process.env.SENDGRID_API_KEY ? 'configured' : 'missing'}`)
  return process.env
}

export function localEnvFilesLoaded() {
  return loadedFrom.slice()
}
