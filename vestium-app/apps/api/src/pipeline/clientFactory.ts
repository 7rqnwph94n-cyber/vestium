// ─── Server-side AI client factory ───────────────────────────────────────────
// Simplified version of the browser clientFactory — no credentials store,
// no localStorage. API key always comes from the server environment.

import type { AIClient } from './aiClient.js';
import { createAnthropicAIClient } from './anthropicClient.js';
import { createGeminiAIClient } from './geminiClient.js';
import { createMockAIClient } from './mockClient.js';

export type AIProviderId = 'anthropic' | 'gemini' | 'mock';

function toProvider(value: string | undefined): AIProviderId {
  if (value === 'mock') return 'mock';
  return value === 'gemini' ? 'gemini' : 'anthropic';
}

export const DEFAULT_AI_PROVIDER: AIProviderId = toProvider(process.env.PIPELINE_AI_PROVIDER);

export function createAIClient(providerId: AIProviderId = DEFAULT_AI_PROVIDER): AIClient {
  if (process.env.PIPELINE_FORCE_MOCK === 'true') {
    return createMockAIClient();
  }
  switch (providerId) {
    case 'mock':
      return createMockAIClient();
    case 'gemini':
      return createGeminiAIClient();
    case 'anthropic':
    default:
      return createAnthropicAIClient(); // reads ANTHROPIC_API_KEY from process.env
  }
}
