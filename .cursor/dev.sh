#!/usr/bin/env bash
#
# Dev server launcher for hsl-workbench in Cloud Agent environments.
#
# Local dev normally loads the OpenAI and SendGrid API keys from Google Secret
# Manager (see server/secrets.js), which requires Application Default
# Credentials (`gcloud auth application-default login`). In a Cloud Agent VM
# those credentials are absent, and the google-gax client surfaces the failure
# as an *unhandled* promise rejection that crashes the whole dev server on boot.
#
# To keep the dev server up we export inert placeholder keys — but ONLY when a
# real value has not already been provided (e.g. via a Cursor secret injected as
# an env var). A non-empty key makes server/secrets.js skip the Secret Manager
# call entirely, avoiding the crash. Real keys always take precedence and enable
# the AI-summary and SendGrid features for real.
set -euo pipefail

cd "$(dirname "$0")/.."

export OPENAI_API_KEY="${OPENAI_API_KEY:-local-dev-openai-key-unset}"
export SENDGRID_API_KEY="${SENDGRID_API_KEY:-local-dev-sendgrid-key-unset}"

exec npm run dev
