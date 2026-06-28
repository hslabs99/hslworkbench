import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const port = process.env.PORT || '8080'
const superstaticBin = path.join(projectRoot, 'node_modules', 'superstatic', 'lib', 'bin', 'server.js')

const child = spawn(
  process.execPath,
  [
    superstaticBin,
    'dist',
    '--config',
    path.join(projectRoot, 'superstatic.json'),
    '--port',
    port,
    '--host',
    '0.0.0.0',
  ],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
