// ─── Generation routes ────────────────────────────────────────────────────────
// POST /:moduleId/start  — starts the pipeline, returns SSE stream of step events
// GET  /:moduleId/status — returns current job state (step results) for polling
// DELETE /:moduleId      — cancels a running job

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { runGenerationJob, type JobStepEvent } from '../pipeline/jobRunner.js';
import type { DomainConfig } from '../pipeline/types.js';
import { resolveCorsOrigin } from '../utils/cors.js';
import { classifyWorkplace } from '../regulatory/workplaceClassifier.js';
import type { WorkplaceClassificationResult } from '../regulatory/types.js';
import { traceGeneration } from '../pipeline/trace.js';
import type { DistilledOrgContextDTO } from '@complianceforge/types';
import { requireRole } from '../plugins/rbac.js';

// ─── In-memory abort controller registry ─────────────────────────────────────
// Keyed by moduleId — allows cancel endpoint to abort a running job.
const activeJobs = new Map<string, AbortController>();
const RUN_STALE_AFTER_SECONDS = Number(process.env.GENERATION_RUN_STALE_AFTER_SECONDS ?? 120);

type RunningJobRow = {
  module_id: string;
  updated_at: string;
};

async function failStaleRunningJobsForOrg(dbOrgId: string): Promise<number> {
  const rows = await sql`
    UPDATE generation_jobs gj
    SET status = 'failed',
        error = 'Generation stalled (heartbeat timeout) — safe to resume',
        updated_at = now()
    FROM modules m
    WHERE gj.module_id = m.id
      AND m.org_id = ${dbOrgId}
      AND gj.status = 'running'
      AND gj.updated_at < (now() - make_interval(secs => ${RUN_STALE_AFTER_SECONDS}))
    RETURNING gj.module_id
  ` as Array<{ module_id: string }>;
  return rows.length;
}

async function listRunningJobsForOrg(dbOrgId: string): Promise<RunningJobRow[]> {
  return await sql`
    SELECT gj.module_id, gj.updated_at
    FROM generation_jobs gj
    JOIN modules m ON m.id = gj.module_id
    WHERE m.org_id = ${dbOrgId}
      AND gj.status = 'running'
    ORDER BY gj.updated_at DESC
  ` as RunningJobRow[];
}

// ─── Fixed module shape ──────────────────────────────────────────────────────
// Every module is 2 stages, 2 lessons/stage, 1 mission. Enforced server-side.
// All raw pipeline data is preserved in generation_jobs.job_state for future
// extension if the module path needs to grow.

export const MODULE_SHAPE = {
  stageCount: 2,
  lessonsPerStage: 2,
  missionCount: 1,
} as const;

// ─── Request schema ───────────────────────────────────────────────────────────

