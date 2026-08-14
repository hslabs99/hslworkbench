import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getServerFirestore } from './firebaseApp.js'
import { readJsonBody, sendJson } from './httpUtils.js'

const ALLOWED_COLLECTIONS = new Set([
  'projects',
  'techStackLookup',
  'sectorLookup',
  'harvestEmailExclusions',
  'email_summaries',
  'communication_summary_colors',
  'project_history',
  'boardSilos',
  'boardSettings',
  'users',
])

function assertCollection(name) {
  if (!ALLOWED_COLLECTIONS.has(name)) {
    const err = new Error(`Collection not allowed: ${name}`)
    err.statusCode = 400
    throw err
  }
}

function serializeValue(value) {
  if (value == null) return value
  if (value instanceof Timestamp || (typeof value?.toDate === 'function' && typeof value.seconds === 'number')) {
    const d = value.toDate()
    return {
      __fs: 'ts',
      iso: d.toISOString(),
      seconds: value.seconds,
      nanoseconds: value.nanoseconds ?? 0,
    }
  }
  if (value instanceof Date) {
    return {
      __fs: 'ts',
      iso: value.toISOString(),
      seconds: Math.floor(value.getTime() / 1000),
      nanoseconds: 0,
    }
  }
  if (Array.isArray(value)) return value.map(serializeValue)
  if (typeof value === 'object') {
    const out = {}
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested === 'function') continue
      out[key] = serializeValue(nested)
    }
    return out
  }
  return value
}

function serializeDoc(id, data) {
  return { id, data: serializeValue(data) }
}

function reviveForWrite(value) {
  if (value && typeof value === 'object' && value.__fs === 'timestamp') {
    return serverTimestamp()
  }
  if (Array.isArray(value)) return value.map(reviveForWrite)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, nested] of Object.entries(value)) {
      out[key] = reviveForWrite(nested)
    }
    return out
  }
  return value
}

function buildQuery(db, { collection: col, id, constraints = [] }) {
  assertCollection(col)
  if (id) return doc(db, col, id)

  let q = collection(db, col)
  const parts = []
  for (const c of constraints) {
    if (c._kind === 'where' || c.kind === 'where') {
      parts.push(where(c.field, c.op, c.value))
    } else if (c._kind === 'orderBy' || c.kind === 'orderBy') {
      parts.push(orderBy(c.field, c.dir || 'asc'))
    }
  }
  return parts.length ? query(q, ...parts) : q
}

function firestoreError(err) {
  const error = new Error(err instanceof Error ? err.message : String(err))
  error.code = err?.code || ''
  error.statusCode = err?.code === 'not-found' ? 404 : 500
  return error
}

async function handleOp(db, body) {
  const op = body.op
  if (op === 'getDoc') {
    assertCollection(body.collection)
    const snap = await getDoc(doc(db, body.collection, body.id))
    return {
      exists: snap.exists(),
      id: snap.id,
      data: snap.exists() ? serializeValue(snap.data()) : null,
    }
  }

  if (op === 'getDocs') {
    const q = buildQuery(db, body)
    const snap = await getDocs(q)
    return {
      empty: snap.empty,
      docs: snap.docs.map((d) => serializeDoc(d.id, d.data())),
    }
  }

  if (op === 'addDoc') {
    assertCollection(body.collection)
    const ref = await addDoc(collection(db, body.collection), reviveForWrite(body.data || {}))
    return { id: ref.id }
  }

  if (op === 'setDoc') {
    assertCollection(body.collection)
    await setDoc(doc(db, body.collection, body.id), reviveForWrite(body.data || {}), {
      merge: Boolean(body.merge),
    })
    return { ok: true }
  }

  if (op === 'updateDoc') {
    assertCollection(body.collection)
    try {
      await updateDoc(doc(db, body.collection, body.id), reviveForWrite(body.data || {}))
    } catch (err) {
      throw firestoreError(err)
    }
    return { ok: true }
  }

  if (op === 'deleteDoc') {
    assertCollection(body.collection)
    await deleteDoc(doc(db, body.collection, body.id))
    return { ok: true }
  }

  if (op === 'batch') {
    const batch = writeBatch(db)
    for (const item of body.ops || []) {
      assertCollection(item.collection)
      const ref = doc(db, item.collection, item.id)
      if (item.type === 'set') {
        batch.set(ref, reviveForWrite(item.data || {}), { merge: Boolean(item.merge) })
      } else if (item.type === 'update') {
        batch.update(ref, reviveForWrite(item.data || {}))
      } else if (item.type === 'delete') {
        batch.delete(ref)
      }
    }
    await batch.commit()
    return { ok: true }
  }

  const err = new Error(`Unknown Firestore op: ${op}`)
  err.statusCode = 400
  throw err
}

function parseWatchParams(url) {
  const collectionName = url.searchParams.get('collection') || ''
  const id = url.searchParams.get('id') || ''
  let constraints = []
  const raw = url.searchParams.get('constraints')
  if (raw) {
    try {
      constraints = JSON.parse(raw)
    } catch {
      constraints = []
    }
  }
  return { collection: collectionName, id, constraints }
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

/** Handle /api/firestore. Returns true if handled. */
export async function handleFirestoreApi(req, res, pathname, env = process.env) {
  if (!pathname.startsWith('/api/firestore')) return false

  try {
    const db = getServerFirestore(env)

    if (pathname === '/api/firestore/watch' && req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost')
      const target = parseWatchParams(url)
      const q = buildQuery(db, target)

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      })

      const unsub = onSnapshot(
        q,
        (snap) => {
          if (typeof snap.exists === 'function') {
            writeSse(res, {
              kind: 'doc',
              exists: snap.exists(),
              id: snap.id,
              data: snap.exists() ? serializeValue(snap.data()) : null,
            })
            return
          }
          writeSse(res, {
            kind: 'query',
            empty: snap.empty,
            docs: snap.docs.map((d) => serializeDoc(d.id, d.data())),
          })
        },
        (err) => {
          writeSse(res, { kind: 'error', error: err instanceof Error ? err.message : String(err), code: err?.code })
        },
      )

      req.on('close', () => {
        unsub()
      })
      return true
    }

    if (pathname === '/api/firestore' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const result = await handleOp(db, body)
      sendJson(res, 200, result)
      return true
    }

    sendJson(res, 404, { error: 'Firestore API route not found.' })
    return true
  } catch (err) {
    const status = err.statusCode || (err.code === 'not-found' ? 404 : 500)
    sendJson(res, status, {
      error: err instanceof Error ? err.message : String(err),
      code: err.code || '',
    })
    return true
  }
}
