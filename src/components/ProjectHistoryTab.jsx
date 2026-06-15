import { useEffect, useState } from 'react'
import { formatHistoryTimestamp } from '../commSummaryFormat.js'
import { subscribeProjectHistory } from '../projectHistory.js'

export default function ProjectHistoryTab({ projectId }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!projectId) {
      setEntries([])
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const unsub = subscribeProjectHistory(
      projectId,
      (rows) => {
        setEntries(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )
    return unsub
  }, [projectId])

  if (loading) {
    return <p className="muted">Loading history…</p>
  }

  if (error) {
    return (
      <p className="form-error">
        {error.includes('index')
          ? `${error} — create the Firestore index from the link in the browser console.`
          : error}
      </p>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="muted">
        No column moves recorded yet. Drag this project to another column on the board to log
        history.
      </p>
    )
  }

  return (
    <ul className="project-history-list">
      {entries.map((entry) => (
        <li key={entry.id} className="project-history-item">
          <time className="project-history-when" dateTime={entry.changedAt?.toDate?.()?.toISOString?.()}>
            {formatHistoryTimestamp(entry.changedAt)}
          </time>
          <span className="project-history-change">
            <span className="project-history-from">{entry.fromStatus || entry.fromSiloId}</span>
            <span className="project-history-arrow" aria-hidden="true">
              →
            </span>
            <span className="project-history-to">{entry.toStatus || entry.toSiloId}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
