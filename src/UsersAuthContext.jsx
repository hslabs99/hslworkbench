import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authenticateUser, normalizeUsername } from './users.js'
import { clearStoredSession, loadStoredSession, saveStoredSession } from './userAuthStorage.js'

const UsersAuthContext = createContext(null)

export function UsersAuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUser(loadStoredSession())
    setLoading(false)
  }, [])

  const login = useCallback(async (username, password, remember) => {
    const authenticated = await authenticateUser(username, password)
    const session = {
      userId: authenticated.id,
      username: authenticated.username,
      displayName: authenticated.displayName,
    }
    saveStoredSession(session, remember)
    setUser(session)
    return session
  }, [])

  const logout = useCallback(() => {
    clearStoredSession()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      isAuthenticated: Boolean(user),
    }),
    [user, loading, login, logout],
  )

  return <UsersAuthContext.Provider value={value}>{children}</UsersAuthContext.Provider>
}

export function useUsersAuth() {
  const ctx = useContext(UsersAuthContext)
  if (!ctx) throw new Error('useUsersAuth must be used within UsersAuthProvider')
  return ctx
}

export function useCurrentUsername() {
  const { user } = useUsersAuth()
  return user?.username ? normalizeUsername(user.username) : null
}
