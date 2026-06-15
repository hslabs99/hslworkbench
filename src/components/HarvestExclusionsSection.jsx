import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  normalizeHarvestEmail,
  runHarvestExclusionCleanup,
} from '../harvestExclusionsCleanup.js'
import ConfirmModal from './ConfirmModal.jsx'
import ReorderableListTable from './ReorderableListTable.jsx'

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeHarvestEmail(email))
}

export default function HarvestExclusionsSection() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newEmail, setNewEmail] = useState('')
  const [addError, setAddError] = useState(null)
  const [cleaning, setCleaning] = useState(false)
  const [cleanupResult, setCleanupResult] = useState(null)
  const [cleanupError, setCleanupError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'harvestEmailExclusions'), orderBy('sortOrder'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => ({
            id: d.id,
            email: d.data().email ?? '',
            sortOrder: d.data().sortOrder ?? 0,
          })),
        )
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        const msg = err.message || 'Failed to load harvest exclusions'
        setError(
          msg.includes('permission') || msg.includes('Permission')
            ? `${msg} — publish updated Firestore rules (see firestore.rules in the project).`
            : msg,
        )
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const maxSort = useMemo(
    () => items.reduce((m, x) => Math.max(m, Number(x.sortOrder) || 0), -1),
    [items],
  )

  const knownEmails = useMemo(
    () => new Set(items.map((x) => normalizeHarvestEmail(x.email)).filter(Boolean)),
    [items],
  )

  async function handleAdd(e) {
    e.preventDefault()
    const email = normalizeHarvestEmail(newEmail)
    setAddError(null)
    if (!email) return
    if (!isValidEmail(email)) {
      setAddError('Enter a valid email address.')
      return
    }
    if (knownEmails.has(email)) {
      setAddError('That address is already in the exclusion list.')
      return
    }
    await addDoc(collection(db, 'harvestEmailExclusions'), {
      email,
      sortOrder: maxSort + 1,
      createdAt: serverTimestamp(),
    })
    setNewEmail('')
    setCleanupResult(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setCleanupResult(null)
    await deleteDoc(doc(db, 'harvestEmailExclusions', deleteTarget.id))
    setDeleteTarget(null)
  }

  async function confirmCleanupProjects() {
    const emails = items.map((x) => x.email).filter(Boolean)
    if (emails.length === 0) return

    setCleaning(true)
    setCleanupError(null)
    setCleanupResult(null)
    try {
      const result = await runHarvestExclusionCleanup(emails)
      setCleanupResult(result)
      setCleanupConfirmOpen(false)
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : String(err))
    } finally {
      setCleaning(false)
    }
  }

  const exclusionCount = items.filter((x) => x.email).length

  return (
    <section className="lookup-section harvest-exclusions-section">
      <h3 className="lookup-section-title">Harvest email exclusions</h3>
      <p className="lookup-section-intro muted">
        Addresses listed here (short form only, e.g. notifications@wix-forms.com) are never added
        when you harvest From/To/Cc from a client folder — use this for your own mailbox and any
        internal or notification addresses. Long Outlook display names are ignored; only the
        email part is matched.
      </p>
      {loading && <span className="muted">Loading…</span>}
      {error && <span className="error-text">{error}</span>}

      <div className="systems-card">
        <ReorderableListTable
          collectionName="harvestEmailExclusions"
          items={items}
          labelHeader="Email"
          emptyMessage="No exclusions yet — add your work email so harvest skips you."
          getRowLabel={(row) => row.email}
          renderActions={(row) => (
            <button
              type="button"
              className="btn-danger btn-small"
              onClick={() => setDeleteTarget(row)}
            >
              Remove
            </button>
          )}
        />

        <form className="systems-add-row" onSubmit={handleAdd}>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value)
              setAddError(null)
            }}
            placeholder="you@yourcompany.com"
            aria-label="Email to exclude from harvest"
          />
          <button type="submit" className="btn-primary" disabled={!newEmail.trim()}>
            Add exclusion
          </button>
        </form>
        {addError && <p className="form-error harvest-exclusions-add-error">{addError}</p>}

        <div className="harvest-exclusions-cleanup">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setCleanupConfirmOpen(true)}
            disabled={cleaning || loading || items.length === 0}
          >
            {cleaning ? 'Cleaning up…' : 'Clean up all projects'}
          </button>
          <p className="muted harvest-exclusions-cleanup-hint">
            Removes every excluded address from client email lists on all project cards, and
            deletes saved communication summaries from those senders.
          </p>
          {cleanupResult && (
            <p className="harvest-exclusions-cleanup-result">
              Updated {cleanupResult.projectsUpdated} project
              {cleanupResult.projectsUpdated === 1 ? '' : 's'} — removed{' '}
              {cleanupResult.contactsRemoved} contact
              {cleanupResult.contactsRemoved === 1 ? '' : 's'}.
              {(cleanupResult.summariesRemoved ?? 0) > 0
                ? ` Removed ${cleanupResult.summariesRemoved} saved summar${cleanupResult.summariesRemoved === 1 ? 'y' : 'ies'}.`
                : ''}
              {cleanupResult.projectsUpdated === 0 &&
                (cleanupResult.summariesRemoved ?? 0) === 0 &&
                ' No matching addresses found on projects or summaries.'}
            </p>
          )}
          {cleanupError && <p className="form-error">{cleanupError}</p>}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove exclusion?"
        message={
          deleteTarget
            ? `Remove ${deleteTarget.email} from the harvest exclusion list?`
            : ''
        }
        confirmLabel="Remove"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={cleanupConfirmOpen}
        title="Clean up all projects?"
        message={`Remove ${exclusionCount} excluded address${exclusionCount === 1 ? '' : 'es'} from client email lists and saved communication summaries on every project? This cannot be undone.`}
        confirmLabel="Clean up projects"
        danger
        busy={cleaning}
        onConfirm={confirmCleanupProjects}
        onCancel={() => !cleaning && setCleanupConfirmOpen(false)}
      />
    </section>
  )
}

export function useHarvestExclusions() {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'harvestEmailExclusions'), orderBy('sortOrder'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEmails(
          snap.docs
            .map((d) => (d.data().email || '').trim())
            .filter(Boolean),
        )
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub()
  }, [])

  return { excludeEmails: emails, loading }
}
