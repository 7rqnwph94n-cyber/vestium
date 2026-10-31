// ─── SOP Review Routes ────────────────────────────────────────────────────────
// Findings disposition and attestation for SOPs.
// Mirrors review.ts pattern — separate tables (sop_review_findings, sop_attestations).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import type { ApiResponse, SopReviewFinding, SopAttestationRecord } from '@complianceforge/types';
import { validateAttestationPreconditions } from '../regulatory/reviewPolicy.js';
import { requireRole } from '../plugins/rbac.js';

const CreateFindingSchema = z.object({
  severity: z.enum(['regulatory', 'high', 'medium', 'low']),
  category: z.enum(['A', 'B']),
  description: z.string().min(1),
  location: z.string().min(1),
  regulatoryRef: z.string().optional(),
  sourceAttribution: z.string().optional(),
});

const DisposeFindingSchema = z.object({
  disposition: z.enum(['accepted', 'amended', 'escalated']),
  rationale: z.string().min(5),
});

const CreateAttestationSchema = z.object({
  reviewerName: z.string().min(1),
  reviewerRole: z.string().min(1),
  basisOfCompetence: z.string().min(1),
  regulatoryFrameworksReviewed: z.array(z.string().min(1)).min(1),
  explicitAcceptance: z.string().min(1),
  contentHashAtAttestation: z.string().min(1),
});

