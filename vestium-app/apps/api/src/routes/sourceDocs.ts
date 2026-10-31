// ─── Source Documents routes ───────────────────────────────────────────────────
// Manages the regulatory source document registry.
//   GET  /api/source-documents     — list all source docs
//   PATCH /api/source-documents/:id — update source doc version; auto-flags
//                                     dependent modules as stale

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { sendStaleModuleAlert } from '../lib/email.js';
import { requireRole } from '../plugins/rbac.js';

const UpdateSourceDocSchema = z.object({
  version: z.string().min(1).optional(),
  effectiveDate: z.string().optional(),  // ISO date string
  isCurrent: z.boolean().optional(),
  supersededBy: z.string().optional(),
});

interface SourceDocRecord {
  id: string;
  schemaId: string;
  title: string;
  url: string;
  publisher: string;
  docType: string;
  year: number;
  version?: string;
  effectiveDate?: string;
  isCurrent: boolean;
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
}

function rowToSourceDoc(row: Record<string, unknown>): SourceDocRecord {
  return {
    id: row.id as string,
    schemaId: row.schema_id as string,
    title: row.title as string,
    url: row.url as string,
    publisher: row.publisher as string,
    docType: row.doc_type as string,
    year: row.year as number,
    version: row.version as string | undefined,
    effectiveDate: row.effective_date as string | undefined,
    isCurrent: row.is_current as boolean,
    supersededBy: row.superseded_by as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const sourceDocsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/source-documents — list all source docs
  // RBAC: admin/hr_manager only — regulatory registry is management data.
  app.get('/', { preHandler: [requireRole('admin', 'hr_manager')] }, async () => {
    const rows = await sql`
      SELECT * FROM source_documents ORDER BY schema_id, year DESC
    `;
    return { ok: true, data: (rows as Record<string, unknown>[]).map((r) => rowToSourceDoc(r)) };
  });

  // PATCH /api/source-documents/:id
  // Update version, effective date, or supersession.
  // Automatically flags any deployed/in_review modules using this schema as 'stale'.
  // PLATFORM ADMIN ONLY — source_documents are a global regulatory registry shared across
  // all orgs. Mutating them can stale-flag modules for every tenant on the platform.
  // Gate via PLATFORM_ADMIN_USER_IDS env var (comma-separated Clerk user IDs).
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { userId, orgId } = request.auth;
    const { id } = request.params;

    if (!orgId) {
      reply.status(400);
      return { ok: false, error: 'No active org' };
    }

    const adminIds = (process.env.PLATFORM_ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (adminIds.length === 0 || !adminIds.includes(userId)) {
      reply.status(403);
      return { ok: false, error: 'Source document mutation requires platform administrator access' };
    }

    const parsed = UpdateSourceDocSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: 'Invalid request body', code: parsed.error.message };
    }

    const existingRows = await sql`SELECT * FROM source_documents WHERE id = ${id}`;
    if (!existingRows[0]) {
      reply.status(404);
      return { ok: false, error: 'Source document not found' };
    }
    const existing = rowToSourceDoc(existingRows[0] as Record<string, unknown>);

    // Apply updates
    const { version, effectiveDate, isCurrent, supersededBy } = parsed.data;
    const updatedRows = await sql`
      UPDATE source_documents
      SET
        version        = COALESCE(${version ?? null}, version),
        effective_date = COALESCE(${effectiveDate ?? null}::date, effective_date),
        is_current     = COALESCE(${isCurrent ?? null}, is_current),
        superseded_by  = COALESCE(${supersededBy ?? null}, superseded_by),
        updated_at     = now()
      WHERE id = ${id}
      RETURNING *
    `;
    const updated = rowToSourceDoc(updatedRows[0] as Record<string, unknown>);

    // Stale-flag deployed/in_review modules that reference this schema.
    // A module references a schema via regulatory_classification.applicableSchemas[].schemaId.
    const schemaId = existing.schemaId;
    const staleResult = await sql`
      UPDATE modules
      SET status = 'stale', updated_at = now()
      WHERE status IN ('deployed', 'in_review')
        AND regulatory_classification @> ${JSON.stringify({ applicableSchemas: [{ schemaId }] })}::jsonb
      RETURNING id, org_id, title
    `;

    // Write audit entries for each flagged module
    for (const staleRow of staleResult as Record<string, unknown>[]) {
      await writeAuditLog({
        orgId: staleRow.org_id as string,
        moduleId: staleRow.id as string,
        userId,
        action: 'module_stale_flagged',
        payload: {
          reason: 'source_doc_updated',
          sourceDocId: id,
          schemaId,
          newVersion: version ?? existing.version,
        },
      });
    }

    // Fire-and-forget stale alert emails grouped by org
    if (staleResult.length > 0) {
      const byOrg = new Map<string, string[]>();
      for (const row of staleResult as Array<{ org_id: string; title: string }>) {
        const titles = byOrg.get(row.org_id) ?? [];
        titles.push(row.title);
        byOrg.set(row.org_id, titles);
      }
      setImmediate(() => {
        for (const [stalledOrgId, titles] of byOrg) {
          void (async () => {
            try {
              const orgRows = await sql`SELECT clerk_org_id FROM orgs WHERE id = ${stalledOrgId}`;
              const clerkOrgId = (orgRows[0] as Record<string, unknown> | undefined)?.clerk_org_id as string | undefined;
              if (clerkOrgId) await sendStaleModuleAlert(clerkOrgId, titles);
            } catch (err) {
              console.warn('[sourceDocs] stale alert email failed:', err);
            }
          })();
        }
      });
    }

    return {
      ok: true,
      data: { updated, staleFlagged: staleResult.length },
    };
  });
};
