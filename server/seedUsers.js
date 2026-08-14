import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { getServerFirestore } from './firebaseApp.js'

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

/** Inserts the dev seed user once if missing. Safe to call on every dev server start. */
export async function seedDevUsersOnce() {
  const db = getServerFirestore()
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