const StartGenerationSchema = z.object({
  title: z.string().min(1),
  domainPrompt: z.string().min(1),
  audienceDescription: z.string().min(1),
  objectives: z.array(z.string()).min(1),
  sourceReferences: z.array(z.string()).default([]),
  // stageCount, lessonsPerStage, missionCount — enforced by MODULE_SHAPE constant.
  // workplaceContext + regulatoryClassification — loaded from DB (trust boundary).
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export const generationRoutes: FastifyPluginAsync = async (app) => {

  // POST /api/generation/:moduleId/start
  // Starts the pipeline and streams step events via SSE.
  // The client subscribes with EventSource or fetch+ReadableStream.
  app.post<{ Params: { moduleId: string } }>(
    '/:moduleId/start',
    { preHandler: [requireRole('admin', 'hr_manager')], config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { userId, orgId } = request.auth;
      const { moduleId } = request.params;

      if (!orgId) {
        reply.status(400).send({ ok: false, error: 'No active org' });
        return;
      }

      // Upsert org — ensures it exists even if user came straight from Studio.
      const orgRows = await sql`
        INSERT INTO orgs (clerk_org_id, name, tier)
        VALUES (${orgId}, ${orgId}, 1)
        ON CONFLICT (clerk_org_id) DO UPDATE SET clerk_org_id = EXCLUDED.clerk_org_id
        RETURNING id
      `;
      const dbOrgId = (orgRows[0] as { id: string }).id;
      const staleFailed = await failStaleRunningJobsForOrg(dbOrgId);
      if (staleFailed > 0) {
        traceGeneration(moduleId, 'stale_jobs_failed_before_start', { staleFailed, dbOrgId });
      }

      const moduleRows = await sql`
        SELECT id, status, workplace_context, regulatory_classification
        FROM modules WHERE id = ${moduleId} AND org_id = ${dbOrgId}
      `;
      if (!moduleRows[0]) {
        reply.status(404).send({ ok: false, error: 'Module not found' });
        return;
      }
      const moduleRow = moduleRows[0] as {
        id: string; status: string;
        workplace_context: DomainConfig['workplaceContext'];
        regulatory_classification: unknown;
      };
      if (moduleRow.status === 'deployed') {
        reply.status(409).send({ ok: false, error: 'Cannot regenerate a deployed module — create a new module record to preserve cert chain integrity' });
        return;
      }

      // DB-backed run lock: one active generation per org at a time.
      // This prevents accidental multi-run forks from UI double-click/restart races.
      const runningJobs = await listRunningJobsForOrg(dbOrgId);
      const otherRunning = runningJobs.find((row) => row.module_id !== moduleId);
      if (otherRunning) {
        reply.status(409).send({
          ok: false,
          error: `Generation already running for module ${otherRunning.module_id}. Wait for completion/cancel before starting another.`,
          runningModuleId: otherRunning.module_id,
        });
        return;
      }

      // Same-module lock (DB + in-memory).
      if (runningJobs.some((row) => row.module_id === moduleId) || activeJobs.has(moduleId)) {
        reply.status(409).send({
          ok: false,
          error: 'Generation already running for this module',
          runningModuleId: moduleId,
        });
        return;
      }

      const parsed = StartGenerationSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400).send({ ok: false, error: 'Invalid request body', code: parsed.error.message });
        return;
      }

      const body = parsed.data;
      const storedClassification = moduleRow.regulatory_classification as Record<string, unknown> | null | undefined;
      const hasExpandedSchemaShape =
        !!storedClassification
        && typeof storedClassification === 'object'
        && !!(storedClassification as { primarySchema?: { schema?: unknown } }).primarySchema?.schema;

      // Backward compatibility:
      // modules.regulatory_classification is stored as a summary DTO
      // (primarySchemaId + applicableSchemas[].schemaId), while the pipeline
      // needs full schema objects for prompts/fact-check severity.
      // If full schema objects are missing, rebuild classification from the
      // authoritative workplace context.
      const resolvedClassification: WorkplaceClassificationResult | undefined =
        hasExpandedSchemaShape
          ? (moduleRow.regulatory_classification as WorkplaceClassificationResult)
          : (moduleRow.workplace_context ? classifyWorkplace(moduleRow.workplace_context) : undefined);

      // Load distilled org context (prior module intelligence) if available
      const orgCtxRows = await sql`
        SELECT distilled_context FROM org_contexts WHERE org_id = ${dbOrgId}
      `;
      const orgDistilledContext = orgCtxRows[0]
        ? (orgCtxRows[0] as { distilled_context: DistilledOrgContextDTO }).distilled_context
        : undefined;

      // workplaceContext + regulatoryClassification come from the DB record, not the
      // client payload. The client stores them when the module is created; loading
      // them here ensures the pipeline always uses the validated authoritative values.
      const config: DomainConfig = {
        moduleId,
        domainPrompt: body.domainPrompt,
        audienceDescription: body.audienceDescription,
        objectives: body.objectives,
        stageCount: MODULE_SHAPE.stageCount,
        lessonsPerStage: MODULE_SHAPE.lessonsPerStage,
        missionCount: MODULE_SHAPE.missionCount,
        fastMode: false,
        sourceReferences: body.sourceReferences,
        workplaceContext: moduleRow.workplace_context,
        regulatoryClassification: resolvedClassification,
        orgDistilledContext,
      };
      traceGeneration(moduleId, 'start_request_accepted', {
        userId,
        orgId: dbOrgId,
        ...MODULE_SHAPE,
      });

      // Set up SSE response headers — CORS origin is already set by the global
      // onRequest hook in index.ts, but SSE bypasses Fastify's reply so we must
      // set it on the raw response. resolveCorsOrigin() is the shared validator.
      const reqOrigin = request.headers.origin ?? '';
      const sseOrigin = resolveCorsOrigin(reqOrigin);
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': sseOrigin,
        'Vary': 'Origin',
      });

      const abortController = new AbortController();
      activeJobs.set(moduleId, abortController);

      // Do not couple job lifetime to socket lifecycle.
      // If the client connection drops, generation should continue server-side so
      // the run remains resumable and tokens already spent are not wasted.

      let terminalEventSent = false;
      const sendEvent = (event: JobStepEvent) => {
        if (event.event === 'job_complete' || event.event === 'job_failed') {
          terminalEventSent = true;
        }
        traceGeneration(moduleId, 'sse_event', {
          sseEvent: event.event,
          stepKey: event.stepKey,
          tokensUsed: event.tokensUsed,
          error: event.error,
          totalTokensUsed: event.totalTokensUsed,
        });
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // Client disconnected — ignore write errors
        }
      };

      // ── SSE keep-alive heartbeat ──────────────────────────────────────────
      // During long-running steps (e.g. blueprint on Anthropic, ~30-60s) no data
      // is written to the SSE connection. Some browsers and reverse proxies will
      // close idle connections. An SSE comment line every 15s prevents this.
      const heartbeatInterval = setInterval(() => {
        try { reply.raw.write(': heartbeat\n\n'); } catch { /* client gone */ }
        // Keep DB updated_at fresh during long model calls so stale detection is reliable.
        void sql`
          UPDATE generation_jobs
          SET updated_at = now()
          WHERE module_id = ${moduleId}
            AND org_id = ${dbOrgId}
            AND status = 'running'
        `;
      }, 15_000);

      try {
        await runGenerationJob(
          moduleId,
          dbOrgId,
          userId,
          config,
          sendEvent,
          abortController.signal
        );
      } catch (err) {
        traceGeneration(moduleId, 'route_runner_error', {
          error: err instanceof Error ? err.message : String(err),
        });
        // If the runner failed before emitting a terminal event, emit one here so
        // the client gets a concrete error instead of a generic connection-loss UI.
        if (!terminalEventSent) {
          const msg = err instanceof Error ? err.message : String(err);
          sendEvent({ event: 'job_failed', error: msg || 'Generation failed' });
        }
      } finally {
        traceGeneration(moduleId, 'route_stream_closed', { terminalEventSent });
        clearInterval(heartbeatInterval);
        activeJobs.delete(moduleId);
        reply.raw.end();
      }
    }
  );

  // GET /api/generation/:moduleId/status
  // Returns the current job state for a module (all step statuses + results).
  // Frontend can use this to restore state after page refresh.
  app.get<{ Params: { moduleId: string } }>(
    '/:moduleId/status',
    { preHandler: [requireRole('admin', 'hr_manager', 'reviewer')] },
    async (request, reply) => {
      const { orgId } = request.auth;
      const { moduleId } = request.params;

      if (!orgId) {
        reply.status(400).send({ ok: false, error: 'No active org' });
        return;
      }

      const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
      if (!orgRows[0]) {
        reply.status(404).send({ ok: false, error: 'Org not found' });
        return;
      }
      const dbOrgId = (orgRows[0] as { id: string }).id;

      const rows = await sql`
        SELECT gj.status, gj.job_state, gj.error, gj.started_at, gj.completed_at
        FROM generation_jobs gj
        JOIN modules m ON m.id = gj.module_id
        WHERE gj.module_id = ${moduleId} AND m.org_id = ${dbOrgId}
      `;

      if (!rows[0]) {
        reply.status(404).send({ ok: false, error: 'No generation job found for this module' });
        return;
      }

      const row = rows[0] as {
        status: string; job_state: unknown; error: string | null;
        started_at: string; completed_at: string | null;
      };

      return {
        ok: true,
        data: {
          moduleId,
          status: row.status,
          job: row.job_state,
          error: row.error,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          // Use DB status as source of truth — in-memory activeJobs is reset on restart
          isActive: row.status === 'running',
        },
      };
    }
  );

  // DELETE /api/generation/:moduleId
  // Cancels a running generation job.
  app.delete<{ Params: { moduleId: string } }>(
    '/:moduleId',
    { preHandler: [requireRole('admin', 'hr_manager')] },
    async (request, reply) => {
      const { orgId } = request.auth;
      const { moduleId } = request.params;

      if (!orgId) {
        reply.status(400).send({ ok: false, error: 'No active org' });
        return;
      }

      // Verify module belongs to this org before allowing cancel
      const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
      if (!orgRows[0]) {
        reply.status(404).send({ ok: false, error: 'Org not found' });
        return;
      }
      const dbOrgId = (orgRows[0] as { id: string }).id;

      const moduleRows = await sql`
        SELECT id FROM modules WHERE id = ${moduleId} AND org_id = ${dbOrgId}
      `;
      if (!moduleRows[0]) {
        reply.status(404).send({ ok: false, error: 'Module not found' });
        return;
      }

      const controller = activeJobs.get(moduleId);
      if (controller) {
        controller.abort();
        activeJobs.delete(moduleId);
      }

      // Also mark DB-running jobs cancelled even if process-local controller is missing
      // (e.g. restart/multi-instance/orphaned run).
      await sql`
        UPDATE generation_jobs
        SET status = 'failed',
            error = 'Generation cancelled by user',
            updated_at = now()
        WHERE module_id = ${moduleId}
          AND status = 'running'
      `;
      return { ok: true, data: { cancelled: true } };
    }
  );
};
