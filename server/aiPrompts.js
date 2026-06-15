/** Server entry — re-exports shared prompts and API config. */

export {
  BATCH_SIZE,
  PROMPT_VARIANTS,
  PROJECT_USER_PLACEHOLDERS,
  PROSPECT_USER_PLACEHOLDERS,
  DEFAULT_PROJECT_SYSTEM_PROMPT,
  DEFAULT_PROJECT_USER_PROMPT_TEMPLATE,
  DEFAULT_PROSPECT_SYSTEM_PROMPT,
  DEFAULT_PROSPECT_USER_PROMPT_TEMPLATE,
  normalizePromptVariant,
  formatEmailsAsText,
  renderProjectUserPrompt,
  renderProspectUserPrompt,
  resolvePromptSet,
  getDefaultPromptConfig,
  mergePromptOverrides,
} from '../src/aiPromptsShared.js'

import { getDefaultPromptConfig } from '../src/aiPromptsShared.js'

export function getAiPromptConfig(env = process.env) {
  const defaults = getDefaultPromptConfig()
  return {
    model: env.OPENAI_MODEL || 'gpt-4o-mini',
    batchSize: 12,
    hasApiKey: Boolean(env.OPENAI_API_KEY),
    ...defaults,
    systemPrompt: defaults.project.systemPrompt,
    userPromptExample: defaults.project.userPromptExample,
  }
}
