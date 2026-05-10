import Anthropic from '@anthropic-ai/sdk'

// We use GOTPLANS_ANTHROPIC_KEY (not ANTHROPIC_API_KEY) because the user's shell
// may already define ANTHROPIC_API_KEY (e.g. from Claude Code), which would shadow
// the value in .env.local — Next.js doesn't override existing process.env vars.
const apiKey = process.env.GOTPLANS_ANTHROPIC_KEY
if (!apiKey) {
  throw new Error('GOTPLANS_ANTHROPIC_KEY is not set in .env.local')
}

export const anthropic = new Anthropic({ apiKey })
