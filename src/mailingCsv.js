import { parseEmailAddress } from './emailAddress.js'

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

function headerIndex(headers, names) {
  return headers.findIndex((h) => names.includes(h))
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '')
}

/**
 * Parse CSV, TSV, or pasted lines into { name, email, company } rows.
 * Accepts a header row (email / name / company) or name+email columns with no header.
 */
export function parseContactRows(text) {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return []

  const delimiter = detectDelimiter(lines[0])
  const firstCells = splitCsvLine(lines[0], delimiter).map((c) => c.toLowerCase())
  const looksLikeHeader =
    firstCells.some((c) => c === 'email' || c === 'e-mail' || c === 'e mail') ||
    (firstCells.includes('name') && firstCells.some((c) => c.includes('mail')))

  let start = 0
  let emailIdx = 0
  let nameIdx = -1
  let companyIdx = -1

  if (looksLikeHeader) {
    emailIdx = headerIndex(firstCells, ['email', 'e-mail', 'e mail', 'mail'])
    nameIdx = headerIndex(firstCells, ['name', 'contact', 'full name'])
    companyIdx = headerIndex(firstCells, ['company', 'organisation', 'organization', 'org'])
    if (emailIdx < 0) emailIdx = firstCells.findIndex((c) => c.includes('mail'))
    start = 1
  } else if (firstCells.length > 1) {
    nameIdx = 0
    emailIdx = 1
    companyIdx = firstCells.length > 2 ? 2 : -1
  }

  const rows = []
  for (const line of lines.slice(start)) {
    const cells = splitCsvLine(line, delimiter)
    const email = isValidEmail(cells[emailIdx] || cells.find((c) => c.includes('@')) || '')
    if (!email) continue
    rows.push({
      email,
      name: nameIdx >= 0 ? cells[nameIdx] || '' : '',
      company: companyIdx >= 0 ? cells[companyIdx] || '' : '',
    })
  }
  return rows
}

/** Collapse duplicate emails in an import, filling blank name/company from later rows. */
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
    }
    const existing = byEmail.get(email)
    if (existing) {
      duplicates += 1
      byEmail.set(email, {
        ...existing,
        name: existing.name || next.name,
        company: existing.company || next.company,
      })
    } else {
      byEmail.set(email, next)
    }
  }
  return { rows: [...byEmail.values()], duplicates }
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
      <Column ss:Width="160"/>
      <Column ss:Width="240"/>
      <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Name</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Email</Data></Cell>
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
