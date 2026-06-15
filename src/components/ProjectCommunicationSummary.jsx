import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'
import {
  directionTooltip,
  formatDirectionLabel,
  formatSummaryDate,
} from '../commSummaryFormat.js'
import {
  rowWithinDays,
  sortSummaryRows,
  subscribeEmailSummaries,
} from '../emailSummaries.js'
import {
  fetchAiConfig,
} from '../openaiCommunicationSummary.js'
import { projectClientMailFolder, projectContactEmails } from '../graphMail.js'
import { scanProjectCommunications } from '../projectCommunicationScan.js'
import { isExcludedHarvestEmail } from '../harvestExclusionsCleanup.js'
import { useHarvestExclusions } from './HarvestExclusionsSection.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import CommTypeBadge from './CommTypeBadge.jsx'
import { useCommunicationSummaryColors } from '../CommunicationSummaryColorsContext.jsx'
import { useAiPromptSettings } from '../AiPromptSettingsContext.jsx'

export default function ProjectCommunicationSummary({ project, onRecordClientMailScan }) {
  const { configured, account, getAccessToken } = useMicrosoftAuth()
  const { colors: rowColors } = useCommunicationSummaryColors()
  const { promptOverrides } = useAiPromptSettings()
  const { excludeEmails: harvestExclusions } = useHarvestExclusions()
  const [days, setDays] = useState(30)
  const [deepScan, setDeepScan] = useState(false)
  const [batchSize, setBatchSize] = useState(12)
  const [storedRows, setStoredRows] = useState([])
  const [storedLoading, setStoredLoading] = useState(true)
  const [storedError, setStoredError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [lastRun, setLastRun] = useState(null)
  const [reanalyseConfirmOpen, setReanalyseConfirmOpen] = useState(false)
  const locationSyncInFlightRef = useRef(false)
  const mountRescoreDoneRef = useRef(null)

  const projectId = project?.id
  const clientFolder = projectClientMailFolder(project)
  const clientEmails = projectContactEmails(project)

  const displayRows = useMemo(
    () =>
      sortSummaryRows(
        storedRows.filter(
          (r) =>
            rowWithinDays(r, days) &&
            !isExcludedHarvestEmail(r.from, harvestExclusions),
        ),
      ),
    [storedRows, days, harvestExclusions],
  )

  const runSummarise = useCallback(
    async ({ forceReanalyse = false, locationsOnly = false } = {}) => {
      if (!account || !clientFolder?.id || !clientEmails.length || !projectId) return
      setLoading(true)
      setError(null)
      setProgress({
        percent: 5,
        label: locationsOnly ? 'Re-scoring saved mail locations…' : 'Fetching emails from Outlook…',
        done: 0,
        total: 0,
      })

      try {
        const token = await getAccessToken()
        if (!token) return

        const result = await scanProjectCommunications({
          accessToken: token,
          project,
          excludeEmails: harvestExclusions,
          days: Number(days) || 30,
          deepScan,
          batchSize,
          forceReanalyse,
          locationsOnly,
          onRecordClientMailScan,
          promptOverrides,
          onProgress: (p) => {
            if (locationsOnly && p.phase === 'locations') {
              setProgress({ percent: 50, label: 'Scanning client folder…', done: 0, total: 0 })
              return
            }
            if (p.phase === 'fetching') {
              setProgress({ percent: 10, label: 'Fetching emails from Outlook…', done: 0, total: 0 })
              return
            }
            if (p.phase === 'locations') {
              setProgress({ percent: 15, label: 'Re-scoring saved mail locations…', done: 0, total: 0 })
              return
            }
            const total = p.emailTotal || 0
            const done = p.emailDone || 0
            if (total > 0) {
              const pct =
                p.phase === 'saving'
                  ? 90 + Math.round((8 * done) / total)
                  : 25 + Math.round((65 * done) / total)
              setProgress({
                percent: pct,
                label:
                  p.phase === 'saving'
                    ? `Saving ${done} of ${total}…`
                    : `Analysing ${done} of ${total} email(s)…`,
                done,
                total,
              })
            }
          },
        })

        if (result.skipped && result.reason === 'not_configured') return

        if (locationsOnly) {
          setProgress({ percent: 100, label: 'Done', done: 0, total: 0 })
          setLastRun({
            at: new Date(),
            fetched: 0,
            newProcessed: 0,
            skipped: 0,
            locationsUpdated: result.locationsUpdated ?? 0,
            softRescan: true,
            filedCount: 0,
          })
          return
        }

        if ((result.newProcessed ?? 0) === 0) {
          setProgress(null)
          setLastRun({
            at: new Date(),
            fetched: result.fetched ?? 0,
            newProcessed: 0,
            skipped: result.skippedEmails ?? 0,
            locationsUpdated: result.locationsUpdated ?? 0,
            reanalysed: forceReanalyse,
            inbound: result.stats?.inbound,
            inboundInbox: result.stats?.inboundInbox,
            outbound: result.stats?.outbound,
            days: result.stats?.days,
            deepScan: result.stats?.deepScan,
          })
          return
        }

        setProgress({ percent: 100, label: 'Done', done: result.newProcessed, total: result.newProcessed })
        setLastRun({
          at: new Date(),
          fetched: result.fetched ?? 0,
          newProcessed: result.newProcessed ?? 0,
          skipped: result.skippedEmails ?? 0,
          locationsUpdated: result.locationsUpdated ?? 0,
          reanalysed: forceReanalyse,
          inbound: result.stats?.inbound,
          inboundInbox: result.stats?.inboundInbox,
          outbound: result.stats?.outbound,
          days: result.stats?.days,
          deepScan: result.stats?.deepScan,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
        setTimeout(() => setProgress(null), 1200)
      }
    },
    [
      account,
      batchSize,
      clientFolder,
      clientEmails,
      days,
      getAccessToken,
      project,
      projectId,
      onRecordClientMailScan,
      harvestExclusions,
      deepScan,
      promptOverrides,
    ],
  )

  useEffect(() => {
    fetchAiConfig()
      .then((cfg) => {
        if (cfg.batchSize) setBatchSize(cfg.batchSize)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) {
      setStoredRows([])
      setStoredLoading(false)
      return undefined
    }

    setStoredLoading(true)
    setStoredError(null)
    const unsub = subscribeEmailSummaries(
      projectId,
      (rows) => {
        setStoredRows(rows)
        setStoredLoading(false)
      },
      (err) => {
        setStoredError(err instanceof Error ? err.message : String(err))
        setStoredLoading(false)
      },
    )
    return unsub
  }, [projectId])

  useEffect(() => {
    mountRescoreDoneRef.current = null
  }, [projectId])

  /** Re-score saved rows when any are still flagged as root Inbox. */
  useEffect(() => {
    if (storedLoading || loading || !projectId || !account) return
    if (!clientFolder?.id || !clientEmails.length) return
    if (locationSyncInFlightRef.current) return
    if (mountRescoreDoneRef.current === projectId) return

    const hasUnfiledInbound = storedRows.some(
      (r) => r.direction === 'inbound' && r.inInbox && rowWithinDays(r, days),
    )
    if (!hasUnfiledInbound) return

    mountRescoreDoneRef.current = projectId
    locationSyncInFlightRef.current = true
    runSummarise({ locationsOnly: true }).finally(() => {
      locationSyncInFlightRef.current = false
    })
  }, [
    account,
    clientEmails.length,
    clientFolder?.id,
    days,
    loading,
    projectId,
    runSummarise,
    storedLoading,
    storedRows,
  ])

  const summariseNew = useCallback(() => runSummarise({ forceReanalyse: false }), [runSummarise])

  const softRescan = useCallback(() => {
    mountRescoreDoneRef.current = null
    return runSummarise({ locationsOnly: true })
  }, [runSummarise])

  const confirmReanalyse = useCallback(() => {
    setReanalyseConfirmOpen(false)
    runSummarise({ forceReanalyse: true })
  }, [runSummarise])

  if (!configured) {
    return <p className="muted">Microsoft email is not configured. Check Settings.</p>
  }

  if (!account) {
    return (
      <p className="muted">
        Connect your Microsoft account in <strong>Settings → Microsoft email</strong>.
      </p>
    )
  }

  if (!clientFolder || !clientEmails.length) {
    return (
      <p className="muted">
        Set up a client folder and client email addresses on the <strong>Email Settings</strong>{' '}
        tab first.
      </p>
    )
  }

  return (
    <div
      className="comm-summary"
      style={{
        '--comm-inbound-bg': rowColors.inbound,
        '--comm-outbound-bg': rowColors.outbound,
      }}
    >
      <div className="comm-summary-toolbar">
        <label className="comm-summary-days">
          Last
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="comm-summary-days-input"
            aria-label="Number of days to show"
            disabled={loading}
          />
          days
        </label>
        <label className="comm-summary-deep-scan" title="Scan every email in the day window (up to 2000 per folder) and summarise any not yet in the database — use after copying mail between folders">
          <input
            type="checkbox"
            checked={deepScan}
            onChange={(e) => setDeepScan(e.target.checked)}
            disabled={loading}
          />
          Deep scan
        </label>
        <button
          type="button"
          className="btn-primary btn-small"
          onClick={summariseNew}
          disabled={loading}
        >
          Summarise new emails
        </button>
        <button
          type="button"
          className="btn-secondary btn-small"
          onClick={softRescan}
          disabled={loading}
          title="Refresh Inbox vs client folder flags for already summarised mail (no OpenAI)"
        >
          Update locations
        </button>
        <button
          type="button"
          className="btn-secondary btn-small"
          onClick={() => setReanalyseConfirmOpen(true)}
          disabled={loading}
          title="Re-run OpenAI on all emails in the day window (e.g. after prompt changes)"
        >
          Re-analyse in window
        </button>
      </div>

      {progress && (
        <div className="comm-summary-progress" role="status" aria-live="polite">
          <progress
            className="comm-summary-progress-bar"
            value={progress.percent}
            max={100}
          />
          <span className="comm-summary-progress-label">
            {progress.label}
            {progress.total > 0 ? ` (${progress.done} / ${progress.total})` : ''}
          </span>
        </div>
      )}

      <p className="muted comm-summary-hint">
        <strong>Summarise new</strong> fetches mail in the last N days and skips rows already saved.
        Turn on <strong>Deep scan</strong> after copying mail between folders — it scans the full day
        window (not last folder scan) and picks up anything missing from the database. Sent Items uses
        sent date. Red Inbound clears via <strong>Update locations</strong>.
      </p>

      {storedError && <p className="form-error">{storedError}</p>}
      {error && <p className="form-error">{error}</p>}

      {lastRun && !loading && (
        <p className="muted comm-summary-stats">
          {lastRun.at.toLocaleString()} — {lastRun.fetched} in window ({lastRun.inbound} filed inbound
          {lastRun.inboundInbox > 0 ? `, ${lastRun.inboundInbox} in Inbox` : ''}, {lastRun.outbound}{' '}
          outbound)
          {lastRun.reanalysed
            ? `, ${lastRun.newProcessed} re-analysed`
            : lastRun.softRescan
              ? `, ${lastRun.locationsUpdated ?? 0} location(s) updated`
              : `, ${lastRun.newProcessed} new`}
          {!lastRun.softRescan && !lastRun.reanalysed && (lastRun.locationsUpdated ?? 0) > 0
            ? `, ${lastRun.locationsUpdated} location(s) updated`
            : ''}
          {lastRun.skipped > 0 && !lastRun.reanalysed && !lastRun.softRescan
            ? `, ${lastRun.skipped} already stored`
            : ''}
          {lastRun.deepScan ? ', deep scan' : ''}
        </p>
      )}

      {storedLoading && <p className="muted">Loading saved summaries…</p>}

      {!storedLoading && displayRows.length === 0 && (
        <p className="muted">
          No saved summaries in the last {days} days. Click <strong>Summarise new emails</strong>.
        </p>
      )}

      {displayRows.length > 0 && (
        <div className="comm-summary-table-wrap">
          <table className="comm-summary-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Direction</th>
                <th scope="col">Type</th>
                <th scope="col">Subject</th>
                <th scope="col">Summary</th>
                <th scope="col" className="comm-summary-col-attach" aria-label="Attachments" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const hasAttach = row.attachments?.length > 0
                const attachTip = hasAttach ? row.attachments.join(', ') : undefined
                return (
                  <tr
                    key={row.firestoreId || row.id}
                    className={[
                      'comm-summary-row',
                      `comm-summary-row--${row.direction}`,
                      row.inInbox ? 'comm-summary-row--inbox' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td className="comm-summary-date">
                      {formatSummaryDate(row.date || row.messageDate)}
                    </td>
                    <td
                      className={[
                        'comm-summary-direction',
                        row.inInbox ? 'comm-summary-direction--inbox' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={directionTooltip(row)}
                    >
                      {row.inInbox ? 'Inbound' : formatDirectionLabel(row.direction)}
                    </td>
                    <td className="comm-summary-type">
                      <CommTypeBadge type={row.type} />
                    </td>
                    <td className="comm-summary-subject">
                      {row.webLink ? (
                        <a
                          href={row.webLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Outlook"
                        >
                          {row.subject}
                        </a>
                      ) : (
                        row.subject
                      )}
                    </td>
                    <td className="comm-summary-summary">{row.summary}</td>
                    <td className="comm-summary-col-attach">
                      {hasAttach ? (
                        <span
                          className="comm-summary-paperclip"
                          title={attachTip}
                          aria-label={`Attachments: ${attachTip}`}
                        >
                          📎
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={reanalyseConfirmOpen}
        title="Re-analyse emails in window?"
        message={`Re-run OpenAI on all emails from the last ${days} days for this project. Existing summaries will be overwritten. This uses API credits.`}
        confirmLabel="Re-analyse"
        onConfirm={confirmReanalyse}
        onCancel={() => setReanalyseConfirmOpen(false)}
        busy={loading}
      />
    </div>
  )
}
