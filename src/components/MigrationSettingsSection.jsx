import { useEffect, useRef, useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'
import MigrationDebugPanel from './MigrationDebugPanel.jsx'
import {
  analyzeMigrationSql,
  executeMigrationImport,
  fetchMigrationPreflight,
  formatUploadProgress,
  statMigrationSqlFile,
  testMigrationConnectivity,
  uploadMigrationSqlFile,
} from '../celgpsMigrationApi.js'

function StatusBadge({ ok, label }) {
  return (
    <span className={`migration-status-badge ${ok ? 'migration-status-badge--ok' : 'migration-status-badge--warn'}`}>
      {label}
    </span>
  )
}

function StepHeader({ step, title, complete, active }) {
  return (
    <div className={`migration-step-header ${active ? 'migration-step-header--active' : ''} ${complete ? 'migration-step-header--complete' : ''}`}>
      <span className="migration-step-number">{step}</span>
      <h4 className="migration-step-title">{title}</h4>
      {complete && <StatusBadge ok label="Complete" />}
    </div>
  )
}

function mergeDebug(prev, next) {
  if (!next?.length) return prev
  return [...prev, ...next]
}

export default function MigrationSettingsSection() {
  const fileInputRef = useRef(null)
  const [preflight, setPreflight] = useState(null)
  const [preflightError, setPreflightError] = useState(null)
  const [connectivity, setConnectivity] = useState(null)
  const [connectError, setConnectError] = useState(null)
  const [testing, setTesting] = useState(false)

  const [selectedFileName, setSelectedFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadError, setUploadError] = useState(null)

  const [showAdvancedPath, setShowAdvancedPath] = useState(false)
  const [sqlPath, setSqlPath] = useState('')
  const [fileStat, setFileStat] = useState(null)
  const [statError, setStatError] = useState(null)
  const [statting, setStatting] = useState(false)

  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [report, setReport] = useState(null)
  const [importCommand, setImportCommand] = useState(null)
  const [resolvedFilePath, setResolvedFilePath] = useState(null)
  const [debugLog, setDebugLog] = useState([])

  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importResult, setImportResult] = useState(null)

  useEffect(() => {
    fetchMigrationPreflight()
      .then(setPreflight)
      .catch((err) => setPreflightError(err instanceof Error ? err.message : String(err)))
  }, [])

  async function handleTestConnection() {
    setTesting(true)
    setConnectError(null)
    setConnectivity(null)
    try {
      const result = await testMigrationConnectivity()
      setConnectivity(result)
      if (!result.ok) {
        setConnectError(result.error || 'Connection test failed.')
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  function resetStep2Results() {
    setFileStat(null)
    setStatError(null)
    setReport(null)
    setImportCommand(null)
    setImportResult(null)
    setImportError(null)
    setAnalyzeError(null)
    setUploadError(null)
    setResolvedFilePath(null)
    setUploadProgress(null)
    setDebugLog([])
  }

  function activeFilePath() {
    return fileStat?.filePath || resolvedFilePath || sqlPath.trim() || null
  }

  async function handleFilePick(event) {
    const file = event.target.files?.[0]
    if (!file) return

    resetStep2Results()
    setSelectedFileName(file.name)
    setSqlPath('')
    setShowAdvancedPath(false)
    setUploading(true)
    setUploadProgress(null)
    setDebugLog([
      {
        ts: new Date().toISOString(),
        level: 'info',
        message: `Selected file: ${file.name}`,
        detail: `${(file.size / 1024 / 1024).toFixed(2)} MB — streaming to dev server…`,
      },
    ])

    try {
      const result = await uploadMigrationSqlFile(file, {
        onProgress: (loaded, total) => {
          setUploadProgress({ loaded, total, label: formatUploadProgress(loaded, total) })
        },
      })
      setFileStat(result)
      setResolvedFilePath(result.filePath)
      if (result.debug) setDebugLog((prev) => mergeDebug(prev, result.debug))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
      if (err.debug) setDebugLog((prev) => mergeDebug(prev, err.debug))
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  async function handleValidatePath() {
    const path = sqlPath.trim()
    if (!path) {
      setStatError('Enter a local file path first.')
      return
    }

    setStatting(true)
    setStatError(null)
    setFileStat(null)
    setSelectedFileName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    resetStep2Results()
    setDebugLog([{ ts: new Date().toISOString(), level: 'info', message: 'Validating file path…' }])

    try {
      const stat = await statMigrationSqlFile(path)
      setFileStat(stat)
      setResolvedFilePath(stat.filePath)
      setDebugLog(stat.debug || [])
    } catch (err) {
      setStatError(err instanceof Error ? err.message : String(err))
      if (err.debug) setDebugLog(err.debug)
    } finally {
      setStatting(false)
    }
  }

  async function handleAnalyze() {
    const path = activeFilePath()
    if (!path) {
      setAnalyzeError('Select a downloaded .sql file first, or validate an advanced file path.')
      return
    }

    setAnalyzing(true)
    setAnalyzeError(null)
    setReport(null)
    setImportCommand(null)
    setImportResult(null)
    setImportError(null)
    setDebugLog((prev) =>
      mergeDebug(prev, [
        { ts: new Date().toISOString(), level: 'info', message: 'Starting SQL analysis…' },
      ]),
    )

    try {
      const data = await analyzeMigrationSql({ filePath: path, fileName: fileStat?.fileName })
      setReport(data.report)
      setResolvedFilePath(data.filePath)
      setImportCommand(data.importCommand)
      if (data.debug) setDebugLog((prev) => mergeDebug(prev, data.debug))
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : String(err))
      if (err.debug) setDebugLog((prev) => mergeDebug(prev, err.debug))
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleConfirmImport() {
    setImportConfirmOpen(false)
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    setDebugLog((prev) =>
      mergeDebug(prev, [
        {
          ts: new Date().toISOString(),
          level: 'warn',
          message: 'Restore approved — launching psql (do not close browser or stop dev server)',
        },
      ]),
    )

    try {
      if (!resolvedFilePath) throw new Error('No analysed SQL file path available.')
      const result = await executeMigrationImport(resolvedFilePath)
      setImportResult(result)
      if (result.debug) setDebugLog((prev) => mergeDebug(prev, result.debug))
    } catch (err) {
      const details = err.details || {}
      let message = err instanceof Error ? err.message : String(err)
      if (details.likelyNearComplete) {
        message +=
          '\n\nThe failure was on a Cloud SQL–specific GRANT/role line near the end of the file. Schema, data, indexes, and constraints were likely already applied — verify in Supabase before re-importing (a full re-import would fail on “already exists”).'
      }
      if (details.logPath) {
        message += `\n\nFull log: ${details.logPath}`
      }
      setImportError(message)
      if (details.debug) setDebugLog((prev) => mergeDebug(prev, details.debug))
      if (details.stderr) {
        setDebugLog((prev) =>
          mergeDebug(prev, [
            {
              ts: new Date().toISOString(),
              level: 'error',
              message: 'psql stderr (tail)',
              detail: details.stderr.slice(-800),
            },
          ]),
        )
      }
    } finally {
      setImporting(false)
    }
  }

  const cliReady = preflight?.cli?.ready
  const connected = connectivity?.ok
  const step1Complete = connected
  const step2Active = step1Complete
  const step2Busy = uploading || statting || analyzing || importing
  const hasPreparedFile = Boolean(fileStat?.filePath)

  return (
    <section className="lookup-section migration-settings-section">
      <h3 className="lookup-section-title">CELGPS database migration</h3>
      <p className="lookup-section-intro muted">
        Two-step workflow: verify Supabase connectivity, then analyse and restore your SQL export.
        Import does not run until you explicitly approve it.
      </p>

      {preflightError && <p className="form-error">{preflightError}</p>}

      <div className="systems-card migration-card migration-step-card">
        <StepHeader
          step={1}
          title="Check connection to Supabase"
          complete={step1Complete}
          active={!step1Complete}
        />

        {!preflight ? (
          <p className="muted">Checking prerequisites…</p>
        ) : (
          <ul className="migration-checklist migration-prereq-list">
            <li>
              psql:{' '}
              {preflight.cli.psql.path ? (
                <>
                  <StatusBadge ok label="Found" /> {preflight.cli.psql.version}
                </>
              ) : (
                <>
                  <StatusBadge ok={false} label="Missing" /> Install PostgreSQL client tools
                </>
              )}
            </li>
            <li>
              pg_dump:{' '}
              {preflight.cli.pgDump.path ? (
                <>
                  <StatusBadge ok label="Found" /> {preflight.cli.pgDump.version}
                </>
              ) : (
                <StatusBadge ok={false} label="Missing" />
              )}
            </li>
          </ul>
        )}

        <p className="muted migration-hint">
          Credentials in{' '}
          <code>{preflight?.envPaths?.migrationEnvPath || '.env.celgps-migration.local'}</code>{' '}
          — use the Session pooler URL for IPv4 networks. Restart <code>npm run dev</code> after
          editing.
        </p>

        <div className="migration-actions">
          <button
            type="button"
            className="btn-primary btn-small"
            disabled={testing || !cliReady}
            onClick={handleTestConnection}
          >
            {testing ? 'Testing connection…' : 'Check Supabase connection'}
          </button>
        </div>

        {connectError && <pre className="migration-error-detail">{connectError}</pre>}
        {connected && (
          <div className="migration-result migration-result--ok">
            <p>
              <StatusBadge ok label="Connected" /> {connectivity.version}
            </p>
            <p className="muted">
              Logged in as <strong>{connectivity.currentUser}</strong> on database{' '}
              <strong>{connectivity.currentDatabase}</strong>. You can proceed to Step 2.
            </p>
          </div>
        )}
      </div>

      <div
        className={`systems-card migration-card migration-step-card ${!step2Active ? 'migration-step-card--locked' : ''}`}
        aria-disabled={!step2Active}
      >
        <StepHeader
          step={2}
          title="Restore downloaded .sql file"
          complete={Boolean(importResult?.ok)}
          active={step2Active && !importResult?.ok}
        />

        {!step2Active ? (
          <p className="muted migration-locked-hint">
            Complete Step 1 before restoring your downloaded SQL export.
          </p>
        ) : (
          <>
            <p className="muted migration-hint">
              Choose the <strong>.sql file you downloaded</strong> from Google Cloud SQL. The file
              is streamed to the dev server (works for multi-GB exports) — you don&apos;t need to
              copy-paste paths.
            </p>

            <div className="migration-file-picker">
              <label className="migration-field migration-file-picker-label">
                Select downloaded .sql file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sql,application/sql,text/sql"
                  disabled={uploading || analyzing || importing}
                  onChange={handleFilePick}
                />
              </label>
              {selectedFileName && !uploading && (
                <p className="muted migration-selected-file">
                  Selected: <strong>{selectedFileName}</strong>
                  {fileStat?.sizeLabel ? ` (${fileStat.sizeLabel})` : ''}
                </p>
              )}
            </div>

            {uploading && uploadProgress && (
              <div className="migration-upload-progress">
                <div className="migration-upload-progress-label">
                  Uploading to dev server… {uploadProgress.label}
                </div>
                <div
                  className="migration-upload-progress-bar"
                  role="progressbar"
                  aria-valuenow={uploadProgress.loaded}
                  aria-valuemin={0}
                  aria-valuemax={uploadProgress.total || uploadProgress.loaded}
                >
                  <div
                    className="migration-upload-progress-fill"
                    style={{
                      width: uploadProgress.total
                        ? `${Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))}%`
                        : '30%',
                    }}
                  />
                </div>
              </div>
            )}

            {uploadError && <pre className="migration-error-detail">{uploadError}</pre>}

            <details
              className="migration-advanced-path"
              open={showAdvancedPath}
              onToggle={(e) => setShowAdvancedPath(e.target.open)}
            >
              <summary className="migration-advanced-summary">Advanced: paste file path instead</summary>
              <p className="muted migration-hint">
                Only if the file is already on this machine where <code>npm run dev</code> runs and
                you prefer not to re-upload it.
              </p>
              <label className="migration-field">
                Local file path
                <input
                  type="text"
                  className="migration-input"
                  value={sqlPath}
                  onChange={(e) => {
                    setSqlPath(e.target.value)
                    resetStep2Results()
                    setSelectedFileName('')
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  placeholder="C:\Users\mike\Downloads\celgps-export.sql"
                  disabled={uploading}
                />
              </label>
              <div className="migration-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={statting || !sqlPath.trim() || uploading}
                  onClick={handleValidatePath}
                >
                  {statting ? 'Checking path…' : 'Validate path'}
                </button>
              </div>
              {statError && <p className="form-error">{statError}</p>}
            </details>

            {fileStat && (
              <dl className="migration-report-grid migration-file-stat">
                <dt>File</dt>
                <dd>{fileStat.fileName}</dd>
                <dt>Size</dt>
                <dd>
                  {fileStat.sizeLabel}
                  {fileStat.isLarge && (
                    <span className="migration-large-tag"> — large export</span>
                  )}
                </dd>
                <dt>Server copy</dt>
                <dd className="migration-path-value">{fileStat.filePath}</dd>
                {fileStat.isVeryLarge && (
                  <>
                    <dt>Estimate</dt>
                    <dd>Analyse ~2–10 min · Restore ~30–90+ min depending on disk and network</dd>
                  </>
                )}
              </dl>
            )}

            <div className="migration-actions">
              <button
                type="button"
                className="btn-primary btn-small"
                disabled={analyzing || !hasPreparedFile || uploading}
                onClick={handleAnalyze}
              >
                {analyzing ? 'Analysing (streaming)…' : 'Analyse SQL export'}
              </button>
            </div>

            <MigrationDebugPanel title="Step 2 debug log" entries={debugLog} busy={step2Busy} />

            {analyzeError && <pre className="migration-error-detail">{analyzeError}</pre>}

            {report && (
              <div className="migration-report">
                <h5 className="migration-subheading">Migration report</h5>
                <dl className="migration-report-grid">
                  <dt>Export file</dt>
                  <dd>{report.export?.fileName}</dd>
                  <dt>Tables in export</dt>
                  <dd>{report.export?.tableCount ?? '—'}</dd>
                  <dt>Lines / size</dt>
                  <dd>
                    {report.export?.lineCount?.toLocaleString()} lines ·{' '}
                    {report.export?.sizeLabel ||
                      (report.export?.sizeBytes
                        ? `${(report.export.sizeBytes / 1024 / 1024).toFixed(2)} MB`
                        : '—')}
                  </dd>
                  {report.export?.scanDurationSec != null && (
                    <>
                      <dt>Scan time</dt>
                      <dd>{report.export.scanDurationSec}s</dd>
                    </>
                  )}
                  <dt>COPY / INSERT</dt>
                  <dd>
                    {report.export?.copyStatements ?? 0} COPY ·{' '}
                    {report.export?.insertStatements ?? 0} INSERT
                  </dd>
                  <dt>Extensions</dt>
                  <dd>
                    {report.export?.extensions?.length
                      ? report.export.extensions.join(', ')
                      : 'None detected'}
                  </dd>
                </dl>

                {report.potentialImportIssues.length > 0 ? (
                  <>
                    <p className="form-error">Potential import issues:</p>
                    <ul className="migration-findings">
                      {report.potentialImportIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                    {report.issueDetails.map((detail) =>
                      detail.samples?.length ? (
                        <div key={detail.id} className="migration-issue-block">
                          <strong>{detail.label}</strong>
                          <pre className="migration-code-sample">
                            {detail.samples.map((s) => `L${s.line}: ${s.text}`).join('\n')}
                          </pre>
                        </div>
                      ) : null,
                    )}
                  </>
                ) : (
                  <p className="migration-result migration-result--ok">
                    No common problematic statements detected in the export.
                  </p>
                )}

                {importCommand && (
                  <>
                    <h5 className="migration-subheading">Import command (not executed yet)</h5>
                    <pre className="migration-command">{importCommand.command}</pre>
                  </>
                )}

                <div className="migration-actions">
                  <button
                    type="button"
                    className="btn-danger btn-small"
                    disabled={!resolvedFilePath || importing}
                    onClick={() => setImportConfirmOpen(true)}
                  >
                    {importing ? 'Restoring…' : 'Approve & restore SQL'}
                  </button>
                </div>
                {importError && <pre className="migration-error-detail">{importError}</pre>}
                {importResult?.ok && (
                  <div className="migration-result migration-result--ok">
                    <p>
                      SQL restore completed in{' '}
                      {importResult.durationLabel || `${importResult.durationSec}s`}.
                    </p>
                    {importResult.logPath && (
                      <p className="muted">
                        Full psql log: <code>{importResult.logPath}</code>
                      </p>
                    )}
                    {importResult.stderr && (
                      <pre className="migration-code-sample">{importResult.stderr}</pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {importResult?.ok && preflight?.postImportChecklist && (
        <div className="systems-card migration-card">
          <h4 className="migration-subheading">Post-restore validation checklist</h4>
          <ul className="migration-checklist">
            {preflight.postImportChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmModal
        open={importConfirmOpen}
        title="Restore SQL into Supabase?"
        message={
          fileStat?.isVeryLarge
            ? `This will run psql against your ${fileStat.sizeLabel} SQL file. It may take 30–90+ minutes. Keep npm run dev running and watch the debug log.`
            : 'This will execute the analysed SQL file against the CELGPS Supabase database. This action modifies production data. Only proceed if you have reviewed the migration report.'
        }
        confirmLabel="Yes, restore SQL"
        cancelLabel="Cancel"
        danger
        busy={importing}
        onConfirm={handleConfirmImport}
        onCancel={() => setImportConfirmOpen(false)}
      />
    </section>
  )
}
