// ─── Org Context routes ──────────────────────────────────────────────────────
// GET /api/org-context — returns org-level workplace context + distilled intelligence.
// Used by the frontend to pre-populate workplace fields and show module history.

import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../db/client.js';
import type { OrgContextDTO, DistilledOrgContextDTO, WorkplaceContextDTO } from '@complianceforge/types';
import { requireRole } from '../plugins/rbac.js';

const EMPTY_DISTILLED: DistilledOrgContextDTO = {
  coveredTopics: [],
  coveredRegulations: [],
  reviewerCorrections: [],
  domainInsights: [],
  moduleSummaries: [],
};

export const orgContextRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/org-context
  // RBAC: admin/hr_manager only — org intelligence is management data.
  app.get('/', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply) => {
    const { orgId } = request.auth;
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

    // Check for existing org_contexts row
    const ctxRows = await sql`
      SELECT workplace_context, distilled_context, modules_deployed, last_distilled_at
      FROM org_contexts WHERE org_id = ${dbOrgId}
    `;

    if (ctxRows[0]) {
      const row = ctxRows[0] as {
        workplace_context: WorkplaceContextDTO;
        distilled_context: DistilledOrgContextDTO;
        modules_deployed: number;
        last_distilled_at: string | null;
      };
      const dto: OrgContextDTO = {
        orgId: dbOrgId,
        workplaceContext: row.workplace_context,
        distilledContext: row.distilled_context ?? EMPTY_DISTILLED,
        modulesDeployed: row.modules_deployed,
        lastDistilledAt: row.last_distilled_at ?? undefined,
      };
      return { ok: true, data: dto };
    }

    // Backfill: org has modules but no org_contexts row yet
    // (pre-existing orgs created before this feature)
    const backfillRows = await sql`
      SELECT workplace_context FROM modules
      WHERE org_id = ${dbOrgId}
      ORDER BY created_at ASC
      LIMIT 1
    `;

    if (backfillRows[0]) {
      const wc = (backfillRows[0] as { workplace_context: WorkplaceContextDTO }).workplace_context;
      const deployedCount = await sql`
        SELECT count(*)::int AS cnt FROM modules
        WHERE org_id = ${dbOrgId} AND status = 'deployed'
      `;
      const cnt = (deployedCount[0] as { cnt: number }).cnt;

      await sql`
        INSERT INTO org_contexts (org_id, workplace_context, modules_deployed)
        VALUES (${dbOrgId}, ${JSON.stringify(wc)}, ${cnt})
        ON CONFLICT (org_id) DO NOTHING
      `;

      const dto: OrgContextDTO = {
        orgId: dbOrgId,
        workplaceContext: wc,
        distilledContext: EMPTY_DISTILLED,
        modulesDeployed: cnt,
        lastDistilledAt: undefined,
      };
      return { ok: true, data: dto };
    }

    // No context and no modules — fresh org
    return { ok: true, data: null };
  });
};
