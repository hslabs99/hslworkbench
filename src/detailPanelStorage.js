const STORAGE_KEY = 'hsl-workbench-detail-panel-open'

export function loadDetailPanelOpen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'false') return false
    if (raw === 'true') return true
  } catch {
    /* ignore */
  }
  return true
}

export function saveDetailPanelOpen(open) {
  try {
    localStorage.setItem(STORAGE_KEY, open ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}
