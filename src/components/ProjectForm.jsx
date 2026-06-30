import { useEffect, useState } from 'react'
import MailFolderPickerModal from './MailFolderPickerModal.jsx'
import MainContactFieldMenu from './MainContactFieldMenu.jsx'
import { useHarvestExclusions } from './HarvestExclusionsSection.jsx'
import { useMicrosoftAuth } from '../MicrosoftAuthContext.jsx'
import { projectClientMailFolder } from '../graphMail.js'
import { clientMailRootLabel } from '../mailFolderConfig.js'
import { harvestClientEmailsForProject } from '../projectHarvest.js'
import { isProspectLeadProject } from '../unassignedQueue.js'
import { normalizeAttention } from '../attention.js'

function buildEmpty() {
  return {
    projectName: '',
    clientCompany: '',
    description: '',
    projectType: '',
    startDate: '',
    expectedCompletionDate: '',
    approxProjectValue: '',
    mainContactName: '',
    mainContactEmail: '',
    aiContext: '',
    nextActionOwner: '',
    nextActionSummary: '',
    siloId: 'active',
    latestStatusSummary: '',
    attention: 'green',
  }
}

function projectToFormState(p) {
  if (!p) return { ...buildEmpty() }
  const contact = Array.isArray(p.clientContacts) && p.clientContacts[0]
  return {
    projectName: p.projectName ?? '',
    clientCompany: p.clientCompany ?? '',
    description: p.description ?? '',
    projectType: p.projectType ?? '',
    startDate: p.startDate ?? '',
    expectedCompletionDate: p.expectedCompletionDate ?? '',
    approxProjectValue:
      p.approxProjectValue !== undefined && p.approxProjectValue !== null
        ? String(p.approxProjectValue)
        : '',
    mainContactName: contact?.name ?? '',
    mainContactEmail: contact?.email ?? '',
    aiContext: p.aiContext ?? '',
    nextActionOwner: p.nextActionOwner ?? '',
    nextActionSummary: p.nextActionSummary ?? '',
    siloId: p.siloId ?? 'active',
    latestStatusSummary: p.latestStatusSummary ?? '',
    attention: normalizeAttention(p.attention ?? 'green'),
  }
}

