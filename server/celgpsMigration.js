import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createConnection } from 'node:net'
import { pipeline } from 'node:stream/promises'

const execFileAsync = promisify(execFile)

/** Browser uploads above this are rejected — use a local file path instead. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
/** Files above this get extra warnings in the UI (e.g. 1 GB dumps). */
export const LARGE_FILE_BYTES = 100 * 1024 * 1024
const ANALYZE_PROGRESS_LINES = 250_000

export const SUPABASE_PROJECT_REF = 'ticxxuvaajtqmdrdcbml'
export const SUPABASE_DIRECT_HOST = `db.${SUPABASE_PROJECT_REF}.supabase.co`
const SUPABASE_PORT = 5432
const SUPABASE_USER = 'postgres'
const SUPABASE_DATABASE = 'postgres'

export const IPV6_POOLER_HINT = `Supabase direct host (${SUPABASE_DIRECT_HOST}) is IPv6-only. Your network cannot resolve it.

Fix: In Supabase Dashboard → Connect → Session pooler, copy the connection string and set CELGPS_DATABASE_URL in .env.celgps-migration.local:

CELGPS_DATABASE_URL=postgresql://postgres.${SUPABASE_PROJECT_REF}:YOUR_PASSWORD@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres

Use the exact Session pooler host from your Supabase Dashboard (Connect). Restart npm run dev after saving.`

const PSQL_CANDIDATES = [
  'psql',
  'pg_dump',
  process.env.PSQL_PATH,
  process.env.PG_DUMP_PATH,
  'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe',
  'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
  'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
  'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
  'C:\\Program Files (x86)\\PostgreSQL\\18\\bin\\psql.exe',
].filter(Boolean)

const PG_DUMP_CANDIDATES = [
  'pg_dump',
  process.env.PG_DUMP_PATH,
  'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
].filter(Boolean)

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATION_ENV_PATH = join(__dirname, '..', '.env.celgps-migration.local')
const UPLOAD_DIR = join(__dirname, '..', '.migration-temp')

const PROBLEMATIC_PATTERNS = [
  { id: 'create_database', label: 'CREATE DATABASE', regex: /^\s*CREATE\s+DATABASE\b/im },
  { id: 'create_role', label: 'CREATE ROLE / CREATE USER', regex: /^\s*CREATE\s+(ROLE|USER)\b/im },
  { id: 'alter_role', label: 'ALTER ROLE', regex: /^\s*ALTER\s+ROLE\b/im },
  { id: 'alter_owner', label: 'ALTER ... OWNER', regex: /^\s*ALTER\s+(\w+\s+)?\w+\s+OWNER\s+TO\b/im },
  { id: 'grant', label: 'GRANT', regex: /^\s*GRANT\b/im },
  { id: 'revoke', label: 'REVOKE', regex: /^\s*REVOKE\b/im },
  { id: 'extension', label: 'CREATE EXTENSION', regex: /^\s*CREATE\s+EXTENSION\b/im },
  { id: 'drop_database', label: 'DROP DATABASE', regex: /^\s*DROP\s+DATABASE\b/im },
  { id: 'cloud_sql', label: 'Cloud SQL comment/metadata', regex: /cloud\s*sql|googleapis\.com/i },
  {
    id: 'cloudsql_role',
    label: 'Cloud SQL role (GRANT/OWNER)',
    regex: /^\s*(GRANT|REVOKE|ALTER\s+.*\s+OWNER\s+TO|CREATE\s+ROLE|ALTER\s+ROLE)\b.*\bcloudsql/i,
  },
]

const ORM_MARKERS = [
  { name: 'Prisma', files: ['schema.prisma'], deps: ['@prisma/client', 'prisma'] },
  { name: 'Drizzle', files: ['drizzle.config.ts', 'drizzle.config.js'], deps: ['drizzle-orm'] },
  { name: 'Knex', files: ['knexfile.js', 'knexfile.ts'], deps: ['knex'] },
  { name: 'TypeORM', files: [], deps: ['typeorm'] },
  { name: 'Sequelize', files: [], deps: ['sequelize'] },
  { name: 'Supabase JS', files: [], deps: ['@supabase/supabase-js'] },
]

const GCLOUD_PATTERNS = [
  { id: 'database_url', label: 'DATABASE_URL', regex: /DATABASE_URL/i },
  { id: 'direct_url', label: 'DIRECT_URL', regex: /DIRECT_URL/i },
  { id: 'instance_connection', label: 'INSTANCE_CONNECTION_NAME', regex: /INSTANCE_CONNECTION_NAME/i },
  { id: 'cloud_sql_connector', label: 'Cloud SQL connector', regex: /@google-cloud\/sql|cloud-sql-connector|CloudSQL/i },
  { id: 'gcloud_host', label: 'Google Cloud SQL host', regex: /\.googleapis\.com|cloudsql|34\.\d+\.\d+\.\d+/i },
]

