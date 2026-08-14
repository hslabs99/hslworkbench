/**
 * Browser Firestore access via the server. Firebase keys stay in process.env
 * (.env.local / App Hosting RUNTIME) and are never bundled into the client.
 */

export const db = { _remote: true }

const TS_WRITE = 'timestamp'
const TS_READ = 'ts'

export function serverTimestamp() {
  return { __fs: TS_WRITE }
}

function reviveValue(value) {
  if (value == null) return value
  if (typeof value === 'object' && value.__fs === TS_READ) {
    return {
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
      toDate: () => new Date(value.iso),
    }
  }
  if (Array.isArray(value)) return value.map(reviveValue)
  if (typeof value === 'object') {
    const out = {}
    for (const [key, nested] of Object.entries(value)) {
      out[key] = reviveValue(nested)
    }
    return out
  }
  return value
}

function wrapDoc(id, data) {
  const revived = reviveValue(data)
  return {
    id,
    data: () => revived,
    exists: () => revived != null,
  }
}

function wrapQuerySnap(payload) {
  const docs = (payload.docs || []).map((d) => wrapDoc(d.id, d.data))
  return {
    empty: Boolean(payload.empty) || docs.length === 0,
    docs,
    size: docs.length,
  }
}

function wrapDocSnap(payload) {
  const exists = Boolean(payload.exists)
  const revived = exists ? reviveValue(payload.data) : undefined
  return {
    id: payload.id,
    exists: () => exists,
    data: () => revived,
  }
}

class FirestoreClientError extends Error {
  constructor(message, code = '') {
    super(message)
    this.name = 'FirebaseError'
    this.code = code
  }
}

async function postOp(body) {
  const res = await fetch('/api/firestore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new FirestoreClientError(payload.error || `Firestore request failed (${res.status})`, payload.code || '')
  }
  return payload
}

export function collection(_db, name) {
  return { _kind: 'collection', path: name }
}

export function doc(_db, colOrName, id) {
  const collectionName = typeof colOrName === 'string' ? colOrName : colOrName.path
  return { _kind: 'doc', collection: collectionName, id }
}

export function where(field, op, value) {
  return { _kind: 'where', field, op, value }
}

export function orderBy(field, dir = 'asc') {
  return { _kind: 'orderBy', field, dir }
}

export function query(colRef, ...constraints) {
  return {
    _kind: 'query',
    collection: colRef.path,
    constraints,
  }
}

function describeTarget(target) {
  if (target._kind === 'doc') {
    return { collection: target.collection, id: target.id, constraints: [] }
  }
  if (target._kind === 'query') {
    return { collection: target.collection, constraints: target.constraints || [] }
  }
  return { collection: target.path, constraints: [] }
}

export async function getDoc(ref) {
  const payload = await postOp({
    op: 'getDoc',
    collection: ref.collection,
    id: ref.id,
  })
  return wrapDocSnap(payload)
}

export async function getDocs(target) {
  const desc = describeTarget(target)
  const payload = await postOp({
    op: 'getDocs',
    collection: desc.collection,
    constraints: desc.constraints,
  })
  return wrapQuerySnap(payload)
}

export async function addDoc(colRef, data) {
  const payload = await postOp({
    op: 'addDoc',
    collection: colRef.path,
    data,
  })
  return { id: payload.id }
}

export async function setDoc(ref, data, options = {}) {
  await postOp({
    op: 'setDoc',
    collection: ref.collection,
    id: ref.id,
    data,
    merge: Boolean(options.merge),
  })
}

export async function updateDoc(ref, data) {
  await postOp({
    op: 'updateDoc',
    collection: ref.collection,
    id: ref.id,
    data,
  })
}

export async function deleteDoc(ref) {
  await postOp({
    op: 'deleteDoc',
    collection: ref.collection,
    id: ref.id,
  })
}

export function writeBatch() {
  const ops = []
  return {
    set(ref, data, options = {}) {
      ops.push({
        type: 'set',
        collection: ref.collection,
        id: ref.id,
        data,
        merge: Boolean(options.merge),
      })
    },
    update(ref, data) {
      ops.push({
        type: 'update',
        collection: ref.collection,
        id: ref.id,
        data,
      })
    },
    delete(ref) {
      ops.push({
        type: 'delete',
        collection: ref.collection,
        id: ref.id,
      })
    },
    async commit() {
      await postOp({ op: 'batch', ops })
    },
  }
}

export function onSnapshot(target, onNext, onError) {
  let stopped = false
  let timer = null

  async function pull() {
    if (stopped) return
    try {
      const snap = target._kind === 'doc' ? await getDoc(target) : await getDocs(target)
      if (stopped) return
      onNext(snap)
    } catch (err) {
      if (stopped) return
      onError?.(err instanceof Error ? err : new FirestoreClientError(String(err)))
    }
  }

  pull()
  timer = setInterval(pull, 4000)
  return () => {
    stopped = true
    if (timer) clearInterval(timer)
  }
}
