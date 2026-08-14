import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function envFileExists(root, name) {
  return fs.existsSync(path.join(root, name))
}

/** Cloud Run / Firebase App Hosting inject these. Vite and a laptop do not. */
export function isCloudRun() {
  return Boolean(
    process.env.K_SERVICE ||
      process.env.K_REVISION ||
      process.env.K_CONFIGURATION,
  )
}

/**
 * 'hosted' = App Hosting / Cloud Run process env + Secret Manager.
 * 'local' = Vite or laptop, keys from .env.local.
 * Does not use NODE_ENV — `vite build` and some hosts set that to production either way.
 */
export function getRuntimeMode(root = PROJECT_ROOT) {
  const pinned = String(process.env.HSL_RUNTIME || '').trim().toLowerCase()
  if (pinned === 'hosted' || pinned === 'local') return pinned
  if (isCloudRun()) return 'hosted'
  if (envFileExists(root, '.env.local')) return 'local'
  if (process.env.NODE_ENV === 'production') return 'hosted'
  return 'local'
}

export function isHostedRuntime(root = PROJECT_ROOT) {
  return getRuntimeMode(root) === 'hosted'
}

export function pinRuntimeMode(mode) {
  if (mode === 'hosted' || mode === 'local') {
    process.env.HSL_RUNTIME = mode
  }
  return getRuntimeMode()
}
