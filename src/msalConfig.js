/** SPA / public-client config — client secret is not used in the browser. */
export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MS_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_MS_TENANT_ID || 'common'}`,
    redirectUri: import.meta.env.VITE_MS_REDIRECT_URI || `${window.location.origin}/auth/microsoft/callback`,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
}

export const graphScopes = ['User.Read', 'Mail.Read']

export function isMicrosoftConfigured() {
  return Boolean(import.meta.env.VITE_MS_CLIENT_ID && import.meta.env.VITE_MS_TENANT_ID)
}
