import { useEffect, useRef, useState } from 'react'
import { displayNameWithoutEmail, parseEmailAddress } from '../emailAddress.js'

function isValidTestEmail(value) {
  const email = parseEmailAddress(value)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function MailingTestSendMenu({ disabled, busy, meEmail, onSend }) {
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!customOpen) return
    setFormError('')
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    function handleKeyDown(e) {
      if (e.key === 'Escape') closeCustom()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [customOpen])

  function sendToMe() {
    setOpen(false)
    if (!meEmail) return
    onSend(meEmail)
  }

  function closeCustom() {
    if (busy) return
    setCustomOpen(false)
    setFormError('')
  }

  function submitCustom(e) {
    e.preventDefault()
    if (busy) return
    const raw = email.trim()
    if (!isValidTestEmail(raw)) {
      setFormError('Enter a valid email address.')
      inputRef.current?.focus()
      return
    }
    setCustomOpen(false)
    onSend(raw)
  }

  return (
    <>
      <div className="mailing-test-send-wrap" ref={wrapRef}>
        <button
          type="button"
          className="btn-secondary mailing-test-send-trigger"
          disabled={disabled || busy}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          {busy ? 'Sending test…' : 'Send test'}
        </button>
        {open && (
          <ul className="mailing-test-send-menu" role="menu">
            <li role="none">
              <button
                type="button"
                className="mailing-test-send-item"
                role="menuitem"
                disabled={!meEmail}
                onClick={sendToMe}
              >
                To me{meEmail ? ` (${meEmail})` : ''}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                className="mailing-test-send-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  setCustomOpen(true)
                }}
              >
                Manual email…
              </button>
            </li>
          </ul>
        )}
      </div>

      {customOpen ? (
        <div className="modal-backdrop confirm-modal-backdrop" role="presentation" onClick={closeCustom}>
          <div
            className="modal-panel confirm-modal mailing-test-recipient-modal"
            role="dialog"
            aria-labelledby="mailing-test-recipient-title"
            aria-describedby="mailing-test-recipient-hint"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mailing-test-recipient-title" className="confirm-modal-title">
              Send test
            </h2>
            <p id="mailing-test-recipient-hint" className="confirm-modal-message">
              Enter the address to send this campaign test to. It uses the campaign template and From,
              and is not counted as a campaign send.
            </p>
            <form className="mailing-test-recipient-form" onSubmit={submitCustom}>
              <label>
                Email
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (formError) setFormError('')
                  }}
                  placeholder="name@example.com"
                  aria-invalid={Boolean(formError)}
                />
              </label>
              {formError ? <p className="form-error">{formError}</p> : null}
              <div className="form-actions confirm-modal-actions">
                <button type="button" className="btn-secondary" onClick={closeCustom} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  Send test
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function testRecipientFromInput(raw, { meEmail, meName } = {}) {
  const email = parseEmailAddress(raw)
  const pastedName = displayNameWithoutEmail(raw)
  const sendingToMe = Boolean(meEmail && email === parseEmailAddress(meEmail))
  const name = pastedName || (sendingToMe ? meName || email : email)
  return { email, name }
}
