import { getApps, initializeApp } from 'firebase/app'
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { firebaseConfig } from '../src/firebaseConfig.js'

export const USERS_COLLECTION = 'users'

export const DEV_SEED_USER = {
  username: 'mike',
  password: '21662166',
  displayName: 'Mike',
}

function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
}

function getDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  return getFirestore(app)
}

/** Inserts the dev seed user once if missing. Safe to call on every dev server start. */
export async function seedDevUsersOnce() {
  const db = getDb()
  const username = normalizeUsername(DEV_SEED_USER.username)
  const existing = await getDocs(
    query(collection(db, USERS_COLLECTION), where('username', '==', username)),
  )
  if (!existing.empty) {
    return { seeded: false, username }
  }

  await addDoc(collection(db, USERS_COLLECTION), {
    username,
    displayName: DEV_SEED_USER.displayName,
    password: DEV_SEED_USER.password,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return { seeded: true, username }
}
