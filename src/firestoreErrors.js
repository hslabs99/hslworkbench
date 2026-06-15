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
  if (isFirestorePermissionError(err)) {
    return 'Missing or insufficient permissions. Deploy Firestore rules: firebase deploy --only firestore:rules'
  }
  return err instanceof Error ? err.message : String(err)
}

export function asFirestoreError(err) {
  return new Error(formatFirestoreError(err))
}
