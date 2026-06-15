import { ATTENTION_LEVELS } from './attention.js'

const STORAGE_KEY = 'hsl-workbench-attention-lights'

/** Matches previous App.css defaults */
export const DEFAULT_ATTENTION_COLORS = {
  green: '#22c55e',
  orange: '#b87d56',
  red: '#ff4242',
}

export function loadAttentionLights() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        colors: { ...DEFAULT_ATTENTION_COLORS },
        tooltips: { green: '', orange: '', red: '' },
      }
    }
    const parsed = JSON.parse(raw)
    const colors = { ...DEFAULT_ATTENTION_COLORS, ...(parsed.colors || {}) }
    const tooltips = {
      green: typeof parsed.tooltips?.green === 'string' ? parsed.tooltips.green : '',
      orange: typeof parsed.tooltips?.orange === 'string' ? parsed.tooltips.orange : '',
      red: typeof parsed.tooltips?.red === 'string' ? parsed.tooltips.red : '',
    }
    for (const k of ATTENTION_LEVELS) {
      if (!colors[k] || typeof colors[k] !== 'string') colors[k] = DEFAULT_ATTENTION_COLORS[k]
    }
    return { colors, tooltips }
  } catch {
    return {
      colors: { ...DEFAULT_ATTENTION_COLORS },
      tooltips: { green: '', orange: '', red: '' },
    }
  }
}

export function saveAttentionLights(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
