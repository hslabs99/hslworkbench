import { parseEmailAddress } from './emailAddress.js'
import {
  CONTACT_COMPANY_HEADERS,
  CONTACT_EMAIL_HEADERS,
  CONTACT_NAME_HEADERS,
  CONTACT_PROFILE_FIELDS,
  CONTACT_TEMPLATE_HEADERS,
  extraFieldsFromRow,
  mergeContactFields,
  normalizeHeader,
  suggestColumnMapping,
} from './contactFields.js'

function isValidEmail(value) {
  const email = parseEmailAddress(value)
  return email.includes('@') ? email : ''
}

function detectDelimiter(line) {
  const counts = { '\t': 0, ',': 0, ';': 0 }
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch in counts) counts[ch] += 1
  }
  if (counts['\t'] >= counts[','] && counts['\t'] >= counts[';'] && counts['\t'] > 0) return '\t'
  if (counts[';'] > counts[','] && counts[';'] > 0) return ';'
  return ','
}

function splitCsvLine(line, delimiter = ',') {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function cellAt(cells, index) {
  return index >= 0 ? String(cells[index] || '').trim() : ''
}

function looksLikeContactHeader(cells) {
  const normalized = cells.map(normalizeHeader)
  if (normalized.some((h) => CONTACT_EMAIL_HEADERS.map(normalizeHeader).includes(h))) return true
  if (normalized.includes('name') && normalized.some((h) => h.includes('mail'))) return true
  if (normalized.some((h) => CONTACT_COMPANY_HEADERS.map(normalizeHeader).includes(h))) return true
  if (normalized.some((h) => CONTACT_NAME_HEADERS.map(normalizeHeader).includes(h))) return true
  return CONTACT_PROFILE_FIELDS.some((field) =>
    field.headers.some((name) => normalized.includes(normalizeHeader(name))),
  )
}

function firstRowHasEmail(cells) {
  return (cells || []).some((cell) => String(cell).includes('@'))
}

function padRow(cells, width) {
  const next = [...(cells || [])]
  while (next.length < width) next.push('')
  return next
}

function tableFromLines(lines) {
  if (!lines.length) return { headers: [], rows: [] }
  const delimiter = detectDelimiter(lines[0])
  const parsed = lines.map((line) => splitCsvLine(line, delimiter))
  const width = Math.max(...parsed.map((row) => row.length), 0)
  const allRows = parsed.map((row) => padRow(row, width))
  const first = allRows[0] || []
  const headerLike = looksLikeContactHeader(first) || !firstRowHasEmail(first)
  if (headerLike) {
    return {
      headers: first.map((cell, idx) => cell || `Column ${idx + 1}`),
      rows: allRows.slice(1),
    }
  }
  return {
    headers: first.map((_, idx) => `Column ${idx + 1}`),
    rows: allRows,
  }
}

/**
 * Parse CSV/TSV/pasted text into a header row plus data rows for column mapping.
 */
export function parseContactTable(text) {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return tableFromLines(lines)
}

export function applyColumnMapping(rows, mapping) {
  const contacts = []
  const noEmail = []
  for (const cells of rows || []) {
    const get = (key) => {
      const idx = mapping?.[key]
      if (idx == null || idx < 0) return ''
      return cellAt(cells, idx)
    }
    const mapped = {
      name: get('name'),
      company: get('company'),
      ...Object.fromEntries(CONTACT_PROFILE_FIELDS.map((field) => [field.key, get(field.key)])),
    }
    const email = isValidEmail(get('email'))
    if (!email) {
      noEmail.push({ ...mapped, email: get('email') })
      continue
    }
    contacts.push({ ...mapped, email })
  }
  return { contacts, noEmail }
}

function fallbackNameEmailMapping(headers, mapping) {
  const next = { ...mapping }
  if ((next.email == null || next.email < 0) && (headers || []).length > 1) {
    next.email = 1
    if (next.name == null || next.name < 0) next.name = 0
    if ((next.company == null || next.company < 0) && headers.length > 2) next.company = 2
  }
  return next
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '')
}

/**
 * Parse CSV, TSV, or pasted lines into contact rows.
 * Accepts a header row (email / company_email / contact_name / harvest columns)
 * or name+email columns with no header.
 */
export function parseContactRows(text) {
  const table = parseContactTable(text)
  if (!table.headers.length) return []
  const mapping = fallbackNameEmailMapping(table.headers, suggestColumnMapping(table.headers))
  return applyColumnMapping(table.rows, mapping).contacts
}