function ensureMigrationEnvTemplate() {
  if (!existsSync(MIGRATION_ENV_PATH)) {
    const template = `# CELGPS → Supabase migration credentials (dev server only, gitignored)

# Recommended on IPv4 networks — Session pooler URL from Supabase Dashboard → Connect
# CELGPS_DATABASE_URL=postgresql://postgres.${SUPABASE_PROJECT_REF}:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres

# Or password + direct host (IPv6 only — fails on many Windows/home networks)
CELGPS_SUPABASE_PASSWORD=
`
    writeFileSync(MIGRATION_ENV_PATH, template, 'utf8')
  }
}

function describeConnectionMode(host, user) {
  if (host.includes('pooler.supabase.com')) {
    return { mode: 'pooler', ipv4Compatible: true }
  }
  if (host.startsWith('db.') && host.endsWith('.supabase.co')) {
    return { mode: 'direct', ipv4Compatible: false }
  }
  return { mode: 'custom', ipv4Compatible: null }
}

function formatDnsError(host, errMessage) {
  if (!/ENOTFOUND|ENOENT|EAI_AGAIN/i.test(errMessage)) {
    return errMessage
  }
  const { mode, ipv4Compatible } = describeConnectionMode(host)
  if (mode === 'direct' || host === SUPABASE_DIRECT_HOST) {
    return `${errMessage}\n\n${IPV6_POOLER_HINT}`
  }
  if (ipv4Compatible === false) {
    return `${errMessage}\n\n${IPV6_POOLER_HINT}`
  }
  return `${errMessage}\n\nCheck the hostname in CELGPS_DATABASE_URL and your network connection.`
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const vars = {}
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    vars[key] = value
  }
  return vars
}

export function getMigrationEnvPaths() {
  ensureMigrationEnvTemplate()
  return {
    migrationEnvPath: MIGRATION_ENV_PATH,
    exists: existsSync(MIGRATION_ENV_PATH),
  }
}

export function loadCelgpsDbConfig(processEnv = process.env) {
  ensureMigrationEnvTemplate()
  const migrationVars = parseEnvFile(MIGRATION_ENV_PATH)
  const localVars = parseEnvFile(join(__dirname, '..', '.env.local'))

  const merged = { ...localVars, ...migrationVars, ...processEnv }

  const explicitUrl =
    merged.CELGPS_DATABASE_URL ||
    merged.SUPABASE_DATABASE_URL ||
    merged.DATABASE_URL

  if (explicitUrl && explicitUrl.includes('supabase')) {
    try {
      const url = new URL(explicitUrl)
      const host = url.hostname
      const user = decodeURIComponent(url.username || SUPABASE_USER)
      const password = decodeURIComponent(url.password || '')
      const connectionMode = describeConnectionMode(host, user)
      return {
        host,
        port: Number(url.port || SUPABASE_PORT),
        user,
        password,
        database: url.pathname.replace(/^\//, '') || SUPABASE_DATABASE,
        connectionString: explicitUrl,
        passwordSource: 'CELGPS_DATABASE_URL',
        connectionMode: connectionMode.mode,
        ipv4Compatible: connectionMode.ipv4Compatible,
      }
    } catch {
      /* fall through */
    }
  }

  const password =
    merged.CELGPS_SUPABASE_PASSWORD ||
    merged.SUPABASE_DB_PASSWORD ||
    merged.SUPABASE_PASSWORD ||
    ''

  const passwordSource = merged.CELGPS_SUPABASE_PASSWORD
    ? 'CELGPS_SUPABASE_PASSWORD (.env.celgps-migration.local or .env.local)'
    : merged.SUPABASE_DB_PASSWORD
      ? 'SUPABASE_DB_PASSWORD'
      : merged.SUPABASE_PASSWORD
        ? 'SUPABASE_PASSWORD'
        : null

  const host = merged.CELGPS_SUPABASE_HOST || SUPABASE_DIRECT_HOST
  const port = Number(merged.CELGPS_SUPABASE_PORT || SUPABASE_PORT)
  const user = merged.CELGPS_SUPABASE_USER || SUPABASE_USER
  const database = merged.CELGPS_SUPABASE_DATABASE || SUPABASE_DATABASE
  const connectionMode = describeConnectionMode(host, user)

  const connectionString = password
    ? `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`
    : null

  return {
    host,
    port,
    user,
    password,
    database,
    connectionString,
    passwordSource,
    connectionMode: connectionMode.mode,
    ipv4Compatible: connectionMode.ipv4Compatible,
  }
}

async function resolveBinary(candidates, name) {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (candidate.includes('\\') || candidate.includes('/')) {
      if (existsSync(candidate)) {
        try {
          const { stdout } = await execFileAsync(candidate, ['--version'], { timeout: 10000 })
          return { path: candidate, version: stdout.trim().split('\n')[0] }
        } catch {
          continue
        }
      }
      continue
    }
    try {
      const { stdout } = await execFileAsync(candidate, ['--version'], { timeout: 10000, shell: true })
      return { path: candidate, version: stdout.trim().split('\n')[0] }
    } catch {
      continue
    }
  }
  return { path: null, version: null, missing: name }
}

