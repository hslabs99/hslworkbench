import { useEffect, useRef, useState } from 'react'

export default function SiloTitle({ defaultTitle, displayTitle, onCommit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayTitle)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editing) setDraft(displayTitle)
  }, [displayTitle, editing])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function startEdit(e) {
    e.stopPropagation()
    e.preventDefault()
    setEditing(true)
    setDraft(displayTitle)
  }

  function commit() {
    const t = draft.trim()
    onCommit(t.length ? t : defaultTitle)
    setEditing(false)
  }

  function cancel() {
    setDraft(displayTitle)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="silo-title-frame silo-title-frame--editing">
        <input
          ref={inputRef}
          className="silo-title-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          aria-label="Column title"
          maxLength={120}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )
  }

  return (
    <div className="silo-title-frame">
      <button
        type="button"
        className="silo-title-button"
        onClick={startEdit}
        title="Click to edit column title"
      >
        {displayTitle}
      </button>
    </div>
  )
}
