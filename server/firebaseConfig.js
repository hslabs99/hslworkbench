/** Server-only Firebase web config. Never use a VITE_ prefix — Vite would inline it in the browser. */

export function getFirebaseConfig(env = process.env) {
  return {
    apiKey: env.FIREBASE_API_KEY || '',
    authDomain: env.FIREBASE_AUTH_DOMAIN || '',
    projectId: env.FIREBASE_PROJECT_ID || '',
    storageBucket: env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.FIREBASE_APP_ID || '',
  }
}

export function isFirebaseConfigured(env = process.env) {
  const config = getFirebaseConfig(env)
  return Boolean(config.apiKey && config.projectId && config.appId)
}
