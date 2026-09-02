import { mailingPublicOrigin } from './mailingOrigin.js'

export const MAX_MAILING_FILE_BYTES = 25 * 1024 * 1024

export function mailingFileUrl(fileId) {
  return `${mailingPublicOrigin()}/api/mailings/files/${encodeURIComponent(fileId)}`
}

export function labelFromFileName(name) {
  const base = String(name || '').split(/[/\\]/).pop() || ''
  const withoutExt = base.replace(/\.[^.]+$/, '')
  return withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || base || 'Download'
}

export function uploadMailingFile(file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/mailings/files')
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name || 'document.pdf'))
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    if (onProgress && file.size > 0) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded, event.total)
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
        resolve({
          ...data,
          url: data.url || mailingFileUrl(data.id),
        })
        return
      }
      reject(new Error(data.error || `Upload failed (${xhr.status})`))
    }

    xhr.onerror = () => reject(new Error('Network error during file upload.'))
    xhr.onabort = () => reject(new Error('File upload cancelled.'))
    xhr.send(file)
  })
}
