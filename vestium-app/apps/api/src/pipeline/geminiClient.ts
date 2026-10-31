// ─── Server-side Gemini client ───────────────────────────────────────────────
// Uses Google Generative Language REST API directly (no SDK dependency).

import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import type {
  AIClient,
  AIStreamRequest,
  AIStreamResult,
  AIStructuredRequest,
  AIStructuredResult
} from './aiClient.js';

const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim() ?? '';
  if (!key) throw new Error('GEMINI_API_KEY environment variable is not set');
  return key;
}

function zodErrorToMessage(label: string, issues: Array<{ path: (string | number)[]; message: string }>): string {
  const lines = issues.slice(0, 12).map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(root)';
    return `- ${path}: ${issue.message}`;
  });
  return `Structured output validation failed for ${label}:\n${lines.join('\n')}`;
}

function extractTextFromGeminiResponse(json: unknown): string {
  const obj = json as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  return obj.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

function extractUsage(json: unknown): { inputTokens: number; outputTokens: number } {
  const obj = json as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
  return {
    inputTokens: obj.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: obj.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

// Repair the most common Gemini JSON malformation: missing commas between
// array string elements.  e.g. `"value"\n  "next"` → `"value",\n  "next"`
function repairMissingCommas(input: string): string {
  return input.replace(/(")\s*\n(\s*")/g, '$1,\n$2');
}

function parseJsonOutput(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
    }
    const obj = trimmed.match(/\{[\s\S]*\}/);
    if (obj) {
      try { return JSON.parse(obj[0]); } catch { /* fall through */ }
      // Attempt repair: Gemini sometimes omits commas between array string elements.
      try { return JSON.parse(repairMissingCommas(obj[0])); } catch { /* fall through */ }
    }
    throw new Error(`Could not parse JSON from Gemini output. Raw output begins: ${trimmed.slice(0, 240)}`);
  }
}

async function geminiGenerate(
  request: { system: string; user: string; maxTokens: number; model?: string; signal?: AbortSignal; searchGrounding?: boolean }
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const model = request.model ?? DEFAULT_MODEL;
  const key = getGeminiApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  // Search grounding: adds Google Search as a retrieval tool so Gemini can cite
  // live HSE guidance, legislation.gov.uk, and ACOP documents.
  // Uses 'googleSearch' (Gemini 2.0+); older 1.5 models use 'googleSearchRetrieval'.
  const tools = request.searchGrounding ? [{ googleSearch: {} }] : undefined;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: request.signal,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: request.system }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: request.user }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: request.maxTokens,
      },
      ...(tools ? { tools } : {}),
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Gemini request failed: ${errText}`);
  }

  const json = await response.json();
  const text = extractTextFromGeminiResponse(json);
  const usage = extractUsage(json);
  if (!text.trim()) {
    throw new Error('Gemini returned empty text response');
  }
  return { text, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

async function geminiStreamText(request: AIStreamRequest): Promise<AIStreamResult> {
  const { text, inputTokens, outputTokens } = await geminiGenerate(request);
  request.onChunk(text);
  return { fullText: text, inputTokens, outputTokens };
}

async function geminiCallStructuredJson<TSchema extends ZodTypeAny>(
  request: AIStructuredRequest<TSchema>
): Promise<AIStructuredResult<TSchema>> {
  const strictSystem = `${request.system}

You MUST return valid JSON only. No markdown, no prose.
The JSON must match this shape label: ${request.schemaLabel}.
Preserve required wrapper keys exactly.`;

  const { text, inputTokens, outputTokens } = await geminiGenerate({
    system: strictSystem,
    user: request.user,
    maxTokens: request.maxTokens,
    model: request.model,
    signal: request.signal,
    searchGrounding: request.searchGrounding,
  });

  const parsedRaw = parseJsonOutput(text);
  const validated = request.schema.safeParse(parsedRaw);
  if (!validated.success) {
    if (request.schema instanceof z.ZodObject) {
      const topKeys = Object.keys((request.schema as z.ZodObject<z.ZodRawShape>).shape);
      if (topKeys.length === 1) {
        const recovered = request.schema.safeParse({ [topKeys[0]]: parsedRaw });
        if (recovered.success) {
          return {
            parsed: recovered.data as z.infer<TSchema>,
            rawOutput: JSON.stringify(recovered.data, null, 2),
            inputTokens,
            outputTokens,
          };
        }
      }
    }
    throw new Error(zodErrorToMessage(request.schemaLabel, validated.error.issues));
  }

  return {
    parsed: validated.data as z.infer<TSchema>,
    rawOutput: JSON.stringify(validated.data, null, 2),
    inputTokens,
    outputTokens,
  };
}

export function createGeminiAIClient(): AIClient {
  return {
    providerId: 'gemini',
    streamText: geminiStreamText,
    callStructuredJson: geminiCallStructuredJson,
  };
}
