import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_COMM_SUMMARY_COLORS,
  ensureCommunicationSummaryColorDefaults,
  subscribeCommunicationSummaryColors,
} from './communicationSummaryColors.js'

const CommunicationSummaryColorsContext = createContext(null)

export function CommunicationSummaryColorsProvider({ children }) {
  const [colors, setColors] = useState({ ...DEFAULT_COMM_SUMMARY_COLORS })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let unsub = () => {}
    let cancelled = false

    ;(async () => {
      try {
        await ensureCommunicationSummaryColorDefaults()
      } catch (err) {
        if (!cancelled) {
          console.error(err)
          setError(err instanceof Error ? err.message : String(err))
        }
      }
      if (cancelled) return

      unsub = subscribeCommunicationSummaryColors(
        (next) => {
          if (!cancelled) {
            setColors(next)
            setReady(true)
            setError(null)
          }
        },
        undefined,
        (err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err))
            setReady(true)
          }
        },
      )
    })()

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const value = useMemo(() => ({ colors, ready, error }), [colors, ready, error])

  return (
    <CommunicationSummaryColorsContext.Provider value={value}>
      {children}
    </CommunicationSummaryColorsContext.Provider>
  )
}

export function useCommunicationSummaryColors() {
  const ctx = useContext(CommunicationSummaryColorsContext)
  if (!ctx) {
    return { colors: { ...DEFAULT_COMM_SUMMARY_COLORS }, ready: true, error: null }
  }
  return ctx
}
