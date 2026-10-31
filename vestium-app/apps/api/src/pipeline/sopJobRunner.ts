// ─── SOP Generation Job Runner ────────────────────────────────────────────────
// Orchestrates the 4-step SOP pipeline sequentially:
//   sopExtract → sopRegulatoryMap → sopDraftBuild → sopFactCheck
//
// After completion, auto-seeds Cat A findings for any unattributed steps.

import { createHash } from 'crypto';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { createAIClient } from './clientFactory.js';
import type { JobStepEvent } from './jobRunner.js';
import type { StepResult } from './types.js';
import {
  makeInitialSopJob,
  SOP_STEP_SEQUENCE,
  type SopGenerationJob,
  type SopSourceDocContent,
  type SopExtractOutput,
  type SopRegulatoryMapOutput,
  type SopDraftBuildOutput,
  type SopFactCheckOutput,
} from './sopTypes.js';
import type { WorkplaceContext, WorkplaceClassificationResult } from '../regulatory/types.js';
import type { GroundTruth } from './types.js';
import {
  buildSopExtractPrompt,
  buildSopRegulatoryMapPrompt,
  buildSopDraftBuildPrompt,
  buildSopFactCheckPrompt,
} from './sopPrompts.js';

// ─── Zod schemas for each step output ────────────────────────────────────────

const sourceRefSchema = z.object({
  docTitle: z.string(),
  page: z.number().optional(),
  section: z.string().optional(),
  quote: z.string().optional(),
}).nullable();

const criticalValueSchema = z.object({
  label: z.string(),
  value: z.string(),
  unit: z.string().optional(),
});

const sopExtractSchema = z.object({
  sopExtract: z.object({
    equipment: z.string(),
    prerequisites: z.object({
      ppe: z.array(z.string()),
      conditions: z.array(z.string()),
      documents: z.array(z.string()),
    }),
    steps: z.array(z.object({
      stepNumber: z.number().int().positive(),
      action: z.string().min(1),
      warnings: z.array(z.string()).optional(),
      criticalValues: z.array(criticalValueSchema).optional(),
      sourceRef: sourceRefSchema,
    })),
    postProcedure: z.array(z.string()),
    emergencyActions: z.array(z.string()),
  }),
});

const sopRegulatoryMapSchema = z.object({
  sopRegulatoryMap: z.object({
    steps: z.array(z.object({
      stepNumber: z.number().int().positive(),
      safetyControls: z.array(z.string()),
      regulatoryBasis: z.array(z.string()),
    })),
    applicableRegulations: z.array(z.string()),
  }),
});

const sopDraftBuildSchema = z.object({
  sopDraftBuild: z.object({
    title: z.string().min(1),
    procedureName: z.string().min(1),
    equipment: z.string().min(1),
    scope: z.string().min(1),
    version: z.string(),
    applicableRegulations: z.array(z.string()),
    prerequisites: z.object({
      ppe: z.array(z.string()),
      conditions: z.array(z.string()),
      documents: z.array(z.string()),
    }),
    steps: z.array(z.object({
      stepNumber: z.number().int().positive(),
      action: z.string().min(1),
      safetyControls: z.array(z.string()),
      regulatoryBasis: z.array(z.string()),
      sourceRef: sourceRefSchema,
      criticalValues: z.array(criticalValueSchema).nullable().optional(),
      warnings: z.array(z.string()).nullable().optional(),
    })),
    postProcedure: z.array(z.string()),
    emergencyActions: z.array(z.string()),
  }),
});

