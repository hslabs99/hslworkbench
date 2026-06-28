import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const USERS_COLLECTION = 'users'

export const DEV_SEED_USER = {
  username: 'mike',
  password: '21662166',
  displayName: 'Mike',
}

export function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
}

export function toPublicUser(docSnap) {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    username: data.username ?? '',
    displayName: data.displayName ?? data.username ?? '',
    active: data.active !== false,
  }
}

export async function authenticateUser(username, password) {
  const normalized = normalizeUsername(username)
  if (!normalized || !password) {
    throw new Error('Enter username and password.')
  }

  const q = query(collection(db, USERS_COLLECTION), where('username', '==', normalized))
  const snap = await getDocs(q)
  if (snap.empty) {
    throw new Error('Invalid username or password.')
  }

  const match = snap.docs.find((d) => d.data().password === password)
  if (!match) {
    throw new Error('Invalid username or password.')
  }

  const data = match.data()
  if (data.active === false) {
    throw new Error('This account is disabled.')
  }

  return toPublicUser(match)
}

export async function listUsers() {
  const snap = await getDocs(collection(db, USERS_COLLECTION))
  return snap.docs
    .map(toPublicUser)
    .sort((a, b) => a.username.localeCompare(b.username))
}

export async function createUser({ username, password, displayName, active = true }) {
  const normalized = normalizeUsername(username)
  if (!normalized) throw new Error('Username is required.')
  if (!password) throw new Error('Password is required.')

  const existing = await getDocs(
    query(collection(db, USERS_COLLECTION), where('username', '==', normalized)),
  )
  if (!existing.empty) throw new Error('That username already exists.')

  const ref = await addDoc(collection(db, USERS_COLLECTION), {
    username: normalized,
    displayName: displayName?.trim() || normalized,
    password,
    active: active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return { id: ref.id, username: normalized, displayName: displayName?.trim() || normalized, active: active !== false }
}

export async function updateUser(userId, { username, password, displayName, active }) {
  const payload = { updatedAt: serverTimestamp() }

  if (username !== undefined) {
    const normalized = normalizeUsername(username)
    if (!normalized) throw new Error('Username is required.')
    const existing = await getDocs(
      query(collection(db, USERS_COLLECTION), where('username', '==', normalized)),
    )
    if (existing.docs.some((d) => d.id !== userId)) {
      throw new Error('That username already exists.')
    }
    payload.username = normalized
  }

  if (displayName !== undefined) {
    payload.displayName = displayName.trim() || payload.username || ''
  }

  if (password !== undefined && password !== '') {
    payload.password = password
  }

  if (active !== undefined) {
    payload.active = active !== false
  }

  await updateDoc(doc(db, USERS_COLLECTION, userId), payload)
}

export async function deleteUser(userId) {
  await deleteDoc(doc(db, USERS_COLLECTION, userId))
}
