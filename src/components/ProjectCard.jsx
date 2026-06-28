import { useRef, useState } from 'react'

import { useAttentionLights } from '../AttentionLightsContext.jsx'

import { useEmailSummaryLast } from '../EmailSummaryLastContext.jsx'
import { daysSinceTimestamp, formatMailScanTooltip } from '../commSummaryFormat.js'
import { attentionHoverTitle, normalizeAttention } from '../attention.js'

import ProjectCardEmailLast from './ProjectCardEmailLast.jsx'



export default function ProjectCard({

  project,

  selected,

  onSelect,

  onCycleAttention,

  dropSlot = null,

  onDragOverCard,

  onDropOnCard,

}) {

  const [isDragging, setIsDragging] = useState(false)

  const ignoreClick = useRef(false)



  const attention = normalizeAttention(project.attention)
  const actionWith = project.nextActionOwner?.trim() || ''
  const primaryContact =
    Array.isArray(project.clientContacts) && project.clientContacts[0]
      ? project.clientContacts[0].name?.trim() || ''
      : ''

  const { colors: attentionColors, tooltips: attentionTooltips } = useAttentionLights()

  const { inbound: lastIn, outbound: lastOut } = useEmailSummaryLast(project.id)
  const folderScanDays = daysSinceTimestamp(project.lastClientMailScanAt)
  const folderScanTitle = formatMailScanTooltip(project.lastClientMailScanAt)



  function handleDragStart(e) {

    setIsDragging(true)

    e.dataTransfer.setData('text/plain', project.id)

    e.dataTransfer.effectAllowed = 'move'

  }



  function handleDragEnd() {

    setIsDragging(false)

    ignoreClick.current = true

    window.setTimeout(() => {

      ignoreClick.current = false

    }, 200)

  }



  function handleClick(e) {

    if (ignoreClick.current) {

      e.preventDefault()

      e.stopPropagation()

      return

    }

    onSelect()

  }



  return (

    <article

      className={[

        'project-card',

        selected ? 'project-card--selected' : '',

        isDragging ? 'project-card--dragging' : '',

        dropSlot === 'before' ? 'project-card--drop-slot-before' : '',

        dropSlot === 'after' ? 'project-card--drop-slot-after' : '',

      ]

        .filter(Boolean)

        .join(' ')}

      draggable

      onDragStart={handleDragStart}

      onDragEnd={handleDragEnd}

      onDragOver={

        onDragOverCard

          ? (e) => {

              onDragOverCard(e)

            }

          : undefined

      }

      onDrop={

        onDropOnCard

          ? (e) => {

              onDropOnCard(e)

            }

          : undefined

      }

      onClick={handleClick}

      onKeyDown={(e) => {

        if (e.key === 'Enter' || e.key === ' ') {

          e.preventDefault()

          onSelect()

        }

      }}

      role="button"

      tabIndex={0}

      aria-pressed={selected}

      title="Drag to reorder within the column or move to another column"

    >

      <div className="project-card-inner">

        <h3 className="project-card-title">{project.projectName || 'Untitled'}</h3>

        <p className="project-card-client">{project.clientCompany || '—'}</p>
        {primaryContact ? (
          <p className="project-card-contact">{primaryContact}</p>
        ) : null}

        <div className="project-card-action-row">

          <span className="project-card-action-with">

            Action with: <strong>{actionWith || '—'}</strong>

          </span>

          {onCycleAttention && (

            <button

              type="button"

              className="attention-light attention-light--dynamic"

              style={{

                background: attentionColors[attention],

                borderColor: attentionColors[attention],

              }}

              title={attentionHoverTitle(attention, attentionTooltips)}

              aria-label={`Attention: ${attention}. Click to cycle green, orange, red.`}

              onMouseDown={(e) => e.stopPropagation()}

              onClick={(e) => {

                e.stopPropagation()

                onCycleAttention(project.id)

              }}

            />

          )}

        </div>

        <ProjectCardEmailLast
          inbound={lastIn}
          outbound={lastOut}
          folderScanDays={folderScanDays}
          folderScanTitle={folderScanTitle}
        />

        {project.projectType && (

          <div className="project-card-meta">

            <span className="pill pill-muted">{project.projectType}</span>

          </div>

        )}

        <div className="project-card-metrics" aria-hidden="true" />

      </div>

    </article>

  )

}