export async function checkPostgresCliTools() {
  const psql = await resolveBinary(PSQL_CANDIDATES, 'psql')
  const pgDump = await resolveBinary(PG_DUMP_CANDIDATES, 'pg_dump')
  return {
    psql,
    pgDump,
    onPath: psql.path === 'psql' && pgDump.path === 'pg_dump',
    ready: Boolean(psql.path && pgDump.path),
  }
}

function testTcp(host, port, timeoutMs = 8000) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolvePromise({ ok: false, error: `TCP connection to ${host}:${port} timed out` })
    }, timeoutMs)
    socket.on('connect', () => {
      clearTimeout(timer)
      socket.end()
      resolvePromise({ ok: true })
    })
    socket.on('error', (err) => {
      clearTimeout(timer)
      resolvePromise({ ok: false, error: formatDnsError(host, err.message) })
    })
  })
}

export async function testSupabaseConnectivity(processEnv = process.env) {
  const config = loadCelgpsDbConfig(processEnv)
  const cli = await checkPostgresCliTools()

  if (!config.password && !config.connectionString) {
    return {
      ok: false,
      stage: 'credentials',
      error:
        'Supabase password not configured. Add CELGPS_SUPABASE_PASSWORD to .env.celgps-migration.local (created in project root) and restart npm run dev.',
      config: sanitizeConfig(config),
      cli,
    }
  }

  const tcp = await testTcp(config.host, config.port)
  if (!tcp.ok) {
    return { ok: false, stage: 'tcp', error: tcp.error, config: sanitizeConfig(config), cli }
  }

  if (!cli.psql.path) {
    return {
      ok: false,
      stage: 'cli',
      error: 'psql not found. Install PostgreSQL client tools or add psql to PATH.',
      config: sanitizeConfig(config),
      cli,
      tcpOk: true,
    }
  }

  const connectionUrl = config.connectionString
  const args = [
    connectionUrl,
    '-t',
    '-A',
    '-c',
    'SELECT version();',
    '-c',
    'SELECT current_user;',
    '-c',
    'SELECT current_database();',
  ]

  try {
    const { stdout, stderr } = await execFileAsync(cli.psql.path, args, {
      timeout: 20000,
      env: { ...process.env, PGSSLMODE: 'require' },
    })
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const versionLine = lines.find((line) => /PostgreSQL/i.test(line)) || 'Unknown'
    const versionMatch = versionLine.match(/PostgreSQL\s+[\d.]+[^,\n]*/i)
    const otherLines = lines.filter((line) => line !== versionLine)

    return {
      ok: true,
      config: sanitizeConfig(config),
      cli,
      tcpOk: true,
      version: versionMatch ? versionMatch[0].trim() : versionLine,
      currentUser: otherLines[0] || config.user,
      currentDatabase: otherLines[1] || config.database,
      stderr: stderr?.trim() || null,
    }
  } catch (err) {
    const rawError = err.stderr?.trim() || err.message
    return {
      ok: false,
      stage: 'psql',
      error: formatDnsError(config.host, rawError),
      config: sanitizeConfig(config),
      cli,
      tcpOk: true,
    }
  }
}

function sanitizeConfig(config) {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    passwordConfigured: Boolean(config.password),
    passwordSource: config.passwordSource,
    connectionMode: config.connectionMode,
    ipv4Compatible: config.ipv4Compatible,
    migrationEnvPath: MIGRATION_ENV_PATH,
  }
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function createDebugLog() {
  const entries = []
  return {
    entries,
    log(level, message, detail = null) {
      entries.push({
        ts: new Date().toISOString(),
        level,
        message,
        detail: detail || undefined,
      })
      return entries.length - 1
    },
    info(message, detail) {
      return this.log('info', message, detail)
    },
    warn(message, detail) {
      return this.log('warn', message, detail)
    },
    error(message, detail) {
      return this.log('error', message, detail)
    },
    success(message, detail) {
      return this.log('success', message, detail)
    },
    snapshot() {
      return [...entries]
    },
  }
}

