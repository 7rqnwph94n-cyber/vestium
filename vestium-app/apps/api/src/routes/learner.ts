// ─── Learner delivery routes ──────────────────────────────────────────────────
// Authenticated:
//   GET  /api/learner/modules/:moduleId            — return assembled module
//   GET  /api/learner/progress/:moduleId            — fetch learner progress
//   PUT  /api/learner/progress/:moduleId            — upsert learner progress

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { assembleModule } from '../pipeline/orchestrator.js';
import type { GenerationJob } from '../pipeline/types.js';

const SaveProgressSchema = z.object({
  progress: z.record(z.unknown()),
  score: z.number().int().min(0).max(100).optional(),
  completed: z.boolean().optional(),
});

/** Resolve Clerk orgId string → DB orgs.id UUID. Returns null if not found. */
async function resolveOrgId(clerkOrgId: string): Promise<string | null> {
  const [row] = (await sql`SELECT id FROM orgs WHERE clerk_org_id = ${clerkOrgId}`) as { id: string }[];
  return row?.id ?? null;
}

export async function learnerRoutes(app: FastifyInstance) {
  // ── GET /modules/:moduleId — assembled module for preview/delivery ──────────
  app.get<{ Params: { moduleId: string } }>('/modules/:moduleId', async (request, reply) => {
    const { moduleId } = request.params;
    const { orgId } = request.auth;

    const [mod] = (await sql`
      SELECT m.id FROM modules m
      JOIN orgs o ON o.id = m.org_id
      WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
        AND m.status IN ('in_review', 'deployed')
    `) as { id: string }[];

    if (!mod) {
      return reply.status(404).send({ ok: false, error: 'Module not found or not accessible' });
    }

    const [jobRow] = (await sql`
      SELECT job_state FROM generation_jobs WHERE module_id = ${moduleId}
    `) as { job_state: GenerationJob }[];

    if (!jobRow?.job_state) {
      return reply.status(404).send({ ok: false, error: 'Module job state not found' });
    }

    try {
      const assembled = assembleModule(jobRow.job_state);
      return reply.send({ ok: true, data: assembled });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assemble module';
      return reply.status(500).send({ ok: false, error: message });
    }
  });

  // ── GET /progress/:moduleId — fetch current progress for authenticated user ─
  app.get<{ Params: { moduleId: string } }>('/progress/:moduleId', async (request, reply) => {
    const { moduleId } = request.params;
    const { userId, orgId } = request.auth;

    const dbOrgId = await resolveOrgId(orgId!);
    if (!dbOrgId) return reply.status(403).send({ ok: false, error: 'Org not found' });

    // Verify module belongs to org and is accessible
    const [mod] = (await sql`
      SELECT id FROM modules
      WHERE id = ${moduleId} AND org_id = ${dbOrgId}
        AND status IN ('in_review', 'deployed')
    `) as { id: string }[];

    if (!mod) return reply.status(404).send({ ok: false, error: 'Module not found' });

    const [row] = (await sql`
      SELECT progress, score, completed FROM learner_progress
      WHERE module_id = ${moduleId} AND user_id = ${userId}
    `) as { progress: Record<string, unknown>; score: number | null; completed: boolean }[];

    return reply.send({ ok: true, data: row ?? null });
  });

  // ── PUT /progress/:moduleId — upsert learner progress ──────────────────────
  app.put<{ Params: { moduleId: string } }>('/progress/:moduleId', async (request, reply) => {
    const { moduleId } = request.params;
    const { userId, orgId } = request.auth;

    const parsed = SaveProgressSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'Invalid request body', code: parsed.error.message });
    }
    const { progress, score, completed } = parsed.data;

    const dbOrgId = await resolveOrgId(orgId!);
    if (!dbOrgId) return reply.status(403).send({ ok: false, error: 'Org not found' });

    // Verify module belongs to org
    const [mod] = (await sql`
      SELECT id FROM modules
      WHERE id = ${moduleId} AND org_id = ${dbOrgId}
        AND status IN ('in_review', 'deployed')
    `) as { id: string }[];

    if (!mod) return reply.status(404).send({ ok: false, error: 'Module not found' });

    const progressJson = JSON.stringify(progress);
    const completedAt = completed ? new Date().toISOString() : null;

    // Upsert: insert or update on (module_id, user_id) conflict.
    // was_already_completed captures the DB state BEFORE this write so we can
    // detect first-time completion and write the WORM audit entry exactly once.
    const [row] = (await sql`
      INSERT INTO learner_progress (module_id, org_id, user_id, progress, score, completed, completed_at)
      VALUES (${moduleId}, ${dbOrgId}, ${userId}, ${progressJson}::jsonb, ${score ?? null}, ${completed ?? false}, ${completedAt})
      ON CONFLICT (module_id, user_id) DO UPDATE SET
        progress = ${progressJson}::jsonb,
        score = COALESCE(${score ?? null}, learner_progress.score),
        completed = CASE
          WHEN ${completed ?? false} THEN true
          ELSE learner_progress.completed
        END,
        completed_at = CASE
          WHEN ${completed ?? false} AND NOT learner_progress.completed THEN now()
          ELSE learner_progress.completed_at
        END,
        updated_at = now()
      RETURNING id, completed,
        (SELECT completed FROM learner_progress WHERE module_id = ${moduleId} AND user_id = ${userId}) AS was_already_completed
    `) as { id: string; completed: boolean; was_already_completed: boolean | null }[];

    // Write WORM audit entry ONLY on the first completion transition (false→true).
    // was_already_completed is null on INSERT (new row), false on first completion UPDATE.
    const isFirstCompletion = completed && row && !row.was_already_completed;
    if (isFirstCompletion) {
      await writeAuditLog({
        orgId: dbOrgId,
        moduleId,
        userId,
        action: 'learner_completed',
        payload: { score: score ?? null, progressId: row.id },
      });
    }

    return reply.send({ ok: true, data: { id: row.id } });
  });
}
