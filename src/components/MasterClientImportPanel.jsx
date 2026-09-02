import { useMemo, useRef, useState } from 'react'
import { createImportBatchRef, importMasterContacts } from '../clientEmails.js'
import { appendImportExceptions } from '../importExceptions.js'
import {
  CONTACT_IMPORT_FIELDS,
  suggestColumnMapping,
} from '../contactFields.js'
import {
  applyColumnMapping,
  downloadContactTemplateXls,
  parseContactTableFile,
  parseContactTableText,
  splitFileDuplicates,
} from '../mailingCsv.js'

function sampleValue(rows, index) {
  if (index == null || index < 0) return ''
  for (const row of rows || []) {
    const value = String(row[index] || '').trim()
    if (value) return value
  }
  return ''
}

export default function MasterClientImportPanel({ items = [], batchOptions = [], onImported }) {
  const fileInputRef = useRef(null)
  const [batch, setBatch] = useState(() => createImportBatchRef())
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState(null)
  const [mapping, setMapping] = useState({})
  const [suggested, setSuggested] = useState({})
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const knownEmails = useMemo(() => new Set(items.map((row) => row.email)), [items])

  function loadTable(next, origin) {
    const headers = next?.headers || []
    const guess = suggestColumnMapping(headers)
    setTable(next)
    setFileName(origin)
    setMapping(guess)
    setSuggested(guess)
    setError(null)
    setResult(null)
  }

  async function handleCsvFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      loadTable(await parseContactTableFile(file), file.name || 'CSV file')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handlePasteParse() {
    try {
      const next = parseContactTableText(pasteText)
      if (!next.headers.length) {
        setError('No rows found in the pasted text.')
        return
      }
      loadTable(next, 'paste')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const mapped = useMemo(
    () => applyColumnMapping(table?.rows || [], mapping),
    [table, mapping],
  )

  const preview = useMemo(() => {
    const { unique, duplicates } = splitFileDuplicates(mapped.contacts)
    const existing = unique.filter((row) => knownEmails.has(row.email))
    const fresh = unique.filter((row) => !knownEmails.has(row.email))
    return {
      unique,
      duplicates,
      existing,
      fresh,
      noEmail: mapped.noEmail,
    }
  }, [mapped, knownEmails])

  const emailMapped = Number(mapping.email) >= 0
  const batchReady = Boolean(String(batch).trim())
  const canImport =
    Boolean(table) &&
    emailMapped &&
    batchReady &&
    !importing &&
    (preview.unique.length > 0 || preview.noEmail.length > 0)

  async function handleImport() {
    const batchRef = String(batch).trim()
    if (!batchRef) {
      setError('A batch reference is required. It is stamped on every new row and is not a CSV column.')
      return
    }
    if (!emailMapped) {
      setError('Map a CSV column to Email before importing.')
      return
    }
    setImporting(true)
    setError(null)
    try {
      const outcome = await importMasterContacts(preview.unique, {
        source: 'import',
        importBatch: batchRef,
      })
      const at = new Date().toISOString()
      const exceptions = [
        ...preview.noEmail.map((row) => ({ ...row, reason: 'no_email' })),
        ...preview.duplicates.map((row) => ({ ...row, reason: 'duplicate' })),
        ...outcome.exceptions,
      ].map((row) => ({
        email: row.email || '',
        name: row.name || '',
        company: row.company || '',
        reason: row.reason,
        batch: batchRef,
        existingBatch: row.existingBatch || '',
        fileName,
        at,
      }))
      if (exceptions.length) await appendImportExceptions(exceptions)
      const summary = {
        added: outcome.added,
        exceptions: exceptions.length,
        existing: exceptions.filter((row) => row.reason === 'existing').length,
        batch: batchRef,
      }
      setResult(summary)
      setTable(null)
      setPasteText('')
      setBatch(createImportBatchRef())
      onImported?.(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="systems-card mailing-wide-card">
      <h4 className="mailing-import-heading">Import CSV</h4>
      <p className="muted">
        Upload a harvested list. Columns are mapped automatically where the header is recognised;
        you can fix anything else below. A batch reference is required and is written onto every
        new row so you can filter the master list later. Emails that already exist are not
        imported — they go to the Exceptions tab.
      </p>

      <label className="mailing-form-label">
        Batch reference
        <input
          type="text"
          required
          value={batch}
          list="master-import-batch-list"
          onChange={(e) => setBatch(e.target.value)}
          placeholder="e.g. Auckland construction harvest Sep 2026"
          aria-label="Batch reference"
        />
      </label>
      <datalist id="master-import-batch-list">
        {batchOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      <div className="mailing-toolbar mailing-import-toolbar">
        <button type="button" className="btn-secondary" onClick={downloadContactTemplateXls}>
          Download template (XLS)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.xls,text/csv,text/plain"
          className="sr-only"
          onChange={handleCsvFile}
        />
        <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
          Choose CSV
        </button>
        {fileName ? <span className="muted">{fileName}</span> : null}
      </div>

      <textarea
        className="mailing-paste-area"
        rows={4}
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder={'company,company_email,contact_name\nAcme Ltd,jane@acme.test,Jane Example'}
        aria-label="Paste CSV rows"
      />
      <div className="mailing-toolbar">
        <button
          type="button"
          className="btn-secondary"
          onClick={handlePasteParse}
          disabled={!pasteText.trim()}
        >
          Use pasted rows
        </button>
      </div>

      {table ? (
        <>
          <p className="muted">
            {table.rows.length} data row{table.rows.length === 1 ? '' : 's'} · {table.headers.length}{' '}
            column{table.headers.length === 1 ? '' : 's'}. Email is required. Batch is not a mapped
            field.
          </p>
          <div className="mailing-table-wrap">
            <table className="systems-table mailing-map-table">
              <thead>
                <tr>
                  <th scope="col">Master list field</th>
                  <th scope="col">CSV column</th>
                  <th scope="col">Sample</th>
                </tr>
              </thead>
              <tbody>
                {CONTACT_IMPORT_FIELDS.map((field) => {
                  const selected = mapping[field.key] ?? -1
                  return (
                    <tr key={field.key}>
                      <td>
                        {field.label}
                        {field.required ? ' *' : ''}
                        {selected >= 0 && suggested[field.key] === selected ? (
                          <span className="mailing-pill mailing-pill--muted">Auto</span>
                        ) : null}
                      </td>
                      <td>
                        <select
                          value={String(selected)}
                          onChange={(e) =>
                            setMapping((current) => ({
                              ...current,
                              [field.key]: Number(e.target.value),
                            }))
                          }
                          aria-label={`CSV column for ${field.label}`}
                        >
                          <option value="-1">(not mapped)</option>
                          {table.headers.map((header, idx) => (
                            <option key={`${header}-${idx}`} value={String(idx)}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="muted mailing-cell-clip">
                        <span title={sampleValue(table.rows, selected)}>
                          {sampleValue(table.rows, selected) || '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="muted">
            {preview.unique.length} unique email{preview.unique.length === 1 ? '' : 's'}
            {preview.fresh.length ? ` · ${preview.fresh.length} new` : ''}
            {preview.existing.length ? ` · ${preview.existing.length} already on the list` : ''}
            {preview.duplicates.length
              ? ` · ${preview.duplicates.length} duplicate${preview.duplicates.length === 1 ? '' : 's'} in file`
              : ''}
            {preview.noEmail.length ? ` · ${preview.noEmail.length} with no valid email` : ''}
          </p>

          {preview.unique.length > 0 && preview.fresh.length === 0 ? (
            <p className="muted">
              Every mapped email is already on the master list. Import will write them to Exceptions
              and will not add duplicates.
            </p>
          ) : null}

          <div className="mailing-toolbar">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setTable(null)
                setFileName('')
                setResult(null)
              }}
              disabled={importing}
            >
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleImport} disabled={!canImport}>
              {importing
                ? 'Importing…'
                : preview.fresh.length
                  ? `Import ${preview.fresh.length} new contact${preview.fresh.length === 1 ? '' : 's'}`
                  : 'Record exceptions'}
            </button>
          </div>
        </>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {result ? (
        <p className="harvest-client-emails-result">
          Batch {result.batch}: added {result.added}
          {result.exceptions
            ? `, ${result.exceptions} exception${result.exceptions === 1 ? '' : 's'} (not imported)`
            : ''}
          {result.existing ? ` · ${result.existing} already on the list` : ''}.
        </p>
      ) : null}
    </div>
  )
}
