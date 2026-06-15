import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase.js'
import { asFirestoreError } from './firestoreErrors.js'
import { getDefaultPromptConfig, mergePromptOverrides } from './aiPromptsShared.js'

export const BOARD_SETTINGS_DOC = 'aiPrompts'
const COLLECTION = 'boardSettings'

function normalizeStored(data = {}) {
  return {
    projectSystemPrompt: data.projectSystemPrompt ?? '',
    projectUserPromptTemplate: data.projectUserPromptTemplate ?? '',
    prospectSystemPrompt: data.prospectSystemPrompt ?? '',
    prospectUserPromptTemplate: data.prospectUserPromptTemplate ?? '',
  }
}

export function subscribeAiPromptSettings(onData, onError) {
  const ref = doc(db, COLLECTION, BOARD_SETTINGS_DOC)
  return onSnapshot(
    ref,
    (snap) => {
      const stored = normalizeStored(snap.data())
      const merged = mergePromptOverrides(stored)
      onData({
        stored,
        merged,
        usingDefaults: {
          projectSystem: !stored.projectSystemPrompt?.trim(),
          projectUser: !stored.projectUserPromptTemplate?.trim(),
          prospectSystem: !stored.prospectSystemPrompt?.trim(),
          prospectUser: !stored.prospectUserPromptTemplate?.trim(),
        },
      })
    },
    onError,
  )
}

export function getDefaultAiPromptFields() {
  const defaults = getDefaultPromptConfig()
  return {
    projectSystemPrompt: defaults.project.systemPrompt,
    projectUserPromptTemplate: defaults.project.userPromptTemplate,
    prospectSystemPrompt: defaults.prospect.systemPrompt,
    prospectUserPromptTemplate: defaults.prospect.userPromptTemplate,
  }
}

export async function saveAiPromptSettings(fields) {
  const ref = doc(db, COLLECTION, BOARD_SETTINGS_DOC)
  const payload = {
    projectSystemPrompt: (fields.projectSystemPrompt || '').trim(),
    projectUserPromptTemplate: (fields.projectUserPromptTemplate || '').trim(),
    prospectSystemPrompt: (fields.prospectSystemPrompt || '').trim(),
    prospectUserPromptTemplate: (fields.prospectUserPromptTemplate || '').trim(),
    updatedAt: serverTimestamp(),
  }
  try {
    try {
      await updateDoc(ref, payload)
    } catch (err) {
      if (err?.code === 'not-found') {
        await setDoc(ref, { ...payload, createdAt: serverTimestamp() })
        return
      }
      throw err
    }
  } catch (err) {
    throw asFirestoreError(err)
  }
}

export async function resetAiPromptSettings() {
  await saveAiPromptSettings({
    projectSystemPrompt: '',
    projectUserPromptTemplate: '',
    prospectSystemPrompt: '',
    prospectUserPromptTemplate: '',
  })
}
