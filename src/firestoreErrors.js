import { isHostedBrowser } from './runtimeMode.js'

export function isFirestorePermissionError(err) {
  const code = err?.code || ''
  const message = err instanceof Error ? err.message : String(err || '')
  return (
    code === 'permission-denied' ||
    /permission/i.test(message) ||
    /insufficient permissions/i.test(message)
  )
}

export function formatFirestoreError(err) {
  const message = err instanceof Error ? err.message : String(err || '')
  if (isFirestorePermissionError(err)) {
    return isHostedBrowser()
      ? `${message} Check FIREBASE_* on App Hosting (RUNTIME).`
      : `${message} Check FIREBASE_* in .env.local.`
  }
  return message
}

export function asFirestoreError(err) {
  return new Error(formatFirestoreError(err))
}
