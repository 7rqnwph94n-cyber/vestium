// ─── RAMS Generation Job Runner ───────────────────────────────────────────────
// Orchestrates the 4-step RAMS pipeline sequentially:
//   ramsHazardId → ramsRiskAssessment → ramsDraftBuild → ramsFactCheck
//
// Uses sharedPipeline.ts utilities + content_generation_jobs table (via registryId).
// After completion, auto-seeds Cat A findings for unattributed hazards/steps.

import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { createAIClient } from './clientFactory.js';
import { runSequentialStep, computeContentHash, upsertContentJobState } from './sharedPipeline.js';
import type { JobStepEvent } from './jobRunner.js';
import {
  makeInitialRamsJob,
  RAMS_STEP_SEQUENCE,
  type RamsGenerationJob,
  type RamsSourceDocContent,
  type RamsHazardIdOutput,
  type RamsRiskAssessmentOutput,
  type RamsDraftBuildOutput,
  type RamsFactCheckOutput,
} from './ramsTypes.js';
import type { WorkplaceContext, WorkplaceClassificationResult } from '../regulatory/types.js';
import {
  buildRamsHazardIdPrompt,
  buildRamsRiskAssessmentPrompt,
  buildRamsDraftBuildPrompt,
  buildRamsFactCheckPrompt,
} from './ramsPrompts.js';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const ramsHazardIdSchema = z.object({
  ramsHazardId: z.object({
    hazards: z.array(z.object({
      id: z.string(),
      hazard: z.string(),
      activity: z.string(),
      personsAtRisk: z.array(z.string()),
      sourceRef: z.string().nullable(),
    })),
  }),
});

const ramsRiskAssessmentSchema = z.object({
  ramsRiskAssessment: z.object({
    hazards: z.array(z.object({
      id: z.string(),
      initialLikelihood: z.number().int().min(1).max(5),
      initialSeverity: z.number().int().min(1).max(5),
      initialRiskScore: z.number().int().min(1).max(25),
      controls: z.array(z.string()),
      regulatoryBasis: z.array(z.string()),
      residualLikelihood: z.number().int().min(1).max(5),
      residualSeverity: z.number().int().min(1).max(5),
      residualRiskScore: z.number().int().min(1).max(25),
    })),
  }),
});

const ramsMethodStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  action: z.string().min(1),
  hazardRefs: z.array(z.string()),
  controls: z.array(z.string()),
  ppe: z.array(z.string()),
  checkpoints: z.array(z.string()),
  sourceRef: z.string().nullable(),
});

const ramsDraftBuildSchema = z.object({
  ramsDraftBuild: z.object({
    title: z.string().min(1),
    taskDescription: z.string().min(1),
    location: z.string(),
    equipment: z.array(z.string()),
    scope: z.string().min(1),
    version: z.string(),
    applicableRegulations: z.array(z.string()),
    hazardMatrix: z.array(z.object({
      id: z.string(),
      hazard: z.string(),
      activity: z.string(),
      personsAtRisk: z.array(z.string()),
      initialLikelihood: z.number(),
      initialSeverity: z.number(),
      initialRiskScore: z.number(),
      controls: z.array(z.string()),
      regulatoryBasis: z.array(z.string()),
      residualLikelihood: z.number(),
      residualSeverity: z.number(),
      residualRiskScore: z.number(),
      sourceRef: z.string().nullable(),
    })),
    methodStatement: z.array(ramsMethodStepSchema),
    emergencyProcedures: z.array(z.string()),
    permits: z.array(z.string()),
    reviewFrequency: z.string(),
  }),
});

const ramsFactCheckSchema = z.object({
  ramsFactCheck: z.object({
    hazards: z.array(z.object({
      id: z.string(),
      attributed: z.boolean(),
      confidence: z.enum(['high', 'medium', 'low']),
      note: z.string().nullable().optional(),
    })),
    methodSteps: z.array(z.object({
      stepNumber: z.number().int().positive(),
      attributed: z.boolean(),
      confidence: z.enum(['high', 'medium', 'low']),
      note: z.string().nullable().optional(),
    })),
    unattributedCount: z.number().int().min(0),
    summary: z.string(),
  }),
});

