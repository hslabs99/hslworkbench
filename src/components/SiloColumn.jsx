import { useEffect, useState } from 'react'
import ProjectCard from './ProjectCard.jsx'
import SiloColumnMenu from './SiloColumnMenu.jsx'
import SiloTitle from './SiloTitle.jsx'
import { SILO_REORDER_MIME } from '../boardSilos.js'

function isSiloReorderDrag(e) {
  return [...(e.dataTransfer?.types || [])].includes(SILO_REORDER_MIME)
}

export default function SiloColumn({
  silo,
  projects,
  onSelectCard,
  selectedId,
  onMoveCard,
  onPlaceProject,
  allSilos,
  accentColor,
  onSetSiloColor,
  onResetSiloColor,
  onCycleAttention,
  displayTitle,
  onSiloTitleCommit,
  siloTitleOverrides = {},
  onScanColumn,
  onDeleteSilo,
  canDeleteList,
  siloReorderSlot = null,
  siloDragging = false,
  siloReordering = false,
  onSiloReorderDragStart,
  onSiloReorderDragOver,
  onSiloReorderDrop,
}) {
  const [dragOver, setDragOver] = useState(false)
  const [dropIndicator, setDropIndicator] = useState(null)

  useEffect(() => {
    function clearIndicator() {
      setDropIndicator(null)
    }
    document.addEventListener('dragend', clearIndicator)
    return () => document.removeEventListener('dragend', clearIndicator)
  }, [])

  function handleColumnDragOver(e) {
    if (isSiloReorderDrag(e)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const rect = e.currentTarget.getBoundingClientRect()
      const before = e.clientX < rect.left + rect.width / 2
      onSiloReorderDragOver?.(silo.id, before)
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  function handleColumnDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOver(false)
    }
  }

  /** Drop on column chrome (not on a card): move / append to this silo. */
  function handleColumnDrop(e) {
    if (isSiloReorderDrag(e)) {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      const dragId = e.dataTransfer.getData(SILO_REORDER_MIME)
      if (!dragId) return
      const rect = e.currentTarget.getBoundingClientRect()
      const before = e.clientX < rect.left + rect.width / 2
      onSiloReorderDrop?.(dragId, silo.id, before)
      return
    }
    e.preventDefault()
    setDragOver(false)
    if (e.target.closest?.('.project-card')) return
    if (e.target.closest?.('.silo-cards')) return
    const id = e.dataTransfer.getData('text/plain')
    if (id) onMoveCard(id, silo.id)
  }

  function handleCardsAreaDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!e.target.closest?.('.project-card')) {
      setDropIndicator(null)
    }
  }

  function handleCardsAreaDrop(e) {
    if (e.target.closest?.('.project-card')) return
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    setDropIndicator(null)
    const dragId = e.dataTransfer.getData('text/plain')
    if (dragId) {
      onPlaceProject(dragId, silo.id, null, false)
    }
  }

  function handleCardDragOver(e, targetProjectId) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    setDropIndicator({ targetId: targetProjectId, before })
  }

  function handleCardDrop(e, targetProjectId) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    setDropIndicator(null)
    const dragId = e.dataTransfer.getData('text/plain')
    if (!dragId || dragId === targetProjectId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    onPlaceProject(dragId, silo.id, targetProjectId, before)
  }

  return (
    <div
      className={[
        'silo-column',
        dragOver ? 'silo-column--drag-over' : '',
        siloDragging ? 'silo-column--silo-dragging' : '',
        siloReorderSlot === 'before' ? 'silo-column--drop-before' : '',
        siloReorderSlot === 'after' ? 'silo-column--drop-after' : '',
        siloReordering ? 'silo-column--reordering' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-silo-accent={accentColor ? 'true' : undefined}
      style={accentColor ? { '--silo-accent': accentColor } : undefined}
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
    >
      <div className="silo-header">
        <span
          className="list-drag-handle silo-drag-handle"
          draggable={!siloReordering}
          onDragStart={(e) => {
            e.stopPropagation()
            e.dataTransfer.setData(SILO_REORDER_MIME, silo.id)
            e.dataTransfer.effectAllowed = 'move'
            onSiloReorderDragStart?.(silo.id)
          }}
          aria-label={`Drag to reorder ${displayTitle ?? silo.title}`}
          title="Drag to reorder list"
        >
          ⋮⋮
        </span>
        <SiloTitle
          defaultTitle={silo.title}
          displayTitle={displayTitle ?? silo.title}
          onCommit={(t) => onSiloTitleCommit?.(t)}
        />
        <div className="silo-header-actions">
          <span className="silo-count">{projects.length}</span>
          <SiloColumnMenu
            siloId={silo.id}
            color={accentColor}
            onSetColor={onSetSiloColor}
            onResetColor={onResetSiloColor}
            onScanColumn={onScanColumn}
            onDeleteSilo={onDeleteSilo}
            canDeleteList={canDeleteList}
          />
        </div>
      </div>
      <div
        className="silo-cards"
        onDragOver={handleCardsAreaDragOver}
        onDrop={handleCardsAreaDrop}
      >
        {projects.length === 0 && (
          <p className="silo-empty muted">No projects — drop a card here</p>
        )}
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            selected={p.id === selectedId}
            onSelect={() => onSelectCard(p.id)}
            onCycleAttention={onCycleAttention}
            dropSlot={
              dropIndicator?.targetId === p.id
                ? dropIndicator.before
                  ? 'before'
                  : 'after'
                : null
            }
            onDragOverCard={(e) => handleCardDragOver(e, p.id)}
            onDropOnCard={(e) => handleCardDrop(e, p.id)}
          />
        ))}
      </div>
    </div>
  )
}
