import type { ZodTypeAny } from 'zod';

export interface AIStreamRequest {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
}

export interface AIStructuredRequest<TSchema extends ZodTypeAny> {
  system: string;
  user: string;
  maxTokens: number;
  schema: TSchema;
  toolName: string;
  schemaLabel: string;
  model?: string;
  signal?: AbortSignal;
}

export interface AIStreamResult {
  fullText: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AIStructuredResult<TSchema extends ZodTypeAny> {
  parsed: TSchema['_output'];
  rawOutput: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AIClient {
  providerId: string;
  streamText: (request: AIStreamRequest) => Promise<AIStreamResult>;
  callStructuredJson: <TSchema extends ZodTypeAny>(
    request: AIStructuredRequest<TSchema>
  ) => Promise<AIStructuredResult<TSchema>>;
}

export interface AICredentialsStore {
  getStoredApiKey: () => string;
  saveApiKey: (key: string) => void;
  clearApiKey: () => void;
  testApiKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
}
