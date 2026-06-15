import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_COMM_SUMMARY_COLORS,
  ensureCommunicationSummaryColorDefaults,
  resetAllCommunicationSummaryColors,
  resetCommunicationSummaryColor,
  subscribeCommunicationSummaryColors,
  updateCommunicationSummaryColor,
} from '../communicationSummaryColors.js'

export default function CommunicationSummaryColorsSection() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    let unsub = () => {}
    let cancelled = false

    ;(async () => {
      try {
        await ensureCommunicationSummaryColorDefaults()
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
      if (cancelled) return

      unsub = subscribeCommunicationSummaryColors(
        undefined,
        (nextRows) => {
          if (!cancelled) {
            setRows(nextRows)
            setLoading(false)
          }
        },
        (err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err))
            setLoading(false)
          }
        },
      )
    })()

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const handleColorChange = useCallback(async (id, hex) => {
    setSavingId(id)
    setError(null)
    try {
      await updateCommunicationSummaryColor(id, hex)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingId(null)
    }
  }, [])

  const handleResetOne = useCallback(async (id) => {
    setSavingId(id)
    setError(null)
    try {
      await resetCommunicationSummaryColor(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingId(null)
    }
  }, [])

  const handleResetAll = useCallback(async () => {
    setResetting(true)
    setError(null)
    try {
      await resetAllCommunicationSummaryColors()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResetting(false)
    }
  }, [])

  return (
    <section className="lookup-section comm-colors-settings-section">
      <h3 className="lookup-section-title">Communication summary row colours</h3>
      <p className="lookup-section-intro muted">
        Background colours for inbound and outbound rows on the project Communication Summary
        table. Stored in Firestore (<code>communication_summary_colors</code>).
      </p>

      {error && <p className="form-error">{error}</p>}

      <div className="systems-card lights-settings-card">
        {loading ? (
          <p className="muted">Loading colours…</p>
        ) : (
          <>
            <table className="systems-table lights-settings-table comm-colors-settings-table">
              <thead>
                <tr>
                  <th scope="col">Direction</th>
                  <th scope="col">Background</th>
                  <th scope="col">Preview</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="lights-level-cell">
                      <span className="lights-level-name">{row.label}</span>
                    </td>
                    <td>
                      <div className="lights-color-cell">
                        <input
                          type="color"
                          className="lights-color-input"
                          value={row.backgroundColor}
                          disabled={savingId === row.id || resetting}
                          onChange={(e) => handleColorChange(row.id, e.target.value)}
                          aria-label={`${row.label} row background`}
                        />
                        <code className="lights-hex">{row.backgroundColor}</code>
                      </div>
                    </td>
                    <td>
                      <span
                        className="comm-colors-swatch"
                        style={{ backgroundColor: row.backgroundColor }}
                        title="Table row preview"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        disabled={savingId === row.id || resetting}
                        onClick={() => handleResetOne(row.id)}
                      >
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="comm-colors-settings-actions">
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={resetting || Boolean(savingId)}
                onClick={handleResetAll}
              >
                {resetting ? 'Resetting…' : 'Reset all to defaults'}
              </button>
              <p className="muted comm-colors-defaults-hint">
                Defaults: inbound {DEFAULT_COMM_SUMMARY_COLORS.inbound}, outbound{' '}
                {DEFAULT_COMM_SUMMARY_COLORS.outbound}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
