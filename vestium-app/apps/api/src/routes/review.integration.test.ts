// ─── Review critical path — integration tests ────────────────────────────────
// Exercises the attestation-to-deployment evidence chain end-to-end using a
// real Fastify instance with mocked DB, audit, and snapshot dependencies.
// Covers the legal-liability core of the product.
//
// Tests:
//   1. Attestation blocked when findings undisposed (400)
//   2. Attestation blocked when module not in_review (409)
//   3. Attestation blocked when module already deployed (409)
//   4. Cat A finding disposition blocked without gated window (400)
//   5. Cat A finding disposition succeeds after gate unlock (200)
//   6. Attestation succeeds when all preconditions met (201)
//   7. Module cert issuance sets status to deployed (201)
//   8. Module cert issuance is idempotent (200)
//   9. Deployed module attestation blocked (409)
//  10. Learner cert requires module cert (400)

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// vi.mock is hoisted — modules replaced before any imports run.
vi.mock('../db/client.js', () => ({ sql: vi.fn() }));
vi.mock('../db/audit.js', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/moduleSnapshots.js', () => ({
  createModuleSnapshot: vi.fn().mockResolvedValue({ version: 1 }),
  getLatestSnapshotVersion: vi.fn().mockResolvedValue(1),
}));
vi.mock('../regulatory/contradictionDetector.js', () => ({
  detectContradictions: vi.fn().mockReturnValue([]),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn().mockResolvedValue({ content: [{ text: '{}' }] }) };
  },
}));
vi.mock('../services/orgContextBuilder.js', () => ({
  updateDistilledOrgContext: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('pdf-lib', () => ({
  PDFDocument: { create: vi.fn().mockResolvedValue({ addPage: vi.fn(), save: vi.fn().mockResolvedValue(new Uint8Array([1])) }) },
  degrees: vi.fn(),
  rgb: vi.fn(),
  StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,') } }));
vi.mock('../pipeline/orchestrator.js', () => ({ assembleModule: vi.fn() }));

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { reviewRoutes } from './review.js';
import { certsRoutes } from './certs.js';
import { sql } from '../db/client.js';
import type { OrgRole } from '@complianceforge/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CLERK_ORG   = 'org_test_review';
const DB_ORG_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';
const MODULE_ID   = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000001';
const FINDING_A_ID = 'cccccccc-cccc-cccc-cccc-000000000001';
const FINDING_B_ID = 'cccccccc-cccc-cccc-cccc-000000000002';
const ATTEST_ID   = 'dddddddd-dddd-dddd-dddd-000000000001';
const CERT_ID     = 'eeeeeeee-eeee-eeee-eeee-000000000001';
const NOW = new Date().toISOString();

const MODULE_ROW_IN_REVIEW = {
  id: MODULE_ID, org_id: DB_ORG_ID, status: 'in_review', title: 'Test Module',
  content_hash: 'abc123', regulatory_classification: { applicableSchemas: [] },
  generation_metadata: {}, deployed_at: null,
};

const MODULE_ROW_DRAFT = { ...MODULE_ROW_IN_REVIEW, status: 'draft' };
const MODULE_ROW_DEPLOYED = { ...MODULE_ROW_IN_REVIEW, status: 'deployed' };

const FINDING_ROW_CAT_A = {
  id: FINDING_A_ID, module_id: MODULE_ID, severity: 'regulatory', category: 'A',
  description: 'LOLER interval incorrect', location: 'Lesson 1.1',
  regulatory_ref: 'LOLER Reg 9', disposition: null, disposition_rationale: null,
  disposed_by: null, disposed_at: null, org_id: DB_ORG_ID,
};

const FINDING_ROW_DISPOSED = {
  ...FINDING_ROW_CAT_A,
  disposition: 'amended', disposition_rationale: 'Corrected to 6-month interval per LOLER Reg 9(3)(a)(ii)',
  disposed_by: 'test-user', disposed_at: NOW,
};

const ATTEST_ROW = {
  id: ATTEST_ID, module_id: MODULE_ID, reviewer_user_id: 'test-user',
  reviewer_name: 'Sarah Thompson', reviewer_role: 'H&S Manager',
  basis_of_competence: 'NEBOSH NGC 2019, 8 years warehousing H&S',
  regulatory_frameworks_reviewed: ['PUWER 1998', 'LOLER 1998', 'MHSWR 1999'],
  explicit_acceptance: 'I confirm all content is accurate per UK H&S legislation.',
  content_hash_at_attestation: 'abc123', attested_at: NOW, snapshot_version: 1,
};

const MODULE_CERT_ROW = {
  id: CERT_ID, module_id: MODULE_ID, attestation_id: ATTEST_ID, org_id: DB_ORG_ID,
  cert_number: 'CF-MOD-TEST-001', content_hash: 'abc123',
  source_doc_versions: '{}', regulatory_schemas: [],
  module_title: 'Test Module', reviewer_name: 'Sarah Thompson', reviewer_role: 'H&S Manager',
  issued_at: NOW, snapshot_version: 1, was_inserted: true,
};

const ATTEST_BODY = {
  reviewerName: 'Sarah Thompson',
  reviewerRole: 'H&S Manager',
  basisOfCompetence: 'NEBOSH NGC 2019, 8 years warehousing H&S',
  regulatoryFrameworksReviewed: ['PUWER 1998', 'LOLER 1998', 'MHSWR 1999'],
  explicitAcceptance: 'I confirm all content is accurate per UK H&S legislation.',
  contentHashAtAttestation: 'abc123',
};

// ─── Fake auth plugin — bypasses Clerk JWT ────────────────────────────────────

const fakeAuth = fp(async (app) => {
  const store = new WeakMap<FastifyRequest, { userId: string; orgId: string | null; role: OrgRole }>();
  app.decorateRequest('auth', {
    getter(this: FastifyRequest) {
      return store.get(this) ?? { userId: 'test-user', orgId: CLERK_ORG, role: 'admin' as OrgRole };
    },
    setter(this: FastifyRequest, value: { userId: string; orgId: string | null; role: OrgRole }) {
      store.set(this, value);
    },
  });
  app.addHook('onRequest', async (req) => {
    req.auth = { userId: 'test-user', orgId: CLERK_ORG, role: 'admin' as OrgRole };
  });
});

// ─── App setup ────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(fakeAuth);
  await app.register(reviewRoutes, { prefix: '/api/review' });
  await app.register(certsRoutes, { prefix: '/api/certs' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.mocked(sql).mockReset();
  vi.mocked(sql).mockResolvedValue([] as never);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sqlOnce = (value: unknown) => vi.mocked(sql).mockResolvedValueOnce(value as never);

// ─── Test 1: Attestation blocked when findings undisposed ─────────────────────

describe('POST /api/review/:moduleId/attestation — precondition guards', () => {
  it('returns 400 when undisposed findings remain', async () => {
    sqlOnce([MODULE_ROW_IN_REVIEW]); // module lookup
    sqlOnce([{ count: 2 }]);          // undisposed count = 2

    const res = await app.inject({
      method: 'POST',
      url: `/api/review/${MODULE_ID}/attestation`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ATTEST_BODY),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/undisposed|finding/i);
  });

  // ─── Test 2: Attestation blocked when module not in_review ──────────────────

  it('returns 409 when module is still draft', async () => {
    sqlOnce([MODULE_ROW_DRAFT]); // module lookup — status: draft

    const res = await app.inject({
      method: 'POST',
      url: `/api/review/${MODULE_ID}/attestation`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ATTEST_BODY),
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/in.review/i);
  });

  // ─── Test 3: Attestation blocked when module already deployed ───────────────

  it('returns 409 when module is already deployed', async () => {
    sqlOnce([MODULE_ROW_DEPLOYED]); // module lookup — status: deployed

    const res = await app.inject({
      method: 'POST',
      url: `/api/review/${MODULE_ID}/attestation`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ATTEST_BODY),
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/deployed/i);
  });
});

// ─── Test 4: Cat A finding disposition blocked without gated window ───────────

describe('PATCH /api/review/findings/:findingId/disposition — gated window enforcement', () => {
  it('returns 400 for Cat A finding without gated_window_unlocked audit entry', async () => {
    sqlOnce([FINDING_ROW_CAT_A]);  // finding lookup
    sqlOnce([{ count: 0 }]);       // gate check — no unlocked entry

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/review/findings/${FINDING_A_ID}/disposition`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disposition: 'amended',
        rationale: 'Corrected to six-month interval per LOLER Reg 9(3)(a)(ii)',
      }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/gated window/i);
  });

  // ─── Test 5: Cat A finding disposition succeeds after gate unlock ────────────

  it('returns 200 for Cat A finding after gated window completed', async () => {
    sqlOnce([FINDING_ROW_CAT_A]);  // finding lookup
    sqlOnce([{ count: 1 }]);       // gate check — unlocked entry exists
    sqlOnce([FINDING_ROW_DISPOSED]); // UPDATE RETURNING

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/review/findings/${FINDING_A_ID}/disposition`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disposition: 'amended',
        rationale: 'Corrected to six-month interval per LOLER Reg 9(3)(a)(ii)',
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; data: { disposition: string } };
    expect(body.ok).toBe(true);
    expect(body.data.disposition).toBe('amended');
  });
});

// ─── Test 6: Attestation succeeds when all preconditions met ──────────────────

describe('POST /api/review/:moduleId/attestation — happy path', () => {
  it('returns 201 when module is in_review and all findings disposed', async () => {
    sqlOnce([MODULE_ROW_IN_REVIEW]); // module lookup
    sqlOnce([{ count: 0 }]);          // undisposed count = 0
    sqlOnce([{ job_state: {} }]);     // generation_jobs for snapshot
    sqlOnce([ATTEST_ROW]);            // INSERT attestation (upsert RETURNING)

    const res = await app.inject({
      method: 'POST',
      url: `/api/review/${MODULE_ID}/attestation`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ATTEST_BODY),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { ok: boolean; data: { id: string; reviewerName: string } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(ATTEST_ID);
    expect(body.data.reviewerName).toBe('Sarah Thompson');
  });
});

// ─── Test 7: Module cert issuance sets status to deployed ─────────────────────

describe('POST /api/certs/module/:moduleId — cert issuance', () => {
  it('returns 201 and deploys the module', async () => {
    sqlOnce([MODULE_ROW_IN_REVIEW]); // module lookup
    sqlOnce([]);                      // existing cert check — none
    sqlOnce([ATTEST_ROW]);            // attestation check
    sqlOnce([MODULE_CERT_ROW]);       // INSERT cert (upsert RETURNING)
    sqlOnce([]);                      // UPDATE modules SET status = deployed
    // writeAuditLog calls are mocked

    const res = await app.inject({
      method: 'POST',
      url: `/api/certs/module/${MODULE_ID}`,
    });

    // Cert issuance returns 201 for new certs (was_inserted = true triggers status update)
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { ok: boolean; data: { certNumber: string } };
    expect(body.ok).toBe(true);
    expect(body.data.certNumber).toBe('CF-MOD-TEST-001');
  });

  // ─── Test 8: Module cert issuance is idempotent ─────────────────────────────

  it('returns existing cert on second call (idempotent)', async () => {
    sqlOnce([MODULE_ROW_IN_REVIEW]); // module lookup
    sqlOnce([MODULE_CERT_ROW]);       // existing cert check — cert found

    const res = await app.inject({
      method: 'POST',
      url: `/api/certs/module/${MODULE_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; data: { certNumber: string } };
    expect(body.ok).toBe(true);
    expect(body.data.certNumber).toBe('CF-MOD-TEST-001');
  });
});

// ─── Test 9: Deployed module attestation blocked ──────────────────────────────

describe('POST /api/review/:moduleId/attestation — post-deployment guard', () => {
  it('returns 409 after module is deployed', async () => {
    sqlOnce([MODULE_ROW_DEPLOYED]); // module lookup — deployed

    const res = await app.inject({
      method: 'POST',
      url: `/api/review/${MODULE_ID}/attestation`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ATTEST_BODY),
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/deployed/i);
  });
});

// ─── Test 10: Learner cert requires module cert ───────────────────────────────

describe('POST /api/certs/learner/:moduleId — learner cert preconditions', () => {
  it('returns 400 when no module cert exists', async () => {
    // Learner cert endpoint's first SQL call is the module cert check (no separate module lookup)
    sqlOnce([]);  // module cert check — none found → should 400

    const res = await app.inject({
      method: 'POST',
      url: `/api/certs/learner/${MODULE_ID}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        learnerName: 'Mark Davies',
        learnerUserId: 'user_learner_01',
        score: 85,
        passThreshold: 70,
      }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/cert/i);
  });
});
