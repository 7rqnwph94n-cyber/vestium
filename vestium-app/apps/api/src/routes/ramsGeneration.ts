// ─── RAMS Generation Routes ───────────────────────────────────────────────────
// POST /:ramsId/start  — starts RAMS pipeline, returns SSE stream
// GET  /:ramsId/status — returns current job state
// DELETE /:ramsId      — cancels a running job

import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../db/client.js';
import { runRamsGenerationJob } from '../pipeline/ramsJobRunner.js';
import { getRegistryIdByEntity } from '../services/contentRegistry.js';
import type { JobStepEvent } from '../pipeline/jobRunner.js';
import { resolveCorsOrigin } from '../utils/cors.js';
import { requireRole } from '../plugins/rbac.js';

const activeJobs = new Map<string, AbortController>();

export const ramsGenerationRoutes: FastifyPluginAsync = async (app) => {

  // POST /api/rams-generation/:ramsId/start
  app.post<{ Params: { ramsId: string } }>(
    '/:ramsId/start',
    { preHandler: [requireRole('admin', 'hr_manager')], config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { userId, orgId } = request.auth;
      const { ramsId } = request.params;

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

      const ramsRows = await sql`
        SELECT id, status FROM rams_records WHERE id = ${ramsId} AND org_id = ${dbOrgId}
      `;
      if (!ramsRows[0]) {
        reply.status(404).send({ ok: false, error: 'RAMS not found' });
        return;
      }
      if ((ramsRows[0] as { status: string }).status === 'deployed') {
        reply.status(409).send({ ok: false, error: 'Cannot regenerate a deployed RAMS — create a new record to preserve attestation immutability' });
        return;
      }

      // Require at least one source document
      const [docCount] = await sql`
        SELECT count(*)::int AS n FROM rams_source_documents WHERE rams_id = ${ramsId}
      ` as Array<{ n: number }>;
      if (docCount.n === 0) {
        reply.status(422).send({
          ok: false,
          error: 'At least one source document must be uploaded before generating a RAMS. Upload the existing risk assessment, method statement, or equipment manual.',
        });
        return;
      }

      // Look up registry ID
      const registryId = await getRegistryIdByEntity('rams', ramsId);
      if (!registryId) {
        reply.status(500).send({ ok: false, error: 'RAMS not registered in content_registry' });
        return;
      }

      if (activeJobs.has(ramsId)) {
        reply.status(409).send({ ok: false, error: 'RAMS generation already running' });
        return;
      }

      // SSE headers
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
      activeJobs.set(ramsId, abortController);

      const sendEvent = (event: JobStepEvent) => {
        try { reply.raw.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* client gone */ }
      };

      try {
        await runRamsGenerationJob(ramsId, registryId, dbOrgId, userId, sendEvent, abortController.signal);
      } catch {
        // Error already emitted via job_failed event
      } finally {
        activeJobs.delete(ramsId);
        reply.raw.end();
      }
    }
  );

  // GET /api/rams-generation/:ramsId/status
  app.get<{ Params: { ramsId: string } }>(
    '/:ramsId/status',
    { preHandler: [requireRole('admin', 'hr_manager')] },
    async (request, reply) => {
      const { orgId } = request.auth;
      const { ramsId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
      if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
      const dbOrgId = (orgRows[0] as { id: string }).id;

      const registryId = await getRegistryIdByEntity('rams', ramsId);
      if (!registryId) {
        return { ok: true, data: { status: 'not_started', job: null, isActive: false } };
      }

      const rows = await sql`
        SELECT j.status, j.job_state, j.error, j.started_at, j.completed_at
        FROM content_generation_jobs j
        WHERE j.registry_id = ${registryId} AND j.org_id = ${dbOrgId}
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
          isActive: activeJobs.has(ramsId),
        },
      };
    }
  );

  // DELETE /api/rams-generation/:ramsId
  app.delete<{ Params: { ramsId: string } }>(
    '/:ramsId',
    { preHandler: [requireRole('admin', 'hr_manager')] },
    async (request, reply) => {
      const { orgId } = request.auth;
      const { ramsId } = request.params;

      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
      if (!orgRows[0]) {
        reply.status(404);
        return { ok: false, error: 'Org not found' };
      }
      const dbOrgId = (orgRows[0] as { id: string }).id;

      const ramsRows = await sql`SELECT id FROM rams_records WHERE id = ${ramsId} AND org_id = ${dbOrgId}`;
      if (!ramsRows[0]) {
        reply.status(404);
        return { ok: false, error: 'RAMS not found' };
      }

      const controller = activeJobs.get(ramsId);
      if (!controller) {
        reply.status(404);
        return { ok: false, error: 'No active RAMS generation for this ID' };
      }
      controller.abort();
      activeJobs.delete(ramsId);
      return { ok: true, data: { cancelled: true } };
    }
  );
};
