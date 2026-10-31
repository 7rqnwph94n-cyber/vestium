// ─── Server-side generation job runner ───────────────────────────────────────
// Orchestrates the full pipeline with dependency-aware PARALLEL execution.
// Steps whose dependencies are all 'done' run concurrently in the same wave.
//
// Critical-path reduction (3-stage example):
//   Sequential: blueprint→s1→t1→s2→t2→s3→t3→missions→4 serial→factCheck→3 serial→themeShell
//   Parallel:   blueprint → (s1,s2,s3 ∥) → (t1,t2,t3 ∥) + missions → (4 post-mission ∥)
//               → (factCheck,faultRef,builderCapstone ∥) → themeShell
//
// Safety: JS is single-threaded. Concurrent steps share the job object but
// each writes only to its own job.steps[stepKey] slot — no data races.

import { createHash } from 'crypto';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { createAIClient } from './clientFactory.js';
import type { AIProviderId } from './clientFactory.js';
import { runStepWithRetry } from './stepRunners.js';
import { assembleModule, allStepsDone, anyStepErrored } from './orchestrator.js';
import { makeInitialJob } from './types.js';
import type { GenerationJob, DomainConfig, StepResult } from './types.js';
import { traceGeneration } from './trace.js';
import { createModuleSnapshot } from '../services/moduleSnapshots.js';

// ─── SSE event types ──────────────────────────────────────────────────────────

export interface JobStepEvent {
  event: 'step_started' | 'step_done' | 'step_error' | 'job_complete' | 'job_failed';
  stepKey?: string;
  parsedJson?: unknown;
  rawOutput?: string;
  tokensUsed?: number;
  error?: string;
  totalTokensUsed?: number;
}

// ─── Job state stored in DB ───────────────────────────────────────────────────

export interface StoredJobState {
  moduleId: string;
  orgId: string;
  userId: string;
  status: 'running' | 'complete' | 'failed';
  job: GenerationJob;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// ─── Step dependency graph ────────────────────────────────────────────────────
// Returns stepKeys that must be 'done' before the given stepKey can start.

function getStepDeps(stepKey: string, stageCount: number): string[] {
  const stageKeys = Array.from({ length: stageCount }, (_, i) => `stage_${i + 1}`);
  const testKeys  = Array.from({ length: stageCount }, (_, i) => `test_${i + 1}`);

  // Phase 0: domainSurvey has no deps — it's the first step
  if (stepKey === 'domainSurvey') return [];

  // Phase 1: blueprint waits for domain intelligence
  if (stepKey === 'blueprint') return ['domainSurvey'];

  // Phase 2: stages + tests
  const stageM = stepKey.match(/^stage_(\d+)$/);
  if (stageM) return ['blueprint'];

  const testM = stepKey.match(/^test_(\d+)$/);
  if (testM) return [`stage_${testM[1]}`];

  if (stepKey === 'missions') return stageKeys;

  // placementAssessment + lessonMissionMap read test questions for coverage analysis
  if (['placementAssessment', 'lessonMissionMap'].includes(stepKey)) {
    return ['missions', ...testKeys];
  }
  // themeShell, sourceAttribution, simulatorDesign only need lesson/mission content —
  // starting them as soon as missions complete saves waiting for the full test wave.
  if (['sourceAttribution', 'simulatorDesign', 'themeShell'].includes(stepKey)) {
    return ['missions'];
  }

  // Phase 3: coherence pass — needs all post-mission parallel analysis steps done
  if (stepKey === 'coherencePass') {
    return ['sourceAttribution', 'placementAssessment', 'lessonMissionMap'];
  }

  // Phase 4: dual fact-check — both wait for coherence pass + source/placement
  if (stepKey === 'factCheckA') return ['sourceAttribution', 'placementAssessment', 'coherencePass'];
  if (stepKey === 'factCheckG') return ['sourceAttribution', 'placementAssessment', 'coherencePass'];
  if (stepKey === 'factCheckMerge') return ['factCheckA', 'factCheckG'];

  // Legacy: factCheck → factCheckA (backward compat for any old job state)
  if (stepKey === 'factCheck') return ['sourceAttribution', 'placementAssessment'];

  if (stepKey === 'faultAndReference')  return ['simulatorDesign'];
  if (stepKey === 'builderAndCapstone') return ['simulatorDesign'];

  // Repair runs after merge (patches disputed/unsupported claims) + missions (patches coverage gaps)
  if (stepKey === 'repairArtifacts') return ['factCheckMerge', 'missions'];

  return [];
}

// Returns all steps that are 'pending' with every dependency already 'done'.
function readySteps(job: GenerationJob): string[] {
  return job.stepSequence.filter((key) => {
    if (job.steps[key]?.status !== 'pending') return false;
    return getStepDeps(key, job.stageCount).every(
      (dep) => job.steps[dep]?.status === 'done'
    );
  });
}

function getWaveConcurrency(wave: string[]): number {
  const configured = Number(process.env.PIPELINE_WAVE_CONCURRENCY ?? 2);
  const concurrency = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 2;
  const hasParallelStageOrTest = wave.some((k) => /^stage_\d+$/.test(k) || /^test_\d+$/.test(k));
  if (!hasParallelStageOrTest) return wave.length;
  return Math.min(concurrency, wave.length);
}

async function runWaveWithConcurrency(
  wave: string[],
  runStep: (key: string) => Promise<void>
): Promise<void> {
  const concurrency = getWaveConcurrency(wave);
  if (concurrency >= wave.length) {
    await Promise.allSettled(wave.map((key) => runStep(key)));
    return;
  }

  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= wave.length) return;
      await runStep(wave[idx]).catch(() => {});
    }
  });
  await Promise.allSettled(workers);
}

