import { useState } from 'react'
import { DEFAULT_SECTOR_ITEMS } from '../sectorDefaults.js'
import { DEFAULT_TECH_STACK_ITEMS } from '../techStackDefaults.js'
import AISettingsSection from '../components/AISettingsSection.jsx'
import CommunicationSummaryColorsSection from '../components/CommunicationSummaryColorsSection.jsx'
import EmailSettingsSection from '../components/EmailSettingsSection.jsx'
import HarvestExclusionsSection from '../components/HarvestExclusionsSection.jsx'
import LookupSection from '../components/LookupSection.jsx'
import LightsSettingsSection from '../components/LightsSettingsSection.jsx'
import MigrationSettingsSection from '../components/MigrationSettingsSection.jsx'
import UsersSettingsSection from '../components/UsersSettingsSection.jsx'

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'users', label: 'Users' },
  { id: 'email', label: 'Email' },
  { id: 'ai', label: 'AI' },
  { id: 'migration', label: 'Migration' },
]

export default function SettingsPage() {
  const [settingsTab, setSettingsTab] = useState('general')

  return (
    <div className="systems-page settings-page">
      <div className="systems-toolbar">
        <h2 className="systems-heading">Settings</h2>
        <p className="systems-intro muted">
          Lookups, Microsoft email, and OpenAI for communication summaries.
        </p>
      </div>

      <div className="detail-tabs settings-tabs" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-selected={settingsTab === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            className="detail-tab"
            onClick={() => setSettingsTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="detail-tab-panels settings-tab-panels">
        {settingsTab === 'general' && (
          <div
            id="settings-panel-general"
            role="tabpanel"
            aria-labelledby="settings-tab-general"
            className="detail-tab-panel settings-tab-panel"
          >
            <HarvestExclusionsSection />

            <LightsSettingsSection />

            <LookupSection
              collectionName="techStackLookup"
              title="Tech stack"
              intro="Checked items appear when editing a project’s tech stack."
              defaultItems={DEFAULT_TECH_STACK_ITEMS}
              namePlaceholder="New technology name"
              removeConfirm="Remove this tech stack option? Existing projects keep saved values."
              seedConfirm="Add any missing default tech items? Duplicates by name are not added."
            />

            <LookupSection
              collectionName="sectorLookup"
              title="Sector"
              intro="Sectors listed here appear as checkboxes on projects. Manual sectors typed on a project are added here automatically."
              defaultItems={DEFAULT_SECTOR_ITEMS}
              namePlaceholder="New sector name"
              removeConfirm="Remove this sector option? Existing projects keep saved values."
              seedConfirm="Add any missing default sectors? Duplicates by name are not added."
            />
          </div>
        )}

        {settingsTab === 'users' && (
          <div
            id="settings-panel-users"
            role="tabpanel"
            aria-labelledby="settings-tab-users"
            className="detail-tab-panel settings-tab-panel"
          >
            <UsersSettingsSection />
          </div>
        )}

        {settingsTab === 'email' && (
          <div
            id="settings-panel-email"
            role="tabpanel"
            aria-labelledby="settings-tab-email"
            className="detail-tab-panel settings-tab-panel"
          >
            <EmailSettingsSection />

            <CommunicationSummaryColorsSection />
          </div>
        )}

        {settingsTab === 'ai' && (
          <div
            id="settings-panel-ai"
            role="tabpanel"
            aria-labelledby="settings-tab-ai"
            className="detail-tab-panel settings-tab-panel"
          >
            <AISettingsSection />
          </div>
        )}

        {settingsTab === 'migration' && (
          <div
            id="settings-panel-migration"
            role="tabpanel"
            aria-labelledby="settings-tab-migration"
            className="detail-tab-panel settings-tab-panel"
          >
            <MigrationSettingsSection />
          </div>
        )}
      </div>
    </div>
  )
}