export const sopReviewRoutes: FastifyPluginAsync = async (app) => {

  // ── Helper: verify SOP belongs to org ──────────────────────────────────────
  async function verifySopOwnership(sopId: string, clerkOrgId: string): Promise<{ dbOrgId: string } | null> {
    const rows = await sql`
      SELECT o.id AS db_org_id
      FROM sop_records s
      JOIN orgs o ON o.id = s.org_id
      WHERE s.id = ${sopId} AND o.clerk_org_id = ${clerkOrgId}
    ` as Array<{ db_org_id: string }>;
    return rows[0] ? { dbOrgId: rows[0].db_org_id } : null;
  }

  // GET /api/sop-review/:sopId/findings
  app.get<{ Params: { sopId: string } }>('/:sopId/findings', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<SopReviewFinding[]>> => {
    const { orgId } = request.auth;
    const { sopId } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    if (!await verifySopOwnership(sopId, orgId)) {
      reply.status(404); return { ok: false, error: 'SOP not found' };
    }

    const rows = await sql`
      SELECT id, sop_id, severity, category, description, location,
             regulatory_ref, source_attribution, disposition,
             disposition_rationale, disposed_by, disposed_at, created_at
      FROM sop_review_findings
      WHERE sop_id = ${sopId}
      ORDER BY category ASC, severity DESC, created_at ASC
    `;

    return { ok: true, data: rows.map(rowToFinding) };
  });

  // POST /api/sop-review/:sopId/findings
  app.post<{ Params: { sopId: string } }>('/:sopId/findings', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<SopReviewFinding>> => {
    const { userId, orgId, role } = request.auth;
    const { sopId } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const ownership = await verifySopOwnership(sopId, orgId);
    if (!ownership) { reply.status(404); return { ok: false, error: 'SOP not found' }; }

    const parsed = CreateFindingSchema.safeParse(request.body);
    if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

    const { severity, category, description, location, regulatoryRef, sourceAttribution } = parsed.data;

    const rows = await sql`
      INSERT INTO sop_review_findings
        (sop_id, severity, category, description, location, regulatory_ref, source_attribution)
      VALUES (
        ${sopId}, ${severity}, ${category}, ${description}, ${location},
        ${regulatoryRef ?? null}, ${sourceAttribution ?? null}
      )
      RETURNING id, sop_id, severity, category, description, location,
                regulatory_ref, source_attribution, disposition,
                disposition_rationale, disposed_by, disposed_at, created_at
    `;

    await writeAuditLog({
      orgId: ownership.dbOrgId, userId,
      userRole: role,
      action: 'finding_disposed',
      payload: { sopId, findingId: (rows[0] as { id: string }).id, action: 'created', severity, category },
    });

    reply.status(201);
    return { ok: true, data: rowToFinding(rows[0]) };
  });

  // PATCH /api/sop-review/findings/:findingId/disposition
  app.patch<{ Params: { findingId: string } }>('/findings/:findingId/disposition', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<SopReviewFinding>> => {
    const { userId, orgId, role } = request.auth;
    const { findingId } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const parsed = DisposeFindingSchema.safeParse(request.body);
    if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

    // Fetch finding + verify org ownership via sop
    const findingRows = await sql`
      SELECT f.id, f.sop_id, f.severity, f.category, o.id AS db_org_id
      FROM sop_review_findings f
      JOIN sop_records s ON s.id = f.sop_id
      JOIN orgs o ON o.id = s.org_id
      WHERE f.id = ${findingId} AND o.clerk_org_id = ${orgId}
    ` as Array<{ id: string; sop_id: string; severity: string; category: string; db_org_id: string }>;

    if (!findingRows[0]) { reply.status(404); return { ok: false, error: 'Finding not found' }; }

    const { disposition, rationale } = parsed.data;

    // Cat A findings require meaningful rationale (10+ chars)
    if (findingRows[0].category === 'A' && rationale.trim().length < 10) {
      reply.status(400);
      return { ok: false, error: 'Category A findings require a rationale of at least 10 characters.' };
    }

    const rows = await sql`
      UPDATE sop_review_findings
      SET disposition = ${disposition},
          disposition_rationale = ${rationale},
          disposed_by = ${userId},
          disposed_at = now()
      WHERE id = ${findingId}
      RETURNING id, sop_id, severity, category, description, location,
                regulatory_ref, source_attribution, disposition,
                disposition_rationale, disposed_by, disposed_at, created_at
    `;

    await writeAuditLog({
      orgId: findingRows[0].db_org_id, userId,
      userRole: role,
      action: 'finding_disposed',
      payload: { findingId, sopId: findingRows[0].sop_id, disposition, rationale },
    });

    return { ok: true, data: rowToFinding(rows[0]) };
  });

  // POST /api/sop-review/:sopId/seed-findings
  // Auto-seeds findings from the sopFactCheck step output (in addition to Cat A findings
  // auto-seeded by the job runner — this endpoint allows re-seeding or manual trigger).
  app.post<{ Params: { sopId: string } }>('/:sopId/seed-findings', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<{ seeded: number }>> => {
    const { orgId } = request.auth;
    const { sopId } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    const ownership = await verifySopOwnership(sopId, orgId);
    if (!ownership) { reply.status(404); return { ok: false, error: 'SOP not found' }; }

    // Load job state
    const [jobRow] = await sql`
      SELECT job_state FROM sop_generation_jobs WHERE sop_id = ${sopId} LIMIT 1
    ` as Array<{ job_state: { steps?: Record<string, { parsedJson?: unknown }> } }>;

    if (!jobRow?.job_state?.steps) {
      reply.status(422); return { ok: false, error: 'No generation job found for this SOP' };
    }

    const factCheckStep = jobRow.job_state.steps['sopFactCheck'];
    if (!factCheckStep?.parsedJson) {
      reply.status(422); return { ok: false, error: 'Fact check step not complete' };
    }

    const fc = factCheckStep.parsedJson as {
      sopFactCheck?: {
        steps?: Array<{ stepNumber: number; attributed: boolean; confidence: string; note?: string }>;
      };
    };

    const draftStep = jobRow.job_state.steps['sopDraftBuild'];
    const draft = (draftStep?.parsedJson as { sopDraftBuild?: { steps?: Array<{ stepNumber: number; action: string }> } })?.sopDraftBuild;

    const unattributed = (fc.sopFactCheck?.steps ?? []).filter((s) => !s.attributed);

    // Skip already-existing findings (deduplicate by location)
    const [existingRows] = await sql`
      SELECT array_agg(location) AS locations FROM sop_review_findings WHERE sop_id = ${sopId}
    ` as Array<{ locations: string[] | null }>;
    const existingLocations = new Set(existingRows?.locations ?? []);

    let seeded = 0;
    for (const step of unattributed) {
      const draftStepAction = draft?.steps?.find((ds) => ds.stepNumber === step.stepNumber)?.action;
      const location = `Step ${step.stepNumber}${draftStepAction ? ` — ${draftStepAction.slice(0, 80)}` : ''}`;
      if (existingLocations.has(location)) continue;

      await sql`
        INSERT INTO sop_review_findings
          (sop_id, severity, category, description, location, source_attribution)
        VALUES (
          ${sopId}, 'high', 'A',
          ${`Step ${step.stepNumber} cannot be attributed to uploaded source documentation. ${step.note ?? ''}`},
          ${location},
          ${'Procedural claim not found in uploaded source documents'}
        )
      `;
      seeded++;
    }

    return { ok: true, data: { seeded } };
  });

  // GET /api/sop-review/:sopId/attestation
  app.get<{ Params: { sopId: string } }>('/:sopId/attestation', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<SopAttestationRecord | null>> => {
    const { orgId } = request.auth;
    const { sopId } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    if (!await verifySopOwnership(sopId, orgId)) {
      reply.status(404); return { ok: false, error: 'SOP not found' };
    }

    const rows = await sql`
      SELECT id, sop_id, reviewer_user_id, reviewer_name, reviewer_role,
             basis_of_competence, regulatory_frameworks_reviewed,
             explicit_acceptance, content_hash_at_attestation, attested_at
      FROM sop_attestations
      WHERE sop_id = ${sopId}
      ORDER BY attested_at DESC
      LIMIT 1
    `;

    return { ok: true, data: rows[0] ? rowToAttestation(rows[0]) : null };
  });

  // POST /api/sop-review/:sopId/attestation — immutable legal commitment
  app.post<{ Params: { sopId: string } }>('/:sopId/attestation', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<SopAttestationRecord>> => {
    const { userId, orgId, role } = request.auth;
    const { sopId } = request.params;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

    // Verify ownership and fetch current SOP status
    const sopRows = await sql`
      SELECT s.id, s.status, o.id AS db_org_id
      FROM sop_records s
      JOIN orgs o ON o.id = s.org_id
      WHERE s.id = ${sopId} AND o.clerk_org_id = ${orgId}
    ` as Array<{ id: string; status: string; db_org_id: string }>;
    if (!sopRows[0]) { reply.status(404); return { ok: false, error: 'SOP not found' }; }
    const { status: sopStatus, db_org_id: dbOrgId } = sopRows[0];
    const ownership = { dbOrgId };

    if (sopStatus === 'deployed') {
      reply.status(409);
      return { ok: false, error: 'SOP is already deployed — attestation is immutable' };
    }
    if (sopStatus !== 'in_review') {
      reply.status(409);
      return { ok: false, error: 'SOP must complete generation before attestation (status must be in_review)' };
    }

    const parsed = CreateAttestationSchema.safeParse(request.body);
    if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

    // Hard stop: all findings must be disposed
    const [undisposed] = await sql`
      SELECT count(*)::int AS n FROM sop_review_findings
      WHERE sop_id = ${sopId} AND disposition IS NULL
    ` as Array<{ n: number }>;
    const precondition = validateAttestationPreconditions(undisposed.n);
    if (!precondition.ok) {
      reply.status(409);
      return { ok: false, error: precondition.error! };
    }

    const { reviewerName, reviewerRole, basisOfCompetence, regulatoryFrameworksReviewed, explicitAcceptance, contentHashAtAttestation } = parsed.data;

    // ON CONFLICT (sop_id) DO NOTHING guards against concurrent duplicate attestation.
    const insertRows = await sql`
      INSERT INTO sop_attestations (
        sop_id, reviewer_user_id, reviewer_name, reviewer_role,
        basis_of_competence, regulatory_frameworks_reviewed,
        explicit_acceptance, content_hash_at_attestation
      )
      VALUES (
        ${sopId}, ${userId}, ${reviewerName}, ${reviewerRole},
        ${basisOfCompetence}, ${regulatoryFrameworksReviewed},
        ${explicitAcceptance}, ${contentHashAtAttestation}
      )
      ON CONFLICT (sop_id) DO NOTHING
      RETURNING id, sop_id, reviewer_user_id, reviewer_name, reviewer_role,
                basis_of_competence, regulatory_frameworks_reviewed,
                explicit_acceptance, content_hash_at_attestation, attested_at
    `;

    let attestationRow: Record<string, unknown>;
    if (insertRows[0]) {
      attestationRow = insertRows[0] as Record<string, unknown>;
    } else {
      // Lost the race — return the existing attestation
      const existing = await sql`
        SELECT id, sop_id, reviewer_user_id, reviewer_name, reviewer_role,
               basis_of_competence, regulatory_frameworks_reviewed,
               explicit_acceptance, content_hash_at_attestation, attested_at
        FROM sop_attestations WHERE sop_id = ${sopId} LIMIT 1
      `;
      if (!existing[0]) {
        reply.status(500);
        return { ok: false, error: 'Attestation conflict — could not retrieve existing attestation' };
      }
      attestationRow = existing[0] as Record<string, unknown>;
    }

    const attestation = rowToAttestation(attestationRow);

    // Advance SOP status to deployed
    await sql`
      UPDATE sop_records
      SET status = 'deployed', deployed_at = now(), updated_at = now()
      WHERE id = ${sopId}
    `;

    await writeAuditLog({
      orgId: ownership.dbOrgId, userId,
      userRole: role,
      action: 'attestation_completed',
      payload: { sopId, attestationId: attestation.id, reviewerRole, frameworks: regulatoryFrameworksReviewed },
    });

    reply.status(201);
    return { ok: true, data: attestation };
  });
};

