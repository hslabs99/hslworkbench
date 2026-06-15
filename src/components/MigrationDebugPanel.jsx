function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString()
  } catch {
    return iso
  }
}

function levelClass(level) {
  if (level === 'error') return 'migration-debug-line--error'
  if (level === 'warn') return 'migration-debug-line--warn'
  if (level === 'success') return 'migration-debug-line--success'
  return ''
}

export default function MigrationDebugPanel({ title = 'Debug log', entries = [], busy = false }) {
  if (!entries.length && !busy) return null

  return (
    <div className="migration-debug-panel">
      <div className="migration-debug-header">
        <h5 className="migration-subheading">{title}</h5>
        {busy && <span className="migration-debug-live">Running…</span>}
      </div>
      <pre className="migration-debug-log" aria-live="polite">
        {entries.map((entry, index) => (
          <div key={`${entry.ts}-${index}`} className={`migration-debug-line ${levelClass(entry.level)}`}>
            <span className="migration-debug-time">{formatTime(entry.ts)}</span>
            <span className="migration-debug-level">[{entry.level}]</span>
            <span className="migration-debug-msg">{entry.message}</span>
            {entry.detail && (
              <span className="migration-debug-detail"> — {entry.detail}</span>
            )}
          </div>
        ))}
        {busy && entries.length === 0 && (
          <div className="migration-debug-line">Waiting for server…</div>
        )}
      </pre>
    </div>
  )
}
