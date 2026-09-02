import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { Storage } from '@google-cloud/storage'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseConfig } from './firebaseConfig.js'
import { getServerFirestore } from './firebaseApp.js'
import { sendJson } from './httpUtils.js'

export const MAX_MAILING_FILE_BYTES = 25 * 1024 * 1024

const SETTINGS = 'boardSettings'

const ALLOWED_EXT = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'txt',
  'csv',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
])

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

function fileDocId(id) {
  return `mailingFile_${id}`
}

function safeFileName(name) {
  const base = String(name || 'file').split(/[/\\]/).pop() || 'file'
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, '_').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 180) || 'file'
}

function extensionOf(name) {
  return extname(name).replace(/^\./, '').toLowerCase()
}

let cachedBucket = null

function storageClient(env = process.env) {
  const config = getFirebaseConfig(env)
  return new Storage({ projectId: config.projectId || 'hslworkbench' })
}

function isFirebaseReservedBucketName(name) {
  return /\.firebasestorage\.app$/i.test(name) || /\.appspot\.com$/i.test(name)
}

function candidateBucketNames(env = process.env) {
  const config = getFirebaseConfig(env)
  const projectId = config.projectId || 'hslworkbench'
  const preferred = String(env.FIREBASE_STORAGE_BUCKET || config.storageBucket || '').trim()
  return [
    ...new Set(
      [preferred, `${projectId}.firebasestorage.app`, `${projectId}.appspot.com`, `${projectId}-mailing-files`].filter(
        Boolean,
      ),
    ),
  ]
}

async function ensurePublicObjectRead(bucket) {
  const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 })
  policy.bindings ||= []
  const already = policy.bindings.some(
    (binding) => binding.role === 'roles/storage.objectViewer' && binding.members?.includes('allUsers'),
  )
  if (already) return
  policy.bindings.push({ role: 'roles/storage.objectViewer', members: ['allUsers'] })
  await bucket.iam.setPolicy(policy)
}

async function mailingBucket(env = process.env) {
  if (cachedBucket) return cachedBucket
  const names = candidateBucketNames(env)
  if (!names.length) {
    throw new Error('FIREBASE_STORAGE_BUCKET is not set. Add it to .env.local / App Hosting.')
  }
  const storage = storageClient(env)
  for (const name of names) {
    const bucket = storage.bucket(name)
    const [exists] = await bucket.exists()
    if (exists) {
      cachedBucket = bucket
      return bucket
    }
  }
  const config = getFirebaseConfig(env)
  const projectId = config.projectId || 'hslworkbench'
  const name = names.find((item) => !isFirebaseReservedBucketName(item)) || `${projectId}-mailing-files`
  try {
    const [created] = await storage.createBucket(name, {
      location: 'asia-southeast1',
      uniformBucketLevelAccess: true,
    })
    try {
      await ensurePublicObjectRead(created)
    } catch (iamErr) {
      console.warn(
        `[hsl-workbench] Created Storage bucket "${name}" but could not make objects public: ${storageErrorMessage(iamErr)}`,
      )
    }
    console.log(`[hsl-workbench] Created Storage bucket "${name}" for mailing files`)
    cachedBucket = created
    return created
  } catch (err) {
    throw new Error(
      `No Firebase Storage bucket is available (looked for ${names.join(', ')}). Enable Storage in the Firebase console, or create a GCS bucket named "${name}". ${storageErrorMessage(err)}`,
    )
  }
}

async function mailingObject(storagePath, env = process.env) {
  const bucket = await mailingBucket(env)
  if (!bucket || typeof bucket.file !== 'function') {
    throw new Error('Firebase Storage is not ready. Check FIREBASE_STORAGE_BUCKET and retry.')
  }
  return { bucket, file: bucket.file(storagePath) }
}

