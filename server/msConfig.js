/** Public Microsoft SPA settings (client id + tenant are not secrets). */
export function getPublicMicrosoftConfig(env = process.env) {
  const tenantId = (env.VITE_MS_TENANT_ID || env.MS_TENANT_ID || '').trim()
  const clientId = (env.VITE_MS_CLIENT_ID || env.MS_CLIENT_ID || '').trim()
  const redirectUri = (env.VITE_MS_REDIRECT_URI || env.MS_REDIRECT_URI || '').trim()
  return {
    tenantId,
    clientId,
    redirectUri: redirectUri || null,
  }
}

export function isMicrosoftConfigPresent(env = process.env) {
  const { tenantId, clientId } = getPublicMicrosoftConfig(env)
  return Boolean(tenantId && clientId)
}