// ─── Main runner ─────────────────────────────────────────────────────────────

export async function runRamsGenerationJob(
  ramsId: string,
  registryId: string,
  orgId: string,
  userId: string,
  onEvent: (event: JobStepEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  // Load RAMS record + source documents
  const [ramsRow] = await sql`
    SELECT title, task_description, location, equipment,
           workplace_context, regulatory_classification
    FROM rams_records
    WHERE id = ${ramsId} AND org_id = ${orgId}
  ` as Array<{
    title: string;
    task_description: string;
    location: string;
    equipment: string[];
    workplace_context: WorkplaceContext;
    regulatory_classification: WorkplaceClassificationResult;
  }>;

  if (!ramsRow) throw new Error('RAMS record not found');

  const docRows = await sql`
    SELECT id, filename, doc_type, content
    FROM rams_source_documents
    WHERE rams_id = ${ramsId}
    ORDER BY uploaded_at ASC
  ` as Array<{ id: string; filename: string; doc_type: string; content: string }>;

  const sourceDocuments: RamsSourceDocContent[] = docRows.map((r) => ({
    id: r.id, filename: r.filename, docType: r.doc_type, content: r.content,
  }));

  const job = makeInitialRamsJob(
    ramsId, registryId,
    ramsRow.title, ramsRow.task_description,
    ramsRow.location, ramsRow.equipment,
    sourceDocuments,
    ramsRow.workplace_context,
    ramsRow.regulatory_classification,
  );

  // Clear any prior failure metadata
  await sql`
    UPDATE rams_records
    SET generation_metadata = '{}', updated_at = now()
    WHERE id = ${ramsId}
  `;

  await upsertContentJobState(registryId, orgId, userId, 'running', job, null);

  const client = createAIClient('anthropic');
  const persist = () => upsertContentJobState(registryId, orgId, userId, 'running', job, null);

  try {
    // Step 1: Hazard Identification
    const hazardResult = await runSequentialStep<RamsHazardIdOutput>({
      client, stepKey: 'ramsHazardId',
      prompt: buildRamsHazardIdPrompt(job),
      schema: ramsHazardIdSchema, toolName: 'rams_hazard_id',
      maxTokens: 8000, job, onEvent, onPersist: persist, signal,
    });

    // Step 2: Risk Assessment
    const riskResult = await runSequentialStep<RamsRiskAssessmentOutput>({
      client, stepKey: 'ramsRiskAssessment',
      prompt: buildRamsRiskAssessmentPrompt(job, hazardResult.ramsHazardId.hazards),
      schema: ramsRiskAssessmentSchema, toolName: 'rams_risk_assessment',
      maxTokens: 8000, job, onEvent, onPersist: persist, signal,
    });

    // Step 3: Draft Build
    const draftResult = await runSequentialStep<RamsDraftBuildOutput>({
      client, stepKey: 'ramsDraftBuild',
      prompt: buildRamsDraftBuildPrompt(job, hazardResult.ramsHazardId.hazards, riskResult.ramsRiskAssessment),
      schema: ramsDraftBuildSchema, toolName: 'rams_draft_build',
      maxTokens: 12000, job, onEvent, onPersist: persist, signal,
    });

    // Step 4: Fact Check (Haiku — binary attribution verification)
    const factCheckResult = await runSequentialStep<RamsFactCheckOutput>({
      client, stepKey: 'ramsFactCheck',
      prompt: buildRamsFactCheckPrompt(
        job,
        draftResult.ramsDraftBuild.hazardMatrix,
        draftResult.ramsDraftBuild.methodStatement,
      ),
      schema: ramsFactCheckSchema, toolName: 'rams_fact_check',
      maxTokens: 6000, model: 'claude-haiku-4-5-20251001',
      job, onEvent, onPersist: persist, signal,
    });

    // ── Completion ────────────────────────────────────────────────────────────
    const contentHash = computeContentHash(draftResult.ramsDraftBuild);
    const completedAt = new Date().toISOString();

    await sql`
      UPDATE rams_records
      SET status = 'in_review',
          generation_metadata = ${JSON.stringify({
            completedAt,
            stepCount: RAMS_STEP_SEQUENCE.length,
            totalTokensUsed: job.actualTokensUsed,
            sourceDocCount: sourceDocuments.length,
            hazardCount: draftResult.ramsDraftBuild.hazardMatrix.length,
            methodStepCount: draftResult.ramsDraftBuild.methodStatement.length,
          })},
          content_hash = ${contentHash},
          updated_at = now()
      WHERE id = ${ramsId}
    `;

    // Update content_registry status
    await sql`
      UPDATE content_registry
      SET status = 'in_review', content_hash = ${contentHash}, updated_at = now()
      WHERE id = ${registryId}
    `;

    await upsertContentJobState(registryId, orgId, userId, 'complete', job, null, completedAt);

    await writeAuditLog({
      orgId, registryId, userId,
      action: 'generation_complete',
      payload: {
        ramsId, registryId,
        totalTokensUsed: job.actualTokensUsed,
        stepCount: RAMS_STEP_SEQUENCE.length,
      },
    });

    // Auto-seed Cat A findings for unattributed hazards + method steps
    const unattributedHazards = factCheckResult.ramsFactCheck.hazards.filter((h) => !h.attributed);
    for (const h of unattributedHazards) {
      const hazardEntry = draftResult.ramsDraftBuild.hazardMatrix.find((hm) => hm.id === h.id);
      await sql`
        INSERT INTO governed_findings (registry_id, severity, category, description, location, source_attribution)
        VALUES (
          ${registryId},
          'high',
          'A',
          ${`Hazard "${hazardEntry?.hazard ?? h.id}" cannot be attributed to uploaded source documentation. ${h.note ?? 'No citation found.'}`},
          ${`Hazard ${h.id}${hazardEntry ? ` — ${hazardEntry.hazard.slice(0, 80)}` : ''}`},
          ${'Hazard claim not found in uploaded source documents — must be verified or removed'}
        )
      `;
    }

    const unattributedSteps = factCheckResult.ramsFactCheck.methodSteps.filter((s) => !s.attributed);
    for (const step of unattributedSteps) {
      const methodStep = draftResult.ramsDraftBuild.methodStatement.find((ms) => ms.stepNumber === step.stepNumber);
      await sql`
        INSERT INTO governed_findings (registry_id, severity, category, description, location, source_attribution)
        VALUES (
          ${registryId},
          'high',
          'A',
          ${`Method step ${step.stepNumber} cannot be attributed to uploaded source documentation. ${step.note ?? 'No citation found.'}`},
          ${`Step ${step.stepNumber}${methodStep ? ` — ${methodStep.action.slice(0, 80)}` : ''}`},
          ${'Method statement claim not found in uploaded source documents — must be verified or removed'}
        )
      `;
    }

    onEvent({ event: 'job_complete', totalTokensUsed: job.actualTokensUsed });

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE rams_records
      SET generation_metadata = ${JSON.stringify({ failed: true, error, failedAt: new Date().toISOString() })},
          updated_at = now()
      WHERE id = ${ramsId}
    `.catch(() => {});

    if (!job.steps[job.currentStepKey] || job.steps[job.currentStepKey].status !== 'error') {
      onEvent({ event: 'job_failed', error });
    }
    await upsertContentJobState(registryId, orgId, userId, 'failed', job, error);
    await writeAuditLog({
      orgId, registryId, userId,
      action: 'generation_failed',
      payload: { ramsId, registryId, error },
    });
    throw err;
  }
}
