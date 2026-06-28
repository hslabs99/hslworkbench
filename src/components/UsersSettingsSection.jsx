import { useEffect, useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'
import { createUser, deleteUser, listUsers, updateUser } from '../users.js'
import { useUsersAuth } from '../UsersAuthContext.jsx'

const emptyForm = {
  username: '',
  displayName: '',
  password: '',
  active: true,
}

export default function UsersSettingsSection() {
  const { user: currentUser } = useUsersAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  async function refreshUsers() {
    setLoading(true)
    setError(null)
    try {
      setUsers(await listUsers())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshUsers()
  }, [])

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setFormError(null)
  }

  function startEdit(u) {
    setEditingId(u.id)
    setForm({
      username: u.username,
      displayName: u.displayName,
      password: '',
      active: u.active,
    })
    setFormError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      if (editingId) {
        await updateUser(editingId, form)
      } else {
        await createUser(form)
      }
      resetForm()
      await refreshUsers()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    setFormError(null)
    try {
      await deleteUser(deleteTarget.id)
      if (editingId === deleteTarget.id) resetForm()
      setDeleteTarget(null)
      await refreshUsers()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="lookup-section users-settings-section">
      <h3 className="lookup-section-title">Users</h3>
      <p className="lookup-section-intro muted">
        Workbench login accounts stored in Firestore <code>users</code>. Passwords are stored as
        plain text in this collection — suitable for internal use only.
      </p>

      {loading ? (
        <p className="muted">Loading users…</p>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : (
        <table className="systems-table users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Display name</th>
              <th>Active</th>
              <th className="systems-col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.displayName}</td>
                <td>{u.active ? 'Yes' : 'No'}</td>
                <td className="systems-col-actions">
                  <button type="button" className="btn-secondary btn-small" onClick={() => startEdit(u)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-danger btn-small"
                    disabled={u.id === currentUser?.userId}
                    onClick={() => setDeleteTarget(u)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="users-form systems-card" onSubmit={handleSubmit}>
        <h4 className="migration-subheading">{editingId ? 'Edit user' : 'Add user'}</h4>

        <label className="login-field">
          Username
          <input
            type="text"
            className="login-input"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
          />
        </label>

        <label className="login-field">
          Display name
          <input
            type="text"
            className="login-input"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          />
        </label>

        <label className="login-field">
          Password{editingId ? ' (leave blank to keep current)' : ''}
          <input
            type="password"
            className="login-input"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required={!editingId}
          />
        </label>

        <label className="login-remember">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Account active
        </label>

        {formError && <p className="form-error">{formError}</p>}

        <div className="migration-actions">
          {editingId && (
            <button type="button" className="btn-secondary btn-small" onClick={resetForm}>
              Cancel edit
            </button>
          )}
          <button type="submit" className="btn-primary btn-small" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Update user' : 'Add user'}
          </button>
        </div>
      </form>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete user?"
        message={
          deleteTarget
            ? `Remove user "${deleteTarget.username}"? They will no longer be able to sign in.`
            : ''
        }
        confirmLabel="Delete user"
        cancelLabel="Cancel"
        danger
        busy={saving}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
