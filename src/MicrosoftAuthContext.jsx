import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { PublicClientApplication } from '@azure/msal-browser'
import { graphScopes, isMicrosoftConfigured, msalConfig } from './msalConfig.js'

const MicrosoftAuthContext = createContext(null)

let msalInstancePromise = null

function getMsalInstance() {
  if (!msalInstancePromise) {
    msalInstancePromise = (async () => {
      const msal = new PublicClientApplication(msalConfig)
      await msal.initialize()
      return msal
    })()
  }
  return msalInstancePromise
}

export function MicrosoftAuthProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [account, setAccount] = useState(null)
  const [initError, setInitError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!isMicrosoftConfigured()) {
        if (!cancelled) setReady(true)
        return
      }

      try {
        const msal = await getMsalInstance()
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
    const msal = await getMsalInstance()
    await msal.loginRedirect({ scopes: graphScopes })
  }, [])

  const logout = useCallback(async () => {
    const msal = await getMsalInstance()
    await msal.logoutRedirect()
  }, [])

  const getAccessToken = useCallback(async () => {
    const msal = await getMsalInstance()
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
      configured: isMicrosoftConfigured(),
      account,
      initError,
      login,
      logout,
      getAccessToken,
      userEmail: account?.username || '',
      userName: account?.name || '',
    }),
    [ready, account, initError, login, logout, getAccessToken],
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