function contentDisposition(fileName, inline) {
  const ascii = String(fileName || 'file')
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(fileName || 'file')
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

/** Long-lived Firebase download URL (token in object metadata). Works for email recipients. */
function firebaseMediaUrl(bucketName, storagePath, token) {
  const objectPath = encodeURIComponent(storagePath)
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${objectPath}?alt=media&token=${encodeURIComponent(token)}`
}

function gcsPublicUrl(bucketName, storagePath) {
  const encodedPath = String(storagePath || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://storage.googleapis.com/${bucketName}/${encodedPath}`
}

function publicFileUrl(bucketName, storagePath, token) {
  if (isFirebaseReservedBucketName(bucketName)) {
    return firebaseMediaUrl(bucketName, storagePath, token)
  }
  return gcsPublicUrl(bucketName, storagePath)
}

function storageErrorMessage(err) {
  const detail = err instanceof Error ? err.message : String(err)
  if (/could not load the default credentials/i.test(detail)) {
    return 'Could not reach Firebase Storage. Locally run `gcloud auth application-default login`. On App Hosting, grant the compute service account Storage Object Admin on the Firebase Storage bucket.'
  }
  if (/permission|forbidden|403|accessdenied|access denied/i.test(detail)) {
    return 'Cannot write to Firebase Storage. Grant this app Storage Object Admin on the FIREBASE_STORAGE_BUCKET, then retry.'
  }
  return detail
}

async function readBodyLimited(req, maxBytes) {
  const contentLength = Number(req.headers['content-length'] || 0)
  if (contentLength > maxBytes) {
    const err = new Error(`File is too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))} MB.`)
    err.statusCode = 413
    throw err
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) {
      const err = new Error(`File is too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))} MB.`)
      err.statusCode = 413
      throw err
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function handleMailingFileUpload(req, res, env = process.env) {
  const originalName = safeFileName(decodeURIComponent(String(req.headers['x-file-name'] || 'file')))
  const ext = extensionOf(originalName)
  if (!ALLOWED_EXT.has(ext)) {
    sendJson(res, 400, {
      error: `File type .${ext || 'unknown'} is not allowed. Upload a PDF (preferred) or another document such as Word, Excel, or PowerPoint.`,
    })
    return
  }

  let buffer
  try {
    buffer = await readBodyLimited(req, MAX_MAILING_FILE_BYTES)
  } catch (err) {
    sendJson(res, err.statusCode || 400, { error: storageErrorMessage(err) })
    return
  }
  if (!buffer.length) {
    sendJson(res, 400, { error: 'The uploaded file is empty.' })
    return
  }

  const id = randomUUID().replace(/-/g, '')
  const downloadToken = randomUUID()
  const contentType =
    MIME_BY_EXT[ext] ||
    String(req.headers['content-type'] || '').split(';')[0].trim() ||
    'application/octet-stream'
  const storagePath = `mailing-files/${id}/${originalName}`
  const inline = ext === 'pdf' || contentType.startsWith('image/')

  let bucketName = ''
  let publicUrl = ''
  let gsPath = ''

  try {
    const { bucket, file } = await mailingObject(storagePath, env)
    bucketName = bucket.name
    gsPath = `gs://${bucketName}/${storagePath}`
    publicUrl = publicFileUrl(bucketName, storagePath, downloadToken)
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
        contentDisposition: contentDisposition(originalName, inline),
        metadata: {
          originalName,
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    })
    const db = getServerFirestore(env)
    await setDoc(doc(db, SETTINGS, fileDocId(id)), {
      fileName: originalName,
      contentType,
      size: buffer.length,
      storagePath,
      bucket: bucketName,
      gsPath,
      downloadToken,
      publicUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    sendJson(res, 500, { error: storageErrorMessage(err) })
    return
  }

  sendJson(res, 200, {
    id,
    fileName: originalName,
    contentType,
    size: buffer.length,
    bucket: bucketName,
    storagePath,
    gsPath,
    url: publicUrl,
  })
}

export async function handleMailingFileDownload(req, res, fileId, env = process.env) {
  const id = String(fileId || '').replace(/[^a-zA-Z0-9]/g, '')
  if (!id) {
    sendJson(res, 404, { error: 'File not found.' })
    return
  }

  const db = getServerFirestore(env)
  const snap = await getDoc(doc(db, SETTINGS, fileDocId(id)))
  if (!snap.exists()) {
    sendJson(res, 404, { error: 'File not found.' })
    return
  }

  const data = snap.data() || {}
  const storagePath = String(data.storagePath || '')
  if (!storagePath) {
    sendJson(res, 404, { error: 'File is missing from storage.' })
    return
  }

  let file
  try {
    ;({ file } = await mailingObject(storagePath, env))
    const [exists] = await file.exists()
    if (!exists) {
      sendJson(res, 404, { error: 'File is missing from storage.' })
      return
    }
  } catch (err) {
    sendJson(res, 500, { error: storageErrorMessage(err) })
    return
  }

  const fileName = data.fileName || 'document.pdf'
  const contentType = data.contentType || 'application/octet-stream'
  const inline = contentType === 'application/pdf' || String(contentType).startsWith('image/')

  res.statusCode = 200
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', contentDisposition(fileName, inline))
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  try {
    await new Promise((resolve, reject) => {
      const stream = file.createReadStream()
      stream.on('error', reject)
      res.on('close', resolve)
      res.on('finish', resolve)
      stream.pipe(res)
    })
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: storageErrorMessage(err) })
      return
    }
    res.end()
  }
}

export function mailingFileIdFromPath(pathname) {
  const match = String(pathname || '').match(/^\/api\/mailings\/files\/([a-zA-Z0-9]+)\/?$/)
  return match ? match[1] : ''
}
