import type { AIClient, AICredentialsStore } from './aiClient';
import {
  createAnthropicAIClient,
  getStoredApiKey as getStoredAnthropicApiKey,
  saveApiKey as saveAnthropicApiKey,
  clearApiKey as clearAnthropicApiKey,
  testApiKey as testAnthropicApiKey
} from './anthropicClient';

export type AIProviderId = 'anthropic';

export const DEFAULT_AI_PROVIDER: AIProviderId = 'anthropic';

export function createAIClient(apiKey: string, providerId: AIProviderId = DEFAULT_AI_PROVIDER): AIClient {
  switch (providerId) {
    case 'anthropic':
    default:
      return createAnthropicAIClient(apiKey);
  }
}

export function getCredentialsStore(
  providerId: AIProviderId = DEFAULT_AI_PROVIDER
): AICredentialsStore {
  switch (providerId) {
    case 'anthropic':
    default:
      return {
        getStoredApiKey: getStoredAnthropicApiKey,
        saveApiKey: saveAnthropicApiKey,
        clearApiKey: clearAnthropicApiKey,
        testApiKey: testAnthropicApiKey
      };
  }
}
