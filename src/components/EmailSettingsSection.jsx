import MicrosoftConnectCard from './MicrosoftConnectCard.jsx'

export default function EmailSettingsSection() {
  return (
    <section className="lookup-section email-settings-section">
      <h3 className="lookup-section-title">Microsoft email</h3>
      <p className="lookup-section-intro muted">
        Connect your Microsoft 365 mailbox so the Communications tab can show messages matching
        each project&apos;s client contact email.
      </p>
      <MicrosoftConnectCard />
    </section>
  )
}
