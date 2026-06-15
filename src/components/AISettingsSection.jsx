import { useEffect, useRef, useState } from 'react'
import {
  getDefaultAiPromptFields,
  resetAiPromptSettings,
  saveAiPromptSettings,
} from '../aiPromptSettings.js'
import { fetchAiConfig, testOpenAIConnection } from '../openaiCommunicationSummary.js'
import { subscribeAiPromptSettings } from '../aiPromptSettings.js'
import { formatFirestoreError } from '../firestoreErrors.js'

function PromptEditor({ title, intro, placeholders, systemPrompt, userPromptTemplate, onChange }) {
  return (
    <div className="systems-card ai-settings-card ai-prompt-editor">
      <h3 className="lookup-section-title">{title}</h3>
      {intro && <p className="muted ai-settings-hint">{intro}</p>}

      <label className="ai-prompt-field">
        System prompt
        <textarea
          className="ai-prompt-textarea"
          value={systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
          rows={14}
          spellCheck={false}
        />
      </label>

      <label className="ai-prompt-field">
        User prompt template
        <textarea
          className="ai-prompt-textarea"
          value={userPromptTemplate}
          onChange={(e) => onChange({ userPromptTemplate: e.target.value })}
          rows={12}
          spellCheck={false}
        />
      </label>

      {placeholders?.length > 0 && (
        <p className="muted ai-settings-hint">
          Placeholders: {placeholders.join(', ')}. The <code>{'{{emails}}'}</code> block is filled
          with plain-text email details when scanning.
        </p>
      )}
    </div>
  )
}

export default function AISettingsSection() {
  const [config, setConfig] = useState(null)
  const [configError, setConfigError] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState(null)
  const [testResult, setTestResult] = useState(null)

  const [projectSystemPrompt, setProjectSystemPrompt] = useState('')
  const [projectUserPromptTemplate, setProjectUserPromptTemplate] = useState('')
  const [prospectSystemPrompt, setProspectSystemPrompt] = useState('')
  const [prospectUserPromptTemplate, setProspectUserPromptTemplate] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    let cancelled = false
    fetchAiConfig()
      .then((data) => {
        if (!cancelled) setConfig(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setConfigError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsub = subscribeAiPromptSettings(
      (data) => {
        if (dirtyRef.current) return
        const merged = data.merged
        setProjectSystemPrompt(merged.projectSystemPrompt)
        setProjectUserPromptTemplate(merged.projectUserPromptTemplate)
        setProspectSystemPrompt(merged.prospectSystemPrompt)
        setProspectUserPromptTemplate(merged.prospectUserPromptTemplate)
        setSettingsLoading(false)
        setSettingsError(null)
        if (!dirty) setSaveMessage(null)
      },
      (err) => {
        setSettingsError(formatFirestoreError(err))
        setSettingsLoading(false)
      },
    )
    return unsub
  }, [])

  async function handleTest() {
    setTesting(true)
    setTestError(null)
    setTestResult(null)
    try {
      const data = await testOpenAIConnection()
      setTestResult(data)
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaveBusy(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      await saveAiPromptSettings({
        projectSystemPrompt,
        projectUserPromptTemplate,
        prospectSystemPrompt,
        prospectUserPromptTemplate,
      })
      setDirty(false)
      setSaveMessage('Prompts saved.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaveBusy(false)
    }
  }

  async function handleResetDefaults() {
    if (
      !window.confirm(
        'Reset all AI prompts to built-in defaults? Your saved custom prompts will be cleared.',
      )
    ) {
      return
    }
    setSaveBusy(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      await resetAiPromptSettings()
      const defaults = getDefaultAiPromptFields()
      setProjectSystemPrompt(defaults.projectSystemPrompt)
      setProjectUserPromptTemplate(defaults.projectUserPromptTemplate)
      setProspectSystemPrompt(defaults.prospectSystemPrompt)
      setProspectUserPromptTemplate(defaults.prospectUserPromptTemplate)
      setDirty(false)
      setSaveMessage('Restored built-in default prompts.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaveBusy(false)
    }
  }

  return (
    <div className="settings-tab-content ai-settings">
      <p className="lookup-section-intro muted">
        Edit plain-text system and user prompts for email scanning. Existing projects use project
        context; prospect projects (Unassigned lead queue) use separate triage prompts with no
        project scope.
      </p>

      <div className="systems-card ai-settings-card">
        <h4 className="ai-settings-subheading">Connection</h4>
        <p className="muted ai-settings-hint">
          Key: <code>OPENAI_API_KEY</code> in <code>.env.local</code> (server only). Model:{' '}
          <code>OPENAI_MODEL</code> (default <code>gpt-4o-mini</code>). Restart{' '}
          <code>npm run dev</code> after env changes.
        </p>

        {config && (
          <p className="muted ai-settings-meta">
            {config.hasApiKey ? (
              <>
                API key detected · model <strong>{config.model}</strong> · batch size{' '}
                {config.batchSize}
              </>
            ) : (
              <span className="form-error" style={{ display: 'inline' }}>
                OPENAI_API_KEY not loaded — add to .env.local and restart dev server.
              </span>
            )}
          </p>
        )}

        <button
          type="button"
          className="btn-primary btn-small"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? 'Testing…' : 'Test OpenAI connection'}
        </button>

        {testResult && (
          <p className="ai-settings-ok">
            Connected — model <strong>{testResult.model}</strong>
            {testResult.reply ? ` (reply: ${testResult.reply})` : ''}
          </p>
        )}
        {testError && <p className="form-error">{testError}</p>}
        {configError && <p className="form-error">{configError}</p>}
      </div>

      {settingsLoading && <p className="muted">Loading saved prompts…</p>}
      {settingsError && <p className="form-error">{settingsError}</p>}

      {config && !settingsLoading && (
        <>
          <PromptEditor
            title="Existing projects"
            intro="Used when scanning assigned projects with a client folder, company name, and optional AI context."
            placeholders={config.project?.placeholders}
            systemPrompt={projectSystemPrompt}
            userPromptTemplate={projectUserPromptTemplate}
            onChange={({ systemPrompt, userPromptTemplate }) => {
              setDirty(true)
              if (systemPrompt !== undefined) setProjectSystemPrompt(systemPrompt)
              if (userPromptTemplate !== undefined) setProjectUserPromptTemplate(userPromptTemplate)
            }}
          />

          <PromptEditor
            title="Prospect projects"
            intro="Used for the Unassigned lead queue before a lead becomes a full project. No project name, client, or scope is sent."
            placeholders={config.prospect?.placeholders}
            systemPrompt={prospectSystemPrompt}
            userPromptTemplate={prospectUserPromptTemplate}
            onChange={({ systemPrompt, userPromptTemplate }) => {
              setDirty(true)
              if (systemPrompt !== undefined) setProspectSystemPrompt(systemPrompt)
              if (userPromptTemplate !== undefined) setProspectUserPromptTemplate(userPromptTemplate)
            }}
          />

          <div className="ai-prompt-save-row">
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saveBusy || !dirty}
            >
              {saveBusy ? 'Saving…' : 'Save prompts'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetDefaults}
              disabled={saveBusy}
            >
              Reset to defaults
            </button>
            {saveMessage && <span className="ai-settings-ok">{saveMessage}</span>}
            {saveError && <span className="form-error">{saveError}</span>}
          </div>
        </>
      )}
    </div>
  )
}