// ─── Row mappers ─────────────────────────────────────────────────────────────

function rowToFinding(row: Record<string, unknown>): SopReviewFinding {
  return {
    id: row.id as string,
    sopId: row.sop_id as string,
    severity: row.severity as SopReviewFinding['severity'],
    category: row.category as SopReviewFinding['category'],
    description: row.description as string,
    location: row.location as string,
    regulatoryRef: row.regulatory_ref as string | undefined ?? undefined,
    sourceAttribution: row.source_attribution as string | undefined ?? undefined,
    disposition: row.disposition as SopReviewFinding['disposition'] ?? undefined,
    dispositionRationale: row.disposition_rationale as string | undefined ?? undefined,
    disposedBy: row.disposed_by as string | undefined ?? undefined,
    disposedAt: row.disposed_at as string | undefined ?? undefined,
    createdAt: row.created_at as string,
  };
}

function rowToAttestation(row: Record<string, unknown>): SopAttestationRecord {
  return {
    id: row.id as string,
    sopId: row.sop_id as string,
    reviewerUserId: row.reviewer_user_id as string,
    reviewerName: row.reviewer_name as string,
    reviewerRole: row.reviewer_role as string,
    basisOfCompetence: row.basis_of_competence as string,
    regulatoryFrameworksReviewed: row.regulatory_frameworks_reviewed as string[],
    explicitAcceptance: row.explicit_acceptance as string,
    contentHashAtAttestation: row.content_hash_at_attestation as string,
    attestedAt: row.attested_at as string,
  };
}
