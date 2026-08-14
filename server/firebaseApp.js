import { getApps, initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getFirebaseConfig, isFirebaseConfigured } from './firebaseConfig.js'
import { loadLocalEnv } from './loadLocalEnv.js'
import { isHostedRuntime } from './runtimeMode.js'

let loggedProject = false

export function getServerFirestore(env = {}) {
  loadLocalEnv()
  const resolved = { ...env, ...process.env }
  if (!isFirebaseConfigured(resolved)) {
    throw new Error(
      isHostedRuntime()
        ? 'Firebase is not configured. Set FIREBASE_* in apphosting.yaml (RUNTIME) and redeploy.'
        : 'Firebase is not configured. Set FIREBASE_* in .env.local and restart the dev server.',
    )
  }
  const config = getFirebaseConfig(resolved)
  if (!loggedProject) {
    loggedProject = true
    console.log(`[hsl-workbench] Firestore: cloud project "${config.projectId}"`)
  }
  const existing = getApps().find((app) => app.options?.projectId === config.projectId)
  const app = existing ?? initializeApp(config, config.projectId)
  return getFirestore(app)
}
