import { useEffect, useRef, useState } from 'react'

export default function MainContactFieldMenu({ onHarvest, disabled, harvestDisabled }) {
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
        aria-label="Main contact options"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ⋯
      </button>
      {open && (
        <ul className="silo-menu-dropdown" role="menu">
          <li role="none">
            <button
              type="button"
              className="silo-menu-item"
              role="menuitem"
              disabled={harvestDisabled}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onHarvest?.()
              }}
            >
              Harvest
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
