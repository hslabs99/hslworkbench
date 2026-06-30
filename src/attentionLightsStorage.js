import { ATTENTION_LEVELS } from './attention.js'

const STORAGE_KEY = 'hsl-workbench-attention-lights'

/** Matches previous App.css defaults */
export const DEFAULT_ATTENTION_COLORS = {
  green: '#22c55e',
  orange: '#f5c518',
  red: '#ff4242',
  clear: '#f1f5f9',
}

const LEGACY_ORANGE = '#b87d56'

export function loadAttentionLights() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        colors: { ...DEFAULT_ATTENTION_COLORS },
        tooltips: { green: '', orange: '', red: '', clear: '' },
      }
    }
    const parsed = JSON.parse(raw)
    const colors = { ...DEFAULT_ATTENTION_COLORS, ...(parsed.colors || {}) }
    const tooltips = {
      green: typeof parsed.tooltips?.green === 'string' ? parsed.tooltips.green : '',
      orange: typeof parsed.tooltips?.orange === 'string' ? parsed.tooltips.orange : '',
      red: typeof parsed.tooltips?.red === 'string' ? parsed.tooltips.red : '',
      clear: typeof parsed.tooltips?.clear === 'string' ? parsed.tooltips.clear : '',
    }
    for (const k of ATTENTION_LEVELS) {
      if (!colors[k] || typeof colors[k] !== 'string') colors[k] = DEFAULT_ATTENTION_COLORS[k]
    }
    if (colors.orange?.toLowerCase() === LEGACY_ORANGE) {
      colors.orange = DEFAULT_ATTENTION_COLORS.orange
    }
    return { colors, tooltips }
  } catch {
    return {
      colors: { ...DEFAULT_ATTENTION_COLORS },
      tooltips: { green: '', orange: '', red: '', clear: '' },
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