// ─── Main job runner ──────────────────────────────────────────────────────────

export async function runGenerationJob(
  moduleId: string,
  orgId: string,
  userId: string,
  config: DomainConfig,
  onEvent: (event: JobStepEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const job = makeInitialJob(config);
  traceGeneration(moduleId, 'job_started', {
    stageCount: config.stageCount,
    lessonsPerStage: config.lessonsPerStage,
    missionCount: config.missionCount,
    fastMode: !!config.fastMode,
  });
  try {

  // ── Resume: load any previously-completed steps ──────────────────────────
  // Merges 'done' steps from the last run so only failed/pending steps re-execute.
  // Safe on first run — no row means no-op.
  {
    console.log(`[resume] moduleId=${moduleId} — querying generation_jobs`);
    const [existingRow] = await sql`
      SELECT job_state FROM generation_jobs WHERE module_id = ${moduleId} LIMIT 1
    ` as Array<{ job_state: GenerationJob }>;

    console.log(`[resume] existingRow found=${!!existingRow}, hasSteps=${!!existingRow?.job_state?.steps}`);
    traceGeneration(moduleId, 'resume_lookup', {
      foundExistingRow: !!existingRow,
      hasStoredSteps: !!existingRow?.job_state?.steps,
    });

    if (existingRow?.job_state?.steps) {
      let restoredCount = 0;
      for (const key of job.stepSequence) {
        const stored = existingRow.job_state.steps[key];
        if (stored?.status === 'done') {
          job.steps[key] = stored;
          restoredCount++;
          // Re-emit step_done so the frontend re-syncs any steps it may have cleared
          // when the user clicked "Regenerate" on a single step.
          onEvent({
            event: 'step_done',
            stepKey: key,
            parsedJson: stored.parsedJson,
            rawOutput: stored.rawOutput ?? '',
            tokensUsed: stored.tokensUsed ?? 0,
          });
        }
      }
      console.log(`[resume] restored ${restoredCount} steps from DB`);
      traceGeneration(moduleId, 'resume_restored_steps', { restoredCount });
      job.actualTokensUsed = Object.values(job.steps)
        .reduce((sum, s) => sum + (s?.tokensUsed ?? 0), 0);
    }
  }

  await upsertJobState(moduleId, {
    moduleId, orgId, userId, status: 'running', job,
    startedAt: new Date().toISOString()
  });

  await writeAuditLog({
    orgId, moduleId, userId,
    action: 'generation_started',
    payload: {
      stageCount: config.stageCount,
      fastMode: !!config.fastMode,
      primarySchema: config.regulatoryClassification?.primarySchema.schema.id ?? null,
    },
  });

  // ── Single-step executor ───────────────────────────────────────────────────
  // Marks the step running, calls the pipeline, persists result + emits SSE.
  // On failure: marks step as 'error', emits step_error, then re-throws so
  // Promise.allSettled can collect it without orphaning the wave.

  async function runOneStep(stepKey: string): Promise<void> {
    if (signal.aborted) throw new Error('Generation cancelled by client disconnect');

    const provider = getProviderForStep(stepKey);
    const model = getModelForStep(stepKey, provider);
    const client = createAIClient(provider);
    job.steps[stepKey].status = 'running';
    job.currentStepKey = stepKey;
    const stepStartedAt = Date.now();
    traceGeneration(moduleId, 'step_started', { stepKey, provider, model });
    onEvent({ event: 'step_started', stepKey });

    let result: StepResult;
    try {
      result = await runStepWithRetry(stepKey, client, job, signal, () => {}, model);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[pipeline] step "${stepKey}" FAILED:`, error);
      if (err instanceof Error && err.stack) console.error(err.stack);
      job.steps[stepKey].status = 'error';
      job.steps[stepKey].rawOutput = error;
      const failDurationMs = Date.now() - stepStartedAt;
      traceGeneration(moduleId, 'step_failed', {
        stepKey,
        provider,
        durationMs: failDurationMs,
        error,
      });
      onEvent({ event: 'step_error', stepKey, error });

      // Record failed step metric (best-effort)
      sql`
        INSERT INTO module_generation_metrics
          (module_id, org_id, step_key, provider, model, attempt, status, duration_ms, error_message)
        VALUES
          (${moduleId}, ${orgId}, ${stepKey}, ${provider}, ${model},
           1, 'error', ${failDurationMs}, ${error.slice(0, 500)})
      `.catch(() => {});
      // Persist failed state so the frontend can show which step failed
      await upsertJobState(moduleId, { moduleId, orgId, userId, status: 'failed', job, error, startedAt: '' });
      throw err; // captured by Promise.allSettled — caller checks anyStepErrored
    }

    job.steps[stepKey] = result;
    job.actualTokensUsed = Object.values(job.steps)
      .reduce((sum, s) => sum + (s?.tokensUsed ?? 0), 0);
    const stepDurationMs = Date.now() - stepStartedAt;
    traceGeneration(moduleId, 'step_done', {
      stepKey,
      provider,
      durationMs: stepDurationMs,
      tokensUsed: result.tokensUsed,
      retryCount: result.retryCount,
      totalTokensUsed: job.actualTokensUsed,
    });

    // Record per-step metrics (best-effort — don't block on failure)
    sql`
      INSERT INTO module_generation_metrics
        (module_id, org_id, step_key, provider, model, attempt, status, output_tokens, duration_ms)
      VALUES
        (${moduleId}, ${orgId}, ${stepKey}, ${provider}, ${model},
         ${result.retryCount + 1}, 'done', ${result.tokensUsed}, ${stepDurationMs})
    `.catch(() => {});

    // DB write is deferred to the end of the wave (see wave loop below).
    // The SSE event is emitted immediately so the frontend stays in sync.
    onEvent({
      event: 'step_done',
      stepKey,
      parsedJson: result.parsedJson,
      rawOutput: result.rawOutput,
      tokensUsed: result.tokensUsed,
    });

    // After repairArtifacts, re-broadcast the patched factCheckMerge + missions so
    // the frontend's job state reflects the server-side repairs before validation.
    // (runRepairArtifacts mutates job.steps['factCheckMerge'/'missions'] in-place; the
    //  original step_done events fired earlier carried pre-repair data.)
    if (stepKey === 'repairArtifacts') {
      const fcStep = job.steps['factCheckMerge'] ?? job.steps['factCheck'];
      const fcKey  = job.steps['factCheckMerge'] ? 'factCheckMerge' : 'factCheck';
      if (fcStep?.status === 'done') {
        onEvent({ event: 'step_done', stepKey: fcKey, parsedJson: fcStep.parsedJson, rawOutput: '', tokensUsed: 0 });
      }
      const msStep = job.steps['missions'];
      if (msStep?.status === 'done') {
        onEvent({ event: 'step_done', stepKey: 'missions', parsedJson: msStep.parsedJson, rawOutput: '', tokensUsed: 0 });
      }
    }
  }

  // ── Parallel wave executor ─────────────────────────────────────────────────
  // Each iteration finds all currently-unblocked pending steps and runs them
  // concurrently. Uses allSettled so a single failure doesn't abandon sibling
  // steps mid-wave (their results are saved even if the job ultimately fails).

    while (!allStepsDone(job) && !anyStepErrored(job)) {
      if (signal.aborted) throw new Error('Generation cancelled by client disconnect');

      const wave = readySteps(job);
      if (wave.length === 0) break; // dependency deadlock — should never happen
      traceGeneration(moduleId, 'wave_started', { wave, waveSize: wave.length });

      // Run ready steps with bounded concurrency for stage/test waves.
      // Full fan-out can trigger provider throttling and become slower overall.
      await runWaveWithConcurrency(wave, runOneStep);

      // Single DB write per wave instead of per step — reduces DB load by ~4x on
      // a 3-stage module (15-18 per-step writes → ~7 per-wave writes).
      // Failed steps already wrote their own upsert; this captures successful ones.
      if (!anyStepErrored(job)) {
        await upsertJobState(moduleId, { moduleId, orgId, userId, status: 'running', job, startedAt: '' });
      }
      traceGeneration(moduleId, 'wave_completed', {
        wave,
        totalTokensUsed: job.actualTokensUsed,
      });

      if (anyStepErrored(job)) break;
    }

    if (anyStepErrored(job)) {
      const failed = job.stepSequence
        .filter((key) => job.steps[key]?.status === 'error')
        .map((key) => {
          const raw = (job.steps[key]?.rawOutput ?? '').trim();
          const reason = raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
          return `${key}${reason ? `: ${reason}` : ''}`;
        });
      const message = `Pipeline step failure: ${failed.join(' | ') || 'unknown step error'}`;
      traceGeneration(moduleId, 'job_failed_pipeline_steps', { failedSteps: failed, error: message });
      throw new Error(message);
    }

    // ── Assembly ───────────────────────────────────────────────────────────
    assembleModule(job); // validates all steps are present
    const completedAt = new Date().toISOString();

    // Compute a real SHA-256 content hash of the assembled module at generation time.
    // This hash becomes the evidentiary anchor for the attestation + certificate chain.
    const contentHash = createHash('sha256')
      .update(JSON.stringify(job.steps))
      .digest('hex');

    await upsertJobState(moduleId, {
      moduleId, orgId, userId, status: 'complete', job, startedAt: '', completedAt
    });

    await sql`
      UPDATE modules
      SET content_hash = ${contentHash},
          generation_metadata = ${JSON.stringify({
        runId: moduleId,
        modelId: 'claude-sonnet-4-6',
        schemaVersions: config.regulatoryClassification
          ? Object.fromEntries(
              config.regulatoryClassification.applicableSchemas
                .filter((c) => c.schema.siNumber)
                .map((c) => [c.schema.id, c.schema.siNumber])
            )
          : {},
        sourceDocumentIds: config.regulatoryClassification
          ? config.regulatoryClassification.applicableSchemas.flatMap((c) =>
              c.schema.sourceDocuments.map((d) => d.id)
            )
          : [],
        completedAt,
      })},
          status = 'in_review',
          updated_at = now()
      WHERE id = ${moduleId}
    `;

    await writeAuditLog({
      orgId, moduleId, userId,
      action: 'generation_complete',
      payload: { totalTokensUsed: job.actualTokensUsed, stepCount: job.stepSequence.length },
    });

    // Create version 1 snapshot (generation_complete) — best-effort
    try {
      await createModuleSnapshot(moduleId, contentHash, job.steps, 'generation_complete', userId, orgId);
    } catch (snapErr) {
      console.warn('[pipeline] Snapshot creation failed (non-blocking):', snapErr instanceof Error ? snapErr.message : snapErr);
    }

    onEvent({ event: 'job_complete', totalTokensUsed: job.actualTokensUsed });
    traceGeneration(moduleId, 'job_complete', { totalTokensUsed: job.actualTokensUsed });

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    traceGeneration(moduleId, 'job_failed', { error });
    onEvent({ event: 'job_failed', error });
    await writeAuditLog({
      orgId, moduleId, userId,
      action: 'generation_failed',
      payload: { error },
    });
    // Stamp failure info on the module record so ModulesPage can surface it.
    // Best-effort — don't let this mask the original error.
    try {
      await sql`
        UPDATE modules
        SET generation_metadata = ${JSON.stringify({ failed: true, error, failedAt: new Date().toISOString() })},
            updated_at = now()
        WHERE id = ${moduleId} AND org_id = ${orgId}
      `;
    } catch { /* ignore */ }
    throw err;
  }
}

// ─── Provider selection ───────────────────────────────────────────────────────

function getProviderForStep(stepKey: string): AIProviderId {
  const globalProvider     = toProvider(process.env.PIPELINE_AI_PROVIDER) ?? 'anthropic';
  const sourceAttrProvider = toProvider(process.env.PIPELINE_PROVIDER_SOURCE_ATTRIBUTION) ?? 'gemini';

  // Phase 0 + 3: prefer Gemini (search-grounded intelligence); override via env
  if (stepKey === 'domainSurvey')  return toProvider(process.env.PIPELINE_PROVIDER_DOMAIN_SURVEY) ?? 'gemini';
  if (stepKey === 'coherencePass') return toProvider(process.env.PIPELINE_PROVIDER_COHERENCE) ?? 'gemini';

  // Phase 4 dual fact-check: model-specific — A=Anthropic, G=Gemini, merge=Anthropic
  if (stepKey === 'factCheckA')    return 'anthropic';
  if (stepKey === 'factCheckG')    return 'gemini';
  if (stepKey === 'factCheckMerge') return 'anthropic';

  // Legacy single fact-check path (old job state)
  if (stepKey === 'factCheck') {
    return toProvider(process.env.PIPELINE_PROVIDER_FACTCHECK) ?? globalProvider;
  }

  if (stepKey === 'sourceAttribution') return sourceAttrProvider;

  // Repair uses Anthropic — it reasons over the merged fact-check output
  if (stepKey === 'repairArtifacts') return 'anthropic';

  return globalProvider;
}

function toProvider(value: string | undefined): AIProviderId | null {
  if (!value) return null;
  return value === 'gemini' ? 'gemini' : 'anthropic';
}

function getModelForProvider(provider: AIProviderId): string {
  if (provider === 'gemini') return process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  if (provider === 'mock') return 'mock';
  return 'claude-sonnet-4-6';
}

// ─── Per-step model routing ─────────────────────────────────────────────────
// Lightweight steps (structured extraction, constraint matching, JSON merges)
// route to Haiku for ~70% cost reduction with no quality impact.

const HAIKU_STEPS = new Set([
  'blueprint',         // Structured list generation — planning skeleton, not creative reasoning
  'lessonMissionMap',  // Pure constraint satisfaction — match lessons to missions on semantic fit
  'themeShell',        // Flat metadata object — colours, fonts, tone
  // factCheckMerge is pure computation (no API call) — already free
]);

function getModelForStep(stepKey: string, provider: AIProviderId): string {
  if (provider === 'anthropic' && HAIKU_STEPS.has(stepKey)) {
    return 'claude-haiku-4-5-20251001';
  }
  return getModelForProvider(provider);
}

// ─── Job state persistence ────────────────────────────────────────────────────

async function upsertJobState(moduleId: string, state: Partial<StoredJobState>): Promise<void> {
  await sql`
    INSERT INTO generation_jobs (module_id, org_id, user_id, status, job_state, error, started_at, completed_at)
    VALUES (
      ${moduleId},
      ${state.orgId ?? ''},
      ${state.userId ?? ''},
      ${state.status ?? 'running'},
      ${JSON.stringify(state.job ?? {})},
      ${state.error ?? null},
      ${state.startedAt || new Date().toISOString()},
      ${state.completedAt ?? null}
    )
    ON CONFLICT (module_id) DO UPDATE SET
      status       = EXCLUDED.status,
      job_state    = EXCLUDED.job_state,
      error        = EXCLUDED.error,
      completed_at = EXCLUDED.completed_at,
      updated_at   = now()
  `;
}
