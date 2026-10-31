// ─── Modules routes ───────────────────────────────────────────────────────────
// Module registry CRUD. Modules are created by the generation pipeline and
// updated through the review/deployment workflow.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { registerContent } from '../services/contentRegistry.js';
import type { ModuleRecord, DirectorModuleRecord, ApiResponse, PaginatedApiSuccess } from '@complianceforge/types';
import { requireRole } from '../plugins/rbac.js';
import { PaginationSchema } from '../utils/pagination.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateModuleSchema = z.object({
  title: z.string().min(1),
  workplaceContext: z.object({
    industryType: z.string(),
    industryLabel: z.string(),
    operations: z.string(),
    workforceProfile: z.string(),
    hazardKeywords: z.array(z.string()),
    additionalContext: z.string(),
  }),
  regulatoryClassification: z.object({
    primarySchemaId: z.string(),
    primarySchemaTitle: z.string(),
    applicableSchemas: z.array(z.object({
      schemaId: z.string(),
      shortTitle: z.string(),
      weight: z.number(),
      mandatory: z.boolean(),
      pending: z.boolean(),
    })),
    classificationNotes: z.string(),
  }),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export const modulesRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/modules/director — Director's View: modules + attestation summary, stale-first
  // Must be registered before /:id to avoid route collision
  app.get('/director', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<DirectorModuleRecord[]> | PaginatedApiSuccess<DirectorModuleRecord>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    const { limit, offset } = PaginationSchema.parse(request.query);

    const countRows = await sql`SELECT count(*)::int AS total FROM modules WHERE org_id = ${dbOrgId}`;
    const total = (countRows[0] as { total: number }).total;

    const rows = await sql`
      SELECT
        m.id, m.title, m.status, m.deployed_at, m.updated_at, m.created_at,
        m.regulatory_classification,
        a.reviewer_name, a.reviewer_role, a.attested_at
      FROM modules m
      LEFT JOIN LATERAL (
        SELECT reviewer_name, reviewer_role, attested_at
        FROM attestations
        WHERE module_id = m.id
        ORDER BY attested_at DESC
        LIMIT 1
      ) a ON true
      WHERE m.org_id = ${dbOrgId}
      ORDER BY
        CASE m.status
          WHEN 'stale'     THEN 0
          WHEN 'deployed'  THEN 1
          WHEN 'in_review' THEN 2
          ELSE 3
        END,
        m.updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { ok: true, data: (rows as Record<string, unknown>[]).map(rowToDirectorRecord), total, limit, offset };
  });

  // GET /api/modules — list org's modules
  app.get('/', { preHandler: [requireRole('admin', 'hr_manager', 'reviewer')] }, async (request, reply): Promise<ApiResponse<ModuleRecord[]> | PaginatedApiSuccess<ModuleRecord>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    const { limit, offset } = PaginationSchema.parse(request.query);

    const countRows = await sql`SELECT count(*)::int AS total FROM modules WHERE org_id = ${dbOrgId}`;
    const total = (countRows[0] as { total: number }).total;

    const rows = await sql`
      SELECT id, org_id, title, status, workplace_context, regulatory_classification,
             generation_metadata, content_hash, deployed_at, created_at, updated_at
      FROM modules
      WHERE org_id = ${dbOrgId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { ok: true, data: rows.map(rowToModuleRecord), total, limit, offset };
  });

  // GET /api/modules/:id — get single module
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [requireRole('admin', 'hr_manager', 'reviewer')] }, async (request, reply): Promise<ApiResponse<ModuleRecord>> => {
    const { orgId } = request.auth;
    const { id } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const rows = await sql`
      SELECT m.id, m.org_id, m.title, m.status, m.workplace_context, m.regulatory_classification,
             m.generation_metadata, m.content_hash, m.deployed_at, m.created_at, m.updated_at
      FROM modules m
      JOIN orgs o ON o.id = m.org_id
      WHERE m.id = ${id} AND o.clerk_org_id = ${orgId}
    `;

    if (!rows[0]) { reply.status(404); return { ok: false, error: 'Module not found' }; }
    return { ok: true, data: rowToModuleRecord(rows[0]) };
  });

  // POST /api/modules — create module record (called at generation start)
  app.post('/', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<ModuleRecord>> => {
    const { userId, orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const parsed = CreateModuleSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: 'Invalid request body', code: parsed.error.message };
    }

    // Upsert org — auto-provisions if user has not yet visited /api/orgs/me.
    const orgRows = await sql`
      INSERT INTO orgs (clerk_org_id, name, tier)
      VALUES (${orgId}, ${orgId}, 1)
      ON CONFLICT (clerk_org_id) DO UPDATE SET clerk_org_id = EXCLUDED.clerk_org_id
      RETURNING id
    `;
    const dbOrgId = (orgRows[0] as { id: string }).id;

    // Auto-cleanup: delete orphaned draft modules for this org before creating a new one.
    // Preserves any draft with an actively running job (to avoid race conditions).
    // This prevents accumulation of abandoned draft modules from failed/retried generations.
    await sql`
      DELETE FROM modules
      WHERE org_id = ${dbOrgId}
        AND status = 'draft'
        AND id NOT IN (
          SELECT module_id FROM generation_jobs WHERE status = 'running'
        )
    `;

    const { title, regulatoryClassification } = parsed.data;
    let { workplaceContext } = parsed.data;

    // ── Org context: inherit or capture ──────────────────────────────────────
    // First module for this org → store workplace context in org_contexts.
    // Subsequent modules → inherit workplace context from org (ignore client payload).
    // Each module still records its own workplace_context copy for cert chain integrity.
    const existingOrgCtx = await sql`
      SELECT workplace_context FROM org_contexts WHERE org_id = ${dbOrgId}
    `;
    if (existingOrgCtx[0]) {
      // Inherit org-level workplace context (authoritative source)
      workplaceContext = (existingOrgCtx[0] as { workplace_context: typeof workplaceContext }).workplace_context;
    } else {
      // First module — capture workplace context at org level
      await sql`
        INSERT INTO org_contexts (org_id, workplace_context)
        VALUES (${dbOrgId}, ${JSON.stringify(workplaceContext)})
        ON CONFLICT (org_id) DO NOTHING
      `;
    }

    const rows = await sql`
      INSERT INTO modules (org_id, title, workplace_context, regulatory_classification, generation_metadata)
      VALUES (
        ${dbOrgId},
        ${title},
        ${JSON.stringify(workplaceContext)},
        ${JSON.stringify(regulatoryClassification)},
        ${JSON.stringify({})}
      )
      RETURNING id, org_id, title, status, workplace_context, regulatory_classification,
                generation_metadata, content_hash, deployed_at, created_at, updated_at
    `;

    const module = rowToModuleRecord(rows[0]);

    // v2: dual-write to content_registry
    const registryId = await registerContent('module', dbOrgId, module.id, title);

    await writeAuditLog({
      orgId: dbOrgId,
      moduleId: module.id,
      registryId,
      userId,
      action: 'generation_started',
      payload: { title, primarySchema: regulatoryClassification.primarySchemaId },
    });

    reply.status(201);
    return { ok: true, data: module };
  });

  // DELETE /api/modules/:id — permanently delete a draft module and its job state.
  // Only draft-status modules may be deleted. in_review / deployed modules are protected.
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireRole('admin')] }, async (request, reply): Promise<ApiResponse<{ deleted: true }>> => {
    const { userId, orgId } = request.auth;
    const { id } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const rows = await sql`
      SELECT m.id, m.status, o.id AS db_org_id
      FROM modules m
      JOIN orgs o ON o.id = m.org_id
      WHERE m.id = ${id} AND o.clerk_org_id = ${orgId}
    ` as Array<{ id: string; status: string; db_org_id: string }>;

    if (!rows[0]) { reply.status(404); return { ok: false, error: 'Module not found' }; }

    const { status, db_org_id } = rows[0];
    if (status !== 'draft') {
      reply.status(409);
      return { ok: false, error: `Cannot delete a module with status '${status}'. Only draft modules may be deleted.` };
    }

    // generation_jobs CASCADE deletes on module FK, so no separate cleanup needed.
    await sql`DELETE FROM modules WHERE id = ${id} AND org_id = ${db_org_id}`;

    await writeAuditLog({
      orgId: db_org_id,
      moduleId: id,
      userId,
      action: 'module_deleted',
      payload: { status },
    });

    return { ok: true, data: { deleted: true } };
  });
};

