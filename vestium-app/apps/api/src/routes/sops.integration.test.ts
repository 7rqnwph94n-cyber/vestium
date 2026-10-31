// ─── SOP pipeline — happy-path integration test ───────────────────────────────
// Exercises the SOP HTTP layer end-to-end using a real Fastify instance with
// mocked DB, AI pipeline, and audit dependencies. No real database, AI API, or
// Clerk JWT calls are made. Covers the critical happy-path and hard-stop cases.
//
// Tests:
//   POST /api/sops                         — create SOP record (201 + SopRecord)
//   POST /api/sop-generation/:id/start     — 422 with no source docs
//   POST /api/sop-generation/:id/start     — 200 SSE stream → job_complete
//   GET  /api/sop-review/:id/findings      — returns findings list
//   POST /api/sop-review/:id/attestation   — 409 while undisposed findings remain
//   POST /api/sop-review/:id/attestation   — 201 when all findings are disposed

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// vi.mock is hoisted before all imports — modules are replaced before any code runs.
vi.mock('../db/client.js', () => ({ sql: vi.fn() }));
vi.mock('../db/audit.js', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../pipeline/sopJobRunner.js', () => ({ runSopGenerationJob: vi.fn() }));
vi.mock('../services/contentRegistry.js', () => ({
  registerContent: vi.fn().mockResolvedValue('eeeeeeee-eeee-eeee-eeee-000000000001'),
}));

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { sopRoutes } from './sops.js';
import { sopGenerationRoutes } from './sopGeneration.js';
import { sopReviewRoutes } from './sopReview.js';
import { sql } from '../db/client.js';
import { runSopGenerationJob } from '../pipeline/sopJobRunner.js';
import type { JobStepEvent } from '../pipeline/jobRunner.js';
import type { OrgRole } from '@complianceforge/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CLERK_ORG   = 'org_test_happy_path';
const DB_ORG_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';
const SOP_ID      = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000001';
const FINDING_ID  = 'cccccccc-cccc-cccc-cccc-000000000001';
const ATTEST_ID   = 'dddddddd-dddd-dddd-dddd-000000000001';
const NOW = new Date().toISOString();

const SOP_ROW = {
  id: SOP_ID, org_id: DB_ORG_ID, module_id: null,
  title: 'Hydraulic Oil Change', procedure_name: 'Change hydraulic oil',
  equipment: 'Komatsu PC210 excavator', status: 'draft',
  workplace_context: {}, regulatory_classification: {}, generation_metadata: {},
  content_hash: null, deployed_at: null, created_at: NOW, updated_at: NOW,
};

const FINDING_ROW = {
  id: FINDING_ID, sop_id: SOP_ID, severity: 'high', category: 'A',
  description: 'Step 2 cannot be attributed to uploaded source documentation.',
  location: 'Step 2 — Drain hydraulic oil', regulatory_ref: null,
  source_attribution: 'Unattributed', disposition: null,
  disposition_rationale: null, disposed_by: null, disposed_at: null, created_at: NOW,
};

const ATTEST_ROW = {
  id: ATTEST_ID, sop_id: SOP_ID, reviewer_user_id: 'test-user',
  reviewer_name: 'Jane Smith', reviewer_role: 'Competent Person',
  basis_of_competence: 'PUWER-trained technician, 10 years experience',
  regulatory_frameworks_reviewed: ['PUWER 1998', 'MHSWR 1999'],
  explicit_acceptance: 'I confirm this SOP accurately reflects the source documentation.',
  content_hash_at_attestation: 'abc123', attested_at: NOW,
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
  await app.register(sopRoutes, { prefix: '/api/sops' });
  await app.register(sopGenerationRoutes, { prefix: '/api/sop-generation' });
  await app.register(sopReviewRoutes, { prefix: '/api/sop-review' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: sql returns [] so unmocked calls don't throw.
  vi.mocked(sql).mockResolvedValue([] as never);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Queue a one-shot SQL response for the next call. */
const sqlOnce = (value: unknown) => vi.mocked(sql).mockResolvedValueOnce(value as never);

/** Parse SSE body into individual event objects. */
const parseSseEvents = (body: string): JobStepEvent[] =>
  body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data: /, '')) as JobStepEvent);

// ─── POST /api/sops ───────────────────────────────────────────────────────────

describe('POST /api/sops — create SOP record', () => {
  it('returns 201 + SopRecord on valid input', async () => {
    sqlOnce([{ id: DB_ORG_ID }]); // org lookup
    sqlOnce([SOP_ROW]);           // INSERT sop_records

    const res = await app.inject({
      method: 'POST',
      url: '/api/sops',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Hydraulic Oil Change',
        procedureName: 'Change hydraulic oil',
        equipment: 'Komatsu PC210 excavator',
        workplaceContext: { industry: 'construction' },
        regulatoryClassification: { schemas: ['puwer'] },
      }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { ok: boolean; data: { id: string; procedureName: string; status: string } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(SOP_ID);
    expect(body.data.procedureName).toBe('Change hydraulic oil');
    expect(body.data.status).toBe('draft');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sops',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }), // missing procedureName, equipment, etc.
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).ok).toBe(false);
  });
});

// ─── POST /api/sop-generation/:sopId/start — SSE stream ──────────────────────

describe('POST /api/sop-generation/:sopId/start — SSE generation stream', () => {
  it('returns 422 when no source documents have been uploaded', async () => {
    sqlOnce([{ id: DB_ORG_ID }]);            // org lookup
    sqlOnce([{ id: SOP_ID, status: 'draft' }]); // sop ownership check
    sqlOnce([{ n: 0 }]);                     // source doc count — zero

    const res = await app.inject({
      method: 'POST',
      url: `/api/sop-generation/${SOP_ID}/start`,
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toMatch(/source document/i);
    // runSopGenerationJob must NOT be called — no job should start without docs
    expect(vi.mocked(runSopGenerationJob)).not.toHaveBeenCalled();
  });

  it('streams all 4 pipeline steps then job_complete when source docs are present', async () => {
    sqlOnce([{ id: DB_ORG_ID }]);            // org lookup
    sqlOnce([{ id: SOP_ID, status: 'draft' }]); // sop ownership check
    sqlOnce([{ n: 1 }]);                     // source doc count — one present

    vi.mocked(runSopGenerationJob).mockImplementation(
      async (_sopId, _orgId, _userId, sendEvent) => {
        sendEvent({ event: 'step_started', stepKey: 'sopExtract' });
        sendEvent({ event: 'step_done',    stepKey: 'sopExtract',        parsedJson: {}, tokensUsed: 100 });
        sendEvent({ event: 'step_started', stepKey: 'sopRegulatoryMap' });
        sendEvent({ event: 'step_done',    stepKey: 'sopRegulatoryMap',  parsedJson: {}, tokensUsed: 80  });
        sendEvent({ event: 'step_started', stepKey: 'sopDraftBuild' });
        sendEvent({ event: 'step_done',    stepKey: 'sopDraftBuild',     parsedJson: {}, tokensUsed: 200 });
        sendEvent({ event: 'step_started', stepKey: 'sopFactCheck' });
        sendEvent({ event: 'step_done',    stepKey: 'sopFactCheck',      parsedJson: {}, tokensUsed: 60  });
        sendEvent({ event: 'job_complete', totalTokensUsed: 440 });
      }
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/sop-generation/${SOP_ID}/start`,
    });

    // SSE content-type
    expect(res.headers['content-type']).toMatch(/text\/event-stream/i);

    // Parse events and verify the 4-step sequence
    const events = parseSseEvents(res.body);
    const startedSteps = events
      .filter((e) => e.event === 'step_started')
      .map((e) => e.stepKey);
    expect(startedSteps).toEqual(['sopExtract', 'sopRegulatoryMap', 'sopDraftBuild', 'sopFactCheck']);

    // Final event must be job_complete
    const last = events.at(-1);
    expect(last?.event).toBe('job_complete');
    expect(last?.totalTokensUsed).toBe(440);

    // Job runner was called with the correct SOP id, org id, and user
    expect(vi.mocked(runSopGenerationJob)).toHaveBeenCalledWith(
      SOP_ID,
      DB_ORG_ID,
      'test-user',
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });
});

// ─── GET /api/sop-review/:sopId/findings ─────────────────────────────────────

describe('GET /api/sop-review/:sopId/findings', () => {
  it('returns the findings list for the SOP', async () => {
    sqlOnce([{ db_org_id: DB_ORG_ID }]); // ownership verification
    sqlOnce([FINDING_ROW]);              // SELECT from sop_review_findings

    const res = await app.inject({
      method: 'GET',
      url: `/api/sop-review/${SOP_ID}/findings`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      data: Array<{ id: string; category: string; severity: string; disposition?: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(FINDING_ID);
    expect(body.data[0].category).toBe('A');
    expect(body.data[0].severity).toBe('high');
    expect(body.data[0].disposition).toBeUndefined();
  });

  it('returns 404 when the SOP does not belong to the org', async () => {
    sqlOnce([]); // ownership check returns nothing — SOP not found

    const res = await app.inject({
      method: 'GET',
      url: `/api/sop-review/${SOP_ID}/findings`,
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /api/sop-review/:sopId/attestation ─────────────────────────────────

describe('POST /api/sop-review/:sopId/attestation — legal commitment', () => {
  const attestBody = {
    reviewerName: 'Jane Smith',
    reviewerRole: 'Competent Person',
    basisOfCompetence: 'PUWER-trained technician, 10 years experience on excavators',
    regulatoryFrameworksReviewed: ['PUWER 1998', 'MHSWR 1999'],
    explicitAcceptance:
      'I confirm this SOP accurately reflects the manufacturer instructions and regulatory controls.',
    contentHashAtAttestation: 'abc123',
  };

  it('returns 409 when undisposed findings remain — attestation hard-stop enforced', async () => {
    sqlOnce([{ id: SOP_ID, status: 'in_review', db_org_id: DB_ORG_ID }]); // ownership + status check
    sqlOnce([{ n: 2 }]);                 // 2 undisposed findings — hard-stop

    const res = await app.inject({
      method: 'POST',
      url: `/api/sop-review/${SOP_ID}/attestation`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attestBody),
    });

    expect(res.statusCode).toBe(409);
    const err = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(err.ok).toBe(false);
    expect(err.error).toMatch(/2 finding\(s\).*undisposed/i);
  });

  it('returns 201 + attestation record when all findings are disposed', async () => {
    sqlOnce([{ id: SOP_ID, status: 'in_review', db_org_id: DB_ORG_ID }]); // ownership + status check
    sqlOnce([{ n: 0 }]);                 // zero undisposed — gate passes
    sqlOnce([ATTEST_ROW]);              // INSERT ON CONFLICT DO NOTHING RETURNING
    sqlOnce([]);                         // UPDATE sop_records SET status = 'deployed'

    const res = await app.inject({
      method: 'POST',
      url: `/api/sop-review/${SOP_ID}/attestation`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attestBody),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      data: { id: string; reviewerName: string; regulatoryFrameworksReviewed: string[] };
    };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(ATTEST_ID);
    expect(body.data.reviewerName).toBe('Jane Smith');
    expect(body.data.regulatoryFrameworksReviewed).toContain('PUWER 1998');
  });

  it('returns 400 when body is missing required fields', async () => {
    sqlOnce([{ id: SOP_ID, status: 'in_review', db_org_id: DB_ORG_ID }]); // ownership + status passes — schema validation runs next

    const res = await app.inject({
      method: 'POST',
      url: `/api/sop-review/${SOP_ID}/attestation`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewerName: 'Jane' }), // missing role, basis, frameworks, acceptance, hash
    });

    expect(res.statusCode).toBe(400);
  });
});
