import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { PublicClientApplication } from '@azure/msal-browser'
import {
  buildMsalConfig,
  graphScopes,
  isMicrosoftConfiguredFromBuild,
  isMicrosoftConfiguredValues,
} from './msalConfig.js'

const MicrosoftAuthContext = createContext(null)

let msalInstancePromise = null
let msalInstanceKey = ''

function getMsalInstance(config) {
  const key = `${config.auth.clientId}:${config.auth.authority}:${config.auth.redirectUri}`
  if (!msalInstancePromise || msalInstanceKey !== key) {
    msalInstanceKey = key
    msalInstancePromise = (async () => {
      const msal = new PublicClientApplication(config)
      await msal.initialize()
      return msal
    })()
  }
  return msalInstancePromise
}

async function resolveMicrosoftConfig() {
  if (isMicrosoftConfiguredFromBuild()) {
    return buildMsalConfig()
  }

  try {
    const res = await fetch('/api/ms-config')
    if (!res.ok) return null
    const data = await res.json()
    if (!isMicrosoftConfiguredValues(data)) return null
    return buildMsalConfig({
      tenantId: data.tenantId,
      clientId: data.clientId,
      redirectUri: data.redirectUri || undefined,
    })
  } catch {
    return null
  }
}

export function MicrosoftAuthProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [account, setAccount] = useState(null)
  const [initError, setInitError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const config = await resolveMicrosoftConfig()
      if (cancelled) return

      if (!config?.auth?.clientId || !config.auth.authority) {
        setConfigured(false)
        setReady(true)
        return
      }

      setConfigured(true)

      try {
        const msal = await getMsalInstance(config)
        const result = await msal.handleRedirectPromise()
        if (result?.account) {
          msal.setActiveAccount(result.account)
        } else {
          const accounts = msal.getAllAccounts()
          if (accounts.length > 0) msal.setActiveAccount(accounts[0])
        }
        if (!cancelled) {
          setAccount(msal.getActiveAccount() || null)
          setReady(true)
        }
      } catch (err) {
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : String(err))
          setReady(true)
        }
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async () => {
    const config = await resolveMicrosoftConfig()
    if (!config) throw new Error('Microsoft sign-in is not configured.')
    const msal = await getMsalInstance(config)
    await msal.loginRedirect({ scopes: graphScopes })
  }, [])

  const logout = useCallback(async () => {
    const config = await resolveMicrosoftConfig()
    if (!config) return
    const msal = await getMsalInstance(config)
    await msal.logoutRedirect()
  }, [])

  const getAccessToken = useCallback(async () => {
    const config = await resolveMicrosoftConfig()
    if (!config) throw new Error('Microsoft sign-in is not configured.')
    const msal = await getMsalInstance(config)
    const active = msal.getActiveAccount() || msal.getAllAccounts()[0]
    if (!active) throw new Error('Not signed in to Microsoft.')

    try {
      const result = await msal.acquireTokenSilent({ scopes: graphScopes, account: active })
      return result.accessToken
    } catch {
      await msal.acquireTokenRedirect({ scopes: graphScopes, account: active })
      return null
    }
  }, [])

  const value = useMemo(
    () => ({
      ready,
      configured,
      account,
      initError,
      login,
      logout,
      getAccessToken,
      userEmail: account?.username || '',
      userName: account?.name || '',
    }),
    [ready, configured, account, initError, login, logout, getAccessToken],
  )

  return (
    <MicrosoftAuthContext.Provider value={value}>{children}</MicrosoftAuthContext.Provider>
  )
}

export function useMicrosoftAuth() {
  const ctx = useContext(MicrosoftAuthContext)
  if (!ctx) throw new Error('useMicrosoftAuth must be used within MicrosoftAuthProvider')
  return ctx
}
