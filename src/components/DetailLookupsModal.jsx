import { useEffect, useState } from 'react'

export default function DetailLookupsModal({
  open,
  project,
  techStackOptions,
  sectorOptions,
  techStackLookupLoading,
  sectorLookupLoading,
  onEnsureSectorInLookup,
  onEnsureTechStackInLookup,
  onSave,
  onClose,
}) {
  const [selectedTechNames, setSelectedTechNames] = useState([])
  const [legacyTechExtras, setLegacyTechExtras] = useState([])
  const [selectedSectorNames, setSelectedSectorNames] = useState([])
  const [legacySectorExtras, setLegacySectorExtras] = useState([])
  const [manualSectorInput, setManualSectorInput] = useState('')
  const [manualTechInput, setManualTechInput] = useState('')

  useEffect(() => {
    if (!open || !project) return
    const ts = Array.isArray(project.techStack) ? project.techStack : []
    if (techStackOptions.length === 0) {
      setSelectedTechNames([])
      setLegacyTechExtras(ts)
    } else {
      const catalog = new Set(techStackOptions.map((o) => o.name))
      setSelectedTechNames(ts.filter((t) => catalog.has(t)))
      setLegacyTechExtras(ts.filter((t) => !catalog.has(t)))
    }

    const sectors = Array.isArray(project.sectors) ? project.sectors : []
    if (sectorOptions.length === 0) {
      setSelectedSectorNames([])
      setLegacySectorExtras(sectors)
    } else {
      const catalog = new Set(sectorOptions.map((o) => o.name))
      setSelectedSectorNames(sectors.filter((t) => catalog.has(t)))
      setLegacySectorExtras(sectors.filter((t) => !catalog.has(t)))
    }
    setManualSectorInput('')
    setManualTechInput('')
  }, [open, project, techStackOptions, sectorOptions])

  if (!open || !project) return null

  function toggleTech(name) {
    setSelectedTechNames((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    )
  }

  function toggleSector(name) {
    setSelectedSectorNames((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    )
  }

  async function handleManualSectorAdd(e) {
    e.preventDefault()
    const t = manualSectorInput.trim()
    if (!t || !onEnsureSectorInLookup) return
    const canonical = await onEnsureSectorInLookup(t)
    setManualSectorInput('')
    if (!canonical) return
    setSelectedSectorNames((prev) =>
      prev.some((x) => x.toLowerCase() === canonical.toLowerCase())
        ? prev
        : [...prev, canonical],
    )
  }

  async function handleManualTechAdd(e) {
    e.preventDefault()
    const t = manualTechInput.trim()
    if (!t || !onEnsureTechStackInLookup) return
    const canonical = await onEnsureTechStackInLookup(t)
    setManualTechInput('')
    if (!canonical) return
    setSelectedTechNames((prev) =>
      prev.some((x) => x.toLowerCase() === canonical.toLowerCase())
        ? prev
        : [...prev, canonical],
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const techStack = [...new Set([...selectedTechNames, ...legacyTechExtras])]
    const sectors = [...new Set([...selectedSectorNames, ...legacySectorExtras])]
    await onSave(project.id, sectors, techStack)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-panel--lookups"
        role="dialog"
        aria-labelledby="detail-lookups-title"
        onClick={(e) => e.stopPropagation()}
      >
        <form className="project-form" onSubmit={handleSubmit}>
          <h2 id="detail-lookups-title" className="form-title">
            Sectors & tech stack
          </h2>
          <p className="muted" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
            {project.projectName || 'Untitled'}
          </p>

          <fieldset className="full-width tech-stack-fieldset">
            <legend>Sector</legend>
            {sectorLookupLoading && <p className="muted">Loading sectors…</p>}
            {!sectorLookupLoading && sectorOptions.length === 0 && (
              <p className="muted">
                No sectors in catalog — use manual add below or open Settings to seed defaults.
              </p>
            )}
            {!sectorLookupLoading && sectorOptions.length > 0 && (
              <div className="tech-stack-picker" role="group" aria-label="Sector">
                {sectorOptions.map((o) => (
                  <label key={o.id} className="tech-stack-option">
                    <input
                      type="checkbox"
                      checked={selectedSectorNames.includes(o.name)}
                      onChange={() => toggleSector(o.name)}
                    />
                    <span>{o.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="sector-manual-row">
              <input
                type="text"
                value={manualSectorInput}
                onChange={(e) => setManualSectorInput(e.target.value)}
                placeholder="Add sector by name"
                aria-label="Add sector by name"
              />
              <button type="button" className="btn-secondary" onClick={handleManualSectorAdd}>
                Add sector
              </button>
            </div>
            {legacySectorExtras.length > 0 && (
              <p className="tech-stack-legacy muted">
                Kept from project (not in catalog): <strong>{legacySectorExtras.join(', ')}</strong>
              </p>
            )}
          </fieldset>

          <fieldset className="full-width tech-stack-fieldset">
            <legend>Tech stack</legend>
            {techStackLookupLoading && <p className="muted">Loading options…</p>}
            {!techStackLookupLoading && techStackOptions.length === 0 && (
              <p className="muted">
                No tech catalog yet — add entries below (saved to Settings) or open Settings to seed
                defaults.
              </p>
            )}
            {!techStackLookupLoading && techStackOptions.length > 0 && (
              <div className="tech-stack-picker" role="group" aria-label="Tech stack">
                {techStackOptions.map((o) => (
                  <label key={o.id} className="tech-stack-option">
                    <input
                      type="checkbox"
                      checked={selectedTechNames.includes(o.name)}
                      onChange={() => toggleTech(o.name)}
                    />
                    <span>{o.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="sector-manual-row">
              <input
                type="text"
                value={manualTechInput}
                onChange={(e) => setManualTechInput(e.target.value)}
                placeholder="Add tech by name"
                aria-label="Add tech stack item by name"
              />
              <button type="button" className="btn-secondary" onClick={handleManualTechAdd}>
                Add tech
              </button>
            </div>
            {legacyTechExtras.length > 0 && (
              <p className="tech-stack-legacy muted">
                Kept from project (not in catalog): <strong>{legacyTechExtras.join(', ')}</strong>
              </p>
            )}
          </fieldset>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
