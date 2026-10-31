// ─── Generic Governance Routes ──────────────────────────────────────────────
// Content-type-agnostic governance endpoints operating on content_registry.id.
// These serve all content types (RAMS, permits, toolbox talks, etc.) via a
// single set of routes. Existing modules/SOPs keep their v1 routes for now
// and will migrate in Phase 3.
//
// Endpoints:
//   GET    /api/governance/:registryId/findings
//   POST   /api/governance/:registryId/findings
//   PATCH  /api/governance/findings/:findingId/disposition
//   POST   /api/governance/:registryId/seed-findings
//   POST   /api/governance/findings/:findingId/gate-open
//   POST   /api/governance/findings/:findingId/gate-unlock
//   GET    /api/governance/:registryId/attestation
//   POST   /api/governance/:registryId/attestation
//   POST   /api/governance/:registryId/certificate

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { requireRole } from '../plugins/rbac.js';
import { validateAttestationPreconditions } from '../regulatory/reviewPolicy.js';
import { PaginationSchema } from '../utils/pagination.js';
import { getRegistryEntry, updateRegistryStatus } from '../services/contentRegistry.js';
import { getSeedStrategy } from '../services/governanceSeedStrategies.js';
import type {
  ApiResponse,
  PaginatedApiSuccess,
  GovernedFinding,
  GovernedAttestation,
  GovernedCertificate,
} from '@complianceforge/types';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

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

