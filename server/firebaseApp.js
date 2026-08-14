import { getApps, initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getFirebaseConfig, isFirebaseConfigured } from './firebaseConfig.js'
import { loadLocalEnv } from './loadLocalEnv.js'

let loggedProject = false

export function getServerFirestore(env = {}) {
  loadLocalEnv()
  const resolved = { ...env, ...process.env }
  if (!isFirebaseConfigured(resolved)) {
    throw new Error(
      'Firebase is not configured. Set FIREBASE_* in .env.local (dev) or apphosting.yaml (RUNTIME).',
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
