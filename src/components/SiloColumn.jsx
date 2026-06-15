import { useEffect, useState } from 'react'
import ProjectCard from './ProjectCard.jsx'
import SiloColumnMenu from './SiloColumnMenu.jsx'
import SiloTitle from './SiloTitle.jsx'

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
      className={`silo-column ${dragOver ? 'silo-column--drag-over' : ''}`}
      data-silo-accent={accentColor ? 'true' : undefined}
      style={accentColor ? { '--silo-accent': accentColor } : undefined}
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
    >
      <div className="silo-header">
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
