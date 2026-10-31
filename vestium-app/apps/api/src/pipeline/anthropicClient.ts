// ─── Server-side Anthropic client ────────────────────────────────────────────
// Node.js version of the AI client — no browser APIs, no localStorage,
// no dangerouslyAllowBrowser. API key comes from process.env only.
//
// This is a direct port of src/features/studio/api/anthropicClient.ts
// with all browser-specific code removed.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import type {
  AIClient,
  AIStreamRequest,
  AIStreamResult,
  AIStructuredRequest,
  AIStructuredResult
} from './aiClient.js';

export function getServerApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  if (!key) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  return key;
}

export function createAnthropicClient(apiKey?: string): Anthropic {
  return new Anthropic({ apiKey: apiKey ?? getServerApiKey() });
}

function zodErrorToMessage(label: string, issues: Array<{ path: (string | number)[]; message: string }>): string {
  const lines = issues.slice(0, 12).map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(root)';
    return `- ${path}: ${issue.message}`;
  });
  return `Structured output validation failed for ${label}:\n${lines.join('\n')}`;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// ─── Minimal JSON Schema from Zod ────────────────────────────────────────────
// Generates a top-level JSON Schema hint from a Zod schema so the Anthropic tool
// definition tells the model exactly what keys to return.  Without this, the model
// sometimes returns `{}` when `input_schema` is just `{ type: 'object' }`.

function zodToMinimalType(schema: ZodTypeAny, depth = 0): Record<string, unknown> {
  if (depth > 3) return {};
  if (schema instanceof z.ZodEffects) return zodToMinimalType(schema._def.schema, depth);
  if (schema instanceof z.ZodArray) {
    const itemSchema = schema._def.type as ZodTypeAny;
    return { type: 'array', items: zodToMinimalType(itemSchema, depth + 1) };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodObject && depth > 0) {
    // For nested objects, include property names so the model knows the expected shape
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape as Record<string, ZodTypeAny>;
    const keys = Object.keys(shape);
    if (keys.length > 0 && keys.length <= 12) {
      const properties: Record<string, unknown> = {};
      for (const key of keys) properties[key] = zodToMinimalType(shape[key], depth + 1);
      return { type: 'object', properties, required: keys.filter(k => {
        const v = shape[k];
        return !(v instanceof z.ZodOptional);
      }) };
    }
    return { type: 'object' };
  }
  if (schema instanceof z.ZodObject) return { type: 'object' };
  if (schema instanceof z.ZodRecord) return { type: 'object' };
  if (schema instanceof z.ZodEnum) {
    const vals = (schema as z.ZodEnum<[string, ...string[]]>)._def.values;
    return { type: 'string', enum: vals };
  }
  if (schema instanceof z.ZodUnion) return {};
  if (schema instanceof z.ZodOptional) return zodToMinimalType(schema._def.innerType, depth);
  if (schema instanceof z.ZodDefault) return zodToMinimalType(schema._def.innerType, depth);
  return {};
}

