/** Turn OpenAI SDK errors into clearer messages for the UI. */
export function formatOpenAIError(err) {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (lower.includes('quota') || lower.includes('429')) {
    return (
      'OpenAI quota exceeded — your API key works but the account has no remaining credits or hit its spending limit. ' +
      'Add payment method / credits at https://platform.openai.com/account/billing and check usage at ' +
      'https://platform.openai.com/usage — then run the test again.'
    )
  }

  if (lower.includes('401') || lower.includes('incorrect api key') || lower.includes('invalid_api_key')) {
    return (
      'Invalid OpenAI API key. Create or copy a key from https://platform.openai.com/api-keys into ' +
      'OPENAI_API_KEY in .env.local, then restart npm run dev.'
    )
  }

  if (lower.includes('rate limit') || lower.includes('429')) {
    return `OpenAI rate limit — wait a moment and retry. (${msg})`
  }

  return msg
}
