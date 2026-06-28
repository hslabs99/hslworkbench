/** SPA / public-client config — client secret is not used in the browser. */

export function buildMsalConfig({ tenantId = '', clientId = '', redirectUri = '' } = {}) {
  const resolvedTenant = tenantId || import.meta.env.VITE_MS_TENANT_ID || ''
  const resolvedClient = clientId || import.meta.env.VITE_MS_CLIENT_ID || ''
  const resolvedRedirect =
    redirectUri ||
    import.meta.env.VITE_MS_REDIRECT_URI ||
    `${window.location.origin}/auth/microsoft/callback`

  return {
    auth: {
      clientId: resolvedClient,
      authority: `https://login.microsoftonline.com/${resolvedTenant || 'common'}`,
      redirectUri: resolvedRedirect,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false,
    },
  }
}

/** @deprecated use buildMsalConfig() — kept for modules that read static config */
export const msalConfig = buildMsalConfig()

export const graphScopes = ['User.Read', 'Mail.Read']

export function isMicrosoftConfiguredFromBuild() {
  return Boolean(import.meta.env.VITE_MS_CLIENT_ID && import.meta.env.VITE_MS_TENANT_ID)
}

export function isMicrosoftConfiguredValues({ tenantId, clientId } = {}) {
  return Boolean(tenantId && clientId)
}