export function statSqlFile(filePath, debug = createDebugLog()) {
  if (!filePath?.trim()) {
    throw new Error('No file path provided.')
  }

  const resolved = resolve(filePath.trim())
  if (!resolved.toLowerCase().endsWith('.sql')) {
    debug.warn(
      'File extension is not .sql',
      'Plain SQL text exports (.sql) are expected for psql -f restore.',
    )
  }
  debug.info('Checking SQL file path', resolved)

  if (!existsSync(resolved)) {
    debug.error('File not found', resolved)
    const err = new Error(`SQL file not found: ${resolved}`)
    err.debug = debug.snapshot()
    throw err
  }

  const stat = statSync(resolved)
  if (!stat.isFile()) {
    debug.error('Path is not a file', resolved)
    const err = new Error(`Path is not a file: ${resolved}`)
    err.debug = debug.snapshot()
    throw err
  }

  const sizeBytes = stat.size
  const sizeLabel = formatBytes(sizeBytes)
  const isLarge = sizeBytes >= LARGE_FILE_BYTES
  const isVeryLarge = sizeBytes >= 512 * 1024 * 1024

  debug.success('File found', `${sizeLabel}${isLarge ? ' (large file)' : ''}`)
  if (isVeryLarge) {
    debug.warn(
      'Very large export',
      'Analysis streams line-by-line. Restore may take 30+ minutes — watch the debug log.',
    )
  } else if (isLarge) {
    debug.warn('Large export', 'Use local path only. Do not upload via browser.')
  }

  let readable = false
  try {
    const handle = createReadStream(resolved, { start: 0, end: 0 })
    readable = true
    handle.destroy()
    debug.info('File is readable by dev server')
  } catch (err) {
    debug.error('Cannot read file', err instanceof Error ? err.message : String(err))
  }

  return {
    filePath: resolved,
    fileName: basename(resolved),
    sizeBytes,
    sizeLabel,
    isLarge,
    isVeryLarge,
    readable,
    modifiedAt: stat.mtime.toISOString(),
    debug: debug.snapshot(),
  }
}

function resolveSqlFilePath(filePath) {
  const resolved = resolve(filePath)
  if (!existsSync(resolved)) throw new Error(`SQL file not found: ${resolved}`)
  const stat = statSync(resolved)
  if (!stat.isFile()) throw new Error(`Path is not a file: ${resolved}`)
  return { resolved, stat }
}

