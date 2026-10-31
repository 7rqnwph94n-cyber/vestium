// ─── Shared Pipeline Utilities ────────────────────────────────────────────────
// Extracted from sopJobRunner.ts for reuse by all sequential content-type
// pipelines (RAMS, permits, toolbox talks, etc.).
//
// The module pipeline (parallel DAG) does NOT use these — it has its own
// wave executor in jobRunner.ts.

import { createHash } from 'crypto';
import type { z } from 'zod';
import { sql } from '../db/client.js';
import type { AIClient } from './aiClient.js';
import type { StepResult } from './types.js';
import type { JobStepEvent } from './jobRunner.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Minimal job state contract for sequential pipelines. */
export interface SequentialJobState {
  steps: Record<string, StepResult>;
  currentStepKey: string;
  actualTokensUsed: number;
}

// ─── Retry-aware sequential step runner ──────────────────────────────────────
// Runs one AI call with retry on parse/network failures.
// Abort cancellations are re-thrown immediately without retry.

export async function runSequentialStep<T>(opts: {
  client: AIClient;
  stepKey: string;
  prompt: { system: string; user: string };
  schema: z.ZodType<T>;
  toolName: string;
  maxTokens: number;
  model?: string;
  job: SequentialJobState;
  onEvent: (event: JobStepEvent) => void;
  onPersist: () => Promise<void>;
  signal: AbortSignal;
  maxRetries?: number;
}): Promise<T> {
  const { client, stepKey, prompt, schema, toolName, maxTokens, model, job, onEvent, onPersist, signal } = opts;
  const maxRetries = opts.maxRetries ?? 2;

  if (signal.aborted) throw new Error('Generation cancelled');

  job.steps[stepKey].status = 'running';
  job.currentStepKey = stepKey;
  onEvent({ event: 'step_started', stepKey });

  let lastErr: unknown;
  let retryCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) throw new Error('Generation cancelled');
    try {
      const result = await client.callStructuredJson({
        system: prompt.system,
        user: prompt.user,
        maxTokens,
        model,
        schema,
        toolName,
        schemaLabel: stepKey,
        signal,
      });

      const stepResult: StepResult = {
        stepKey,
        status: 'done',
        rawOutput: result.rawOutput,
        parsedJson: result.parsed,
        validationErrors: [],
        tokensUsed: result.inputTokens + result.outputTokens,
        retryCount,
      };
      job.steps[stepKey] = stepResult;
      job.actualTokensUsed += stepResult.tokensUsed;

      await onPersist();
      onEvent({ event: 'step_done', stepKey, parsedJson: result.parsed, tokensUsed: stepResult.tokensUsed });

      return result.parsed;
    } catch (err) {
      lastErr = err;
      if (signal.aborted) throw err;
      if (attempt < maxRetries) {
        retryCount++;
        const delay = 1500 * Math.pow(2, attempt);
        await new Promise<void>((res) => setTimeout(res, delay));
      }
    }
  }

  const error = lastErr instanceof Error ? lastErr.message : String(lastErr);
  job.steps[stepKey].status = 'error';
  job.steps[stepKey].rawOutput = error;
  onEvent({ event: 'step_error', stepKey, error });
  throw lastErr;
}

// ─── Content hash ────────────────────────────────────────────────────────────

/** SHA-256 of JSON-serialized content. Used as evidentiary anchor. */
export function computeContentHash(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(content))
    .digest('hex');
}

// ─── Job state upsert ────────────────────────────────────────────────────────
// Generic upsert for content_generation_jobs (keyed on registry_id).

export async function upsertContentJobState(
  registryId: string,
  orgId: string,
  userId: string,
  status: 'running' | 'complete' | 'failed',
  jobState: unknown,
  error: string | null,
  completedAt?: string,
): Promise<void> {
  await sql`
    INSERT INTO content_generation_jobs (registry_id, org_id, user_id, status, job_state, error, completed_at)
    VALUES (
      ${registryId}, ${orgId}, ${userId}, ${status},
      ${JSON.stringify(jobState)}, ${error},
      ${completedAt ?? null}
    )
    ON CONFLICT (registry_id) DO UPDATE SET
      status       = EXCLUDED.status,
      job_state    = EXCLUDED.job_state,
      error        = EXCLUDED.error,
      completed_at = EXCLUDED.completed_at,
      updated_at   = now()
  `;
}
