import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from './firebase.js'
import { isExcludedHarvestEmail } from './harvestExclusionsCleanup.js'

const EmailSummaryLastContext = createContext(null)

function buildLastByProject(docs, excludeEmails) {
  /** @type {Record<string, { inbound: { date: string, type: string, t: number } | null, outbound: ... }>} */
  const map = {}

  for (const snap of docs) {
    const data = snap.data()
    const projectId = data.projectId
    const direction = data.direction
    const messageDate = data.messageDate
    if (!projectId || !messageDate) continue
    if (direction !== 'outbound' && isExcludedHarvestEmail(data.from, excludeEmails)) continue

    const t = new Date(messageDate).getTime()
    if (Number.isNaN(t)) continue

    const slot = direction === 'outbound' ? 'outbound' : 'inbound'
    if (!map[projectId]) {
      map[projectId] = { inbound: null, outbound: null }
    }

    const entry = {
      date: messageDate,
      type: data.type || '—',
      t,
      inInbox: Boolean(data.inInbox),
    }
    const cur = map[projectId][slot]
    if (!cur || t > cur.t) {
      map[projectId][slot] = entry
    }
  }

  return map
}

export function EmailSummaryLastProvider({ children }) {
  const [lastByProject, setLastByProject] = useState({})
  const [excludeEmails, setExcludeEmails] = useState([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'harvestEmailExclusions'), orderBy('sortOrder'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setExcludeEmails(
          snap.docs.map((d) => (d.data().email || '').trim()).filter(Boolean),
        )
      },
      () => {},
    )
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'email_summaries'),
      (snap) => {
        setLastByProject(buildLastByProject(snap.docs, excludeEmails))
        setReady(true)
      },
      (err) => {
        console.error(err)
        setReady(true)
      },
    )
    return unsub
  }, [excludeEmails])

  const value = useMemo(() => ({ lastByProject, ready }), [lastByProject, ready])

  return (
    <EmailSummaryLastContext.Provider value={value}>{children}</EmailSummaryLastContext.Provider>
  )
}

export function useEmailSummaryLast(projectId) {
  const ctx = useContext(EmailSummaryLastContext)
  if (!ctx || !projectId) {
    return { inbound: null, outbound: null, ready: true }
  }
  const row = ctx.lastByProject[projectId]
  return {
    inbound: row?.inbound ?? null,
    outbound: row?.outbound ?? null,
    ready: ctx.ready,
  }
}
