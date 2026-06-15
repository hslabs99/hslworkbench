import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCZC4q8OyDder_ZF833Y9v7-leElHxrDko',
  authDomain: 'hslworkbench.firebaseapp.com',
  projectId: 'hslworkbench',
  storageBucket: 'hslworkbench.firebasestorage.app',
  messagingSenderId: '5252692405',
  appId: '1:5252692405:web:ed90688c06d0d3771f01fc',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
