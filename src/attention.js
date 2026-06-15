/** Stored on each project as `attention`. Single traffic-light level (not three lamps). */
export const ATTENTION_LEVELS = ['green', 'orange', 'red']

export function normalizeAttention(value) {
  const v = typeof value === 'string' ? value.toLowerCase().trim() : ''
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
      return 'Orange — needs attention'
    case 'red':
      return 'Red — urgent'
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
