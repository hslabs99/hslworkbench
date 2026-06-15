/** Type badge shared by Communication Summary and project cards. */
export default function CommTypeBadge({ type, className = '' }) {
  const label = (type || '').trim() || '—'
  const key = label.toLowerCase()
  return (
    <span
      className={`comm-type-badge comm-type-badge--${key} ${className}`.trim()}
      title={label}
    >
      {label}
    </span>
  )
}
