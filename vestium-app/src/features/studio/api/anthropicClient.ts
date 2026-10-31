import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import type {
  AIClient,
  AIStreamRequest,
  AIStreamResult,
  AIStructuredRequest,
  AIStructuredResult
} from './aiClient';

const STUDIO_API_KEY_KEY = 'curriculum-studio-anthropic-key';

function getEnvApiKey(): string {
  try {
    return (import.meta.env.VITE_ANTHROPIC_API_KEY ?? '').trim();
  } catch {
    return '';
  }
}

export function getStoredApiKey(): string {
  try {
    const localKey = (localStorage.getItem(STUDIO_API_KEY_KEY) ?? '').trim();
    if (localKey) return localKey;
    return getEnvApiKey();
  } catch {
    return getEnvApiKey();
  }
}

export function saveApiKey(key: string): void {
  try {
    localStorage.setItem(STUDIO_API_KEY_KEY, key.trim());
  } catch {
    // ignore
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(STUDIO_API_KEY_KEY);
  } catch {
    // ignore
  }
}

export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey: apiKey.trim(),
    dangerouslyAllowBrowser: true
  });
}

function zodErrorToMessage(label: string, issues: Array<{ path: (string | number)[]; message: string }>): string {
  const lines = issues.slice(0, 12).map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(root)';
    return `- ${path}: ${issue.message}`;
  });
  return `Structured output validation failed for ${label}:\n${lines.join('\n')}`;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

async function anthropicStreamText(
  client: Anthropic,
  request: AIStreamRequest
): Promise<AIStreamResult> {
  const { system, user, maxTokens, signal, onChunk } = request;
  const model = request.model ?? DEFAULT_MODEL;
  const chunks: string[] = [];

  const stream = await client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    },
    { signal }
  );

  for await (const event of stream) {
    if (signal?.aborted) {
      stream.abort();
      break;
    }
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text;
      chunks.push(text);
      onChunk(text);
    }
  }

  const fullText = chunks.join('');
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const finalMsg = await stream.finalMessage();
    inputTokens = finalMsg.usage.input_tokens;
    outputTokens = finalMsg.usage.output_tokens;
  } catch {
    // Usage may be unavailable on cancelled streams.
  }

  return { fullText, inputTokens, outputTokens };
}

async function anthropicCallStructuredJson<TSchema extends ZodTypeAny>(
  client: Anthropic,
  request: AIStructuredRequest<TSchema>
): Promise<AIStructuredResult<TSchema>> {
  const { system, user, maxTokens, schema, toolName, schemaLabel, signal } = request;
  const model = request.model ?? DEFAULT_MODEL;

  const response = await client.messages.create(
    {
      model,
      max_tokens: maxTokens,
      system: `${system}\n\nYou MUST respond by calling the tool "${toolName}" exactly once. The tool input must be the COMPLETE JSON object exactly as described — preserve all top-level wrapper keys.`,
      messages: [{ role: 'user', content: user }],
      tools: [
        {
          name: toolName,
          description: `Return structured JSON for ${schemaLabel}`,
          input_schema: {
            type: 'object',
            additionalProperties: true
          }
        }
      ],
      tool_choice: {
        type: 'tool',
        name: toolName
      }
    },
    { signal }
  );

  const toolUseBlock = response.content.find(
    (block) => block.type === 'tool_use' && block.name === toolName
  ) as { type: 'tool_use'; input: unknown; name: string } | undefined;

  if (!toolUseBlock) {
    const textBlocks = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    throw new Error(
      `Model did not return tool output for ${schemaLabel}. Raw text: ${textBlocks.slice(0, 300)}`
    );
  }

  const validated = schema.safeParse(toolUseBlock.input);
  if (!validated.success) {
    // Recovery: the model sometimes returns the inner object without its wrapper key
    // (e.g. { items: [...] } instead of { factCheck: { items: [...] } }).
    // If the schema is a single-key ZodObject, try wrapping the raw input in that key.
    if (schema instanceof z.ZodObject) {
      const topKeys = Object.keys((schema as z.ZodObject<z.ZodRawShape>).shape);
      if (topKeys.length === 1) {
        const recovered = schema.safeParse({ [topKeys[0]]: toolUseBlock.input });
        if (recovered.success) {
          return {
            parsed: recovered.data as z.infer<TSchema>,
            rawOutput: JSON.stringify(recovered.data, null, 2),
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens
          };
        }
      }
    }
    throw new Error(zodErrorToMessage(schemaLabel, validated.error.issues));
  }

  return {
    parsed: validated.data as z.infer<TSchema>,
    rawOutput: JSON.stringify(validated.data, null, 2),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens
  };
}

export function createAnthropicAIClient(apiKey: string): AIClient {
  const rawClient = createAnthropicClient(apiKey);
  return {
    providerId: 'anthropic',
    streamText: (request) => anthropicStreamText(rawClient, request),
    callStructuredJson: (request) => anthropicCallStructuredJson(rawClient, request)
  };
}

// Test that the key is valid with a minimal API call
export async function testApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = createAnthropicClient(apiKey);
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }]
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('401') || message.toLowerCase().includes('authentication')) {
      return { ok: false, error: 'Invalid API key. Check it in the Anthropic console.' };
    }
    return { ok: false, error: message };
  }
}
