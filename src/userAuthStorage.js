const STORAGE_KEY = 'hsl-workbench-user-session'

export function loadStoredSession() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.userId || !parsed?.username) return null
    return parsed
  } catch {
    return null
  }
}

export function saveStoredSession(session, remember) {
  clearStoredSession()
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
}