// ─── Row mapper ───────────────────────────────────────────────────────────────

function rowToDirectorRecord(row: Record<string, unknown>): DirectorModuleRecord {
  const rc = row.regulatory_classification as { applicableSchemas?: Array<{ schemaId: string }> } | undefined;
  return {
    id: row.id as string,
    title: row.title as string,
    status: row.status as DirectorModuleRecord['status'],
    deployedAt: row.deployed_at as string | undefined,
    updatedAt: row.updated_at as string,
    createdAt: row.created_at as string,
    primarySchema: rc?.applicableSchemas?.[0]?.schemaId,
    reviewerName: row.reviewer_name as string | undefined,
    reviewerRole: row.reviewer_role as string | undefined,
    attestedAt: row.attested_at as string | undefined,
  };
}

function rowToModuleRecord(row: Record<string, unknown>): ModuleRecord {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    title: row.title as string,
    status: row.status as ModuleRecord['status'],
    workplaceContext: row.workplace_context as ModuleRecord['workplaceContext'],
    regulatoryClassification: row.regulatory_classification as ModuleRecord['regulatoryClassification'],
    generationMetadata: row.generation_metadata as ModuleRecord['generationMetadata'],
    contentHash: row.content_hash as string | undefined,
    deployedAt: row.deployed_at as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