function zodToInputSchema(schema: ZodTypeAny): Record<string, unknown> {
  // Unwrap ZodEffects (preprocess, transform, refine) to reach the inner ZodObject
  let inner: ZodTypeAny = schema;
  for (let i = 0; i < 5 && inner instanceof z.ZodEffects; i++) {
    inner = inner._def.schema;
  }
  if (inner instanceof z.ZodObject) {
    const shape = (inner as z.ZodObject<z.ZodRawShape>).shape as Record<string, ZodTypeAny>;
    const keys = Object.keys(shape);
    if (keys.length > 0) {
      const properties: Record<string, unknown> = {};
      for (const key of keys) {
        properties[key] = zodToMinimalType(shape[key]);
      }
      return { type: 'object' as const, properties, required: keys };
    }
  }
  return { type: 'object' as const, additionalProperties: true };
}

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
      system: [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }],
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
    const cacheCreated = finalMsg.usage.cache_creation_input_tokens ?? 0;
    const cacheRead = finalMsg.usage.cache_read_input_tokens ?? 0;
    if (cacheCreated || cacheRead) {
      console.log(`[cache] stream: created=${cacheCreated} read=${cacheRead} input=${inputTokens}`);
    }
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

  const derivedInputSchema = zodToInputSchema(schema);

  const response = await client.messages.create(
    {
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text' as const, text: `${system}\n\nYou MUST respond by calling the tool "${toolName}" exactly once. Put ALL data inside the tool input — do not output JSON as text.`, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: user }],
      tools: [
        {
          name: toolName,
          description: `Return structured JSON for ${schemaLabel}`,
          input_schema: derivedInputSchema as Anthropic.Tool['input_schema'],
          cache_control: { type: 'ephemeral' as const }
        }
      ],
      tool_choice: {
        type: 'tool',
        name: toolName
      }
    },
    { signal }
  );

  // Log prompt cache stats
  const cacheCreated = response.usage.cache_creation_input_tokens ?? 0;
  const cacheRead = response.usage.cache_read_input_tokens ?? 0;
  if (cacheCreated || cacheRead) {
    console.log(`[cache] ${schemaLabel}: created=${cacheCreated} read=${cacheRead} input=${response.usage.input_tokens}`);
  }

  const toolUseBlock = response.content.find(
    (block) => block.type === 'tool_use' && block.name === toolName
  ) as { type: 'tool_use'; input: unknown; name: string } | undefined;

  // Fallback: if tool input is empty or missing, try parsing JSON from text blocks
  let effectiveInput = toolUseBlock?.input;
  const inputIsEmpty = !effectiveInput
    || (typeof effectiveInput === 'object' && !Array.isArray(effectiveInput) && Object.keys(effectiveInput as Record<string, unknown>).length === 0);

  if (inputIsEmpty) {
    console.warn(`[tool-input] ${schemaLabel}: empty tool input. stop_reason=${response.stop_reason}, content_blocks=${response.content.length}, model=${model}`);
  }

  if (inputIsEmpty) {
    const textBlocks = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { text: string }).text)
      .join('\n');
    if (textBlocks.trim()) {
      // Strip markdown fences if present
      const cleaned = textBlocks.replace(/^```(?:json)?\s*/gm, '').replace(/^```\s*$/gm, '').trim();
      try {
        effectiveInput = JSON.parse(cleaned);
      } catch {
        // Not valid JSON — fall through to validation error
      }
    }
    if (!toolUseBlock && !effectiveInput) {
      throw new Error(
        `Model did not return tool output for ${schemaLabel}. Raw text: ${textBlocks.slice(0, 300)}`
      );
    }
  }

  const validated = schema.safeParse(effectiveInput);
  if (!validated.success) {
    // Recovery: try wrapping input under the single expected top-level key
    let inner: ZodTypeAny = schema;
    for (let i = 0; i < 5 && inner instanceof z.ZodEffects; i++) inner = inner._def.schema;
    if (inner instanceof z.ZodObject) {
      const topKeys = Object.keys((inner as z.ZodObject<z.ZodRawShape>).shape);
      if (topKeys.length === 1) {
        const recovered = schema.safeParse({ [topKeys[0]]: effectiveInput });
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
    const inputSnap = JSON.stringify(effectiveInput, null, 2)?.slice(0, 800) ?? 'null';
    console.error(`[schema-debug] ${schemaLabel} validation failed.\n  keys: ${effectiveInput && typeof effectiveInput === 'object' ? Object.keys(effectiveInput as Record<string, unknown>).join(', ') : 'N/A'}\n  snapshot: ${inputSnap}`);
    throw new Error(zodErrorToMessage(schemaLabel, validated.error.issues));
  }

  return {
    parsed: validated.data as z.infer<TSchema>,
    rawOutput: JSON.stringify(validated.data, null, 2),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens
  };
}

export function createAnthropicAIClient(apiKey?: string): AIClient {
  const rawClient = createAnthropicClient(apiKey);
  return {
    providerId: 'anthropic',
    streamText: (request) => anthropicStreamText(rawClient, request),
    callStructuredJson: (request) => anthropicCallStructuredJson(rawClient, request)
  };
}
