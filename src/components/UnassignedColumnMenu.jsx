import { useEffect, useRef, useState } from 'react'

export default function UnassignedColumnMenu({ onOpenSettings, onScanLeadQueue }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  return (
    <div className="silo-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="silo-menu-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Unassigned column options"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ⋯
      </button>
      {open && (
        <ul className="silo-menu-dropdown" role="menu">
          {onScanLeadQueue && (
            <li role="none">
              <button
                type="button"
                className="silo-menu-item"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  onScanLeadQueue()
                }}
              >
                Scan lead queue
              </button>
            </li>
          )}
          <li role="none">
            <button
              type="button"
              className="silo-menu-item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onOpenSettings?.()
              }}
            >
              Column settings
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
