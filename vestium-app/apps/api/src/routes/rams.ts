// ─── RAMS Routes ──────────────────────────────────────────────────────────────
// CRUD for rams_records + source document upload.
// Follows sops.ts pattern but with RAMS-specific fields.
// Review/attestation/certificates use /api/governance/:registryId/* (Phase 1).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { PDFParse } from 'pdf-parse';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { registerContent } from '../services/contentRegistry.js';
import type { RamsRecord, RamsSourceDocRecord, ApiResponse, PaginatedApiSuccess } from '@complianceforge/types';
import { requireRole } from '../plugins/rbac.js';
import { PaginationSchema } from '../utils/pagination.js';

const CreateRamsSchema = z.object({
  title: z.string().min(1),
  taskDescription: z.string().min(1),
  location: z.string().default(''),
  equipment: z.array(z.string()).default([]),
  workplaceContext: z.record(z.unknown()),
  regulatoryClassification: z.record(z.unknown()),
});

const MAX_DOCS = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const ramsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  });

  // GET /api/rams — list org's RAMS records
  app.get('/', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<RamsRecord[]> | PaginatedApiSuccess<RamsRecord>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    const { limit, offset } = PaginationSchema.parse(request.query);

    const countRows = await sql`SELECT count(*)::int AS total FROM rams_records WHERE org_id = ${dbOrgId}`;
    const total = (countRows[0] as { total: number }).total;

    const rows = await sql`
      SELECT id, org_id, title, task_description, location, equipment, status,
             workplace_context, regulatory_classification, generation_metadata,
             content_hash, deployed_at, created_at, updated_at
      FROM rams_records
      WHERE org_id = ${dbOrgId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { ok: true, data: rows.map(rowToRamsRecord), total, limit, offset };
  });

  // GET /api/rams/:id — fetch single RAMS + source doc list
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<{ rams: RamsRecord; sourceDocs: RamsSourceDocRecord[] }>> => {
    const { orgId } = request.auth;
    const { id } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const rows = await sql`
      SELECT r.id, r.org_id, r.title, r.task_description, r.location, r.equipment,
             r.status, r.workplace_context, r.regulatory_classification, r.generation_metadata,
             r.content_hash, r.deployed_at, r.created_at, r.updated_at
      FROM rams_records r
      JOIN orgs o ON o.id = r.org_id
      WHERE r.id = ${id} AND o.clerk_org_id = ${orgId}
    `;
    if (!rows[0]) { reply.status(404); return { ok: false, error: 'RAMS not found' }; }

    const docRows = await sql`
      SELECT id, rams_id, filename, doc_type, page_count, file_size, uploaded_at
      FROM rams_source_documents
      WHERE rams_id = ${id}
      ORDER BY uploaded_at ASC
    `;

    return {
      ok: true,
      data: {
        rams: rowToRamsRecord(rows[0]),
        sourceDocs: docRows.map(rowToSourceDocRecord),
      },
    };
  });

  // POST /api/rams — create RAMS record + register in content_registry
  app.post('/', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<RamsRecord & { registryId: string }>> => {
    const { userId, orgId, role } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const parsed = CreateRamsSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: 'Invalid request body', code: parsed.error.message };
    }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    const { title, taskDescription, location, equipment, workplaceContext, regulatoryClassification } = parsed.data;

    const rows = await sql`
      INSERT INTO rams_records
        (org_id, title, task_description, location, equipment, workplace_context, regulatory_classification)
      VALUES (
        ${dbOrgId},
        ${title},
        ${taskDescription},
        ${location},
        ${equipment},
        ${JSON.stringify(workplaceContext)},
        ${JSON.stringify(regulatoryClassification)}
      )
      RETURNING id, org_id, title, task_description, location, equipment, status,
                workplace_context, regulatory_classification, generation_metadata,
                content_hash, deployed_at, created_at, updated_at
    `;

    const rams = rowToRamsRecord(rows[0]);

    // Register in content_registry
    const registryId = await registerContent('rams', dbOrgId, rams.id, title);

    await writeAuditLog({
      orgId: dbOrgId, registryId, userId,
      userRole: role,
      action: 'content_registered',
      payload: { ramsId: rams.id, registryId, contentType: 'rams', taskDescription },
    });

    reply.status(201);
    return { ok: true, data: { ...rams, registryId } };
  });

  // DELETE /api/rams/:id — draft only
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<{ deleted: true }>> => {
    const { userId, orgId, role } = request.auth;
    const { id } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const rows = await sql`
      SELECT r.id, r.status, o.id AS db_org_id
      FROM rams_records r
      JOIN orgs o ON o.id = r.org_id
      WHERE r.id = ${id} AND o.clerk_org_id = ${orgId}
    ` as Array<{ id: string; status: string; db_org_id: string }>;

    if (!rows[0]) { reply.status(404); return { ok: false, error: 'RAMS not found' }; }

    const { status, db_org_id } = rows[0];
    if (status !== 'draft') {
      reply.status(409);
      return { ok: false, error: `Cannot delete RAMS with status '${status}'. Only drafts may be deleted.` };
    }

    // Delete content_registry entry (cascade will handle content_generation_jobs)
    await sql`DELETE FROM content_registry WHERE content_type = 'rams' AND source_entity_id = ${id}`;
    await sql`DELETE FROM rams_records WHERE id = ${id} AND org_id = ${db_org_id}`;

    await writeAuditLog({
      orgId: db_org_id, userId,
      userRole: role,
      action: 'module_deleted',
      payload: { ramsId: id, contentType: 'rams', status },
    });

    return { ok: true, data: { deleted: true } };
  });

  // POST /api/rams/:id/source-documents — upload source document
  app.post<{ Params: { id: string } }>('/:id/source-documents', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<RamsSourceDocRecord>> => {
    const { orgId } = request.auth;
    const { id: ramsId } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const rows = await sql`
      SELECT r.id, r.status
      FROM rams_records r
      JOIN orgs o ON o.id = r.org_id
      WHERE r.id = ${ramsId} AND o.clerk_org_id = ${orgId}
    `;
    if (!rows[0]) { reply.status(404); return { ok: false, error: 'RAMS not found' }; }
    if ((rows[0] as { status: string }).status !== 'draft') {
      reply.status(409);
      return { ok: false, error: 'Cannot add documents to a non-draft RAMS' };
    }

    const [countRow] = await sql`SELECT count(*)::int AS n FROM rams_source_documents WHERE rams_id = ${ramsId}` as Array<{ n: number }>;
    if (countRow.n >= MAX_DOCS) {
      reply.status(422);
      return { ok: false, error: `Maximum ${MAX_DOCS} source documents per RAMS` };
    }

    const data = await request.file();
    if (!data) { reply.status(400); return { ok: false, error: 'No file uploaded' }; }

    const docType = (data.fields['docType'] as { value?: string } | undefined)?.value ?? 'other';
    const validDocTypes = ['risk_assessment', 'method_statement', 'coshh_datasheet', 'permit_to_work', 'equipment_manual', 'other'];
    if (!validDocTypes.includes(docType)) {
      reply.status(400); return { ok: false, error: 'Invalid docType' };
    }

    const buffer = await data.toBuffer();
    const fileSize = buffer.length;

    if (fileSize > MAX_FILE_BYTES) {
      reply.status(413);
      return { ok: false, error: 'File exceeds 20 MB limit' };
    }

    let content = '';
    let pageCount: number | undefined;
    const filename = data.filename ?? 'upload';
    const mimetype = data.mimetype ?? '';

    // Validate PDF magic bytes when file claims to be PDF
    const isPdf = mimetype === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
    if (isPdf && (buffer.length < 4 || buffer.subarray(0, 4).toString('ascii') !== '%PDF')) {
      reply.status(422);
      return { ok: false, error: 'File does not appear to be a valid PDF (bad magic bytes)' };
    }

    try {
      if (isPdf) {
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        content = result.text;
        pageCount = result.total;
        await parser.destroy();
      } else {
        content = buffer.toString('utf-8');
      }
    } catch {
      reply.status(422);
      return { ok: false, error: 'Could not extract text from file. Use PDF or plain text.' };
    }

    if (!content.trim()) {
      reply.status(422);
      return { ok: false, error: 'File appears to be empty or unreadable.' };
    }

    const docRows = await sql`
      INSERT INTO rams_source_documents (rams_id, filename, doc_type, content, page_count, file_size)
      VALUES (${ramsId}, ${filename}, ${docType}, ${content}, ${pageCount ?? null}, ${fileSize})
      RETURNING id, rams_id, filename, doc_type, page_count, file_size, uploaded_at
    `;

    reply.status(201);
    return { ok: true, data: rowToSourceDocRecord(docRows[0]) };
  });
};

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToRamsRecord(row: Record<string, unknown>): RamsRecord {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    title: row.title as string,
    taskDescription: row.task_description as string,
    location: row.location as string,
    equipment: row.equipment as string[],
    status: row.status as RamsRecord['status'],
    workplaceContext: row.workplace_context as RamsRecord['workplaceContext'],
    regulatoryClassification: row.regulatory_classification as RamsRecord['regulatoryClassification'],
    generationMetadata: (row.generation_metadata as Record<string, unknown>) ?? {},
    contentHash: row.content_hash as string | undefined ?? undefined,
    deployedAt: row.deployed_at as string | undefined ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToSourceDocRecord(row: Record<string, unknown>): RamsSourceDocRecord {
  return {
    id: row.id as string,
    ramsId: row.rams_id as string,
    filename: row.filename as string,
    docType: row.doc_type as RamsSourceDocRecord['docType'],
    pageCount: row.page_count as number | undefined ?? undefined,
    fileSize: row.file_size as number | undefined ?? undefined,
    uploadedAt: row.uploaded_at as string,
  };
}