async function scanSqlLines(readable, debug) {
  const counts = {
    lineCount: 0,
    tableCount: 0,
    copyStatementCount: 0,
    insertStatementCount: 0,
    bytesScanned: 0,
  }
  const issues = PROBLEMATIC_PATTERNS.map((pattern) => ({
    ...pattern,
    count: 0,
    samples: [],
  }))
  const extensions = new Set()
  const started = Date.now()

  debug.info('Starting streaming SQL scan')

  for await (const line of readable) {
    counts.lineCount += 1
    counts.bytesScanned += Buffer.byteLength(line, 'utf8') + 1

    if (/^\s*CREATE\s+TABLE\b/i.test(line)) counts.tableCount += 1
    if (/^\s*COPY\s+/i.test(line)) counts.copyStatementCount += 1
    if (/^\s*INSERT\s+INTO\b/i.test(line)) counts.insertStatementCount += 1

    const extMatch = line.match(/^\s*CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([^"\s;]+)"?/i)
    if (extMatch) extensions.add(extMatch[1])

    for (const issue of issues) {
      if (issue.count >= 5 && issue.samples.length >= 5) continue
      if (issue.regex.test(line)) {
        issue.count += 1
        if (issue.samples.length < 5) {
          issue.samples.push({ line: counts.lineCount, text: line.trim().slice(0, 200) })
        }
      }
    }

    if (counts.lineCount % ANALYZE_PROGRESS_LINES === 0) {
      debug.info(
        'Scan progress',
        `${counts.lineCount.toLocaleString()} lines · ${formatBytes(counts.bytesScanned)} · ${Math.round((Date.now() - started) / 1000)}s elapsed`,
      )
    }
  }

  const durationSec = Math.round((Date.now() - started) / 1000)
  debug.success(
    'Scan complete',
    `${counts.lineCount.toLocaleString()} lines · ${formatBytes(counts.bytesScanned)} · ${durationSec}s`,
  )

  return {
    ...counts,
    issues: issues.filter((item) => item.count > 0),
    extensions: [...extensions],
    durationSec,
  }
}

async function analyzeFromStream(resolved, stat, debug) {
  const stream = createReadStream(resolved, { encoding: 'utf8' })
  const readable = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    const scan = await scanSqlLines(readable, debug)
    return {
      fileName: basename(resolved),
      filePath: resolved,
      sizeBytes: stat.size,
      sizeLabel: formatBytes(stat.size),
      isLarge: stat.size >= LARGE_FILE_BYTES,
      ...scan,
      recommendation:
        scan.issues.length > 0
          ? 'Review flagged statements before import. You may need to strip CREATE DATABASE, role/owner/grant statements, and verify extensions are enabled in Supabase.'
          : 'No common problematic statements detected. Still verify extensions and run a test import on a staging database if available.',
    }
  } finally {
    readable.close()
    stream.destroy()
  }
}

async function analyzeFromString(content, fileName, debug) {
  const sizeBytes = Buffer.byteLength(content, 'utf8')
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Upload too large (${formatBytes(sizeBytes)}). Max upload is ${formatBytes(MAX_UPLOAD_BYTES)}. Use a local file path instead.`,
    )
  }
  debug.info('Analyzing uploaded SQL', formatBytes(sizeBytes))
  const lines = content.split(/\r?\n/)
  const readable = (async function* () {
    for (const line of lines) yield line
  })()
  const scan = await scanSqlLines(readable, debug)
  return {
    fileName: fileName || 'uploaded.sql',
    filePath: null,
    sizeBytes,
    sizeLabel: formatBytes(sizeBytes),
    isLarge: sizeBytes >= LARGE_FILE_BYTES,
    ...scan,
    recommendation:
      scan.issues.length > 0
        ? 'Review flagged statements before import.'
        : 'No common problematic statements detected.',
  }
}

export async function analyzeSqlExportAsync({ filePath, content, fileName }, debug = createDebugLog()) {
  if (content && !filePath) {
    return analyzeFromString(content, fileName, debug)
  }
  if (!filePath) {
    throw new Error('No SQL file path or content provided.')
  }
  const { resolved, stat } = resolveSqlFilePath(filePath)
  debug.info('Analyzing file on disk', `${resolved} (${formatBytes(stat.size)})`)
  return analyzeFromStream(resolved, stat, debug)
}

export function scanProjectForDatabaseUsage(projectRoot) {
  const root = resolve(projectRoot)
  const packageJsonPath = join(root, 'package.json')
  let packageJson = {}
  if (existsSync(packageJsonPath)) {
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    } catch {
      packageJson = {}
    }
  }

  const allDeps = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  }

  const detectedOrms = ORM_MARKERS.filter((orm) => {
    const hasDep = orm.deps.some((dep) => allDeps[dep])
    const hasFile = orm.files.some((file) => existsSync(join(root, file)))
    return hasDep || hasFile
  }).map((orm) => orm.name)

  const gcloudFindings = []
  const scanExtensions = ['.js', '.jsx', '.ts', '.tsx', '.env', '.env.example', '.env.local', '.json', '.yaml', '.yml']
  const skipDirs = new Set(['node_modules', 'dist', '.git', '.migration-temp'])
  const skipFiles = new Set([
    'server/celgpsMigration.js',
    '.env.celgps-migration.local',
    '.env.example',
  ])

  function walk(dir, relative = '') {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (skipDirs.has(entry.name)) continue
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      if (skipFiles.has(rel.replace(/\\/g, '/'))) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, rel)
        continue
      }
      const ext = entry.name.includes('.') ? `.${entry.name.split('.').pop()}` : ''
      if (!scanExtensions.includes(ext) && !entry.name.startsWith('.env')) continue
      let text
      try {
        text = readFileSync(full, 'utf8')
      } catch {
        continue
      }
      for (const pattern of GCLOUD_PATTERNS) {
        if (pattern.regex.test(text)) {
          gcloudFindings.push({ file: rel, pattern: pattern.label })
        }
      }
      if (/firebase|firestore/i.test(text) && !/node_modules/.test(rel)) {
        /* tracked separately */
      }
    }
  }

  walk(root)

  const usesFirebase = existsSync(join(root, 'src', 'firebase.js')) || Boolean(allDeps.firebase)

  return {
    projectRoot: root,
    detectedOrms,
    usesFirebase,
    usesRawPostgres: detectedOrms.length === 0 && !usesFirebase,
    primaryDataStore: usesFirebase ? 'Firebase Firestore' : detectedOrms[0] || 'None detected in this project',
    gcloudFindings: dedupeFindings(gcloudFindings),
    note:
      'HSL Workbench uses Firebase Firestore, not PostgreSQL. CELGPS migration targets an external Supabase PostgreSQL database.',
  }
}

function dedupeFindings(findings) {
  const seen = new Set()
  return findings.filter((f) => {
    const key = `${f.file}:${f.pattern}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildMigrationReport({ sqlAnalysis, connectivity, projectScan, cli }) {
  const config = connectivity?.config || {}
  const issueSummary = sqlAnalysis?.issues?.map((i) => `${i.label} (${i.count})`) || []

  const requiredCodeChanges = []
  if (projectScan.gcloudFindings.length > 0) {
    requiredCodeChanges.push(
      'Update deployment environment variables: replace Google Cloud SQL DATABASE_URL / DIRECT_URL / INSTANCE_CONNECTION_NAME with Supabase connection string.',
    )
  }
  if (projectScan.gcloudFindings.some((f) => f.pattern.includes('connector'))) {
    requiredCodeChanges.push('Remove Cloud SQL connector / proxy configuration from runtime and CI/CD.')
  }
  if (sqlAnalysis?.extensions?.length) {
    requiredCodeChanges.push(
      `Enable required PostgreSQL extensions in Supabase before import: ${sqlAnalysis.extensions.join(', ')}.`,
    )
  }
  if (issueSummary.length) {
    requiredCodeChanges.push(
      'Sanitize SQL export or use --single-transaction with filtered script: remove CREATE DATABASE, role/owner/grant statements incompatible with Supabase managed Postgres.',
    )
  }
  if (projectScan.usesFirebase) {
    requiredCodeChanges.push(
      'No changes required in HSL Workbench itself (Firestore-based). Update CELGPS application deployment config separately.',
    )
  }

  return {
    generatedAt: new Date().toISOString(),
    database: {
      type: 'PostgreSQL (Supabase)',
      host: config.host,
      version: connectivity?.version || null,
      loginOk: connectivity?.ok === true,
      currentUser: connectivity?.currentUser || null,
    },
    cli: {
      psql: cli?.psql?.version || null,
      psqlPath: cli?.psql?.path || null,
      pgDump: cli?.pgDump?.version || null,
    },
    export: sqlAnalysis
      ? {
          fileName: sqlAnalysis.fileName,
          filePath: sqlAnalysis.filePath,
          tableCount: sqlAnalysis.tableCount,
          lineCount: sqlAnalysis.lineCount,
          sizeBytes: sqlAnalysis.sizeBytes,
          sizeLabel: sqlAnalysis.sizeLabel,
          scanDurationSec: sqlAnalysis.durationSec,
          isLarge: sqlAnalysis.isLarge,
          copyStatements: sqlAnalysis.copyStatementCount,
          insertStatements: sqlAnalysis.insertStatementCount,
          extensions: sqlAnalysis.extensions,
        }
      : null,
    potentialImportIssues: issueSummary,
    issueDetails: sqlAnalysis?.issues || [],
    projectScan,
    requiredCodeChanges,
    importApproved: false,
  }
}

export function buildImportCommand({ filePath, processEnv = process.env }) {
  const config = loadCelgpsDbConfig(processEnv)
  const cli = checkPostgresCliTools()
  return cli.then((tools) => {
    if (!tools.psql.path) {
      throw new Error('psql is not available')
    }
    if (!filePath) {
      throw new Error('SQL file path is required for import command')
    }
    const resolved = resolve(filePath)
    const psqlPath = tools.psql.path.includes(' ') ? `"${tools.psql.path}"` : tools.psql.path
    const fileArg = resolved.includes(' ') ? `"${resolved}"` : resolved

    // Password via env var — never echoed in command line
    const command = `$env:PGPASSWORD="<from .env.celgps-migration.local>"; $env:PGSSLMODE="require"; & ${psqlPath} -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database} -f ${fileArg}`

    const commandMasked = `$env:PGPASSWORD="***"; $env:PGSSLMODE="require"; & ${psqlPath} -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database} -f ${fileArg}`

    return {
      command: commandMasked,
      psqlPath: tools.psql.path,
      sqlFile: resolved,
      host: config.host,
      database: config.database,
    }
  })
}

const CLOUDSQL_ROLE_LINE =
  /^\s*(GRANT|REVOKE|ALTER\s+(?:TABLE|SEQUENCE|FUNCTION|SCHEMA|VIEW|DATABASE)\s+.*\s+OWNER\s+TO|CREATE\s+ROLE|ALTER\s+ROLE)\b.*\bcloudsql/i

function extractPsqlError(text) {
  const match = text.match(/ERROR:\s*.+/i)
  return match ? match[0].trim() : null
}

export async function createSanitizedSqlCopy(sourcePath, debug = createDebugLog()) {
  const resolved = resolve(sourcePath)
  const target = join(UPLOAD_DIR, `sanitized-${Date.now()}-${basename(resolved)}`)
  mkdirSync(UPLOAD_DIR, { recursive: true })

  debug.info('Creating Supabase-safe SQL copy', basename(resolved))

  const input = createReadStream(resolved, { encoding: 'utf8' })
  const readable = createInterface({ input, crlfDelay: Infinity })
  const output = createWriteStream(target, { encoding: 'utf8' })

  let stripped = 0
  let lineNum = 0

  try {
    for await (const line of readable) {
      lineNum += 1
      if (CLOUDSQL_ROLE_LINE.test(line)) {
        stripped += 1
        debug.warn('Stripped Cloud SQL role statement', `L${lineNum}: ${line.trim().slice(0, 120)}`)
        continue
      }
      output.write(`${line}\n`)
    }
  } finally {
    readable.close()
    input.destroy()
    await new Promise((resolvePromise, rejectPromise) => {
      output.end((err) => (err ? rejectPromise(err) : resolvePromise()))
    })
  }

  if (stripped === 0) {
    debug.info('No Cloud SQL role statements found — using original file')
    return { path: resolved, sanitized: false, stripped: 0 }
  }

  debug.success('Sanitized copy ready', `${stripped} line(s) removed → ${target}`)
  return { path: target, sanitized: true, stripped, sanitizedPath: target }
}

export async function executeImport({ filePath, processEnv = process.env, approved = false }) {
  const debug = createDebugLog()

  if (!approved) {
    throw new Error('Import not approved. Set approved: true after explicit user confirmation.')
  }

  const config = loadCelgpsDbConfig(processEnv)
  if (!config.password) {
    debug.error('Supabase password not configured')
    throw new Error('Supabase password not configured.')
  }

  const cli = await checkPostgresCliTools()
  if (!cli.psql.path) {
    debug.error('psql not available')
    throw new Error('psql not available.')
  }

  const resolved = resolve(filePath)
  if (!existsSync(resolved)) {
    debug.error('SQL file not found', resolved)
    throw new Error(`SQL file not found: ${resolved}`)
  }

  const stat = statSync(resolved)
  const sizeLabel = formatBytes(stat.size)
  mkdirSync(UPLOAD_DIR, { recursive: true })

  const sanitized = await createSanitizedSqlCopy(resolved, debug)
  const importPath = sanitized.path

  const logPath = join(UPLOAD_DIR, `import-${Date.now()}.log`)

  debug.info('Preparing psql restore', `${basename(importPath)} (${sizeLabel})`)
  debug.info('Target database', `${config.user}@${config.host}:${config.port}/${config.database}`)
  debug.info('Session log file', logPath)
  if (stat.size >= LARGE_FILE_BYTES) {
    debug.warn('Large restore', 'May take 30–90+ minutes. Keep dev server running. Watch log below.')
  }

  const args = [
    '-h',
    config.host,
    '-p',
    String(config.port),
    '-U',
    config.user,
    '-d',
    config.database,
    '-f',
    importPath,
    '-v',
    'ON_ERROR_STOP=1',
  ]

  const started = Date.now()
  let stderrTail = ''
  let stdoutTail = ''
  let lastProgressLog = started

  return new Promise((resolvePromise, rejectPromise) => {
    const logStream = createWriteStream(logPath, { flags: 'a' })
    logStream.write(`--- CELGPS restore started ${new Date().toISOString()} ---\n`)
    logStream.write(`File: ${importPath} (${sizeLabel})\n`)
    if (sanitized.sanitized) {
      logStream.write(`Sanitized from: ${resolved} (${sanitized.stripped} Cloud SQL role line(s) removed)\n`)
    }
    logStream.write(`Host: ${config.host}:${config.port}\n\n`)

    debug.info('Launching psql', cli.psql.path)

    const proc = spawn(cli.psql.path, args, {
      env: {
        ...processEnv,
        PGPASSWORD: config.password,
        PGSSLMODE: 'require',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      logStream.write(text)
      stdoutTail = (stdoutTail + text).slice(-12000)
    })

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      logStream.write(text)
      stderrTail = (stderrTail + text).slice(-12000)
      const now = Date.now()
      if (now - lastProgressLog >= 15000) {
        lastProgressLog = now
        const elapsed = Math.round((now - started) / 1000)
        const lastLine = text.trim().split(/\r?\n/).filter(Boolean).pop()
        debug.info('psql running', `${elapsed}s elapsed${lastLine ? ` · ${lastLine.slice(0, 120)}` : ''}`)
      }
    })

    proc.on('error', (err) => {
      logStream.end()
      debug.error('Failed to start psql', err.message)
      rejectPromise(err)
    })

    proc.on('close', (code) => {
      const durationSec = Math.round((Date.now() - started) / 1000)
      logStream.write(`\n--- psql exited ${code} after ${durationSec}s ---\n`)
      logStream.end()

      if (code === 0) {
        debug.success('Restore complete', `${durationSec}s · log: ${logPath}`)
        resolvePromise({
          ok: true,
          durationSec,
          durationLabel: `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`,
          sqlFile: resolved,
          sizeLabel,
          logPath,
          stdout: stdoutTail,
          stderr: stderrTail,
          debug: debug.snapshot(),
        })
      } else {
        const psqlError = extractPsqlError(stderrTail) || extractPsqlError(stdoutTail)
        debug.error('psql failed', `exit code ${code} after ${durationSec}s — see log: ${logPath}`)
        if (psqlError) debug.error('PostgreSQL error', psqlError)
        const err = new Error(
          psqlError
            ? `psql exited with code ${code} after ${durationSec}s — ${psqlError}`
            : `psql exited with code ${code} after ${durationSec}s`,
        )
        err.details = {
          code,
          durationSec,
          logPath,
          psqlError,
          stderr: stderrTail,
          stdout: stdoutTail,
          debug: debug.snapshot(),
          likelyNearComplete: /cloudsql/i.test(psqlError || stderrTail),
        }
        rejectPromise(err)
      }
    })
  })
}

export function saveUploadedSql(fileName, content) {
  mkdirSync(UPLOAD_DIR, { recursive: true })
  const safeName = basename(fileName).replace(/[^\w.\-]+/g, '_')
  const target = join(UPLOAD_DIR, `${Date.now()}-${safeName}`)
  writeFileSync(target, content, 'utf8')
  return target
}

export async function streamUploadSqlFile(req, fileName, debug = createDebugLog()) {
  const safeName = basename(fileName || 'upload.sql').replace(/[^\w.\-]+/g, '_')
  if (!safeName.toLowerCase().endsWith('.sql')) {
    debug.warn(
      'File extension is not .sql',
      'Plain SQL text exports (.sql) are expected for psql -f restore.',
    )
  }

  mkdirSync(UPLOAD_DIR, { recursive: true })
  const target = join(UPLOAD_DIR, `${Date.now()}-${safeName}`)
  debug.info('Receiving streamed upload', `${safeName} → ${target}`)

  const contentLength = Number(req.headers['content-length'] || 0)
  if (contentLength > 0) {
    debug.info('Upload size', formatBytes(contentLength))
  }

  const writeStream = createWriteStream(target)
  let bytesReceived = 0
  req.on('data', (chunk) => {
    bytesReceived += chunk.length
  })

  try {
    await pipeline(req, writeStream)
  } catch (err) {
    debug.error('Upload stream failed', err instanceof Error ? err.message : String(err))
    try {
      if (existsSync(target)) writeFileSync(target, '') // truncate failed partial
    } catch {
      /* ignore cleanup errors */
    }
    const error = new Error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
    error.debug = debug.snapshot()
    throw error
  }

  debug.success('Upload saved to disk', `${formatBytes(bytesReceived || statSync(target).size)}`)
  return statSqlFile(target, debug)
}

export const POST_IMPORT_CHECKLIST = [
  'Table count verification — compare CREATE TABLE count in export vs \\dt in Supabase',
  'Row count verification — spot-check key tables with SELECT COUNT(*) and compare to source',
  'Application startup — point CELGPS app at Supabase URL and confirm clean boot',
  'Authentication testing — login, session, and password reset flows',
  'CRUD testing — create, read, update, delete on primary business entities',
  'Deployment configuration — update DATABASE_URL, remove Cloud SQL proxy/connector, redeploy',
  'Extension verification — confirm required extensions are enabled (e.g. uuid-ossp, pg_trgm)',
  'Performance smoke test — run slow queries and check indexes transferred correctly',
]
