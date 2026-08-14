import { OPENAI_SECRET_ID, SENDGRID_SECRET_ID } from './secrets.js'
import { isHostedRuntime } from './runtimeMode.js'

/** User-facing hint when OPENAI_API_KEY is missing (local vs App Hosting). */
export function openAiKeyMissingMessage() {
  if (isHostedRuntime()) {
    return (
      `OpenAI key not available. Check Secret Manager secret "${OPENAI_SECRET_ID}" and App Hosting grantaccess, then redeploy.`
    )
  }
  return (
    `OpenAI key not available. Ensure secret "${OPENAI_SECRET_ID}" exists in Google Secret Manager ` +
    'and run: gcloud auth application-default login — then restart npm run dev.'
  )
}

export function sendGridMissingMessage() {
  if (isHostedRuntime()) {
    return (
      `SendGrid is not configured on App Hosting. Set secret "${SENDGRID_SECRET_ID}" ` +
      '(maps to SENDGRID_API_KEY), grant the backend access, set SENDGRID_FROM_EMAIL, then redeploy.'
    )
  }
  return (
    'SendGrid is not configured. Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to .env.local and restart the dev server.'
  )
}
