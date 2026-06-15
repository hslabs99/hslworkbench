import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { formatFirestoreError } from './firestoreErrors.js'
import { mergePromptOverrides } from './aiPromptsShared.js'
import { subscribeAiPromptSettings } from './aiPromptSettings.js'

const AiPromptSettingsContext = createContext(null)

export function AiPromptSettingsProvider({ children }) {
  const [promptOverrides, setPromptOverrides] = useState(() => mergePromptOverrides({}))
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = subscribeAiPromptSettings(
      (data) => {
        setPromptOverrides(data.merged)
        setReady(true)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(formatFirestoreError(err))
        setReady(true)
      },
    )
    return unsub
  }, [])

  const value = useMemo(
    () => ({ promptOverrides, ready, error }),
    [promptOverrides, ready, error],
  )

  return (
    <AiPromptSettingsContext.Provider value={value}>{children}</AiPromptSettingsContext.Provider>
  )
}

export function useAiPromptSettings() {
  const ctx = useContext(AiPromptSettingsContext)
  if (!ctx) {
    return {
      promptOverrides: mergePromptOverrides({}),
      ready: true,
      error: null,
    }
  }
  return ctx
}
