// ─── SOP Routes ───────────────────────────────────────────────────────────────
// CRUD for sop_records + source document upload.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { PDFParse } from 'pdf-parse';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { registerContent } from '../services/contentRegistry.js';
import type { SopRecord, SopSourceDocRecord, ApiResponse, PaginatedApiSuccess } from '@complianceforge/types';
import { requireRole } from '../plugins/rbac.js';
import { PaginationSchema } from '../utils/pagination.js';

const CreateSopSchema = z.object({
  title: z.string().min(1),
  procedureName: z.string().min(1),
  equipment: z.string().min(1),
  moduleId: z.string().uuid().optional(),
  workplaceContext: z.record(z.unknown()),
  regulatoryClassification: z.record(z.unknown()),
});

// ─── Batch creation — up to 10 SOPs sharing the same workplace context ────────
// Each procedure entry produces an independent sop_record row. Source documents
// are uploaded separately via /api/sops/:id/source-documents after creation.
// Generation must be started individually per SOP (POST /api/sop-generation/:id/start).
const BatchCreateSopsSchema = z.object({
  moduleId: z.string().uuid().optional(),
  workplaceContext: z.record(z.unknown()),
  regulatoryClassification: z.record(z.unknown()),
  procedures: z.array(
    z.object({
      title: z.string().min(1),
      procedureName: z.string().min(1),
      equipment: z.string().min(1),
    })
  ).min(1).max(10),
});

