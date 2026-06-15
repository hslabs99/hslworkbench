async function parseJsonResponse(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    err.debug = data.debug
    err.details = data
    throw err
  }
  return data
}

export async function fetchMigrationPreflight() {
  const res = await fetch('/api/celgps-migration/preflight')
  return parseJsonResponse(res)
}

export async function testMigrationConnectivity() {
  const res = await fetch('/api/celgps-migration/test-connection', { method: 'POST' })
  return parseJsonResponse(res)
}

export function uploadMigrationSqlFile(file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/celgps-migration/upload-sql')
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')

    if (onProgress && file.size > 0) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded, event.total)
        }
      }
    }

    xhr.onload = () => {
      let data = {}
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {}
      } catch {
        reject(new Error('Invalid server response during upload.'))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data)
        return
      }
      const err = new Error(data.error || `Upload failed (${xhr.status})`)
      err.debug = data.debug
      err.details = data
      reject(err)
    }

    xhr.onerror = () => reject(new Error('Network error during file upload.'))
    xhr.onabort = () => reject(new Error('File upload cancelled.'))
    xhr.send(file)
  })
}

export async function statMigrationSqlFile(filePath) {
  const res = await fetch('/api/celgps-migration/stat-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  })
  return parseJsonResponse(res)
}

export async function analyzeMigrationSql({ filePath, fileName }) {
  const res = await fetch('/api/celgps-migration/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, fileName }),
  })
  return parseJsonResponse(res)
}

export async function executeMigrationImport(filePath) {
  const res = await fetch('/api/celgps-migration/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, approved: true }),
  })
  return parseJsonResponse(res)
}

function formatUploadProgress(loaded, total) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
  const loadedMb = (loaded / 1024 / 1024).toFixed(1)
  const totalMb = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?'
  return `${pct}% (${loadedMb} / ${totalMb} MB)`
}

export { formatUploadProgress }
