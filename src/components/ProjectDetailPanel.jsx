import { useState } from 'react'
import { useAttentionLights } from '../AttentionLightsContext.jsx'
import { attentionHoverTitle, attentionLabel, normalizeAttention } from '../attention.js'
import { formatUsd } from '../formatMoney.js'
import { projectClientMailFolder } from '../graphMail.js'
import DetailLookupsModal from './DetailLookupsModal.jsx'
import ProjectCommunications from './ProjectCommunications.jsx'
import ProjectCommunicationSummary from './ProjectCommunicationSummary.jsx'
import ProjectHistoryTab from './ProjectHistoryTab.jsx'

function formatTimestamp(ts) {
  if (ts == null) return '—'
  if (typeof ts.toDate === 'function') {
    try {
      return ts.toDate().toLocaleString()
    } catch {
      return '—'
    }
  }
  return String(ts)
}

export default function ProjectDetailPanel({
  project,
  onClose,
  onEdit,
  onDelete,
  onMove,
  onCycleAttention,
  onUpdateSectorsAndTech,
  onUpdateClientMailFolder,
  onUpdateClientContacts,
  onRecordClientMailScan,
  techStackOptions = [],
  sectorOptions = [],
  techStackLookupLoading,
  sectorLookupLoading,
  onEnsureSectorInLookup,
  onEnsureTechStackInLookup,
  silos,
  siloTitleOverrides = {},
}) {
  const { colors: attentionColors, tooltips: attentionTooltips } = useAttentionLights()
  const [detailTab, setDetailTab] = useState('details')
  const [lookupsOpen, setLookupsOpen] = useState(false)

  if (!project) {
    return (
      <aside className="detail-panel detail-panel--empty" aria-label="Project details">
        <p className="muted">Select a card to view details.</p>
      </aside>
    )
  }

  const contact =
    Array.isArray(project.clientContacts) && project.clientContacts.length > 0
      ? project.clientContacts[0]
      : null

  const attentionLevel = normalizeAttention(project.attention)
  const approxDisplay = formatUsd(project.approxProjectValue)
  const clientFolder = projectClientMailFolder(project)

  async function handleSaveLookups(projectId, sectors, techStack) {
    await onUpdateSectorsAndTech(projectId, sectors, techStack)
    setLookupsOpen(false)
  }

  return (
    <aside className="detail-panel detail-panel--tabbed" aria-label="Project details">
      <div className="detail-panel-header">
        <h2 className="detail-title">{project.projectName || 'Untitled'}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      <div className="detail-toolbar">
        <button type="button" className="btn-secondary btn-small" onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          className="btn-danger btn-small"
          onClick={() => onDelete(project.id)}
        >
          Delete
        </button>
        <button
          type="button"
          className="btn-secondary btn-small"
          onClick={() => setLookupsOpen(true)}
        >
          Sectors & tech
        </button>
      </div>

      <div className="detail-tabs" role="tablist" aria-label="Detail sections">
        <button
          type="button"
          role="tab"
          id="detail-tab-details"
          aria-selected={detailTab === 'details'}
          aria-controls="detail-panel-details"
          className="detail-tab"
          onClick={() => setDetailTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          role="tab"
          id="detail-tab-email-settings"
          aria-selected={detailTab === 'email-settings'}
          aria-controls="detail-panel-email-settings"
          className="detail-tab"
          onClick={() => setDetailTab('email-settings')}
        >
          Email Settings
        </button>
        <button
          type="button"
          role="tab"
          id="detail-tab-history"
          aria-selected={detailTab === 'history'}
          aria-controls="detail-panel-history"
          className="detail-tab"
          onClick={() => setDetailTab('history')}
        >
          History
        </button>
        <button
          type="button"
          role="tab"
          id="detail-tab-comm-summary"
          aria-selected={detailTab === 'comm-summary'}
          aria-controls="detail-panel-comm-summary"
          className="detail-tab"
          onClick={() => setDetailTab('comm-summary')}
        >
          Communication Summary
        </button>
      </div>

      <div className="detail-tab-panels">
        {detailTab === 'details' && (
          <div
            id="detail-panel-details"
            role="tabpanel"
            aria-labelledby="detail-tab-details"
            className="detail-tab-panel"
          >
            <div className="detail-move">
              <label htmlFor="detail-silo-move">Move to column</label>
              <select
                id="detail-silo-move"
                className="move-select"
                value={project.siloId || 'active'}
                onChange={(e) => onMove(project.id, e.target.value)}
              >
                {silos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {siloTitleOverrides[s.id] ?? s.title}
                  </option>
                ))}
              </select>
            </div>

            <dl className="detail-dl">
              <dt>Client</dt>
              <dd>{project.clientCompany || '—'}</dd>

              <dt>Type</dt>
              <dd>{project.projectType || '—'}</dd>

              <dt>Sector</dt>
              <dd>
                {Array.isArray(project.sectors) && project.sectors.length > 0
                  ? project.sectors.join(', ')
                  : '—'}
              </dd>

              <dt>Silo</dt>
              <dd>
                {siloTitleOverrides[project.siloId] ??
                  silos.find((s) => s.id === project.siloId)?.title ??
                  project.siloId ??
                  '—'}
              </dd>

              <dt>Attention</dt>
              <dd className="detail-attention-cell">
                {onCycleAttention && (
                  <button
                    type="button"
                    className="attention-light attention-light--large attention-light--dynamic"
                    style={{
                      background: attentionColors[attentionLevel],
                      borderColor: attentionColors[attentionLevel],
                    }}
                    title={attentionHoverTitle(attentionLevel, attentionTooltips)}
                    aria-label="Cycle attention level"
                    onClick={() => onCycleAttention(project.id)}
                  />
                )}
                <span className="detail-attention-label">{attentionLabel(attentionLevel)}</span>
              </dd>

              <dt>Description</dt>
              <dd className="detail-multiline">{project.description || '—'}</dd>

              <dt>Tech stack</dt>
              <dd>
                {Array.isArray(project.techStack) && project.techStack.length > 0
                  ? project.techStack.join(', ')
                  : '—'}
              </dd>

              <dt>Start</dt>
              <dd>{project.startDate || '—'}</dd>

              <dt>Expected completion</dt>
              <dd>{project.expectedCompletionDate || '—'}</dd>

              <dt>Approx value</dt>
              <dd>{approxDisplay ?? '—'}</dd>

              <dt>Main contact</dt>
              <dd>
                {contact
                  ? `${contact.name || '—'} · ${contact.email || '—'}`
                  : '—'}
              </dd>

              <dt>Client emails</dt>
              <dd>
                {Array.isArray(project.clientContacts) && project.clientContacts.length > 0
                  ? project.clientContacts
                      .filter((c) => c.email)
                      .map((c) => c.email)
                      .join(', ')
                  : '—'}
              </dd>

              <dt>Client mail folder</dt>
              <dd>
                {clientFolder ? (
                  <>
                    {clientFolder.displayName}
                    <span className="detail-mail-folder-path muted"> ({clientFolder.path})</span>
                  </>
                ) : (
                  '—'
                )}
              </dd>

              <dt>AI context</dt>
              <dd className="detail-multiline">{project.aiContext || '—'}</dd>

              <dt>Latest status</dt>
              <dd className="detail-multiline">{project.latestStatusSummary || '—'}</dd>

              <dt>Action with</dt>
              <dd>{project.nextActionOwner || '—'}</dd>

              <dt>Next action</dt>
              <dd className="detail-multiline">{project.nextActionSummary || '—'}</dd>

              <dt>Updated</dt>
              <dd>{formatTimestamp(project.updatedAt)}</dd>

              <dt>Created</dt>
              <dd>{formatTimestamp(project.createdAt)}</dd>
            </dl>
          </div>
        )}

        {detailTab === 'email-settings' && (
          <div
            id="detail-panel-email-settings"
            role="tabpanel"
            aria-labelledby="detail-tab-email-settings"
            className="detail-tab-panel detail-tab-panel--communications"
          >
            <ProjectCommunications
              project={project}
              onUpdateClientMailFolder={onUpdateClientMailFolder}
              onUpdateClientContacts={onUpdateClientContacts}
              onRecordClientMailScan={onRecordClientMailScan}
            />
          </div>
        )}

        {detailTab === 'history' && (
          <div
            id="detail-panel-history"
            role="tabpanel"
            aria-labelledby="detail-tab-history"
            className="detail-tab-panel detail-tab-panel--history"
          >
            <ProjectHistoryTab projectId={project.id} />
          </div>
        )}

        {detailTab === 'comm-summary' && (
          <div
            id="detail-panel-comm-summary"
            role="tabpanel"
            aria-labelledby="detail-tab-comm-summary"
            className="detail-tab-panel detail-tab-panel--comm-summary"
          >
            <ProjectCommunicationSummary
              project={project}
              onRecordClientMailScan={onRecordClientMailScan}
            />
          </div>
        )}
      </div>

      <DetailLookupsModal
        open={lookupsOpen}
        project={project}
        techStackOptions={techStackOptions}
        sectorOptions={sectorOptions}
        techStackLookupLoading={techStackLookupLoading}
        sectorLookupLoading={sectorLookupLoading}
        onEnsureSectorInLookup={onEnsureSectorInLookup}
        onEnsureTechStackInLookup={onEnsureTechStackInLookup}
        onSave={handleSaveLookups}
        onClose={() => setLookupsOpen(false)}
      />
    </aside>
  )
}