export default function ProjectForm({
  mode,
  silos,
  siloTitleOverrides = {},
  techStackOptions = [],
  techStackLookupLoading = false,
  sectorOptions = [],
  sectorLookupLoading = false,
  onEnsureSectorInLookup,
  onEnsureTechStackInLookup,
  initialProject,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(() =>
    mode === 'edit' ? projectToFormState(initialProject) : buildEmpty(),
  )
  const [selectedTechNames, setSelectedTechNames] = useState([])
  const [legacyTechExtras, setLegacyTechExtras] = useState([])
  const [selectedSectorNames, setSelectedSectorNames] = useState([])
  const [legacySectorExtras, setLegacySectorExtras] = useState([])
  const [manualSectorInput, setManualSectorInput] = useState('')
  const [manualTechInput, setManualTechInput] = useState('')
  const [clientMailFolder, setClientMailFolder] = useState(null)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [harvesting, setHarvesting] = useState(false)
  const [harvestError, setHarvestError] = useState(null)
  const [harvestMessage, setHarvestMessage] = useState(null)
  const { configured, account, getAccessToken, userEmail } = useMicrosoftAuth()
  const { excludeEmails: harvestExclusions } = useHarvestExclusions()

  useEffect(() => {
    if (mode === 'edit' && initialProject) {
      setValues(projectToFormState(initialProject))
    }
    if (mode === 'add') {
      setValues(buildEmpty())
      setSelectedTechNames([])
      setLegacyTechExtras([])
      setSelectedSectorNames([])
      setLegacySectorExtras([])
      setManualSectorInput('')
      setManualTechInput('')
      setClientMailFolder(null)
      setHarvestError(null)
      setHarvestMessage(null)
    }
  }, [mode, initialProject])

  useEffect(() => {
    if (mode !== 'edit' || !initialProject) return
    const ts = Array.isArray(initialProject.techStack) ? initialProject.techStack : []
    if (techStackOptions.length === 0) {
      setSelectedTechNames([])
      setLegacyTechExtras(ts)
    } else {
      const catalog = new Set(techStackOptions.map((o) => o.name))
      setSelectedTechNames(ts.filter((t) => catalog.has(t)))
      setLegacyTechExtras(ts.filter((t) => !catalog.has(t)))
    }

    const sectors = Array.isArray(initialProject.sectors) ? initialProject.sectors : []
    if (sectorOptions.length === 0) {
      setSelectedSectorNames([])
      setLegacySectorExtras(sectors)
    } else {
      const catalog = new Set(sectorOptions.map((o) => o.name))
      setSelectedSectorNames(sectors.filter((t) => catalog.has(t)))
      setLegacySectorExtras(sectors.filter((t) => !catalog.has(t)))
    }
  }, [mode, initialProject, techStackOptions, sectorOptions])

  useEffect(() => {
    if (mode === 'edit' && initialProject) {
      setClientMailFolder(projectClientMailFolder(initialProject))
    }
  }, [mode, initialProject])

  async function applyHarvestResult(result, { fillPrimary = true, force = false } = {}) {
    if (result.source === 'stored_summaries' && result.messagesMatched === 0) {
      setHarvestError('No stored emails for this card — run Communication Summary scan first.')
      return
    }
    if (result.contactFilterApplied && result.messagesMatched === 0) {
      setHarvestError('No messages found for this prospect in the folder.')
      setHarvestMessage(
        `Scanned ${result.messagesScanned} message${result.messagesScanned === 1 ? '' : 's'} in the folder.`,
      )
      return
    }

    const parts =
      result.source === 'stored_summaries'
        ? [
            `Used ${result.messagesMatched} stored email${result.messagesMatched === 1 ? '' : 's'} for this card`,
          ]
        : [`Scanned ${result.messagesScanned} message${result.messagesScanned === 1 ? '' : 's'}`]
    if (result.contactFilterApplied && result.messagesMatched < result.messagesScanned) {
      parts.push(`${result.messagesMatched} for this prospect`)
    }
    if (result.primary?.email && fillPrimary) {
      setValues((v) => ({
        ...v,
        mainContactEmail: force
          ? result.primary.email
          : v.mainContactEmail.trim() || result.primary.email,
        mainContactName: force
          ? result.primary.name || v.mainContactName
          : v.mainContactName.trim() || result.primary.name || v.mainContactName,
      }))
      parts.push(`primary contact ${result.primary.email}`)
    } else if (result.added.length > 0) {
      parts.push(`found ${result.added.length} address${result.added.length === 1 ? '' : 'es'}`)
    } else {
      parts.push('no new addresses found')
    }
    setHarvestMessage(parts.join(' — '))
  }

  async function runHarvest(
    folder,
    { fillPrimary = true, force = false, primaryEmail = '' } = {},
  ) {
    const isProspect =
      mode === 'edit' && initialProject && isProspectLeadProject(initialProject)

    if (!isProspect && !folder?.id) return
    if (!isProspect && (!configured || !account)) {
      setHarvestError('Connect Microsoft email in Settings before harvesting.')
      return
    }
    if (isProspect && mode !== 'edit') {
      setHarvestError('Save the card before harvesting from stored emails.')
      return
    }

    setHarvesting(true)
    setHarvestError(null)
    setHarvestMessage(null)

    try {
      const token = !isProspect ? await getAccessToken() : null
      if (!isProspect && !token) throw new Error('Microsoft sign-in required.')

      const existingContacts = [
        {
          name: values.mainContactName || '',
          email: values.mainContactEmail || '',
          role: '',
          phone: '',
        },
      ]

      const harvestProject =
        mode === 'edit' && initialProject
          ? { ...initialProject, clientMailFolder: folder || initialProject.clientMailFolder }
          : { clientMailFolder: folder }

      const result = await harvestClientEmailsForProject(
        token,
        harvestProject,
        existingContacts,
        {
          mailboxEmail: userEmail,
          globalExcludeEmails: harvestExclusions,
          primaryEmail: force ? primaryEmail || values.mainContactEmail.trim() : '',
        },
      )

      await applyHarvestResult(result, { fillPrimary, force })
    } catch (err) {
      setHarvestError(err instanceof Error ? err.message : String(err))
    } finally {
      setHarvesting(false)
    }
  }

  async function handleHarvestMainContact() {
    const isProspect =
      mode === 'edit' && initialProject && isProspectLeadProject(initialProject)

    if (!isProspect && !clientMailFolder?.id) {
      setHarvestError('Choose a client mail folder first.')
      setHarvestMessage(null)
      return
    }

    const primaryEmail =
      values.mainContactEmail.trim() ||
      (mode === 'edit' && initialProject?.prospectEmail) ||
      (mode === 'edit' && initialProject?.clientContacts?.[0]?.email) ||
      ''

    await runHarvest(clientMailFolder, { fillPrimary: true, force: true, primaryEmail })
  }

  async function handleFolderSelect(folder) {
    setClientMailFolder(folder)
    setFolderPickerOpen(false)
    if (mode === 'add' && folder?.id) {
      await runHarvest(folder, { fillPrimary: true })
    }
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setValues((v) => ({
      ...v,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

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

  function handleSubmit(e) {
    e.preventDefault()
    const techStack = [...new Set([...selectedTechNames, ...legacyTechExtras])]
    const sectors = [...new Set([...selectedSectorNames, ...legacySectorExtras])]
    const clientContacts = [
      {
        name: values.mainContactName || '',
        email: values.mainContactEmail || '',
        role: '',
        phone: '',
      },
    ]
    onSubmit({
      projectName: values.projectName,
      clientCompany: values.clientCompany,
      description: values.description,
      projectType: values.projectType,
      techStack,
      sectors,
      startDate: values.startDate,
      expectedCompletionDate: values.expectedCompletionDate,
      approxProjectValue: values.approxProjectValue,
      aiContext: values.aiContext,
      nextActionOwner: values.nextActionOwner,
      nextActionSummary: values.nextActionSummary,
      siloId: values.siloId,
      latestStatusSummary: values.latestStatusSummary,
      attention: values.attention || 'green',
      clientContacts,
      clientMailFolder: clientMailFolder || null,
      visibleOnWorkbench: true,
    })
  }

  const titleId = 'project-form-title'
  const title = mode === 'add' ? 'New project' : 'Edit project'

  return (
    <form className="project-form" onSubmit={handleSubmit}>
      <h2 id={titleId} className="form-title">
        {title}
      </h2>

      <div className="form-grid">
        <label>
          Project name *
          <input
            name="projectName"
            value={values.projectName}
            onChange={handleChange}
            required
            autoComplete="off"
          />
        </label>
        <label>
          Client company *
          <input
            name="clientCompany"
            value={values.clientCompany}
            onChange={handleChange}
            required
          />
        </label>
        <label className="full-width">
          Description
          <textarea name="description" value={values.description} onChange={handleChange} rows={3} />
        </label>
        <label>
          Project type
          <input name="projectType" value={values.projectType} onChange={handleChange} />
        </label>
        <fieldset className="full-width tech-stack-fieldset">
          <legend>Sector</legend>
          {sectorLookupLoading && <p className="muted">Loading sectors…</p>}
          {!sectorLookupLoading && sectorOptions.length === 0 && (
            <p className="muted">
              No sectors in catalog yet. Open <strong>Settings</strong> to seed defaults, or add a
              sector below — it will be saved to Settings automatically.
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
              placeholder="Add sector by name (saved to Settings)"
              aria-label="Add sector by name"
            />
            <button type="button" className="btn-secondary" onClick={handleManualSectorAdd}>
              Add sector
            </button>
          </div>
          <p className="muted sector-manual-hint">
            New names are added to the sector list in Settings and selected for this project.
          </p>
          {legacySectorExtras.length > 0 && (
            <p className="tech-stack-legacy muted">
              Also kept on this project (not in catalog):{' '}
              <strong>{legacySectorExtras.join(', ')}</strong>
            </p>
          )}
        </fieldset>
        <fieldset className="full-width tech-stack-fieldset">
          <legend>Tech stack</legend>
          {techStackLookupLoading && <p className="muted">Loading options…</p>}
          {!techStackLookupLoading && techStackOptions.length === 0 && (
            <p className="muted">
              No catalog entries yet — add a tech name below (saved to Settings), open{' '}
              <strong>Settings</strong>, or seed defaults from there.
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
              placeholder="Add tech by name (saved to Settings)"
              aria-label="Add tech stack item by name"
            />
            <button type="button" className="btn-secondary" onClick={handleManualTechAdd}>
              Add tech
            </button>
          </div>
          <p className="muted sector-manual-hint">
            New names are added to the tech stack list in Settings and selected for this project.
          </p>
          {legacyTechExtras.length > 0 && (
            <p className="tech-stack-legacy muted">
              Also kept on this project (not in catalog):{' '}
              <strong>{legacyTechExtras.join(', ')}</strong>
            </p>
          )}
        </fieldset>
        <label>
          Start date
          <input type="date" name="startDate" value={values.startDate} onChange={handleChange} />
        </label>
        <label>
          Expected completion date
          <input
            type="date"
            name="expectedCompletionDate"
            value={values.expectedCompletionDate}
            onChange={handleChange}
          />
        </label>
        <label>
          Approx project value
          <input
            type="number"
            name="approxProjectValue"
            min="0"
            step="1"
            value={values.approxProjectValue}
            onChange={handleChange}
          />
        </label>
        <fieldset className="full-width mail-folder-fieldset">
          <legend>Client mail folder</legend>
          <p className="muted mail-folder-field-hint">
            Subfolder under {clientMailRootLabel()} to scan for this client&apos;s email. Choosing a
            folder harvests addresses from its mail and fills the main contact when creating a project.
          </p>
          <div className="mail-folder-field-row">
            <div className="mail-folder-field-display">
              {clientMailFolder ? (
                <>
                  <strong>{clientMailFolder.displayName}</strong>
                  <span className="muted mail-folder-field-path">{clientMailFolder.path}</span>
                </>
              ) : (
                <span className="muted">No folder assigned</span>
              )}
            </div>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setFolderPickerOpen(true)}
              disabled={harvesting}
            >
              {clientMailFolder ? 'Change folder' : 'Choose folder'}
            </button>
            {clientMailFolder && (
              <>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => runHarvest(clientMailFolder)}
                  disabled={harvesting || !account}
                >
                  {harvesting ? 'Harvesting…' : 'Harvest emails'}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => {
                    setClientMailFolder(null)
                    setHarvestMessage(null)
                    setHarvestError(null)
                  }}
                  disabled={harvesting}
                >
                  Clear
                </button>
              </>
            )}
          </div>
          {!account && configured && (
            <p className="muted mail-folder-field-hint">
              Connect Microsoft email in Settings to harvest from a folder.
            </p>
          )}
        </fieldset>
        <fieldset className="full-width main-contact-fieldset">
          <legend className="main-contact-legend">
            <span>Main contact</span>
            <MainContactFieldMenu
              onHarvest={handleHarvestMainContact}
              disabled={harvesting}
              harvestDisabled={
                mode === 'edit' &&
                initialProject &&
                isProspectLeadProject(initialProject)
                  ? harvesting || !initialProject.id
                  : harvesting || !clientMailFolder?.id || !account
              }
            />
          </legend>
          <div className="main-contact-fields">
            <label>
              Name
              <input name="mainContactName" value={values.mainContactName} onChange={handleChange} />
            </label>
            <label>
              Email
              <input
                type="email"
                name="mainContactEmail"
                value={values.mainContactEmail}
                onChange={handleChange}
              />
            </label>
          </div>
          {!account && configured && (
            <p className="muted main-contact-hint">
              Connect Microsoft email in Settings to harvest from the client mail folder.
            </p>
          )}
          {account && !clientMailFolder && !(
            mode === 'edit' && initialProject && isProspectLeadProject(initialProject)
          ) && (
            <p className="muted main-contact-hint">
              Assign a client mail folder above, then use Harvest to fill name and email from its
              messages.
            </p>
          )}
          {account &&
            mode === 'edit' &&
            initialProject &&
            isProspectLeadProject(initialProject) && (
              <p className="muted main-contact-hint">
                Use Harvest to fill the main contact from this card&apos;s stored Communication
                Summary emails.
              </p>
            )}
          {harvestError && <p className="form-error">{harvestError}</p>}
          {harvestMessage && <p className="muted project-form-harvest-result">{harvestMessage}</p>}
        </fieldset>
        <label className="full-width">
          AI context
          <textarea name="aiContext" value={values.aiContext} onChange={handleChange} rows={3} />
        </label>
        <label>
          Action with
          <select name="nextActionOwner" value={values.nextActionOwner} onChange={handleChange}>
            <option value="">—</option>
            <option value="HSL">HSL</option>
            <option value="Client">Client</option>
          </select>
        </label>
        <label className="full-width">
          Next action summary
          <textarea
            name="nextActionSummary"
            value={values.nextActionSummary}
            onChange={handleChange}
            rows={2}
          />
        </label>
        {mode === 'edit' && (
          <label className="full-width">
            Latest status summary
            <textarea
              name="latestStatusSummary"
              value={values.latestStatusSummary}
              onChange={handleChange}
              rows={2}
            />
          </label>
        )}
        <label>
          Attention (traffic light)
          <select name="attention" value={values.attention || 'green'} onChange={handleChange}>
            <option value="clear">Clear — no flag</option>
            <option value="green">Green — steady</option>
            <option value="orange">Yellow — needs attention</option>
            <option value="red">Red — urgent</option>
          </select>
        </label>
        <label className="full-width">
          {mode === 'add' ? 'Starting silo' : 'Silo'}
          <select name="siloId" value={values.siloId} onChange={handleChange}>
            {silos.map((s) => (
              <option key={s.id} value={s.id}>
                {siloTitleOverrides[s.id] ?? s.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {mode === 'add' ? 'Create project' : 'Save changes'}
        </button>
      </div>

      <MailFolderPickerModal
        open={folderPickerOpen}
        projectName={values.projectName}
        selectedFolder={clientMailFolder}
        onSelect={handleFolderSelect}
        onClose={() => setFolderPickerOpen(false)}
      />
    </form>
  )
}