const GateUnlockSchema = z.object({
  answer: z.string().min(1),
  timerDuration: z.number().int().positive(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export const governanceRoutes: FastifyPluginAsync = async (app) => {

  // ── Helper: verify registry entry belongs to org ────────────────────────
  async function verifyOwnership(registryId: string, clerkOrgId: string) {
    const rows = await sql`
      SELECT cr.id, cr.status, cr.content_type, cr.source_entity_id, o.id AS db_org_id
      FROM content_registry cr
      JOIN orgs o ON o.id = cr.org_id
      WHERE cr.id = ${registryId} AND o.clerk_org_id = ${clerkOrgId}
    ` as Array<{ id: string; status: string; content_type: string; source_entity_id: string; db_org_id: string }>;
    return rows[0] ?? null;
  }

  // ── GET /findings ───────────────────────────────────────────────────────
  app.get<{ Params: { registryId: string } }>(
    '/:registryId/findings',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<GovernedFinding[]> | PaginatedApiSuccess<GovernedFinding>> => {
      const { orgId } = request.auth;
      const { registryId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      if (!await verifyOwnership(registryId, orgId)) {
        reply.status(404); return { ok: false, error: 'Content not found' };
      }

      const { limit, offset } = PaginationSchema.parse(request.query);

      const countRows = await sql`
        SELECT count(*)::int AS total FROM governed_findings WHERE registry_id = ${registryId}
      `;
      const total = (countRows[0] as { total: number }).total;

      const rows = await sql`
        SELECT id, registry_id, severity, category, description, location,
               regulatory_ref, source_attribution, disposition,
               disposition_rationale, disposed_by, disposed_at, created_at
        FROM governed_findings
        WHERE registry_id = ${registryId}
        ORDER BY category ASC, severity DESC, created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return { ok: true, data: rows.map(rowToFinding), total, limit, offset };
    }
  );

  // ── POST /findings ──────────────────────────────────────────────────────
  app.post<{ Params: { registryId: string } }>(
    '/:registryId/findings',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<GovernedFinding>> => {
      const { userId, orgId, role } = request.auth;
      const { registryId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const ownership = await verifyOwnership(registryId, orgId);
      if (!ownership) { reply.status(404); return { ok: false, error: 'Content not found' }; }

      const parsed = CreateFindingSchema.safeParse(request.body);
      if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

      const { severity, category, description, location, regulatoryRef, sourceAttribution } = parsed.data;

      const rows = await sql`
        INSERT INTO governed_findings
          (registry_id, severity, category, description, location, regulatory_ref, source_attribution)
        VALUES (
          ${registryId}, ${severity}, ${category}, ${description}, ${location},
          ${regulatoryRef ?? null}, ${sourceAttribution ?? null}
        )
        RETURNING id, registry_id, severity, category, description, location,
                  regulatory_ref, source_attribution, disposition,
                  disposition_rationale, disposed_by, disposed_at, created_at
      `;

      await writeAuditLog({
        orgId: ownership.db_org_id, registryId, userId, userRole: role,
        action: 'finding_created',
        payload: { registryId, findingId: (rows[0] as { id: string }).id, severity, category },
      });

      reply.status(201);
      return { ok: true, data: rowToFinding(rows[0]) };
    }
  );

  // ── POST /findings/:findingId/gate-open ─────────────────────────────────
  // Records gated_window_opened to the WORM audit log when a reviewer opens
  // a Cat A finding modal. Required before disposition is allowed.
  app.post<{ Params: { findingId: string } }>(
    '/findings/:findingId/gate-open',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<{ logged: true }>> => {
      const { userId, orgId, role } = request.auth;
      const { findingId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const rows = await sql`
        SELECT gf.registry_id, cr.org_id AS db_org_id
        FROM governed_findings gf
        JOIN content_registry cr ON cr.id = gf.registry_id
        JOIN orgs o ON o.id = cr.org_id
        WHERE gf.id = ${findingId} AND o.clerk_org_id = ${orgId}
      ` as Array<{ registry_id: string; db_org_id: string }>;

      if (!rows[0]) { reply.status(404); return { ok: false, error: 'Finding not found' }; }

      await writeAuditLog({
        orgId: rows[0].db_org_id, registryId: rows[0].registry_id, userId, userRole: role,
        action: 'gated_window_opened',
        payload: { findingId },
      });

      return { ok: true, data: { logged: true } };
    }
  );

  // ── POST /findings/:findingId/gate-unlock ───────────────────────────────
  // Logs gated_window_unlocked with the reviewer's cognitive check answer.
  app.post<{ Params: { findingId: string } }>(
    '/findings/:findingId/gate-unlock',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<{ logged: true }>> => {
      const { userId, orgId, role } = request.auth;
      const { findingId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const parsed = GateUnlockSchema.safeParse(request.body);
      if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

      const rows = await sql`
        SELECT gf.registry_id, cr.org_id AS db_org_id
        FROM governed_findings gf
        JOIN content_registry cr ON cr.id = gf.registry_id
        JOIN orgs o ON o.id = cr.org_id
        WHERE gf.id = ${findingId} AND o.clerk_org_id = ${orgId}
      ` as Array<{ registry_id: string; db_org_id: string }>;

      if (!rows[0]) { reply.status(404); return { ok: false, error: 'Finding not found' }; }

      await writeAuditLog({
        orgId: rows[0].db_org_id, registryId: rows[0].registry_id, userId, userRole: role,
        action: 'gated_window_unlocked',
        payload: { findingId, answer: parsed.data.answer, timerDuration: parsed.data.timerDuration },
      });

      return { ok: true, data: { logged: true } };
    }
  );

  // ── PATCH /findings/:findingId/disposition ──────────────────────────────
  app.patch<{ Params: { findingId: string } }>(
    '/findings/:findingId/disposition',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<GovernedFinding>> => {
      const { userId, orgId, role } = request.auth;
      const { findingId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const parsed = DisposeFindingSchema.safeParse(request.body);
      if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

      // Fetch finding + verify org ownership via registry
      const findingRows = await sql`
        SELECT gf.id, gf.registry_id, gf.severity, gf.category, cr.org_id AS db_org_id
        FROM governed_findings gf
        JOIN content_registry cr ON cr.id = gf.registry_id
        JOIN orgs o ON o.id = cr.org_id
        WHERE gf.id = ${findingId} AND o.clerk_org_id = ${orgId}
      ` as Array<{ id: string; registry_id: string; severity: string; category: string; db_org_id: string }>;

      if (!findingRows[0]) { reply.status(404); return { ok: false, error: 'Finding not found' }; }
      const finding = findingRows[0];

      // Layer 4: Cat A findings require gated window completion (WORM audit trail check)
      if (finding.category === 'A') {
        const gateCheck = await sql`
          SELECT count(*)::int AS count FROM audit_log
          WHERE action = 'gated_window_unlocked'
            AND registry_id = ${finding.registry_id}
            AND payload->>'findingId' = ${findingId}
        `;
        if ((gateCheck[0] as { count: number }).count === 0) {
          reply.status(400);
          return { ok: false, error: 'Category A findings require gated window completion before disposition.' };
        }
      }

      // Cat A / regulatory findings require meaningful rationale
      if (finding.category === 'A' && parsed.data.rationale.trim().length < 10) {
        reply.status(400);
        return { ok: false, error: 'Category A findings require a rationale of at least 10 characters.' };
      }
      if (finding.severity === 'regulatory' && parsed.data.rationale.trim().length < 10) {
        reply.status(400);
        return { ok: false, error: 'Regulatory findings require a clear rationale (10+ chars).' };
      }

      const { disposition, rationale } = parsed.data;

      const rows = await sql`
        UPDATE governed_findings
        SET disposition = ${disposition},
            disposition_rationale = ${rationale},
            disposed_by = ${userId},
            disposed_at = now()
        WHERE id = ${findingId}
        RETURNING id, registry_id, severity, category, description, location,
                  regulatory_ref, source_attribution, disposition,
                  disposition_rationale, disposed_by, disposed_at, created_at
      `;

      await writeAuditLog({
        orgId: finding.db_org_id, registryId: finding.registry_id, userId, userRole: role,
        action: 'finding_disposed',
        payload: { findingId, registryId: finding.registry_id, disposition, rationale },
      });

      return { ok: true, data: rowToFinding(rows[0]) };
    }
  );

  // ── POST /seed-findings ─────────────────────────────────────────────────
  // Delegates to the content-type-specific seed strategy.
  app.post<{ Params: { registryId: string } }>(
    '/:registryId/seed-findings',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<{ created: number; skipped: number }>> => {
      const { orgId } = request.auth;
      const { registryId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const ownership = await verifyOwnership(registryId, orgId);
      if (!ownership) { reply.status(404); return { ok: false, error: 'Content not found' }; }

      const entry = await getRegistryEntry(registryId);
      if (!entry) { reply.status(404); return { ok: false, error: 'Registry entry not found' }; }

      const strategy = getSeedStrategy(entry.contentType);
      if (!strategy) {
        reply.status(422);
        return { ok: false, error: `No seed strategy registered for content type: ${entry.contentType}` };
      }

      const result = await strategy(registryId, entry.sourceEntityId, entry.orgId);
      return { ok: true, data: result };
    }
  );

  // ── GET /attestation ────────────────────────────────────────────────────
  app.get<{ Params: { registryId: string } }>(
    '/:registryId/attestation',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<GovernedAttestation | null>> => {
      const { orgId } = request.auth;
      const { registryId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      if (!await verifyOwnership(registryId, orgId)) {
        reply.status(404); return { ok: false, error: 'Content not found' };
      }

      const rows = await sql`
        SELECT id, registry_id, reviewer_user_id, reviewer_name, reviewer_role,
               basis_of_competence, regulatory_frameworks_reviewed,
               explicit_acceptance, content_hash_at_attestation, attested_at
        FROM governed_attestations
        WHERE registry_id = ${registryId}
        ORDER BY attested_at DESC LIMIT 1
      `;

      return { ok: true, data: rows[0] ? rowToAttestation(rows[0]) : null };
    }
  );

  // ── POST /attestation ───────────────────────────────────────────────────
  // Immutable legal commitment. Creates attestation + advances status to deployed.
  app.post<{ Params: { registryId: string } }>(
    '/:registryId/attestation',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<GovernedAttestation>> => {
      const { userId, orgId, role } = request.auth;
      const { registryId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const ownership = await verifyOwnership(registryId, orgId);
      if (!ownership) { reply.status(404); return { ok: false, error: 'Content not found' }; }

      if (ownership.status === 'deployed') {
        reply.status(409);
        return { ok: false, error: 'Content is already deployed — attestation is immutable' };
      }
      if (ownership.status !== 'in_review') {
        reply.status(409);
        return { ok: false, error: 'Content must complete generation before attestation (status must be in_review)' };
      }

      const parsed = CreateAttestationSchema.safeParse(request.body);
      if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

      // Hard stop: all findings must be disposed
      const [undisposed] = await sql`
        SELECT count(*)::int AS n FROM governed_findings
        WHERE registry_id = ${registryId} AND disposition IS NULL
      ` as Array<{ n: number }>;
      const precondition = validateAttestationPreconditions(undisposed.n);
      if (!precondition.ok) {
        reply.status(409);
        return { ok: false, error: precondition.error! };
      }

      const {
        reviewerName, reviewerRole, basisOfCompetence,
        regulatoryFrameworksReviewed, explicitAcceptance, contentHashAtAttestation,
      } = parsed.data;

      // ON CONFLICT (registry_id) DO NOTHING guards against concurrent duplicate attestation.
      const insertRows = await sql`
        INSERT INTO governed_attestations (
          registry_id, reviewer_user_id, reviewer_name, reviewer_role,
          basis_of_competence, regulatory_frameworks_reviewed,
          explicit_acceptance, content_hash_at_attestation
        )
        VALUES (
          ${registryId}, ${userId}, ${reviewerName}, ${reviewerRole},
          ${basisOfCompetence}, ${regulatoryFrameworksReviewed},
          ${explicitAcceptance}, ${contentHashAtAttestation}
        )
        ON CONFLICT (registry_id) DO NOTHING
        RETURNING id, registry_id, reviewer_user_id, reviewer_name, reviewer_role,
                  basis_of_competence, regulatory_frameworks_reviewed,
                  explicit_acceptance, content_hash_at_attestation, attested_at
      `;

      let attestationRow: Record<string, unknown>;
      if (insertRows[0]) {
        attestationRow = insertRows[0] as Record<string, unknown>;
      } else {
        // Lost the race — return existing attestation
        const existing = await sql`
          SELECT id, registry_id, reviewer_user_id, reviewer_name, reviewer_role,
                 basis_of_competence, regulatory_frameworks_reviewed,
                 explicit_acceptance, content_hash_at_attestation, attested_at
          FROM governed_attestations WHERE registry_id = ${registryId} LIMIT 1
        `;
        if (!existing[0]) {
          reply.status(500);
          return { ok: false, error: 'Attestation conflict — could not retrieve existing attestation' };
        }
        attestationRow = existing[0] as Record<string, unknown>;
      }

      const attestation = rowToAttestation(attestationRow);

      // Advance content status to deployed
      await updateRegistryStatus(registryId, 'deployed');

      await writeAuditLog({
        orgId: ownership.db_org_id, registryId, userId, userRole: role,
        action: 'attestation_completed',
        payload: {
          registryId, attestationId: attestation.id,
          reviewerRole, frameworks: regulatoryFrameworksReviewed,
        },
      });

      reply.status(201);
      return { ok: true, data: attestation };
    }
  );

  // ── POST /certificate ───────────────────────────────────────────────────
  // Issues a governed certificate after attestation. WORM-protected.
  app.post<{ Params: { registryId: string } }>(
    '/:registryId/certificate',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply): Promise<ApiResponse<GovernedCertificate>> => {
      const { userId, orgId, role } = request.auth;
      const { registryId } = request.params;
      if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }

      const ownership = await verifyOwnership(registryId, orgId);
      if (!ownership) { reply.status(404); return { ok: false, error: 'Content not found' }; }

      const entry = await getRegistryEntry(registryId);
      if (!entry) { reply.status(404); return { ok: false, error: 'Registry entry not found' }; }

      // Attestation must exist
      const [attest] = await sql`
        SELECT id, content_hash_at_attestation, reviewer_name, reviewer_role
        FROM governed_attestations WHERE registry_id = ${registryId}
      ` as Array<{ id: string; content_hash_at_attestation: string; reviewer_name: string; reviewer_role: string }>;

      if (!attest) {
        reply.status(409);
        return { ok: false, error: 'Content must be attested before certificate issuance' };
      }

      const contentHash = attest.content_hash_at_attestation;
      if (!contentHash) {
        reply.status(409);
        return { ok: false, error: 'Content has no hash at attestation. Cannot issue certificate without cryptographic anchor.' };
      }

      // Generate cert number: VS-{TYPE_PREFIX}-{YYYYMMDD}-{8hex}
      const prefix = entry.contentType.toUpperCase().slice(0, 4);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const hex = entry.id.replace(/-/g, '').slice(0, 8).toUpperCase();
      const certNumber = `VS-${prefix}-${date}-${hex}`;

      // ON CONFLICT guards against duplicate cert issuance
      const certRows = await sql`
        INSERT INTO governed_certificates (
          registry_id, attestation_id, org_id, cert_number, content_hash,
          source_doc_versions, regulatory_schemas, content_title,
          reviewer_name, reviewer_role
        )
        VALUES (
          ${registryId}, ${attest.id}, ${ownership.db_org_id}, ${certNumber}, ${contentHash},
          ${JSON.stringify({})}, ${[] as string[]}, ${entry.title},
          ${attest.reviewer_name}, ${attest.reviewer_role}
        )
        ON CONFLICT (registry_id) DO NOTHING
        RETURNING id, registry_id, attestation_id, org_id, cert_number, content_hash,
                  source_doc_versions, regulatory_schemas, content_title,
                  reviewer_name, reviewer_role, issued_at
      `;

      let certRow: Record<string, unknown>;
      if (certRows[0]) {
        certRow = certRows[0] as Record<string, unknown>;
      } else {
        const existing = await sql`
          SELECT id, registry_id, attestation_id, org_id, cert_number, content_hash,
                 source_doc_versions, regulatory_schemas, content_title,
                 reviewer_name, reviewer_role, issued_at
          FROM governed_certificates WHERE registry_id = ${registryId} LIMIT 1
        `;
        if (!existing[0]) {
          reply.status(500);
          return { ok: false, error: 'Certificate conflict — could not retrieve existing certificate' };
        }
        certRow = existing[0] as Record<string, unknown>;
      }

      const cert = rowToCertificate(certRow);

      await writeAuditLog({
        orgId: ownership.db_org_id, registryId, userId, userRole: role,
        action: 'certificate_issued',
        payload: { registryId, certNumber: cert.certNumber, contentHash },
      });

      reply.status(201);
      return { ok: true, data: cert };
    }
  );
};

// ─── Row mappers ─────────────────────────────────────────────────────────────

function rowToFinding(row: Record<string, unknown>): GovernedFinding {
  return {
    id: row.id as string,
    registryId: row.registry_id as string,
    severity: row.severity as GovernedFinding['severity'],
    category: row.category as GovernedFinding['category'],
    description: row.description as string,
    location: row.location as string,
    regulatoryRef: (row.regulatory_ref as string | null) ?? undefined,
    sourceAttribution: (row.source_attribution as string | null) ?? undefined,
    disposition: (row.disposition as GovernedFinding['disposition']) ?? undefined,
    dispositionRationale: (row.disposition_rationale as string | null) ?? undefined,
    disposedBy: (row.disposed_by as string | null) ?? undefined,
    disposedAt: (row.disposed_at as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function rowToAttestation(row: Record<string, unknown>): GovernedAttestation {
  return {
    id: row.id as string,
    registryId: row.registry_id as string,
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

function rowToCertificate(row: Record<string, unknown>): GovernedCertificate {
  return {
    id: row.id as string,
    registryId: row.registry_id as string,
    attestationId: row.attestation_id as string,
    orgId: row.org_id as string,
    certNumber: row.cert_number as string,
    contentHash: row.content_hash as string,
    sourceDocVersions: row.source_doc_versions as Record<string, string>,
    regulatorySchemas: row.regulatory_schemas as string[],
    contentTitle: row.content_title as string,
    reviewerName: row.reviewer_name as string,
    reviewerRole: row.reviewer_role as string,
    issuedAt: row.issued_at as string,
  };
}
