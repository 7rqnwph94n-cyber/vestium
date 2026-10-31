import type { ZodTypeAny } from 'zod';
import type { AIClient } from './aiClient';

export interface StreamCallOptions {
  client: AIClient;
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
}

export interface StreamResult {
  fullText: string;
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredCallOptions<TSchema extends ZodTypeAny> {
  client: AIClient;
  system: string;
  user: string;
  maxTokens: number;
  schema: TSchema;
  toolName: string;
  schemaLabel: string;
  model?: string;
  signal?: AbortSignal;
}

export async function streamText(options: StreamCallOptions): Promise<StreamResult> {
  return options.client.streamText({
    system: options.system,
    user: options.user,
    maxTokens: options.maxTokens,
    model: options.model,
    signal: options.signal,
    onChunk: options.onChunk
  });
}

export async function callStructuredJson<TSchema extends ZodTypeAny>(
  options: StructuredCallOptions<TSchema>
): Promise<{
  parsed: TSchema['_output'];
  rawOutput: string;
  inputTokens: number;
  outputTokens: number;
}> {
  return options.client.callStructuredJson({
    system: options.system,
    user: options.user,
    maxTokens: options.maxTokens,
    schema: options.schema,
    toolName: options.toolName,
    schemaLabel: options.schemaLabel,
    model: options.model,
    signal: options.signal
  });
}

// Attempt to parse JSON from raw streamed text.
// Some models occasionally emit a stray character before/after JSON.
export function parseJsonOutput(raw: string): unknown {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // fall through
    }
  }

  throw new Error(`Could not parse JSON from output. Raw output begins: ${trimmed.slice(0, 200)}`);
}
