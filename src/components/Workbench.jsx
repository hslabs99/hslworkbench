import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSiloColors, saveSiloColors } from '../siloColorsStorage.js'
import { loadSiloTitles, saveSiloTitles } from '../siloTitlesStorage.js'
import { loadDetailPanelOpen, saveDetailPanelOpen } from '../detailPanelStorage.js'
import {
  createBoardSilo,
  deleteBoardSilo,
  findSilo,
  normalizeProjectSiloId,
  reorderBoardSilos,
  resolveSiloTitle as resolveBoardSiloTitle,
  siloArchivesOnEntry,
  updateBoardSiloTitle,
} from '../boardSilos.js'
import { useBoardSilos } from '../hooks/useBoardSilos.js'
import { useUnassignedQueue } from '../hooks/useUnassignedQueue.js'
import {
  boardSilosWithUnassigned,
  hasLeadQueueFolders,
  isUnassignedSiloId,
  UNASSIGNED_SILO_ID,
  updateUnassignedQueueSettings,
} from '../unassignedQueue.js'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase.js'
import { nextAttention, normalizeAttention } from '../attention.js'
import { recordProjectSiloChange } from '../projectHistory.js'
import { recordProjectClientMailScan } from '../projectMailScan.js'
import { runColumnCommunicationScan } from '../columnScan.js'
import { partitionScannableProjects } from '../projectCommunicationScan.js'
import { reorderListItems } from '../listReorder.js'
import { buildScanAllStageOptions, runScanAll } from '../scanAll.js'
import { normalizeScanDays } from '../unassignedQueue.js'
import { fetchAiConfig } from '../openaiCommunicationSummary.js'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'
import { useHarvestExclusions } from './HarvestExclusionsSection.jsx'
import ColumnScanProgressModal, {
  ColumnScanConfirmModal,
} from './ColumnScanModal.jsx'
import ScanAllProgressModal, { ScanAllConfirmModal } from './ScanAllModal.jsx'
import SiloColumn from './SiloColumn.jsx'
import UnassignedColumn from './UnassignedColumn.jsx'
import AddSiloColumn from './AddSiloColumn.jsx'
import DeleteSiloModal from './DeleteSiloModal.jsx'
import ProjectForm from './ProjectForm.jsx'
import ProjectDetailPanel from './ProjectDetailPanel.jsx'
import { useTechStackLookup } from '../hooks/useTechStackLookup.js'
import { useSectorLookup } from '../hooks/useSectorLookup.js'
import { useAiPromptSettings } from '../AiPromptSettingsContext.jsx'

function sortProjectsList(list) {
  return [...list].sort((a, b) => {
    const ao = Number(a.sortOrder) || 0
    const bo = Number(b.sortOrder) || 0
    if (ao !== bo) return ao - bo
    return (a.projectName || '').localeCompare(b.projectName || '')
  })
}

