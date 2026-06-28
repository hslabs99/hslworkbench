import http from 'node:http'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleOpenAiApi } from './openaiApi.js'
import { handleMsApi } from './msApi.js'
import { sendJson } from './httpUtils.js'
import { ensureServerSecrets } from './secrets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const publicPort = Number(process.env.PORT || 8080)
const staticPort = Number(process.env.STATIC_INTERNAL_PORT || 18080)
const superstaticBin = path.join(projectRoot, 'node_modules', 'superstatic', 'lib', 'bin', 'server.js')

function startSuperstatic() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        superstaticBin,
        'dist',
        '--config',
        path.join(projectRoot, 'superstatic.json'),
        '--port',
        String(staticPort),
        '--host',
        '127.0.0.1',
      ],
      { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
    )

    let settled = false
    const finish = (err) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(child)
    }

    child.on('error', finish)
    child.on('exit', (code) => {
      if (!settled) finish(new Error(`superstatic exited before ready (code ${code ?? 'unknown'})`))
    })

    const deadline = Date.now() + 15_000
    const poll = () => {
      const req = http.request(
        { hostname: '127.0.0.1', port: staticPort, path: '/', method: 'GET' },
        () => finish(null),
      )
      req.on('error', () => {
        if (Date.now() > deadline) {
          finish(new Error(`superstatic did not start on port ${staticPort} within 15s`))
          return
        }
        setTimeout(poll, 200)
      })
      req.end()
    }
    poll()
  })
}

function proxyToStatic(req, res) {
  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: staticPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )
  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      sendJson(res, 502, { error: `Static server unavailable: ${err.message}` })
    } else {
      res.end()
    }
  })
  req.pipe(proxyReq)
}

async function main() {
  await ensureServerSecrets()
  const staticChild = await startSuperstatic()

  const server = http.createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] ?? ''

    if (pathname.startsWith('/api/')) {
      try {
        if (handleMsApi(req, res, pathname, process.env)) return
        const handled = await handleOpenAiApi(req, res, pathname, process.env)
        if (handled) return
        sendJson(res, 404, { error: 'API route not found.' })
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return
    }

    proxyToStatic(req, res)
  })

  server.listen(publicPort, '0.0.0.0', () => {
    console.log(`[hsl-workbench] Listening on 0.0.0.0:${publicPort} (static on ${staticPort})`)
  })

  staticChild.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

main().catch((err) => {
  console.error('[hsl-workbench] Failed to start:', err)
  process.exit(1)
})