const MAX_DOCS = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export const sopRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  });

  // GET /api/sops — list org's SOPs
  app.get('/', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<SopRecord[]> | PaginatedApiSuccess<SopRecord>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    const { limit, offset } = PaginationSchema.parse(request.query);

    const countRows = await sql`SELECT count(*)::int AS total FROM sop_records WHERE org_id = ${dbOrgId}`;
    const total = (countRows[0] as { total: number }).total;

    const rows = await sql`
      SELECT id, org_id, module_id, title, procedure_name, equipment, status,
             workplace_context, regulatory_classification, generation_metadata,
             content_hash, deployed_at, created_at, updated_at
      FROM sop_records
      WHERE org_id = ${dbOrgId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { ok: true, data: rows.map(rowToSopRecord), total, limit, offset };
  });

  // GET /api/sops/:id — fetch single SOP + source doc list
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<{ sop: SopRecord; sourceDocs: SopSourceDocRecord[] }>> => {
    const { orgId } = request.auth;
    const { id } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const rows = await sql`
      SELECT s.id, s.org_id, s.module_id, s.title, s.procedure_name, s.equipment, s.status,
             s.workplace_context, s.regulatory_classification, s.generation_metadata,
             s.content_hash, s.deployed_at, s.created_at, s.updated_at
      FROM sop_records s
      JOIN orgs o ON o.id = s.org_id
      WHERE s.id = ${id} AND o.clerk_org_id = ${orgId}
    `;
    if (!rows[0]) { reply.status(404); return { ok: false, error: 'SOP not found' }; }

    const docRows = await sql`
      SELECT id, sop_id, filename, doc_type, page_count, file_size, uploaded_at
      FROM sop_source_documents
      WHERE sop_id = ${id}
      ORDER BY uploaded_at ASC
    `;

    return {
      ok: true,
      data: {
        sop: rowToSopRecord(rows[0]),
        sourceDocs: docRows.map(rowToSourceDocRecord),
      },
    };
  });

  // POST /api/sops — create SOP record
  app.post('/', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<SopRecord>> => {
    const { userId, orgId, role } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const parsed = CreateSopSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: 'Invalid request body', code: parsed.error.message };
    }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    const { title, procedureName, equipment, moduleId, workplaceContext, regulatoryClassification } = parsed.data;

    // If moduleId given, verify it belongs to this org
    if (moduleId) {
      const modRows = await sql`SELECT id FROM modules WHERE id = ${moduleId} AND org_id = ${dbOrgId}`;
      if (!modRows[0]) { reply.status(404); return { ok: false, error: 'Module not found or not owned by org' }; }
    }

    const rows = await sql`
      INSERT INTO sop_records
        (org_id, module_id, title, procedure_name, equipment, workplace_context, regulatory_classification)
      VALUES (
        ${dbOrgId},
        ${moduleId ?? null},
        ${title},
        ${procedureName},
        ${equipment},
        ${JSON.stringify(workplaceContext)},
        ${JSON.stringify(regulatoryClassification)}
      )
      RETURNING id, org_id, module_id, title, procedure_name, equipment, status,
                workplace_context, regulatory_classification, generation_metadata,
                content_hash, deployed_at, created_at, updated_at
    `;

    const sop = rowToSopRecord(rows[0]);

    // v2: dual-write to content_registry
    const registryId = await registerContent('sop', dbOrgId, sop.id, title);

    await writeAuditLog({
      orgId: dbOrgId, moduleId: moduleId, registryId, userId,
      userRole: role,
      action: 'generation_started',
      payload: { sopId: sop.id, registryId, procedureName, equipment },
    });

    reply.status(201);
    return { ok: true, data: sop };
  });

  // POST /api/sops/batch — create multiple SOP records in a single request
  // Source documents must be uploaded per-SOP after creation; generation is triggered per-SOP.
  // Hidden feature: gated in the frontend by VITE_FEATURE_BATCH_SOPS. Backend is always active.
  app.post('/batch', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<{ sops: SopRecord[] }>> => {
    const { userId, orgId, role } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const parsed = BatchCreateSopsSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: 'Invalid request body', code: parsed.error.message };
    }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    const { moduleId, workplaceContext, regulatoryClassification, procedures } = parsed.data;

    if (moduleId) {
      const modRows = await sql`SELECT id FROM modules WHERE id = ${moduleId} AND org_id = ${dbOrgId}`;
      if (!modRows[0]) { reply.status(404); return { ok: false, error: 'Module not found or not owned by org' }; }
    }

    const created: SopRecord[] = [];

    for (const proc of procedures) {
      const rows = await sql`
        INSERT INTO sop_records
          (org_id, module_id, title, procedure_name, equipment, workplace_context, regulatory_classification)
        VALUES (
          ${dbOrgId},
          ${moduleId ?? null},
          ${proc.title},
          ${proc.procedureName},
          ${proc.equipment},
          ${JSON.stringify(workplaceContext)},
          ${JSON.stringify(regulatoryClassification)}
        )
        RETURNING id, org_id, module_id, title, procedure_name, equipment, status,
                  workplace_context, regulatory_classification, generation_metadata,
                  content_hash, deployed_at, created_at, updated_at
      `;
      const sopRec = rowToSopRecord(rows[0]);
      // v2: dual-write to content_registry
      await registerContent('sop', dbOrgId, sopRec.id, proc.title);
      created.push(sopRec);
    }

    await writeAuditLog({
      orgId: dbOrgId, moduleId, userId,
      userRole: role,
      action: 'generation_started',
      payload: { batch: true, sopIds: created.map((s) => s.id), count: created.length },
    });

    reply.status(201);
    return { ok: true, data: { sops: created } };
  });

  // DELETE /api/sops/:id — draft only
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<{ deleted: true }>> => {
    const { userId, orgId, role } = request.auth;
    const { id } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const rows = await sql`
      SELECT s.id, s.status, o.id AS db_org_id
      FROM sop_records s
      JOIN orgs o ON o.id = s.org_id
      WHERE s.id = ${id} AND o.clerk_org_id = ${orgId}
    ` as Array<{ id: string; status: string; db_org_id: string }>;

    if (!rows[0]) { reply.status(404); return { ok: false, error: 'SOP not found' }; }

    const { status, db_org_id } = rows[0];
    if (status !== 'draft') {
      reply.status(409);
      return { ok: false, error: `Cannot delete a SOP with status '${status}'. Only draft SOPs may be deleted.` };
    }

    await sql`DELETE FROM sop_records WHERE id = ${id} AND org_id = ${db_org_id}`;

    await writeAuditLog({
      orgId: db_org_id, moduleId: undefined, userId,
      userRole: role,
      action: 'module_deleted',
      payload: { sopId: id, status },
    });

    return { ok: true, data: { deleted: true } };
  });

  // POST /api/sops/:id/source-documents — upload a source document (PDF or text)
  app.post<{ Params: { id: string } }>('/:id/source-documents', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply): Promise<ApiResponse<SopSourceDocRecord>> => {
    const { orgId } = request.auth;
    const { id: sopId } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    // Verify SOP ownership
    const rows = await sql`
      SELECT s.id, s.status
      FROM sop_records s
      JOIN orgs o ON o.id = s.org_id
      WHERE s.id = ${sopId} AND o.clerk_org_id = ${orgId}
    `;
    if (!rows[0]) { reply.status(404); return { ok: false, error: 'SOP not found' }; }
    if ((rows[0] as { status: string }).status !== 'draft') {
      reply.status(409);
      return { ok: false, error: 'Cannot add documents to a non-draft SOP' };
    }

    // Check doc count
    const [countRow] = await sql`SELECT count(*)::int AS n FROM sop_source_documents WHERE sop_id = ${sopId}` as Array<{ n: number }>;
    if (countRow.n >= MAX_DOCS) {
      reply.status(422);
      return { ok: false, error: `Maximum ${MAX_DOCS} source documents per SOP` };
    }

    // Parse multipart
    const data = await request.file();
    if (!data) { reply.status(400); return { ok: false, error: 'No file uploaded' }; }

    const docType = (data.fields['docType'] as { value?: string } | undefined)?.value ?? 'other';
    const validDocTypes = ['operator_manual', 'maintenance_schedule', 'risk_assessment', 'coshh_datasheet', 'other'];
    if (!validDocTypes.includes(docType)) {
      reply.status(400); return { ok: false, error: 'Invalid docType' };
    }

    const buffer = await data.toBuffer();
    const fileSize = buffer.length;

    if (fileSize > MAX_FILE_BYTES) {
      reply.status(413);
      return { ok: false, error: 'File exceeds 20 MB limit' };
    }

    // Extract text
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
        // Plain text / txt / md
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
      INSERT INTO sop_source_documents (sop_id, filename, doc_type, content, page_count, file_size)
      VALUES (${sopId}, ${filename}, ${docType}, ${content}, ${pageCount ?? null}, ${fileSize})
      RETURNING id, sop_id, filename, doc_type, page_count, file_size, uploaded_at
    `;

    reply.status(201);
    return { ok: true, data: rowToSourceDocRecord(docRows[0]) };
  });
};

// ─── Row mappers ─────────────────────────────────────────────────────────────

function rowToSopRecord(row: Record<string, unknown>): SopRecord {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    moduleId: row.module_id as string | undefined ?? undefined,
    title: row.title as string,
    procedureName: row.procedure_name as string,
    equipment: row.equipment as string,
    status: row.status as SopRecord['status'],
    workplaceContext: row.workplace_context as SopRecord['workplaceContext'],
    regulatoryClassification: row.regulatory_classification as SopRecord['regulatoryClassification'],
    generationMetadata: (row.generation_metadata as Record<string, unknown>) ?? {},
    contentHash: row.content_hash as string | undefined ?? undefined,
    deployedAt: row.deployed_at as string | undefined ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToSourceDocRecord(row: Record<string, unknown>): SopSourceDocRecord {
  return {
    id: row.id as string,
    sopId: row.sop_id as string,
    filename: row.filename as string,
    docType: row.doc_type as SopSourceDocRecord['docType'],
    pageCount: row.page_count as number | undefined ?? undefined,
    fileSize: row.file_size as number | undefined ?? undefined,
    uploadedAt: row.uploaded_at as string,
  };
}
