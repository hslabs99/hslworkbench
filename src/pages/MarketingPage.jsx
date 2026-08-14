import { useState } from 'react'
import HarvestClientEmailsSection from '../components/HarvestClientEmailsSection.jsx'
import MailingAudiencesSection from '../components/MailingAudiencesSection.jsx'
import MailingCampaignsSection from '../components/MailingCampaignsSection.jsx'
import MailingExclusionsSection from '../components/MailingExclusionsSection.jsx'
import MailingTemplatesSection from '../components/MailingTemplatesSection.jsx'
import MasterClientListSection from '../components/MasterClientListSection.jsx'

const MARKETING_TABS = [
  { id: 'audiences', label: 'Audiences' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'templates', label: 'Email templates' },
  { id: 'harvest', label: 'Harvest emails' },
  { id: 'clients', label: 'Master client list' },
  { id: 'exclusions', label: 'Exclusions list' },
]

export default function MarketingPage() {
  const [tab, setTab] = useState('templates')

  return (
    <div className="systems-page marketing-page">
      <div className="systems-toolbar">
        <h2 className="systems-heading">Marketing</h2>
        <p className="systems-intro muted">
          Build email templates, audiences, and campaigns. Send via Outlook Graph (safer drip-feed
          from your mailbox) or SendGrid. Harvest and the master client list feed who you can mail.
          Unsubscribes go to the exclusions list.
        </p>
      </div>

      <div className="detail-tabs settings-tabs" role="tablist" aria-label="Marketing sections">
        {MARKETING_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`marketing-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`marketing-panel-${item.id}`}
            className="detail-tab"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="detail-tab-panels settings-tab-panels">
        {tab === 'audiences' && (
          <div
            id="marketing-panel-audiences"
            role="tabpanel"
            aria-labelledby="marketing-tab-audiences"
            className="detail-tab-panel settings-tab-panel"
          >
            <MailingAudiencesSection />
          </div>
        )}
        {tab === 'campaigns' && (
          <div
            id="marketing-panel-campaigns"
            role="tabpanel"
            aria-labelledby="marketing-tab-campaigns"
            className="detail-tab-panel settings-tab-panel"
          >
            <MailingCampaignsSection />
          </div>
        )}
        {tab === 'templates' && (
          <div
            id="marketing-panel-templates"
            role="tabpanel"
            aria-labelledby="marketing-tab-templates"
            className="detail-tab-panel settings-tab-panel"
          >
            <MailingTemplatesSection />
          </div>
        )}
        {tab === 'harvest' && (
          <div
            id="marketing-panel-harvest"
            role="tabpanel"
            aria-labelledby="marketing-tab-harvest"
            className="detail-tab-panel settings-tab-panel"
          >
            <HarvestClientEmailsSection />
          </div>
        )}
        {tab === 'clients' && (
          <div
            id="marketing-panel-clients"
            role="tabpanel"
            aria-labelledby="marketing-tab-clients"
            className="detail-tab-panel settings-tab-panel"
          >
            <MasterClientListSection />
          </div>
        )}
        {tab === 'exclusions' && (
          <div
            id="marketing-panel-exclusions"
            role="tabpanel"
            aria-labelledby="marketing-tab-exclusions"
            className="detail-tab-panel settings-tab-panel"
          >
            <MailingExclusionsSection />
          </div>
        )}
      </div>
    </div>
  )
}
