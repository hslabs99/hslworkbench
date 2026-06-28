import { loadEnv } from 'vite'
import { getAiPromptConfig } from './aiPrompts.js'
import { formatOpenAIError } from './openaiErrors.js'
import { summariseAllEmails } from './openaiSummarise.js'
import { suggestProspectProjectName } from './openaiProspectNaming.js'
import { seedDevUsersOnce } from './seedUsers.js'
import {
  analyzeSqlExportAsync,
  buildImportCommand,
  buildMigrationReport,
  checkPostgresCliTools,
  createDebugLog,
  executeImport,
  getMigrationEnvPaths,
  IPV6_POOLER_HINT,
  MAX_UPLOAD_BYTES,
  POST_IMPORT_CHECKLIST,
  saveUploadedSql,
  scanProjectForDatabaseUsage,
  statSqlFile,
  streamUploadSqlFile,
  SUPABASE_DIRECT_HOST,
  SUPABASE_PROJECT_REF,
  testSupabaseConnectivity,
} from './celgpsMigration.js'

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** Vite dev-only API: OpenAI summarise + config (key stays on server). */
export function devApiPlugin() {
  return {
    name: 'hsl-dev-api',
    configureServer(server) {
      const env = loadEnv('', process.cwd(), '')
      Object.assign(process.env, env)

      seedDevUsersOnce()
        .then((result) => {
          if (result.seeded) {
            console.log(`[hsl-workbench] Seeded dev user "${result.username}"`)
          }
        })
        .catch((err) => {
          console.warn(
            '[hsl-workbench] Dev user seed skipped:',
            err instanceof Error ? err.message : String(err),
          )
        })

      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]

        if (path === '/api/ai-config' && req.method === 'GET') {
          sendJson(res, 200, getAiPromptConfig(process.env))
          return
        }

        if (path === '/api/celgps-migration/preflight' && req.method === 'GET') {
          try {
            const cli = await checkPostgresCliTools()
            const envPaths = getMigrationEnvPaths()
            const projectScan = scanProjectForDatabaseUsage(process.cwd())
            sendJson(res, 200, {
              cli,
              envPaths,
              projectScan,
              postImportChecklist: POST_IMPORT_CHECKLIST,
              supabaseHost: SUPABASE_DIRECT_HOST,
              supabaseProjectRef: SUPABASE_PROJECT_REF,
              ipv6PoolerHint: IPV6_POOLER_HINT,
            })
          } catch (err) {
            sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
          }
          return
        }

        if (path === '/api/celgps-migration/test-connection' && req.method === 'POST') {
          try {
            const result = await testSupabaseConnectivity(process.env)
            sendJson(res, result.ok ? 200 : 500, result)
          } catch (err) {
            sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
          }
          return
        }

        if (path === '/api/celgps-migration/upload-sql' && req.method === 'POST') {
          try {
            const debug = createDebugLog()
            const fileName = decodeURIComponent(req.headers['x-file-name'] || 'upload.sql')
            const stat = await streamUploadSqlFile(req, fileName, debug)
            sendJson(res, 200, { ...stat, source: 'file-picker', debug: debug.snapshot() })
          } catch (err) {
            sendJson(res, 500, {
              error: err instanceof Error ? err.message : String(err),
              debug: err.debug || [],
            })
          }
          return
        }

        if (path === '/api/celgps-migration/stat-file' && req.method === 'POST') {
          try {
            const body = await readJsonBody(req)
            const debug = createDebugLog()
            const stat = statSqlFile(body.filePath, debug)
            sendJson(res, 200, { ...stat, maxUploadBytes: MAX_UPLOAD_BYTES })
          } catch (err) {
            sendJson(res, 500, {
              error: err instanceof Error ? err.message : String(err),
              debug: err.debug || [],
            })
          }
          return
        }

        if (path === '/api/celgps-migration/analyze' && req.method === 'POST') {
          try {
            const body = await readJsonBody(req)
            let { filePath, content, fileName } = body
            const debug = createDebugLog()

            if (content && !filePath) {
              debug.info('Received inline upload (legacy)', fileName || 'upload.sql')
              if (Buffer.byteLength(content, 'utf8') > MAX_UPLOAD_BYTES) {
                debug.error('Inline upload rejected — use file picker for large exports')
                sendJson(res, 400, {
                  error: `File too large for inline upload. Use the file picker (streams to server, supports multi-GB files).`,
                  debug: debug.snapshot(),
                })
                return
              }
              filePath = saveUploadedSql(fileName || 'upload.sql', content)
              debug.info('Saved upload to temp path', filePath)
              content = null
            }

            if (!filePath) {
              sendJson(res, 400, {
                error: 'Select a .sql file with the file picker, or provide a validated file path.',
              })
              return
            }

            const sqlAnalysis = await analyzeSqlExportAsync({ filePath, fileName }, debug)
            const cli = await checkPostgresCliTools()
            const connectivity = await testSupabaseConnectivity(process.env)
            const projectScan = scanProjectForDatabaseUsage(process.cwd())
            const report = buildMigrationReport({
              sqlAnalysis,
              connectivity,
              projectScan,
              cli,
            })
            const importCommand = filePath
              ? await buildImportCommand({ filePath, processEnv: process.env })
              : null
            sendJson(res, 200, {
              sqlAnalysis,
              report,
              importCommand,
              filePath,
              debug: debug.snapshot(),
            })
          } catch (err) {
            sendJson(res, 500, {
              error: err instanceof Error ? err.message : String(err),
              debug: err.debug || [],
            })
          }
          return
        }

        if (path === '/api/celgps-migration/import-command' && req.method === 'POST') {
          try {
            const body = await readJsonBody(req)
            const importCommand = await buildImportCommand({
              filePath: body.filePath,
              processEnv: process.env,
            })
            sendJson(res, 200, importCommand)
          } catch (err) {
            sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
          }
          return
        }

        if (path === '/api/celgps-migration/import' && req.method === 'POST') {
          try {
            const body = await readJsonBody(req)
            if (!body.approved) {
              sendJson(res, 400, {
                error: 'Import requires explicit approval (approved: true).',
              })
              return
            }
            const result = await executeImport({
              filePath: body.filePath,
              processEnv: process.env,
              approved: true,
            })
            sendJson(res, 200, result)
          } catch (err) {
            sendJson(res, 500, {
              error: err instanceof Error ? err.message : String(err),
              ...(err.details || {}),
            })
          }
          return
        }

        if (path === '/api/test-openai' && req.method === 'POST') {
          try {
            const apiKey = process.env.OPENAI_API_KEY
            if (!apiKey) {
              sendJson(res, 500, {
                error:
                  'OPENAI_API_KEY is not set. Add it to .env.local and restart npm run dev.',
              })
              return
            }

            const { default: OpenAI } = await import('openai')
            const client = new OpenAI({ apiKey })
            const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
            let completion
            try {
              completion = await client.chat.completions.create({
                model,
                max_tokens: 16,
                messages: [{ role: 'user', content: 'Reply with exactly the word OK.' }],
              })
            } catch (err) {
              sendJson(res, 500, { error: formatOpenAIError(err) })
              return
            }
            const reply = completion.choices[0]?.message?.content?.trim() || ''

            sendJson(res, 200, { ok: true, model, reply })
          } catch (err) {
            sendJson(res, 500, {
              error: formatOpenAIError(err),
            })
          }
          return
        }

        if (path === '/api/suggest-prospect-name' && req.method === 'POST') {
          try {
            const body = await readJsonBody(req)
            const { senderEmail, senderName, subject, body: emailBody, promptOverrides } = body
            if (!senderEmail && !subject && !emailBody) {
              sendJson(res, 400, { error: 'No lead email content to name from.' })
              return
            }
            const result = await suggestProspectProjectName(
              {
                senderEmail,
                senderName,
                subject,
                body: emailBody,
                promptOverrides: promptOverrides || {},
              },
              process.env,
            )
            sendJson(res, 200, result)
          } catch (err) {
            sendJson(res, 500, { error: formatOpenAIError(err) })
          }
          return
        }

        if (path !== '/api/summarise-communications' || req.method !== 'POST') {
          return next()
        }

        try {
          const body = await readJsonBody(req)
          const {
            rows,
            projectName,
            clientCompany,
            aiContext,
            senderEmail,
            promptVariant,
            promptOverrides,
          } = body

          if (!Array.isArray(rows) || rows.length === 0) {
            sendJson(res, 400, { error: 'No emails to summarise.' })
            return
          }

          const enriched = await summariseAllEmails(
            rows,
            {
              projectName,
              clientCompany,
              aiContext,
              senderEmail,
              promptVariant,
              promptOverrides,
            },
            process.env,
            { promptVariant: promptVariant || 'project', promptOverrides: promptOverrides || {} },
          )

          sendJson(res, 200, { rows: enriched })
        } catch (err) {
          sendJson(res, 500, {
            error: formatOpenAIError(err),
          })
        }
      })
    },
  }
}