const sopFactCheckSchema = z.object({
  sopFactCheck: z.object({
    steps: z.array(z.object({
      stepNumber: z.number().int().positive(),
      attributed: z.boolean(),
      confidence: z.enum(['high', 'medium', 'low']),
      note: z.string().nullable().optional(),
    })),
    unattributedCount: z.number().int().min(0),
    summary: z.string(),
  }),
});

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runSopGenerationJob(
  sopId: string,
  orgId: string,
  userId: string,
  onEvent: (event: JobStepEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  // Load SOP record + source documents
  const [sopRow] = await sql`
    SELECT s.title, s.procedure_name, s.equipment,
           s.workplace_context, s.regulatory_classification,
           s.module_id
    FROM sop_records s
    WHERE s.id = ${sopId} AND s.org_id = ${orgId}
  ` as Array<{
    title: string;
    procedure_name: string;
    equipment: string;
    workplace_context: WorkplaceContext;
    regulatory_classification: WorkplaceClassificationResult;
    module_id: string | null;
  }>;

  if (!sopRow) throw new Error('SOP record not found');

  const docRows = await sql`
    SELECT id, filename, doc_type, content
    FROM sop_source_documents
    WHERE sop_id = ${sopId}
    ORDER BY uploaded_at ASC
  ` as Array<{ id: string; filename: string; doc_type: string; content: string }>;

  const sourceDocuments: SopSourceDocContent[] = docRows.map((r) => ({
    id: r.id, filename: r.filename, docType: r.doc_type, content: r.content,
  }));

  // Optional: pull ground truth from parent module's job state
  let moduleGroundTruth: GroundTruth | undefined;
  if (sopRow.module_id) {
    const [modJob] = await sql`
      SELECT job_state FROM generation_jobs WHERE module_id = ${sopRow.module_id} LIMIT 1
    ` as Array<{ job_state: { groundTruth?: GroundTruth } }>;
    moduleGroundTruth = modJob?.job_state?.groundTruth;
  }

  const job = makeInitialSopJob(
    sopId,
    sopRow.title,
    sopRow.procedure_name,
    sopRow.equipment,
    sourceDocuments,
    sopRow.workplace_context,
    sopRow.regulatory_classification,
    moduleGroundTruth,
  );

  // Clear any prior failure metadata so a retry always starts clean.
  await sql`
    UPDATE sop_records
    SET generation_metadata = '{}', updated_at = now()
    WHERE id = ${sopId}
  `;

  await upsertSopJobState(sopId, orgId, userId, 'running', job, null);

  const client = createAIClient('anthropic');

  // ─── Step runner with retry ───────────────────────────────────────────────
  // Retries the AI call up to MAX_RETRIES times on parse/network failures.
  // Abort cancellations are re-thrown immediately without retry.

  const MAX_RETRIES = 2;

  async function runStep<T>(
    stepKey: string,
    prompt: { system: string; user: string },
    schema: z.ZodType<T>,
    toolName: string,
    maxTokens = 8000,
    model?: string,
  ): Promise<T> {
    if (signal.aborted) throw new Error('SOP generation cancelled');

    job.steps[stepKey].status = 'running';
    job.currentStepKey = stepKey;
    onEvent({ event: 'step_started', stepKey });

    let lastErr: unknown;
    let retryCount = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) throw new Error('SOP generation cancelled');
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
          stepKey, status: 'done',
          rawOutput: result.rawOutput,
          parsedJson: result.parsed,
          validationErrors: [],
          tokensUsed: result.inputTokens + result.outputTokens,
          retryCount,
        };
        job.steps[stepKey] = stepResult;
        job.actualTokensUsed += stepResult.tokensUsed;

        await upsertSopJobState(sopId, orgId, userId, 'running', job, null);
        onEvent({ event: 'step_done', stepKey, parsedJson: result.parsed, tokensUsed: stepResult.tokensUsed });

        return result.parsed;
      } catch (err) {
        lastErr = err;
        // Don't retry abort — propagate immediately
        if (signal.aborted) throw err;
        if (attempt < MAX_RETRIES) {
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
    await upsertSopJobState(sopId, orgId, userId, 'failed', job, error);
    throw lastErr;
  }

  try {
    // Step 1: Extract
    const extractResult = await runStep(
      'sopExtract',
      buildSopExtractPrompt(job),
      sopExtractSchema,
      'sop_extract',
      10000,
    );

    // Step 2: Regulatory map (Haiku — structured constraint matching)
    const mapResult = await runStep(
      'sopRegulatoryMap',
      buildSopRegulatoryMapPrompt(job, extractResult.sopExtract.steps),
      sopRegulatoryMapSchema,
      'sop_regulatory_map',
      6000,
      'claude-haiku-4-5-20251001',
    );

    // Step 3: Draft build
    const draftResult = await runStep(
      'sopDraftBuild',
      buildSopDraftBuildPrompt(job, extractResult.sopExtract, mapResult.sopRegulatoryMap),
      sopDraftBuildSchema,
      'sop_draft_build',
      12000,
    );

    // Step 4: Fact check (Haiku — binary attribution verification)
    const factCheckResult = await runStep(
      'sopFactCheck',
      buildSopFactCheckPrompt(job, draftResult.sopDraftBuild.steps as Parameters<typeof buildSopFactCheckPrompt>[1]),
      sopFactCheckSchema,
      'sop_fact_check',
      4000,
      'claude-haiku-4-5-20251001',
    );

    // ── Completion ──────────────────────────────────────────────────────────
    // SHA-256 content hash of the assembled SOP draft — evidentiary anchor for attestation + certificate chain.
    const contentHash = createHash('sha256')
      .update(JSON.stringify(draftResult.sopDraftBuild))
      .digest('hex');
    const completedAt = new Date().toISOString();

    await sql`
      UPDATE sop_records
      SET status = 'in_review',
          generation_metadata = ${JSON.stringify({
            completedAt,
            stepCount: SOP_STEP_SEQUENCE.length,
            totalTokensUsed: job.actualTokensUsed,
            sourceDocCount: sourceDocuments.length,
          })},
          content_hash = ${contentHash},
          updated_at = now()
      WHERE id = ${sopId}
    `;

    await upsertSopJobState(sopId, orgId, userId, 'complete', job, null, completedAt);

    await writeAuditLog({
      orgId, moduleId: undefined, userId,
      action: 'generation_complete',
      payload: { sopId, totalTokensUsed: job.actualTokensUsed, stepCount: SOP_STEP_SEQUENCE.length },
    });

    // Auto-seed Cat A findings for unattributed steps
    const unattributed = factCheckResult.sopFactCheck.steps.filter((s) => !s.attributed);
    for (const step of unattributed) {
      const draftStep = draftResult.sopDraftBuild.steps.find((ds) => ds.stepNumber === step.stepNumber);
      await sql`
        INSERT INTO sop_review_findings
          (sop_id, severity, category, description, location, source_attribution)
        VALUES (
          ${sopId},
          'high',
          'A',
          ${`Step ${step.stepNumber} cannot be attributed to uploaded source documentation. ${step.note ?? 'No citation found in source documents.'}`},
          ${`Step ${step.stepNumber}${draftStep ? ` — ${draftStep.action.slice(0, 80)}` : ''}`},
          ${'Procedural claim not found in uploaded source documents — must be verified or removed'}
        )
      `;
    }

    onEvent({ event: 'job_complete', totalTokensUsed: job.actualTokensUsed });

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Write failure metadata to sop_records so the UI can distinguish "failed" from "never started".
    await sql`
      UPDATE sop_records
      SET generation_metadata = ${JSON.stringify({ failed: true, error, failedAt: new Date().toISOString() })},
          updated_at = now()
      WHERE id = ${sopId}
    `.catch(() => {}); // best-effort — don't mask the original error
    if (!job.steps[job.currentStepKey] || job.steps[job.currentStepKey].status !== 'error') {
      onEvent({ event: 'job_failed', error });
    }
    await writeAuditLog({
      orgId, moduleId: undefined, userId,
      action: 'generation_failed',
      payload: { sopId, error },
    });
    throw err;
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function upsertSopJobState(
  sopId: string,
  orgId: string,
  userId: string,
  status: 'running' | 'complete' | 'failed',
  job: SopGenerationJob,
  error: string | null,
  completedAt?: string,
): Promise<void> {
  await sql`
    INSERT INTO sop_generation_jobs (sop_id, org_id, user_id, status, job_state, error, completed_at)
    VALUES (
      ${sopId}, ${orgId}, ${userId}, ${status},
      ${JSON.stringify(job)}, ${error},
      ${completedAt ?? null}
    )
    ON CONFLICT (sop_id) DO UPDATE SET
      status       = EXCLUDED.status,
      job_state    = EXCLUDED.job_state,
      error        = EXCLUDED.error,
      completed_at = EXCLUDED.completed_at,
      updated_at   = now()
  `;
}
