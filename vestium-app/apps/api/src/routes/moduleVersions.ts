// ─── Module Version History Routes ───────────────────────────────────────────
// Exposes WORM-protected content snapshots for version history and diff.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { listModuleVersions, getModuleVersion } from '../services/moduleSnapshots.js';
import { jsonDiff } from '../utils/jsonDiff.js';
import { requireRole } from '../plugins/rbac.js';
import type { ApiResponse } from '@complianceforge/types';
import type { ModuleSnapshotSummary, ModuleSnapshot } from '../services/moduleSnapshots.js';
import type { DiffEntry } from '../utils/jsonDiff.js';

export const moduleVersionRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/module-versions/:moduleId/versions — list version summaries
  app.get<{ Params: { moduleId: string } }>(
    '/:moduleId/versions',
    { preHandler: [requireRole('admin', 'hr_manager', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<ModuleSnapshotSummary[]>> => {
      const { orgId } = request.auth;
      const { moduleId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      // Verify org ownership
      const ownerRows = await sql`
        SELECT 1 FROM modules m JOIN orgs o ON o.id = m.org_id
        WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
      `;
      if (!ownerRows[0]) { reply.status(404); return { ok: false, error: 'Module not found' }; }

      const versions = await listModuleVersions(moduleId);
      return { ok: true, data: versions };
    }
  );

  // GET /api/module-versions/:moduleId/versions/:version — get full snapshot
  app.get<{ Params: { moduleId: string; version: string } }>(
    '/:moduleId/versions/:version',
    { preHandler: [requireRole('admin', 'hr_manager', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<ModuleSnapshot>> => {
      const { orgId } = request.auth;
      const { moduleId } = request.params;
      const version = z.coerce.number().int().min(1).parse(request.params.version);
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const ownerRows = await sql`
        SELECT 1 FROM modules m JOIN orgs o ON o.id = m.org_id
        WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
      `;
      if (!ownerRows[0]) { reply.status(404); return { ok: false, error: 'Module not found' }; }

      const snapshot = await getModuleVersion(moduleId, version);
      if (!snapshot) { reply.status(404); return { ok: false, error: 'Version not found' }; }

      return { ok: true, data: snapshot };
    }
  );

  // GET /api/module-versions/:moduleId/diff/:v1/:v2 — JSON diff between versions
  app.get<{ Params: { moduleId: string; v1: string; v2: string } }>(
    '/:moduleId/diff/:v1/:v2',
    { preHandler: [requireRole('admin', 'hr_manager', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<DiffEntry[]>> => {
      const { orgId } = request.auth;
      const { moduleId } = request.params;
      const v1 = z.coerce.number().int().min(1).parse(request.params.v1);
      const v2 = z.coerce.number().int().min(1).parse(request.params.v2);
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const ownerRows = await sql`
        SELECT 1 FROM modules m JOIN orgs o ON o.id = m.org_id
        WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
      `;
      if (!ownerRows[0]) { reply.status(404); return { ok: false, error: 'Module not found' }; }

      const [snap1, snap2] = await Promise.all([
        getModuleVersion(moduleId, v1),
        getModuleVersion(moduleId, v2),
      ]);

      if (!snap1) { reply.status(404); return { ok: false, error: `Version ${v1} not found` }; }
      if (!snap2) { reply.status(404); return { ok: false, error: `Version ${v2} not found` }; }

      const diff = jsonDiff(snap1.content, snap2.content);
      return { ok: true, data: diff };
    }
  );
};