export default function Workbench() {
  const { configured, account, getAccessToken } = useMicrosoftAuth()
  const { excludeEmails: harvestExclusions } = useHarvestExclusions()
  const { silos, loading: silosLoading, error: silosError } = useBoardSilos()
  const { leadQueueFolders, scanDays, deepScan, forceRescan, error: unassignedQueueError } =
    useUnassignedQueue()
  const boardSilos = useMemo(() => boardSilosWithUnassigned(silos), [silos])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('add')
  const [formProject, setFormProject] = useState(null)
  const [siloColors, setSiloColors] = useState(() => loadSiloColors())
  const [siloTitles, setSiloTitles] = useState(() => loadSiloTitles())
  const [detailPanelOpen, setDetailPanelOpen] = useState(() => loadDetailPanelOpen())
  const [scanBatchSize, setScanBatchSize] = useState(12)
  const [columnScanConfirmSiloId, setColumnScanConfirmSiloId] = useState(null)
  const [columnScanDays, setColumnScanDays] = useState(30)
  const [columnScanDeep, setColumnScanDeep] = useState(true)
  const [columnScanRunning, setColumnScanRunning] = useState(false)
  const [columnScanSiloTitle, setColumnScanSiloTitle] = useState('')
  const [columnScanProgress, setColumnScanProgress] = useState(null)
  const [columnScanSummary, setColumnScanSummary] = useState(null)
  const [columnScanError, setColumnScanError] = useState(null)
  const columnScanCancelRef = useRef(false)
  const [scanAllConfirmOpen, setScanAllConfirmOpen] = useState(false)
  const [scanAllSelectedUnassigned, setScanAllSelectedUnassigned] = useState(true)
  const [scanAllSelectedColumnIds, setScanAllSelectedColumnIds] = useState(() => new Set())
  const [scanAllDays, setScanAllDays] = useState(30)
  const [scanAllDeep, setScanAllDeep] = useState(true)
  const [scanAllForceRescan, setScanAllForceRescan] = useState(false)
  const [scanAllRunning, setScanAllRunning] = useState(false)
  const [scanAllProgress, setScanAllProgress] = useState(null)
  const [scanAllSummary, setScanAllSummary] = useState(null)
  const [scanAllError, setScanAllError] = useState(null)
  const scanAllCancelRef = useRef(false)
  const [deleteSiloId, setDeleteSiloId] = useState(null)
  const [deleteSiloBusy, setDeleteSiloBusy] = useState(false)
  const [siloDropIndicator, setSiloDropIndicator] = useState(null)
  const [draggingSiloId, setDraggingSiloId] = useState(null)
  const [siloReordering, setSiloReordering] = useState(false)
  const { items: techStackOptions, loading: techStackLookupLoading } = useTechStackLookup()
  const { items: sectorOptions, loading: sectorLookupLoading } = useSectorLookup()
  const { promptOverrides } = useAiPromptSettings()

  async function ensureSectorInLookup(rawName) {
    const trimmed = (rawName || '').trim()
    if (!trimmed) return null
    const lower = trimmed.toLowerCase()
    const match = sectorOptions.find((o) => o.name.toLowerCase() === lower)
    if (match) return match.name
    const maxSort = sectorOptions.reduce(
      (m, o) => Math.max(m, Number(o.sortOrder) || 0),
      -1,
    )
    await addDoc(collection(db, 'sectorLookup'), {
      name: trimmed,
      sortOrder: maxSort + 1,
      createdAt: serverTimestamp(),
    })
    return trimmed
  }

  async function ensureTechStackInLookup(rawName) {
    const trimmed = (rawName || '').trim()
    if (!trimmed) return null
    const lower = trimmed.toLowerCase()
    const match = techStackOptions.find((o) => o.name.toLowerCase() === lower)
    if (match) return match.name
    const maxSort = techStackOptions.reduce(
      (m, o) => Math.max(m, Number(o.sortOrder) || 0),
      -1,
    )
    await addDoc(collection(db, 'techStackLookup'), {
      name: trimmed,
      sortOrder: maxSort + 1,
      createdAt: serverTimestamp(),
    })
    return trimmed
  }

  useEffect(() => {
    saveSiloColors(siloColors)
  }, [siloColors])

  useEffect(() => {
    saveSiloTitles(siloTitles)
  }, [siloTitles])

  useEffect(() => {
    function clearSiloReorderDrag() {
      setSiloDropIndicator(null)
      setDraggingSiloId(null)
    }
    document.addEventListener('dragend', clearSiloReorderDrag)
    return () => document.removeEventListener('dragend', clearSiloReorderDrag)
  }, [])

  useEffect(() => {
    saveDetailPanelOpen(detailPanelOpen)
  }, [detailPanelOpen])

  useEffect(() => {
    fetchAiConfig()
      .then((cfg) => {
        if (cfg.batchSize) setScanBatchSize(cfg.batchSize)
      })
      .catch(() => {})
  }, [])

  function resolveSiloTitle(siloId) {
    return resolveBoardSiloTitle(siloId, silos, siloTitles)
  }

  function projectArchivedForSilo(siloId) {
    if (isUnassignedSiloId(siloId)) return false
    return siloArchivesOnEntry(findSilo(silos, siloId))
  }

  async function handleSiloTitleCommit(siloId, newTitle) {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    const silo = findSilo(silos, siloId)
    if (silo && trimmed === silo.title) {
      setSiloTitles((prev) => {
        const next = { ...prev }
        delete next[siloId]
        return next
      })
      return
    }
    await updateBoardSiloTitle(siloId, trimmed)
    setSiloTitles((prev) => {
      const next = { ...prev }
      delete next[siloId]
      return next
    })
  }

  function handleSetSiloColor(siloId, hex) {
    setSiloColors((prev) => ({ ...prev, [siloId]: hex }))
  }

  function handleResetSiloColor(siloId) {
    setSiloColors((prev) => {
      const next = { ...prev }
      delete next[siloId]
      return next
    })
  }

  useEffect(() => {
    const q = query(collection(db, 'projects'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setProjects(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Failed to load projects')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const bySilo = useMemo(() => {
    const map = { [UNASSIGNED_SILO_ID]: [] }
    for (const s of silos) map[s.id] = []
    for (const p of projects) {
      const sid = normalizeProjectSiloId(p, silos)
      if (!map[sid]) map[sid] = []
      map[sid].push(p)
    }
    const allKeys = [UNASSIGNED_SILO_ID, ...silos.map((s) => s.id)]
    for (const id of allKeys) {
      if (!map[id]) map[id] = []
      map[id].sort((a, b) => {
        const ao = Number(a.sortOrder) || 0
        const bo = Number(b.sortOrder) || 0
        if (ao !== bo) return ao - bo
        return (a.projectName || '').localeCompare(b.projectName || '')
      })
    }
    return map
  }, [projects, silos])

  const selectedProject = selectedId
    ? projects.find((p) => p.id === selectedId) ?? null
    : null

  async function handleUpdateUnassignedQueueSettings(patch) {
    await updateUnassignedQueueSettings(patch)
  }

  async function handleAddSubmit(payload) {
    const siloId = payload.siloId || normalizeProjectSiloId({}, silos)
    const archived = projectArchivedForSilo(siloId)
    await addDoc(collection(db, 'projects'), {
      projectName: payload.projectName || '',
      clientCompany: payload.clientCompany || '',
      description: payload.description || '',
      projectType: payload.projectType || '',
      techStack: payload.techStack || [],
      status: resolveSiloTitle(siloId),
      siloId,
      sortOrder: Date.now(),
      clientContacts: payload.clientContacts || [],
      clientMailFolder: payload.clientMailFolder || null,
      startDate: payload.startDate || '',
      expectedCompletionDate: payload.expectedCompletionDate || '',
      approxProjectValue: Number(payload.approxProjectValue) || 0,
      aiContext: payload.aiContext || '',
      latestStatusSummary: payload.latestStatusSummary || '',
      nextActionOwner: payload.nextActionOwner || '',
      nextActionSummary: payload.nextActionSummary || '',
      attention: normalizeAttention(payload.attention),
      sectors: Array.isArray(payload.sectors) ? payload.sectors : [],
      visibleOnWorkbench: true,
      archived,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setFormOpen(false)
  }

  async function handleEditSubmit(payload) {
    if (!formProject?.id) return
    const siloId = payload.siloId || normalizeProjectSiloId(formProject, silos)
    const archived = projectArchivedForSilo(siloId)
    await updateDoc(doc(db, 'projects', formProject.id), {
      projectName: payload.projectName || '',
      clientCompany: payload.clientCompany || '',
      description: payload.description || '',
      projectType: payload.projectType || '',
      techStack: payload.techStack || [],
      status: resolveSiloTitle(siloId),
      siloId,
      clientContacts: payload.clientContacts || [],
      clientMailFolder: payload.clientMailFolder || null,
      startDate: payload.startDate || '',
      expectedCompletionDate: payload.expectedCompletionDate || '',
      approxProjectValue: Number(payload.approxProjectValue) || 0,
      aiContext: payload.aiContext || '',
      latestStatusSummary: payload.latestStatusSummary || '',
      nextActionOwner: payload.nextActionOwner || '',
      nextActionSummary: payload.nextActionSummary || '',
      attention: normalizeAttention(payload.attention),
      sectors: Array.isArray(payload.sectors) ? payload.sectors : [],
      visibleOnWorkbench:
        payload.visibleOnWorkbench !== undefined ? payload.visibleOnWorkbench : true,
      archived,
      updatedAt: serverTimestamp(),
    })
    setFormOpen(false)
    setFormProject(null)
  }

  async function handleDelete(projectId) {
    if (!window.confirm('Delete this project? This cannot be undone.')) return
    await deleteDoc(doc(db, 'projects', projectId))
    if (selectedId === projectId) setSelectedId(null)
  }

  /**
   * Trello-style placement: append if anchorProjectId is null; otherwise insert before/after anchor.
   * Handles same-column reorder and cross-column moves.
   */
  async function placeProject(projectId, targetSiloId, anchorProjectId, insertBefore) {
    const dragged = projects.find((p) => p.id === projectId)
    if (!dragged) return

    const pool = sortProjectsList(
      projects.filter(
        (p) => normalizeProjectSiloId(p, silos) === targetSiloId && p.id !== projectId,
      ),
    )

    let newOrder
    if (anchorProjectId == null) {
      newOrder = [...pool, dragged]
    } else {
      if (anchorProjectId === projectId) return
      const anchorIdx = pool.findIndex((p) => p.id === anchorProjectId)
      if (anchorIdx === -1) {
        newOrder = [...pool, dragged]
      } else {
        const insertAt = insertBefore ? anchorIdx : anchorIdx + 1
        newOrder = [...pool.slice(0, insertAt), dragged, ...pool.slice(insertAt)]
      }
    }

    const prevIds = (bySilo[targetSiloId] || []).map((p) => p.id).join(',')
    const nextIds = newOrder.map((p) => p.id).join(',')
    const fromSilo = normalizeProjectSiloId(dragged, silos)
    if (fromSilo === targetSiloId && prevIds === nextIds) return

    const siloChanged = fromSilo !== targetSiloId
    const targetArchived = projectArchivedForSilo(targetSiloId)

    const batch = writeBatch(db)
    newOrder.forEach((p, i) => {
      const patch = {
        sortOrder: i * 1000,
        updatedAt: serverTimestamp(),
      }
      if (p.id === projectId) {
        patch.siloId = targetSiloId
        patch.status = resolveSiloTitle(targetSiloId)
        patch.archived = targetArchived
      }
      batch.update(doc(db, 'projects', p.id), patch)
    })
    await batch.commit()

    if (siloChanged) {
      await recordProjectSiloChange(projectId, fromSilo, targetSiloId, {
        fromStatus: resolveSiloTitle(fromSilo),
        toStatus: resolveSiloTitle(targetSiloId),
      })
    }
  }

  async function moveProject(projectId, newSiloId) {
    const current = projects.find((p) => p.id === projectId)
    const fromId = current ? normalizeProjectSiloId(current, silos) : normalizeProjectSiloId({}, silos)
    if (current && fromId === newSiloId) return
    await placeProject(projectId, newSiloId, null, false)
  }

  async function handleSiloReorder(dragId, targetId, insertBefore) {
    const reordered = reorderListItems(silos, dragId, targetId, insertBefore)
    const prev = silos.map((s) => s.id).join(',')
    const next = reordered.map((s) => s.id).join(',')
    if (prev === next) return

    setSiloReordering(true)
    try {
      await reorderBoardSilos(reordered)
    } finally {
      setSiloReordering(false)
      setSiloDropIndicator(null)
      setDraggingSiloId(null)
    }
  }

  async function cycleProjectAttention(projectId) {
    const p = projects.find((x) => x.id === projectId)
    const level = nextAttention(p?.attention)
    await updateDoc(doc(db, 'projects', projectId), {
      attention: level,
      updatedAt: serverTimestamp(),
    })
  }

  async function updateProjectClientMailFolder(projectId, clientMailFolder) {
    await updateDoc(doc(db, 'projects', projectId), {
      clientMailFolder: clientMailFolder || null,
      updatedAt: serverTimestamp(),
    })
  }

  async function updateProjectClientContacts(projectId, clientContacts) {
    await updateDoc(doc(db, 'projects', projectId), {
      clientContacts: Array.isArray(clientContacts) ? clientContacts : [],
      updatedAt: serverTimestamp(),
    })
  }

  async function updateProjectSectorsAndTech(projectId, sectors, techStack) {
    await updateDoc(doc(db, 'projects', projectId), {
      sectors: Array.isArray(sectors) ? sectors : [],
      techStack: Array.isArray(techStack) ? techStack : [],
      updatedAt: serverTimestamp(),
    })
  }

  function openAdd() {
    setFormMode('add')
    setFormProject(null)
    setFormOpen(true)
  }

  function openEdit(project) {
    setFormMode('edit')
    setFormProject(project)
    setFormOpen(true)
  }

  function handleOpenColumnScan(siloId) {
    if (!configured || !account) {
      window.alert('Connect Microsoft email in Settings before scanning.')
      return
    }
    setColumnScanDays(30)
    setColumnScanDeep(true)
    setColumnScanConfirmSiloId(siloId)
  }

  function resetColumnScanUi() {
    columnScanCancelRef.current = false
    setColumnScanRunning(false)
    setColumnScanConfirmSiloId(null)
    setColumnScanProgress(null)
    setColumnScanSummary(null)
    setColumnScanError(null)
    setColumnScanSiloTitle('')
  }

  function handleColumnScanCancel() {
    if (columnScanRunning) {
      columnScanCancelRef.current = true
      return
    }
    resetColumnScanUi()
  }

  async function handleStartColumnScan() {
    const siloId = columnScanConfirmSiloId
    if (!siloId || !account) return

    const siloProjects = bySilo[siloId] || []
    const { scannable } = partitionScannableProjects(siloProjects)
    if (scannable.length === 0) return

    const siloTitle = resolveSiloTitle(siloId)
    columnScanCancelRef.current = false
    setColumnScanConfirmSiloId(null)
    setColumnScanSiloTitle(siloTitle)
    setColumnScanRunning(true)
    setColumnScanProgress({
      cardIndex: 0,
      cardTotal: scannable.length,
      cardName: '',
      phase: 'fetching',
      emailIndex: 0,
      emailTotal: 0,
      emailSubject: '',
      percent: 0,
    })
    setColumnScanSummary(null)
    setColumnScanError(null)

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Microsoft sign-in required.')

      const summary = await runColumnCommunicationScan({
        projects: siloProjects,
        accessToken: token,
        excludeEmails: harvestExclusions,
        days: Number(columnScanDays) || 30,
        deepScan: columnScanDeep,
        batchSize: scanBatchSize,
        onRecordClientMailScan: recordProjectClientMailScan,
        promptOverrides,
        isCancelled: () => columnScanCancelRef.current,
        onProgress: setColumnScanProgress,
      })
      setColumnScanSummary(summary)
    } catch (err) {
      setColumnScanError(err instanceof Error ? err.message : String(err))
    } finally {
      setColumnScanRunning(false)
    }
  }

  const columnScanConfirmProjects = columnScanConfirmSiloId
    ? bySilo[columnScanConfirmSiloId] || []
    : []
  const columnScanPartition = partitionScannableProjects(columnScanConfirmProjects)

  const scanAllStageOptions = useMemo(
    () =>
      buildScanAllStageOptions({
        silos,
        bySilo,
        resolveSiloTitle,
        leadQueueFolders,
      }),
    [silos, bySilo, leadQueueFolders, siloTitles],
  )

  useEffect(() => {
    if (!scanAllConfirmOpen) return
    setScanAllSelectedColumnIds(new Set(silos.map((s) => s.id)))
    setScanAllSelectedUnassigned(hasLeadQueueFolders(leadQueueFolders))
    setScanAllDays(scanDays)
    setScanAllDeep(deepScan)
    setScanAllForceRescan(forceRescan)
  }, [scanAllConfirmOpen, silos, leadQueueFolders, scanDays, deepScan, forceRescan])

  function handleOpenScanAll() {
    if (!configured || !account) {
      window.alert('Connect Microsoft email in Settings before scanning.')
      return
    }
    setScanAllConfirmOpen(true)
  }

  function resetScanAllUi() {
    scanAllCancelRef.current = false
    setScanAllRunning(false)
    setScanAllConfirmOpen(false)
    setScanAllProgress(null)
    setScanAllSummary(null)
    setScanAllError(null)
  }

  function handleScanAllCancel() {
    if (scanAllRunning) {
      scanAllCancelRef.current = true
      return
    }
    resetScanAllUi()
  }

  async function handleStartScanAll() {
    const includeUnassigned = scanAllSelectedUnassigned && hasLeadQueueFolders(leadQueueFolders)
    const selectedColumns = silos.filter((s) => scanAllSelectedColumnIds.has(s.id))
    const stageCount = selectedColumns.length + (includeUnassigned ? 1 : 0)
    if (stageCount === 0) return

    scanAllCancelRef.current = false
    setScanAllConfirmOpen(false)
    setScanAllRunning(true)
    setScanAllProgress({
      stageIndex: 0,
      stageTotal: stageCount,
      stageName: '',
      stageType: 'fetching',
      phase: 'fetching',
      cardIndex: 0,
      cardTotal: 0,
      cardName: '',
      emailIndex: 0,
      emailTotal: 0,
      emailSubject: '',
      percent: 0,
    })
    setScanAllSummary(null)
    setScanAllError(null)

    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Microsoft sign-in required.')

      const summary = await runScanAll({
        includeUnassigned,
        unassignedProjects: bySilo[UNASSIGNED_SILO_ID] || [],
        allProjects: projects,
        leadQueueFolders,
        columnSilos: selectedColumns.map((silo) => ({
          id: silo.id,
          title: resolveSiloTitle(silo.id),
          projects: bySilo[silo.id] || [],
        })),
        accessToken: token,
        excludeEmails: harvestExclusions,
        userEmail: account?.username || '',
        days: normalizeScanDays(scanAllDays),
        deepScan: scanAllDeep,
        forceRescan: scanAllForceRescan,
        batchSize: scanBatchSize,
        promptOverrides,
        onRecordClientMailScan: recordProjectClientMailScan,
        onUpdateQueueSettings: handleUpdateUnassignedQueueSettings,
        isCancelled: () => scanAllCancelRef.current,
        onProgress: setScanAllProgress,
      })
      setScanAllSummary(summary)
    } catch (err) {
      setScanAllError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanAllRunning(false)
    }
  }

  const canDeleteList = silos.length > 1
  const deleteSiloTarget = deleteSiloId ? findSilo(silos, deleteSiloId) : null
  const deleteSiloProjectCount = deleteSiloId ? (bySilo[deleteSiloId] || []).length : 0

  async function handleAddSilo(title) {
    await createBoardSilo(title)
  }

  function handleDeleteSiloRequest(siloId) {
    if (!canDeleteList) return
    setDeleteSiloId(siloId)
  }

  async function handleConfirmDeleteSilo(moveToSiloId) {
    if (!deleteSiloId || deleteSiloBusy || !canDeleteList) return
    setDeleteSiloBusy(true)
    try {
      const projectsInSilo = bySilo[deleteSiloId] || []
      const targetSilo = moveToSiloId ? findSilo(silos, moveToSiloId) : null
      await deleteBoardSilo(deleteSiloId, {
        moveToSiloId,
        projectsInSilo,
        targetSilo,
      })
      setSiloColors((prev) => {
        const next = { ...prev }
        delete next[deleteSiloId]
        return next
      })
      setSiloTitles((prev) => {
        const next = { ...prev }
        delete next[deleteSiloId]
        return next
      })
      setDeleteSiloId(null)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteSiloBusy(false)
    }
  }

  return (
    <div className="workbench">
      <div className="workbench-toolbar">
        <button type="button" className="btn-primary" onClick={openAdd}>
          Add project
        </button>
        <button type="button" className="btn-secondary" onClick={handleOpenScanAll}>
          Scan all
        </button>
        {loading && <span className="muted">Loading…</span>}
        {silosLoading && silos.length === 0 && <span className="muted">Loading lists…</span>}
        {error && <span className="error-text">{error}</span>}
        {silosError && <span className="error-text">{silosError}</span>}
        {unassignedQueueError && <span className="error-text">{unassignedQueueError}</span>}
        <button
          type="button"
          className="btn-secondary btn-small workbench-panel-toggle"
          onClick={() => setDetailPanelOpen((open) => !open)}
          aria-pressed={detailPanelOpen}
        >
          {detailPanelOpen ? 'Hide preview panel' : 'Show preview panel'}
        </button>
      </div>

      <div
        className={`workbench-body${detailPanelOpen ? '' : ' workbench-body--panel-hidden'}`}
      >
        <section className="board-wrap" aria-label="Project board">
          <div className="board-columns">
            <UnassignedColumn
              projects={bySilo[UNASSIGNED_SILO_ID] || []}
              allProjects={projects}
              leadQueueFolders={leadQueueFolders}
              scanDays={scanDays}
              deepScan={deepScan}
              forceRescan={forceRescan}
              onUpdateQueueSettings={handleUpdateUnassignedQueueSettings}
              onSelectCard={setSelectedId}
              selectedId={selectedId}
              onMoveCard={moveProject}
              onPlaceProject={placeProject}
              onCycleAttention={cycleProjectAttention}
              configured={configured}
              getAccessToken={getAccessToken}
              userEmail={account?.username || ''}
              harvestExclusions={harvestExclusions}
              promptOverrides={promptOverrides}
              scanBatchSize={scanBatchSize}
              onRecordClientMailScan={recordProjectClientMailScan}
            />
            {silos.map((silo) => (
              <SiloColumn
                key={silo.id}
                silo={silo}
                projects={bySilo[silo.id] || []}
                onSelectCard={setSelectedId}
                selectedId={selectedId}
                onMoveCard={moveProject}
                onPlaceProject={placeProject}
                allSilos={boardSilos}
                accentColor={siloColors[silo.id]}
                onSetSiloColor={handleSetSiloColor}
                onResetSiloColor={handleResetSiloColor}
                onCycleAttention={cycleProjectAttention}
                displayTitle={resolveSiloTitle(silo.id)}
                onSiloTitleCommit={(title) => handleSiloTitleCommit(silo.id, title)}
                siloTitleOverrides={siloTitles}
                onScanColumn={handleOpenColumnScan}
                onDeleteSilo={handleDeleteSiloRequest}
                canDeleteList={canDeleteList}
                siloDragging={draggingSiloId === silo.id}
                siloReordering={siloReordering}
                siloReorderSlot={
                  siloDropIndicator?.targetId === silo.id
                    ? siloDropIndicator.before
                      ? 'before'
                      : 'after'
                    : null
                }
                onSiloReorderDragStart={setDraggingSiloId}
                onSiloReorderDragOver={(targetId, before) =>
                  setSiloDropIndicator({ targetId, before })
                }
                onSiloReorderDrop={handleSiloReorder}
              />
            ))}
            <AddSiloColumn onAdd={handleAddSilo} disabled={silosLoading} />
          </div>
        </section>

        {detailPanelOpen && (
          <ProjectDetailPanel
          project={selectedProject}
          onClose={() => setSelectedId(null)}
          onEdit={() => selectedProject && openEdit(selectedProject)}
          onDelete={(id) => handleDelete(id)}
          onMove={(id, siloId) => moveProject(id, siloId)}
          onCycleAttention={cycleProjectAttention}
          onUpdateSectorsAndTech={updateProjectSectorsAndTech}
          onUpdateClientMailFolder={updateProjectClientMailFolder}
          onUpdateClientContacts={updateProjectClientContacts}
          onRecordClientMailScan={recordProjectClientMailScan}
          techStackOptions={techStackOptions}
          sectorOptions={sectorOptions}
          techStackLookupLoading={techStackLookupLoading}
          sectorLookupLoading={sectorLookupLoading}
          onEnsureSectorInLookup={ensureSectorInLookup}
          onEnsureTechStackInLookup={ensureTechStackInLookup}
          silos={boardSilos}
          siloTitleOverrides={siloTitles}
        />
        )}
      </div>

      <DeleteSiloModal
        open={Boolean(deleteSiloId)}
        silo={deleteSiloTarget}
        silos={silos}
        projectCount={deleteSiloProjectCount}
        onConfirm={handleConfirmDeleteSilo}
        onCancel={() => !deleteSiloBusy && setDeleteSiloId(null)}
        busy={deleteSiloBusy}
      />

      {formOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setFormOpen(false)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-labelledby="project-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <ProjectForm
              mode={formMode}
              silos={boardSilos}
              siloTitleOverrides={siloTitles}
              techStackOptions={techStackOptions}
              techStackLookupLoading={techStackLookupLoading}
              sectorOptions={sectorOptions}
              sectorLookupLoading={sectorLookupLoading}
              onEnsureSectorInLookup={ensureSectorInLookup}
              onEnsureTechStackInLookup={ensureTechStackInLookup}
              initialProject={formMode === 'edit' ? formProject : null}
              onSubmit={formMode === 'add' ? handleAddSubmit : handleEditSubmit}
              onCancel={() => {
                setFormOpen(false)
                setFormProject(null)
              }}
            />
          </div>
        </div>
      )}

      <ColumnScanConfirmModal
        open={Boolean(columnScanConfirmSiloId)}
        siloTitle={
          columnScanConfirmSiloId ? resolveSiloTitle(columnScanConfirmSiloId) : ''
        }
        scannableCount={columnScanPartition.scannable.length}
        skippedCount={columnScanPartition.skipped.length}
        days={columnScanDays}
        deepScan={columnScanDeep}
        onDaysChange={setColumnScanDays}
        onDeepScanChange={setColumnScanDeep}
        onConfirm={handleStartColumnScan}
        onCancel={() => setColumnScanConfirmSiloId(null)}
      />

      <ColumnScanProgressModal
        open={columnScanRunning || Boolean(columnScanSummary) || Boolean(columnScanError)}
        siloTitle={columnScanSiloTitle}
        progress={columnScanProgress}
        summary={columnScanSummary}
        error={columnScanError}
        onCancel={handleColumnScanCancel}
      />

      <ScanAllConfirmModal
        open={scanAllConfirmOpen}
        stageOptions={scanAllStageOptions}
        selectedUnassigned={scanAllSelectedUnassigned}
        selectedColumnIds={scanAllSelectedColumnIds}
        days={scanAllDays}
        deepScan={scanAllDeep}
        forceRescan={scanAllForceRescan}
        onToggleUnassigned={setScanAllSelectedUnassigned}
        onToggleColumn={(id, checked) => {
          setScanAllSelectedColumnIds((prev) => {
            const next = new Set(prev)
            if (checked) next.add(id)
            else next.delete(id)
            return next
          })
        }}
        onSelectAll={() => {
          setScanAllSelectedColumnIds(new Set(silos.map((s) => s.id)))
          setScanAllSelectedUnassigned(hasLeadQueueFolders(leadQueueFolders))
        }}
        onSelectNone={() => {
          setScanAllSelectedColumnIds(new Set())
          setScanAllSelectedUnassigned(false)
        }}
        onDaysChange={setScanAllDays}
        onDeepScanChange={setScanAllDeep}
        onForceRescanChange={setScanAllForceRescan}
        onConfirm={handleStartScanAll}
        onCancel={() => setScanAllConfirmOpen(false)}
      />

      <ScanAllProgressModal
        open={scanAllRunning || Boolean(scanAllSummary) || Boolean(scanAllError)}
        progress={scanAllProgress}
        summary={scanAllSummary}
        error={scanAllError}
        onCancel={handleScanAllCancel}
      />
    </div>
  )
}