/** Collapse duplicate emails in an import, filling blank fields from later rows. */
export function dedupeContactRows(rows) {
  const byEmail = new Map()
  let duplicates = 0
  for (const row of rows || []) {
    const email = isValidEmail(row.email)
    if (!email) continue
    const next = {
      email,
      name: String(row.name || '').trim(),
      company: String(row.company || '').trim(),
      ...extraFieldsFromRow(row),
    }
    const existing = byEmail.get(email)
    if (existing) {
      duplicates += 1
      byEmail.set(email, mergeContactFields(existing, next))
    } else {
      byEmail.set(email, next)
    }
  }
  return { rows: [...byEmail.values()], duplicates }
}

/** Keep the first row per email; later copies are file duplicates (not merged). */
export function splitFileDuplicates(rows) {
  const unique = []
  const duplicates = []
  const seen = new Set()
  for (const row of rows || []) {
    const email = isValidEmail(row.email)
    if (!email) continue
    const next = { ...row, email }
    if (seen.has(email)) duplicates.push(next)
    else {
      seen.add(email)
      unique.push(next)
    }
  }
  return { unique, duplicates }
}

function elementsByLocalName(root, name) {
  return [...root.getElementsByTagName('*')].filter((el) => el.localName === name)
}

function spreadsheetXmlToTsv(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Could not read that spreadsheet. Save as CSV or paste the Name and Email columns instead.')
  }
  const lines = elementsByLocalName(doc, 'Row').map((row) => {
    const values = []
    let nextIndex = 1
    for (const cell of elementsByLocalName(row, 'Cell')) {
      const indexAttr = cell.getAttribute('ss:Index') || cell.getAttribute('Index')
      const index = indexAttr ? Number(indexAttr) : nextIndex
      while (values.length < index - 1) values.push('')
      const data = elementsByLocalName(cell, 'Data')[0]
      values.push((data?.textContent || '').trim())
      nextIndex = index + 1
    }
    return values.join('\t')
  })
  return lines.filter(Boolean).join('\n')
}

function looksLikeBinarySpreadsheet(text) {
  if (!text) return false
  const c0 = text.charCodeAt(0)
  const c1 = text.charCodeAt(1)
  if (c0 === 0x50 && c1 === 0x4b) return true
  if (c0 === 0xd0 && c1 === 0xcf) return true
  return text.slice(0, 256).includes('\u0000')
}

export function parseContactImportText(text) {
  const raw = stripBom(text).trim()
  if (!raw) return []
  if (looksLikeBinarySpreadsheet(raw)) {
    throw new Error(
      'Excel binary workbooks cannot be imported directly. Upload a CSV, or copy the Name and Email columns and paste them below.',
    )
  }
  if (raw.includes('urn:schemas-microsoft-com:office:spreadsheet') || /<Workbook[\s>]/i.test(raw)) {
    return parseContactRows(spreadsheetXmlToTsv(raw))
  }
  return parseContactRows(raw)
}

export function parseContactTableText(text) {
  const raw = stripBom(text).trim()
  if (!raw) return { headers: [], rows: [] }
  if (looksLikeBinarySpreadsheet(raw)) {
    throw new Error(
      'Excel binary workbooks cannot be imported directly. Save or export as CSV, then upload that file.',
    )
  }
  if (raw.includes('urn:schemas-microsoft-com:office:spreadsheet') || /<Workbook[\s>]/i.test(raw)) {
    return parseContactTable(spreadsheetXmlToTsv(raw))
  }
  return parseContactTable(raw)
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsText(file)
  })
}

export async function parseContactImportFile(file) {
  if (!file) return []
  return parseContactImportText(await readFileAsText(file))
}

export async function parseContactTableFile(file) {
  if (!file) return { headers: [], rows: [] }
  return parseContactTableText(await readFileAsText(file))
}

export function buildContactTemplateXls() {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Contacts">
    <Table>
${CONTACT_TEMPLATE_HEADERS.map(() => '      <Column ss:Width="140"/>').join('\n')}
      <Row>
${CONTACT_TEMPLATE_HEADERS.map(
  (header) => `        <Cell ss:StyleID="Header"><Data ss:Type="String">${header}</Data></Cell>`,
).join('\n')}
      </Row>
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <Selected/>
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>1</SplitHorizontal>
      <TopRowBottomPane>1</TopRowBottomPane>
      <ActivePane>2</ActivePane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>
`
}

export function downloadContactTemplateXls() {
  const blob = new Blob([buildContactTemplateXls()], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'master-client-list-template.xls'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
