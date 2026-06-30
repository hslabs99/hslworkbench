/** Stored on each project as `attention`. Single traffic-light level (not three lamps). */
export const ATTENTION_LEVELS = ['green', 'orange', 'red', 'clear']

export function normalizeAttention(value) {
  if (value == null || value === '') return 'green'
  const v = typeof value === 'string' ? value.toLowerCase().trim() : ''
  if (!v) return 'green'
  if (v === 'none') return 'clear'
  if (v === 'yellow') return 'orange'
  if (ATTENTION_LEVELS.includes(v)) return v
  return 'green'
}

export function nextAttention(current) {
  const level = normalizeAttention(current)
  const i = ATTENTION_LEVELS.indexOf(level)
  return ATTENTION_LEVELS[(i + 1) % ATTENTION_LEVELS.length]
}

export function attentionLabel(level) {
  switch (normalizeAttention(level)) {
    case 'green':
      return 'Green — steady'
    case 'orange':
      return 'Yellow — needs attention'
    case 'red':
      return 'Red — urgent'
    case 'clear':
      return 'Clear — no flag'
    default:
      return 'Green — steady'
  }
}

/** Tooltip text: custom string per level if set, else default cycle hint */
export function attentionHoverTitle(level, tooltips) {
  const key = normalizeAttention(level)
  const t = tooltips[key]?.trim()
  if (t) return t
  return `${attentionLabel(key)} — click to cycle`
}

export function attentionLightStyle(level, colors) {
  const key = normalizeAttention(level)
  if (key === 'clear') {
    const border = colors.clear || '#94a3b8'
    return {
      background: colors.clear || '#f1f5f9',
      borderColor: border,
    }
  }
  return {
    background: colors[key],
    borderColor: colors[key],
  }
}
