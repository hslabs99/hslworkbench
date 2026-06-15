import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MicrosoftAuthProvider } from './MicrosoftAuthContext.jsx'
import { AttentionLightsProvider } from './AttentionLightsContext.jsx'
import { CommunicationSummaryColorsProvider } from './CommunicationSummaryColorsContext.jsx'
import { AiPromptSettingsProvider } from './AiPromptSettingsContext.jsx'
import { EmailSummaryLastProvider } from './EmailSummaryLastContext.jsx'
import App from './App.jsx'
import './App.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MicrosoftAuthProvider>
      <AttentionLightsProvider>
        <CommunicationSummaryColorsProvider>
          <AiPromptSettingsProvider>
            <EmailSummaryLastProvider>
              <App />
            </EmailSummaryLastProvider>
          </AiPromptSettingsProvider>
        </CommunicationSummaryColorsProvider>
      </AttentionLightsProvider>
    </MicrosoftAuthProvider>
  </StrictMode>,
)
