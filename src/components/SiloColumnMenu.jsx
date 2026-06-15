import { useEffect, useRef, useState } from 'react'

const DEFAULT_SWATCH = '#b3bac5'

export default function SiloColumnMenu({
  siloId,
  color,
  onSetColor,
  onResetColor,
  onScanColumn,
  onDeleteSilo,
  canDeleteList,
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const colorInputRef = useRef(null)

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

  const swatch = color || DEFAULT_SWATCH

  return (
    <div className="silo-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="silo-menu-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Silo options"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ⋯
      </button>
      {open && (
        <ul className="silo-menu-dropdown" role="menu">
          {onScanColumn && (
            <li role="none">
              <button
                type="button"
                className="silo-menu-item"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  onScanColumn(siloId)
                }}
              >
                Scan all cards
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
                colorInputRef.current?.click()
              }}
            >
              Set silo colour
            </button>
          </li>
          {color && (
            <li role="none">
              <button
                type="button"
                className="silo-menu-item"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  onResetColor(siloId)
                }}
              >
                Reset column colour
              </button>
            </li>
          )}
          {canDeleteList && onDeleteSilo && (
            <li role="none">
              <button
                type="button"
                className="silo-menu-item silo-menu-item--danger"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  onDeleteSilo(siloId)
                }}
              >
                Delete list
              </button>
            </li>
          )}
        </ul>
      )}
      <input
        ref={colorInputRef}
        type="color"
        className="silo-color-input-hidden"
        value={swatch}
        onChange={(e) => onSetColor(siloId, e.target.value)}
        aria-label="Silo colour"
        tabIndex={-1}
      />
    </div>
  )
}
