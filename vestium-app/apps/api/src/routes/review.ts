// ─── Review routes ────────────────────────────────────────────────────────────
// Reviewer workflow endpoints:
// - findings list/create/disposition
// - attestation read/create
// All routes are org-scoped via Clerk org context.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { createModuleSnapshot } from '../services/moduleSnapshots.js';
import { detectContradictions, type FactCheckItem } from '../regulatory/contradictionDetector.js';
import {
  deriveFindingCategory,
  deriveFindingSeverity,
  validateAttestationPreconditions,
  type StoredFactCheckItem,
} from '../regulatory/reviewPolicy.js';
import type {
  ApiResponse,
  PaginatedApiSuccess,
  AttestationRecord,
  FindingDisposition,
  FindingSeverity,
  RegulatoryContradiction,
  ReviewFinding,
} from '@complianceforge/types';
import { requireRole } from '../plugins/rbac.js';
import { PaginationSchema } from '../utils/pagination.js';

const CreateFindingSchema = z.object({
  severity: z.enum(['regulatory', 'high', 'medium', 'low']),
  category: z.enum(['A', 'B']),
  description: z.string().min(1),
  location: z.string().min(1),
  regulatoryRef: z.string().optional(),
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

type StoredJobState = {
  steps?: Record<string, { parsedJson?: unknown }>;
};

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/review/:moduleId/findings
  app.get<{ Params: { moduleId: string } }>(
    '/:moduleId/findings',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<ReviewFinding[]> | PaginatedApiSuccess<ReviewFinding>> => {
      const { orgId } = request.auth;
      const { moduleId } = request.params;
      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      const { limit, offset } = PaginationSchema.parse(request.query);

      const countRows = await sql`
        SELECT count(*)::int AS total
        FROM review_findings rf
        JOIN modules m ON m.id = rf.module_id
        JOIN orgs o ON o.id = m.org_id
        WHERE rf.module_id = ${moduleId} AND o.clerk_org_id = ${orgId}
      `;
      const total = (countRows[0] as { total: number }).total;

      const rows = await sql`
        SELECT rf.id, rf.module_id, rf.severity, rf.category, rf.description, rf.location, rf.regulatory_ref,
               rf.disposition, rf.disposition_rationale, rf.disposed_by, rf.disposed_at
        FROM review_findings rf
        JOIN modules m ON m.id = rf.module_id
        JOIN orgs o ON o.id = m.org_id
        WHERE rf.module_id = ${moduleId} AND o.clerk_org_id = ${orgId}
        ORDER BY rf.created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return {
        ok: true,
        total, limit, offset,
        data: rows.map((row) => ({
          id: row.id as string,
          moduleId: row.module_id as string,
          severity: row.severity as FindingSeverity,
          category: row.category as 'A' | 'B',
          description: row.description as string,
          location: row.location as string,
          regulatoryRef: row.regulatory_ref as string | undefined,
          disposition: row.disposition as FindingDisposition | undefined,
          dispositionRationale: row.disposition_rationale as string | undefined,
          disposedBy: row.disposed_by as string | undefined,
          disposedAt: row.disposed_at as string | undefined,
        })),
      };
    }
  );

  // POST /api/review/:moduleId/findings
  app.post<{ Params: { moduleId: string } }>(
    '/:moduleId/findings',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<ReviewFinding>> => {
      const { userId, orgId, role } = request.auth;
      const { moduleId } = request.params;
      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      const parsed = CreateFindingSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400);
        return { ok: false, error: 'Invalid request body', code: parsed.error.message };
      }

      const moduleRows = await sql`
        SELECT m.id, m.org_id
        FROM modules m
        JOIN orgs o ON o.id = m.org_id
        WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
      `;
      if (!moduleRows[0]) {
        reply.status(404);
        return { ok: false, error: 'Module not found' };
      }
      const dbOrgId = (moduleRows[0] as { org_id: string }).org_id;

      const body = parsed.data;
      const rows = await sql`
        INSERT INTO review_findings (module_id, severity, category, description, location, regulatory_ref)
        VALUES (${moduleId}, ${body.severity}, ${body.category}, ${body.description}, ${body.location}, ${body.regulatoryRef ?? null})
        RETURNING id, module_id, severity, category, description, location, regulatory_ref,
                  disposition, disposition_rationale, disposed_by, disposed_at
      `;
      const finding = rows[0];

      await writeAuditLog({
        orgId: dbOrgId,
        moduleId,
        userId,
        userRole: role,
        action: 'finding_created',
        payload: {
          findingId: finding.id,
          severity: finding.severity,
          category: finding.category,
        },
      });

      reply.status(201);
      return {
        ok: true,
        data: {
          id: finding.id as string,
          moduleId: finding.module_id as string,
          severity: finding.severity as FindingSeverity,
          category: finding.category as 'A' | 'B',
          description: finding.description as string,
          location: finding.location as string,
          regulatoryRef: finding.regulatory_ref as string | undefined,
          disposition: undefined,
          dispositionRationale: undefined,
          disposedBy: undefined,
          disposedAt: undefined,
        },
      };
    }
  );

  // POST /api/review/:moduleId/seed-findings
  // Creates review_findings from latest generation fact-check items (unsupported/ambiguous).
  app.post<{ Params: { moduleId: string } }>(
    '/:moduleId/seed-findings',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<{ created: number; skipped: number }>> => {
      const { userId, orgId, role } = request.auth;
      const { moduleId } = request.params;
      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      const moduleRows = await sql`
        SELECT m.id, m.org_id
        FROM modules m
        JOIN orgs o ON o.id = m.org_id
        WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
      `;
      if (!moduleRows[0]) {
        reply.status(404);
        return { ok: false, error: 'Module not found' };
      }
      const dbOrgId = (moduleRows[0] as { org_id: string }).org_id;

      const jobRows = await sql`
        SELECT job_state
        FROM generation_jobs
        WHERE module_id = ${moduleId}
        LIMIT 1
      `;
      if (!jobRows[0]) {
        reply.status(404);
        return { ok: false, error: 'No generation job found for module' };
      }

      const jobState = (jobRows[0] as { job_state: StoredJobState }).job_state;
      const factCheckStep = jobState?.steps?.['factCheckMerge'] ?? jobState?.steps?.['factCheck'];
      const factCheckParsed =
        (factCheckStep?.parsedJson as { factCheck?: { items?: StoredFactCheckItem[] } } | undefined)
          ?.factCheck;
      const items = factCheckParsed?.items ?? [];
      if (items.length === 0) {
        return { ok: true, data: { created: 0, skipped: 0 } };
      }

      const candidates = items.filter((i) => i.verdict !== 'supported');

      const existingRows = await sql`
        SELECT description, location
        FROM review_findings
        WHERE module_id = ${moduleId}
      `;
      const existingKeys = new Set(
        existingRows.map((r) => `${String(r.description)}|${String(r.location)}`)
      );

      let created = 0;
      let skipped = 0;

      for (const item of candidates) {
        const severity = deriveFindingSeverity(item);
        const category = deriveFindingCategory(severity);
        const location = `${item.relatedItemType}:${item.relatedItemId}`;
        const description = `${item.claim}\n\nRationale: ${item.rationale}`;
        const key = `${description}|${location}`;
        if (existingKeys.has(key)) {
          skipped += 1;
          continue;
        }

        await sql`
          INSERT INTO review_findings (module_id, severity, category, description, location, regulatory_ref)
          VALUES (${moduleId}, ${severity}, ${category}, ${description}, ${location}, ${null})
        `;
        existingKeys.add(key);
        created += 1;
      }

      await writeAuditLog({
        orgId: dbOrgId,
        moduleId,
        userId,
        userRole: role,
        action: 'findings_seeded',
        payload: {
          seededFromGeneration: true,
          created,
          skipped,
        },
      });

      return { ok: true, data: { created, skipped } };
    }
  );

  // POST /api/review/findings/:findingId/gate-open
  // Records gated_window_opened to the WORM audit log when a reviewer opens a Cat A finding modal.
  app.post<{ Params: { findingId: string } }>(
    '/findings/:findingId/gate-open',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<{ logged: true }>> => {
      const { userId, orgId, role } = request.auth;
      const { findingId } = request.params;
      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      const rows = await sql`
        SELECT rf.module_id, m.org_id
        FROM review_findings rf
        JOIN modules m ON m.id = rf.module_id
        JOIN orgs o ON o.id = m.org_id
        WHERE rf.id = ${findingId} AND o.clerk_org_id = ${orgId}
      `;
      if (!rows[0]) {
        reply.status(404);
        return { ok: false, error: 'Finding not found' };
      }
      const { module_id: moduleId, org_id: dbOrgId } = rows[0] as { module_id: string; org_id: string };

      await writeAuditLog({
        orgId: dbOrgId,
        moduleId,
        userId,
        userRole: role,
        action: 'gated_window_opened',
        payload: { findingId },
      });

      return { ok: true, data: { logged: true } };
    }
  );

  // PATCH /api/review/findings/:findingId/disposition
  app.patch<{ Params: { findingId: string } }>(
    '/findings/:findingId/disposition',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<ReviewFinding>> => {
      const { userId, orgId, role } = request.auth;
      const { findingId } = request.params;
      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      const parsed = DisposeFindingSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400);
        return { ok: false, error: 'Invalid request body', code: parsed.error.message };
      }

      const findingRows = await sql`
        SELECT rf.id, rf.module_id, rf.severity, rf.category, rf.description, rf.location, rf.regulatory_ref,
               rf.disposition, rf.disposition_rationale, rf.disposed_by, rf.disposed_at, m.org_id
        FROM review_findings rf
        JOIN modules m ON m.id = rf.module_id
        JOIN orgs o ON o.id = m.org_id
        WHERE rf.id = ${findingId} AND o.clerk_org_id = ${orgId}
      `;
      if (!findingRows[0]) {
        reply.status(404);
        return { ok: false, error: 'Finding not found' };
      }
      const finding = findingRows[0] as Record<string, unknown>;

      // Layer 4: For Cat A findings, verify gated window was completed (WORM audit trail).
      // This prevents bypassing the mandatory reading time + cognitive question by calling
      // the API directly — the gated_window_unlocked record MUST exist before disposition.
      if (finding.category === 'A') {
        const gateCheck = await sql`
          SELECT count(*)::int AS count FROM audit_log
          WHERE action = 'gated_window_unlocked'
            AND module_id = ${finding.module_id}
            AND payload->>'findingId' = ${findingId}
        `;
        if ((gateCheck[0] as { count: number }).count === 0) {
          reply.status(400);
          return { ok: false, error: 'Category A findings require gated window completion before disposition.' };
        }
      }

      // Hard-stop behavior: regulatory findings require explicit rationale (already min(5)).
      if (finding.severity === 'regulatory' && parsed.data.rationale.trim().length < 10) {
        reply.status(400);
        return {
          ok: false,
          error: 'Regulatory findings require a clear rationale (10+ chars).',
        };
      }

      const rows = await sql`
        UPDATE review_findings
        SET disposition = ${parsed.data.disposition},
            disposition_rationale = ${parsed.data.rationale},
            disposed_by = ${userId},
            disposed_at = now()
        WHERE id = ${findingId}
        RETURNING id, module_id, severity, category, description, location, regulatory_ref,
                  disposition, disposition_rationale, disposed_by, disposed_at
      `;
      const updated = rows[0];

      await writeAuditLog({
        orgId: finding.org_id as string,
        moduleId: finding.module_id as string,
        userId,
        userRole: role,
        action: 'finding_disposed',
        payload: {
          findingId,
          severity: finding.severity,
          disposition: parsed.data.disposition,
          rationale: parsed.data.rationale,
        },
      });

      return {
        ok: true,
        data: {
          id: updated.id as string,
          moduleId: updated.module_id as string,
          severity: updated.severity as FindingSeverity,
          category: updated.category as 'A' | 'B',
          description: updated.description as string,
          location: updated.location as string,
          regulatoryRef: updated.regulatory_ref as string | undefined,
          disposition: updated.disposition as FindingDisposition,
          dispositionRationale: updated.disposition_rationale as string,
          disposedBy: updated.disposed_by as string,
          disposedAt: updated.disposed_at as string,
        },
      };
    }
  );

  // GET /api/review/:moduleId/contradictions
  // Surfaces regulatory contradictions from the latest fact-check.
  // These are the cases where AI assessment conflicts with regulatory references
  // and the human reviewer MUST make the call.
  app.get<{ Params: { moduleId: string } }>(
    '/:moduleId/contradictions',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<RegulatoryContradiction[]>> => {
      const { orgId } = request.auth;
      const { moduleId } = request.params;
      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      // Verify org ownership
      const moduleRows = await sql`
        SELECT m.id
        FROM modules m
        JOIN orgs o ON o.id = m.org_id
        WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
      `;
      if (!moduleRows[0]) {
        reply.status(404);
        return { ok: false, error: 'Module not found' };
      }

      // Get fact-check items from latest generation job
      const jobRows = await sql`
        SELECT job_state
        FROM generation_jobs
        WHERE module_id = ${moduleId}
        LIMIT 1
      `;
      if (!jobRows[0]) {
        return { ok: true, data: [] };
      }

      const jobState = (jobRows[0] as { job_state: StoredJobState }).job_state;
      const factCheckStep = jobState?.steps?.['factCheckMerge'] ?? jobState?.steps?.['factCheck'];
      const factCheckParsed =
        (factCheckStep?.parsedJson as { factCheck?: { items?: FactCheckItem[] } } | undefined)
          ?.factCheck;
      const items = (factCheckParsed?.items ?? []) as FactCheckItem[];

      // Build finding map from existing findings for cross-reference
      const findingRows = await sql`
        SELECT id, severity, location
        FROM review_findings
        WHERE module_id = ${moduleId}
      `;
      const findingMap = new Map<string, { findingId: string; severity: FindingSeverity }>();
      for (const row of findingRows) {
        findingMap.set(row.location as string, {
          findingId: row.id as string,
          severity: row.severity as FindingSeverity,
        });
      }

      const contradictions = detectContradictions(items, findingMap);
      return { ok: true, data: contradictions };
    }
  );

  // GET /api/review/:moduleId/attestation
  app.get<{ Params: { moduleId: string } }>(
    '/:moduleId/attestation',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<AttestationRecord>> => {
      const { orgId } = request.auth;
      const { moduleId } = request.params;
      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      const rows = await sql`
        SELECT a.id, a.module_id, a.reviewer_name, a.reviewer_role, a.basis_of_competence,
               a.regulatory_frameworks_reviewed, a.explicit_acceptance, a.attested_at,
               a.reviewer_user_id, a.content_hash_at_attestation, a.snapshot_version
        FROM attestations a
        JOIN modules m ON m.id = a.module_id
        JOIN orgs o ON o.id = m.org_id
        WHERE a.module_id = ${moduleId} AND o.clerk_org_id = ${orgId}
        ORDER BY a.attested_at DESC
        LIMIT 1
      `;
      if (!rows[0]) {
        reply.status(404);
        return { ok: false, error: 'No attestation found for module' };
      }
      const row = rows[0] as Record<string, unknown>;
      return {
        ok: true,
        data: {
          id: row.id as string,
          moduleId: row.module_id as string,
          reviewerName: row.reviewer_name as string,
          reviewerRole: row.reviewer_role as string,
          basisOfCompetence: row.basis_of_competence as string,
          regulatoryFrameworksReviewed: row.regulatory_frameworks_reviewed as string[],
          explicitAcceptance: row.explicit_acceptance as string,
          attestedAt: row.attested_at as string,
          reviewerUserId: row.reviewer_user_id as string,
          contentHashAtAttestation: row.content_hash_at_attestation as string,
          snapshotVersion: (row.snapshot_version as number | null) ?? undefined,
        },
      };
    }
  );

  // POST /api/review/:moduleId/attestation
  app.post<{ Params: { moduleId: string } }>(
    '/:moduleId/attestation',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<AttestationRecord>> => {
      const { userId, orgId, role } = request.auth;
      const { moduleId } = request.params;
      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      const parsed = CreateAttestationSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400);
        return { ok: false, error: 'Invalid request body', code: parsed.error.message };
      }

      const moduleRows = await sql`
        SELECT m.id, m.org_id, m.status
        FROM modules m
        JOIN orgs o ON o.id = m.org_id
        WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
      `;
      if (!moduleRows[0]) {
        reply.status(404);
        return { ok: false, error: 'Module not found' };
      }
      const dbOrgId = (moduleRows[0] as { org_id: string }).org_id;
      const moduleStatus = (moduleRows[0] as { status: string }).status;
      if (moduleStatus === 'deployed') {
        reply.status(409);
        return { ok: false, error: 'Module is already deployed — attestation cannot be modified' };
      }
      if (moduleStatus !== 'in_review') {
        reply.status(409);
        return { ok: false, error: 'Module must complete generation before attestation (status must be in_review)' };
      }

      // Must dispose every finding before attestation.
      const undisposedRows = await sql`
        SELECT count(*)::int AS count
        FROM review_findings
        WHERE module_id = ${moduleId} AND disposition IS NULL
      `;
      const undisposed = (undisposedRows[0] as { count: number }).count;
      const precondition = validateAttestationPreconditions(undisposed);
      if (!precondition.ok) {
        reply.status(400);
        return { ok: false, error: precondition.error! };
      }

      const body = parsed.data;

      // Create attestation snapshot FIRST — captures module state the reviewer signs off on.
      // Must happen before attestation INSERT because attestations table is WORM (no UPDATE),
      // so snapshot_version must be known at INSERT time.
      let snapshotVersion: number | null = null;
      try {
        const jobRows = await sql`
          SELECT job_state FROM generation_jobs WHERE module_id = ${moduleId} LIMIT 1
        `;
        if (jobRows[0]) {
          const snap = await createModuleSnapshot(
            moduleId,
            body.contentHashAtAttestation,
            (jobRows[0] as { job_state: unknown }).job_state,
            'attestation',
            userId,
            dbOrgId,
          );
          snapshotVersion = snap.version;
        }
      } catch (snapErr) {
        request.log.warn({ err: snapErr }, 'Attestation snapshot failed (non-blocking)');
      }

      // Serialize by module to avoid duplicate attestations even on drifted DBs
      // where a unique index on attestations(module_id) may be missing.
      const upsertRows = await sql`
        WITH _lock AS (
          SELECT pg_advisory_xact_lock(hashtext(${moduleId}), 0)
        ),
        existing AS (
          SELECT id, module_id, reviewer_name, reviewer_role, basis_of_competence,
                 regulatory_frameworks_reviewed, explicit_acceptance, attested_at,
                 reviewer_user_id, content_hash_at_attestation, snapshot_version
          FROM attestations
          WHERE module_id = ${moduleId}
          LIMIT 1
        ),
        inserted AS (
          INSERT INTO attestations (
            module_id, reviewer_user_id, reviewer_name, reviewer_role, basis_of_competence,
            regulatory_frameworks_reviewed, explicit_acceptance, content_hash_at_attestation,
            snapshot_version
          )
          SELECT
            ${moduleId}, ${userId}, ${body.reviewerName}, ${body.reviewerRole}, ${body.basisOfCompetence},
            ${body.regulatoryFrameworksReviewed}, ${body.explicitAcceptance}, ${body.contentHashAtAttestation},
            ${snapshotVersion}
          WHERE NOT EXISTS (SELECT 1 FROM existing)
          RETURNING id, module_id, reviewer_name, reviewer_role, basis_of_competence,
                    regulatory_frameworks_reviewed, explicit_acceptance, attested_at,
                    reviewer_user_id, content_hash_at_attestation, snapshot_version
        )
        SELECT * FROM inserted
        UNION ALL
        SELECT * FROM existing
        LIMIT 1
      `;

      if (!upsertRows[0]) {
        reply.status(500);
        return { ok: false, error: 'Attestation insert failed' };
      }
      const row = upsertRows[0] as Record<string, unknown>;

      await writeAuditLog({
        orgId: dbOrgId,
        moduleId,
        userId,
        userRole: role,
        action: 'attestation_completed',
        payload: {
          attestationId: row.id,
          reviewerRole: row.reviewer_role,
          frameworks: row.regulatory_frameworks_reviewed,
          snapshotVersion: row.snapshot_version ?? null,
        },
      });

      reply.status(201);
      return {
        ok: true,
        data: {
          id: row.id as string,
          moduleId: row.module_id as string,
          reviewerName: row.reviewer_name as string,
          reviewerRole: row.reviewer_role as string,
          basisOfCompetence: row.basis_of_competence as string,
          regulatoryFrameworksReviewed: row.regulatory_frameworks_reviewed as string[],
          explicitAcceptance: row.explicit_acceptance as string,
          attestedAt: row.attested_at as string,
          reviewerUserId: row.reviewer_user_id as string,
          contentHashAtAttestation: row.content_hash_at_attestation as string,
          snapshotVersion: (row.snapshot_version as number | null) ?? undefined,
        },
      };
    }
  );

  // ─── Gated window routes ───────────────────────────────────────────────────
  // These enforce mandatory reading time + cognitive engagement before a reviewer
  // can dispose of regulatory or high-severity findings. All gate events are
  // WORM-logged. The cognitive question is generated by Haiku based on the
  // specific finding content — it tests engagement, not correctness.

  const GateOpenSchema = z.object({
    findingId: z.string().uuid(),
    description: z.string().min(1),
    regulatoryRef: z.string().optional(),
  });

  // POST /api/review/:moduleId/gate-open
  // Called when reviewer opens the review gate for a finding.
  // Returns a Haiku-generated comprehension question; logs gated_window_opened.
  app.post<{ Params: { moduleId: string } }>(
    '/:moduleId/gate-open',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<{ question: string }>> => {
      const { userId, orgId, role } = request.auth;
      const { moduleId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const parsed = GateOpenSchema.safeParse(request.body);
      if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

      const moduleRows = await sql`
        SELECT m.id, m.org_id
        FROM modules m JOIN orgs o ON o.id = m.org_id
        WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
      `;
      if (!moduleRows[0]) { reply.status(404); return { ok: false, error: 'Module not found' }; }
      const dbOrgId = (moduleRows[0] as { org_id: string }).org_id;

      const { findingId, description, regulatoryRef } = parsed.data;

      // Log gate opened (WORM)
      await writeAuditLog({
        orgId: dbOrgId, moduleId, userId,
        userRole: role,
        action: 'gated_window_opened',
        payload: { findingId, regulatoryRef: regulatoryRef ?? null },
      });

      // Generate cognitive question via Haiku
      let question = 'Based on this finding, what specific regulatory duty is being flagged and why does it matter for this workplace?';
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `You are a UK health and safety compliance assessor. A reviewer must engage with this finding before disposing of it:\n\nFinding: ${description}\n${regulatoryRef ? `Regulatory reference: ${regulatoryRef}` : ''}\n\nGenerate ONE specific comprehension question that tests whether the reviewer has actually understood the regulatory issue. The question should be answerable in 2-3 sentences by someone who read the finding carefully. Return ONLY the question, no preamble or formatting.`,
          }],
        });
        const block = msg.content[0];
        if (block?.type === 'text') question = block.text.trim();
      } catch {
        // Non-critical — fall back to generic question
      }

      return { ok: true, data: { question } };
    }
  );

  // POST /api/review/findings/:findingId/gate-unlock
  // Called after the reviewer submits their cognitive answer.
  // Logs gated_window_unlocked with their answer — does not grade it.
  app.post<{ Params: { findingId: string } }>(
    '/findings/:findingId/gate-unlock',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<Record<string, never>>> => {
      const { userId, orgId, role } = request.auth;
      const { findingId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const body = request.body as { cognitiveAnswer?: string };
      const answer = String(body?.cognitiveAnswer ?? '').trim();

      // Resolve module + org from finding for audit log
      const findingRows = await sql`
        SELECT rf.module_id, m.org_id
        FROM review_findings rf
        JOIN modules m ON m.id = rf.module_id
        JOIN orgs o ON o.id = m.org_id
        WHERE rf.id = ${findingId} AND o.clerk_org_id = ${orgId}
      `;
      if (!findingRows[0]) { reply.status(404); return { ok: false, error: 'Finding not found' }; }
      const { module_id: moduleId, org_id: dbOrgId } = findingRows[0] as { module_id: string; org_id: string };

      await writeAuditLog({
        orgId: dbOrgId, moduleId, userId,
        userRole: role,
        action: 'gated_window_unlocked',
        payload: { findingId, answerLength: answer.length },
      });

      return { ok: true, data: {} };
    }
  );
};
