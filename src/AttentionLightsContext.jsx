import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ATTENTION_LEVELS } from './attention.js'
import {
  DEFAULT_ATTENTION_COLORS,
  loadAttentionLights,
  saveAttentionLights,
} from './attentionLightsStorage.js'

const AttentionLightsContext = createContext(null)

export function AttentionLightsProvider({ children }) {
  const [state, setState] = useState(() => loadAttentionLights())

  useEffect(() => {
    saveAttentionLights(state)
  }, [state])

  const setColor = useCallback((level, hex) => {
    if (!ATTENTION_LEVELS.includes(level)) return
    setState((prev) => ({
      ...prev,
      colors: { ...prev.colors, [level]: hex },
    }))
  }, [])

  const setTooltip = useCallback((level, text) => {
    if (!ATTENTION_LEVELS.includes(level)) return
    setState((prev) => ({
      ...prev,
      tooltips: { ...prev.tooltips, [level]: text },
    }))
  }, [])

  const value = useMemo(
    () => ({
      colors: state.colors,
      tooltips: state.tooltips,
      setColor,
      setTooltip,
    }),
    [state.colors, state.tooltips, setColor, setTooltip],
  )

  return (
    <AttentionLightsContext.Provider value={value}>{children}</AttentionLightsContext.Provider>
  )
}

export function useAttentionLights() {
  const ctx = useContext(AttentionLightsContext)
  if (!ctx) {
    return {
      colors: DEFAULT_ATTENTION_COLORS,
      tooltips: { green: '', orange: '', red: '', clear: '' },
      setColor: () => {},
      setTooltip: () => {},
    }
  }
  return ctx
}
