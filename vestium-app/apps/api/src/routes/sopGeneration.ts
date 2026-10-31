// ─── SOP Generation Routes ────────────────────────────────────────────────────
// POST /:sopId/start  — starts SOP pipeline, returns SSE stream
// GET  /:sopId/status — returns current job state
// DELETE /:sopId      — cancels a running job

import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../db/client.js';
import { runSopGenerationJob } from '../pipeline/sopJobRunner.js';
import type { JobStepEvent } from '../pipeline/jobRunner.js';
import { resolveCorsOrigin } from '../utils/cors.js';
import { requireRole } from '../plugins/rbac.js';

const activeJobs = new Map<string, AbortController>();

export const sopGenerationRoutes: FastifyPluginAsync = async (app) => {

  // POST /api/sop-generation/:sopId/start
  app.post<{ Params: { sopId: string } }>(
    '/:sopId/start',
    { preHandler: [requireRole('admin', 'hr_manager')], config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { userId, orgId } = request.auth;
      const { sopId } = request.params;

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

      const sopRows = await sql`
        SELECT id, status FROM sop_records WHERE id = ${sopId} AND org_id = ${dbOrgId}
      `;
      if (!sopRows[0]) {
        reply.status(404).send({ ok: false, error: 'SOP not found' });
        return;
      }
      if ((sopRows[0] as { status: string }).status === 'deployed') {
        reply.status(409).send({ ok: false, error: 'Cannot regenerate a deployed SOP — create a new SOP record to preserve attestation immutability' });
        return;
      }

      // Require at least one source document before generation
      const [docCount] = await sql`
        SELECT count(*)::int AS n FROM sop_source_documents WHERE sop_id = ${sopId}
      ` as Array<{ n: number }>;
      if (docCount.n === 0) {
        reply.status(422).send({
          ok: false,
          error: 'At least one source document must be uploaded before generating an SOP. Upload the operator manual, maintenance schedule, or COSHH datasheet for this procedure.',
        });
        return;
      }

      if (activeJobs.has(sopId)) {
        reply.status(409).send({ ok: false, error: 'SOP generation already running' });
        return;
      }

      // SSE headers — use shared CORS resolver
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
      activeJobs.set(sopId, abortController);
      // Keep SOP generation alive even if the client stream disconnects.
      // This preserves resumability and avoids losing in-flight work on transport blips.

      const sendEvent = (event: JobStepEvent) => {
        try { reply.raw.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* client gone */ }
      };

      try {
        await runSopGenerationJob(sopId, dbOrgId, userId, sendEvent, abortController.signal);
      } catch {
        // Error already emitted via job_failed event
      } finally {
        activeJobs.delete(sopId);
        reply.raw.end();
      }
    }
  );

  // GET /api/sop-generation/:sopId/status
  app.get<{ Params: { sopId: string } }>(
    '/:sopId/status',
    { preHandler: [requireRole('admin', 'hr_manager')] },
    async (request, reply) => {
      const { orgId } = request.auth;
      const { sopId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
      if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
      const dbOrgId = (orgRows[0] as { id: string }).id;

      const rows = await sql`
        SELECT j.status, j.job_state, j.error, j.started_at, j.completed_at
        FROM sop_generation_jobs j
        JOIN sop_records s ON s.id = j.sop_id
        WHERE j.sop_id = ${sopId} AND s.org_id = ${dbOrgId}
        LIMIT 1
      ` as Array<{ status: string; job_state: unknown; error: string | null; started_at: string; completed_at: string | null }>;

      if (!rows[0]) {
        return { ok: true, data: { status: 'not_started', job: null, isActive: false } };
      }

      const row = rows[0];
      return {
        ok: true,
        data: {
          status: row.status,
          job: row.job_state,
          error: row.error,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          isActive: activeJobs.has(sopId),
        },
      };
    }
  );

  // DELETE /api/sop-generation/:sopId
  app.delete<{ Params: { sopId: string } }>(
    '/:sopId',
    { preHandler: [requireRole('admin', 'hr_manager')] },
    async (request, reply) => {
      const { orgId } = request.auth;
      const { sopId } = request.params;

      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      // Verify SOP belongs to this org before allowing cancel
      const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
      if (!orgRows[0]) {
        reply.status(404);
        return { ok: false, error: 'Org not found' };
      }
      const dbOrgId = (orgRows[0] as { id: string }).id;

      const sopRows = await sql`SELECT id FROM sop_records WHERE id = ${sopId} AND org_id = ${dbOrgId}`;
      if (!sopRows[0]) {
        reply.status(404);
        return { ok: false, error: 'SOP not found' };
      }

      const controller = activeJobs.get(sopId);
      if (!controller) {
        reply.status(404);
        return { ok: false, error: 'No active SOP generation for this ID' };
      }
      controller.abort();
      activeJobs.delete(sopId);
      return { ok: true, data: { cancelled: true } };
    }
  );
};
