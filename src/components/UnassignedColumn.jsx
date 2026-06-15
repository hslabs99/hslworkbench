import { useEffect, useRef, useState } from 'react'
import ProjectCard from './ProjectCard.jsx'
import UnassignedColumnMenu from './UnassignedColumnMenu.jsx'
import UnassignedColumnSettingsModal from './UnassignedColumnSettingsModal.jsx'
import UnassignedQueueScanProgressModal, {
  UnassignedQueueScanConfirmModal,
} from './UnassignedQueueScanModal.jsx'
import { normalizeScanDays, UNASSIGNED_SILO, UNASSIGNED_SILO_ID } from '../unassignedQueue.js'
import { runUnassignedQueueScan } from '../unassignedQueueScan.js'

export default function UnassignedColumn({
  projects,
  allProjects,
  leadQueueFolder,
  scanDays,
  deepScan,
  forceRescan: forceRescanSetting,
  onUpdateQueueSettings,
  onSelectCard,
  selectedId,
  onMoveCard,
  onPlaceProject,
  onCycleAttention,
  configured,
  getAccessToken,
  userEmail,
  harvestExclusions,
  promptOverrides,
  scanBatchSize,
  onRecordClientMailScan,
}) {
  const [dragOver, setDragOver] = useState(false)
  const [dropIndicator, setDropIndicator] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [scanConfirmOpen, setScanConfirmOpen] = useState(false)
  const [scanRunning, setScanRunning] = useState(false)
  const [scanDaysLocal, setScanDaysLocal] = useState(scanDays)
  const [scanDeepLocal, setScanDeepLocal] = useState(deepScan)
  const [scanForceLocal, setScanForceLocal] = useState(forceRescanSetting)
  const [scanProgress, setScanProgress] = useState(null)
  const [scanSummary, setScanSummary] = useState(null)
  const [scanError, setScanError] = useState(null)
  const scanCancelRef = useRef(false)

  useEffect(() => {
    function clearIndicator() {
      setDropIndicator(null)
    }
    document.addEventListener('dragend', clearIndicator)
    return () => document.removeEventListener('dragend', clearIndicator)
  }, [])

  useEffect(() => {
    if (!scanConfirmOpen) return
    setScanDaysLocal(scanDays)
    setScanDeepLocal(deepScan)
    setScanForceLocal(forceRescanSetting)
  }, [scanConfirmOpen, scanDays, deepScan, forceRescanSetting])

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

  function handleColumnDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.target.closest?.('.project-card')) return
    if (e.target.closest?.('.silo-cards')) return
    const id = e.dataTransfer.getData('text/plain')
    if (id) onMoveCard(id, UNASSIGNED_SILO_ID)
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
      onPlaceProject(dragId, UNASSIGNED_SILO_ID, null, false)
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
    onPlaceProject(dragId, UNASSIGNED_SILO_ID, targetProjectId, before)
  }

  async function handleSaveSettings(patch) {
    if (!onUpdateQueueSettings) return
    setSettingsBusy(true)
    try {
      await onUpdateQueueSettings(patch)
    } finally {
      setSettingsBusy(false)
    }
  }

  function handleOpenScan() {
    if (!configured) {
      window.alert('Connect Microsoft email in Settings before scanning.')
      return
    }
    if (!leadQueueFolder?.id) {
      window.alert('Choose a lead queue folder in Column settings first.')
      return
    }
    setScanConfirmOpen(true)
  }

  function resetScanUi() {
    scanCancelRef.current = false
    setScanRunning(false)
    setScanConfirmOpen(false)
    setScanProgress(null)
    setScanSummary(null)
    setScanError(null)
  }

  function handleScanCancel() {
    if (scanRunning) {
      scanCancelRef.current = true
      return
    }
    resetScanUi()
  }

  async function handleStartScan() {
    if (!leadQueueFolder?.id) return

    const days = normalizeScanDays(scanDaysLocal)
    const deep = scanDeepLocal
    const force = scanForceLocal

    scanCancelRef.current = false
    setScanConfirmOpen(false)
    setScanRunning(true)
    setScanProgress({
      phase: 'discovering',
      cardIndex: 0,
      cardTotal: 0,
      cardName: '',
      emailIndex: 0,
      emailTotal: 0,
      emailSubject: '',
      percent: 0,
    })
    setScanSummary(null)
    setScanError(null)

    try {
      if (force !== forceRescanSetting) {
        await onUpdateQueueSettings?.({ forceRescan: force })
      }

      const token = await getAccessToken()
      if (!token) throw new Error('Microsoft sign-in required.')

      const summary = await runUnassignedQueueScan({
        accessToken: token,
        leadQueueFolder,
        existingProjects: allProjects || [],
        excludeEmails: harvestExclusions || [],
        userEmail: userEmail || '',
        days,
        deepScan: deep,
        forceReanalyse: force,
        batchSize: scanBatchSize || 12,
        promptOverrides,
        onRecordClientMailScan,
        isCancelled: () => scanCancelRef.current,
        onProgress: setScanProgress,
      })
      setScanSummary(summary)
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanRunning(false)
    }
  }

  return (
    <>
      <div
        className={`silo-column silo-column--system unassigned-column ${dragOver ? 'silo-column--drag-over' : ''}`}
        data-silo-system="true"
        onDragOver={handleColumnDragOver}
        onDragLeave={handleColumnDragLeave}
        onDrop={handleColumnDrop}
      >
        <div className="silo-header">
          <div className="unassigned-column-title-block">
            <h3 className="unassigned-column-title">{UNASSIGNED_SILO.title}</h3>
            <span className="silo-system-badge">System</span>
          </div>
          <div className="silo-header-actions">
            <span className="silo-count">{projects.length}</span>
            <UnassignedColumnMenu
              onOpenSettings={() => setSettingsOpen(true)}
              onScanLeadQueue={handleOpenScan}
            />
          </div>
        </div>

        <div
          className="silo-cards"
          onDragOver={handleCardsAreaDragOver}
          onDrop={handleCardsAreaDrop}
        >
          {projects.length === 0 && (
            <p className="silo-empty muted unassigned-column-empty">
              {leadQueueFolder
                ? 'No lead cards yet — use Scan lead queue (⋯) to discover prospects.'
                : 'Open Column settings (⋯) to choose a lead queue folder.'}
            </p>
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

      <UnassignedColumnSettingsModal
        open={settingsOpen}
        leadQueueFolder={leadQueueFolder}
        scanDays={scanDays}
        deepScan={deepScan}
        forceRescan={forceRescanSetting}
        onSave={handleSaveSettings}
        onClose={() => !settingsBusy && setSettingsOpen(false)}
        busy={settingsBusy}
      />

      <UnassignedQueueScanConfirmModal
        open={scanConfirmOpen}
        leadQueueFolder={leadQueueFolder}
        days={scanDaysLocal}
        deepScan={scanDeepLocal}
        forceRescan={scanForceLocal}
        onDaysChange={setScanDaysLocal}
        onDeepScanChange={setScanDeepLocal}
        onForceRescanChange={setScanForceLocal}
        onConfirm={handleStartScan}
        onCancel={() => setScanConfirmOpen(false)}
      />

      <UnassignedQueueScanProgressModal
        open={scanRunning || Boolean(scanSummary) || Boolean(scanError)}
        progress={scanProgress}
        summary={scanSummary}
        error={scanError}
        onCancel={handleScanCancel}
      />
    </>
  )
}
