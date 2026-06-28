import { OPENAI_SECRET_ID } from './secrets.js'

/** User-facing hint when OPENAI_API_KEY is missing (dev vs App Hosting). */
export function openAiKeyMissingMessage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      `OpenAI key not available. Check Secret Manager secret "${OPENAI_SECRET_ID}" and App Hosting grantaccess, then redeploy.`
    )
  }
  return (
    `OpenAI key not available. Ensure secret "${OPENAI_SECRET_ID}" exists in Google Secret Manager ` +
    'and run: gcloud auth application-default login — then restart npm run dev.'
  )
}
