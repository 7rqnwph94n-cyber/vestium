// ─── Audit log routes ─────────────────────────────────────────────────────────
// Read-only access to the audit log. All writes go through writeAuditLog().
// Log is WORM — no write/update/delete endpoints exist here.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import type { AuditLogEntry, ApiResponse } from '@complianceforge/types';
import { requireRole } from '../plugins/rbac.js';

const AuditQuerySchema = z.object({
  moduleId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const auditRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/audit?moduleId=&limit=&offset=
  app.get<{
    Querystring: { moduleId?: string; limit?: string; offset?: string };
  }>('/', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<AuditLogEntry[]>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const parsed = AuditQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: 'Invalid query parameters' };
    }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    const { limit, offset } = parsed.data;
    const moduleId = parsed.data.moduleId;

    const rows = moduleId
      ? await sql`
          SELECT id, org_id, module_id, user_id, action, payload, created_at
          FROM audit_log
          WHERE org_id = ${dbOrgId} AND module_id = ${moduleId}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      : await sql`
          SELECT id, org_id, module_id, user_id, action, payload, created_at
          FROM audit_log
          WHERE org_id = ${dbOrgId}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;

    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id as string,
        orgId: row.org_id as string,
        moduleId: row.module_id as string | undefined,
        userId: row.user_id as string,
        action: row.action as AuditLogEntry['action'],
        payload: row.payload as Record<string, unknown>,
        createdAt: row.created_at as string,
      })),
    };
  });
};
