// ─── Privacy Admin Routes ────────────────────────────────────────────────────
// Retention policy management, GDPR deletion requests, privacy reporting.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { requireRole } from '../plugins/rbac.js';
import type { ApiResponse } from '@complianceforge/types';

interface RetentionPolicy {
  audioRetentionDays: number;
  transcriptRetentionDays: number;
}

interface DeletionRequest {
  id: string;
  targetUserId: string;
  requestedBy: string;
  status: string;
  scope: string[];
  completedAt: string | null;
  createdAt: string;
}

interface PrivacyReportEntry {
  userId: string;
  verbalResponseCount: number;
  audioRecordingsCount: number;
  transcriptCount: number;
  certificateCount: number;
}

const UpdateRetentionSchema = z.object({
  audioRetentionDays: z.number().int().min(30).max(3650),
  transcriptRetentionDays: z.number().int().min(30).max(3650),
});

const DeletionRequestSchema = z.object({
  targetUserId: z.string().min(1),
  scope: z.array(z.enum(['audio', 'transcripts', 'verbal_responses', 'certificates'])).min(1),
});

export const privacyRoutes: FastifyPluginAsync = async (app) => {

  async function resolveOrgId(clerkOrgId: string): Promise<string | null> {
    const rows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${clerkOrgId}`;
    return rows[0] ? (rows[0] as { id: string }).id : null;
  }

  // GET /api/admin/retention-policy
  app.get('/retention-policy', { preHandler: [requireRole('admin')] }, async (request, reply): Promise<ApiResponse<RetentionPolicy>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const rows = await sql`
      SELECT audio_retention_days, transcript_retention_days
      FROM data_retention_policies WHERE org_id = ${dbOrgId}
    `;

    return {
      ok: true,
      data: rows[0]
        ? { audioRetentionDays: rows[0].audio_retention_days as number, transcriptRetentionDays: rows[0].transcript_retention_days as number }
        : { audioRetentionDays: 365, transcriptRetentionDays: 730 },
    };
  });

  // PUT /api/admin/retention-policy
  app.put('/retention-policy', { preHandler: [requireRole('admin')] }, async (request, reply): Promise<ApiResponse<RetentionPolicy>> => {
    const { userId, orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const parsed = UpdateRetentionSchema.safeParse(request.body);
    if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

    const { audioRetentionDays, transcriptRetentionDays } = parsed.data;

    await sql`
      INSERT INTO data_retention_policies (org_id, audio_retention_days, transcript_retention_days)
      VALUES (${dbOrgId}, ${audioRetentionDays}, ${transcriptRetentionDays})
      ON CONFLICT (org_id) DO UPDATE SET
        audio_retention_days = EXCLUDED.audio_retention_days,
        transcript_retention_days = EXCLUDED.transcript_retention_days,
        updated_at = now()
    `;

    await writeAuditLog({
      orgId: dbOrgId, userId: userId!,
      action: 'retention_policy_updated',
      payload: { audioRetentionDays, transcriptRetentionDays },
    });

    return { ok: true, data: { audioRetentionDays, transcriptRetentionDays } };
  });

  // POST /api/admin/data-deletion-request
  app.post('/data-deletion-request', { preHandler: [requireRole('admin')] }, async (request, reply): Promise<ApiResponse<DeletionRequest>> => {
    const { userId, orgId } = request.auth;
    if (!orgId || !userId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const parsed = DeletionRequestSchema.safeParse(request.body);
    if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

    const { targetUserId, scope } = parsed.data;

    // Create deletion request
    const rows = await sql`
      INSERT INTO data_deletion_requests (org_id, requested_by, target_user_id, status, scope)
      VALUES (${dbOrgId}, ${userId}, ${targetUserId}, 'pending', ${scope})
      RETURNING id, target_user_id, requested_by, status, scope, completed_at, created_at
    `;
    const row = rows[0] as Record<string, unknown>;

    // Process deletion immediately (synchronous for now — could be async job later)
    try {
      await sql`UPDATE data_deletion_requests SET status = 'processing' WHERE id = ${row.id}`;

      // Redact audio data
      if (scope.includes('audio') || scope.includes('verbal_responses')) {
        await sql`
          UPDATE verbal_responses SET audio_data = NULL
          WHERE learner_user_id = ${targetUserId} AND org_id = ${dbOrgId}
        `;
      }

      // Redact transcripts
      if (scope.includes('transcripts') || scope.includes('verbal_responses')) {
        await sql`
          UPDATE verbal_responses
          SET transcript = '[REDACTED]', manager_note = '[REDACTED]'
          WHERE learner_user_id = ${targetUserId} AND org_id = ${dbOrgId}
        `;
      }

      // Anonymise learner certificates (keep for legal retention, redact name)
      if (scope.includes('certificates')) {
        await sql`
          UPDATE learner_certificates
          SET learner_name = 'Redacted User'
          WHERE learner_user_id = ${targetUserId} AND org_id = ${dbOrgId}
        `;
      }

      await sql`
        UPDATE data_deletion_requests
        SET status = 'completed', completed_at = now()
        WHERE id = ${row.id}
      `;

      await writeAuditLog({
        orgId: dbOrgId, userId,
        action: 'data_deletion_completed',
        payload: { requestId: row.id, targetUserId, scope },
      });
    } catch (err) {
      await sql`
        UPDATE data_deletion_requests
        SET status = 'failed'
        WHERE id = ${row.id}
      `;
      console.error('[privacy] Deletion request failed:', err);
    }

    // Re-read the request to get final status
    const finalRows = await sql`
      SELECT id, target_user_id, requested_by, status, scope, completed_at, created_at
      FROM data_deletion_requests WHERE id = ${row.id}
    `;
    const final = finalRows[0] as Record<string, unknown>;

    reply.status(201);
    return {
      ok: true,
      data: {
        id: final.id as string,
        targetUserId: final.target_user_id as string,
        requestedBy: final.requested_by as string,
        status: final.status as string,
        scope: final.scope as string[],
        completedAt: final.completed_at ? String(final.completed_at) : null,
        createdAt: String(final.created_at),
      },
    };
  });

  // GET /api/admin/data-deletion-requests
  app.get('/data-deletion-requests', { preHandler: [requireRole('admin')] }, async (request, reply): Promise<ApiResponse<DeletionRequest[]>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const rows = await sql`
      SELECT id, target_user_id, requested_by, status, scope, completed_at, created_at
      FROM data_deletion_requests
      WHERE org_id = ${dbOrgId}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id as string,
        targetUserId: r.target_user_id as string,
        requestedBy: r.requested_by as string,
        status: r.status as string,
        scope: r.scope as string[],
        completedAt: r.completed_at ? String(r.completed_at) : null,
        createdAt: String(r.created_at),
      })),
    };
  });

  // GET /api/admin/privacy-report — per-learner data inventory
  app.get('/privacy-report', { preHandler: [requireRole('admin')] }, async (request, reply): Promise<ApiResponse<PrivacyReportEntry[]>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const rows = await sql`
      SELECT
        vr.learner_user_id AS user_id,
        count(*)::int AS verbal_count,
        count(*) FILTER (WHERE vr.audio_data IS NOT NULL)::int AS audio_count,
        count(*) FILTER (WHERE vr.transcript IS NOT NULL AND vr.transcript != '[REDACTED]')::int AS transcript_count
      FROM verbal_responses vr
      WHERE vr.org_id = ${dbOrgId}
      GROUP BY vr.learner_user_id
      ORDER BY verbal_count DESC
      LIMIT 200
    `;

    // Get cert counts
    const certRows = await sql`
      SELECT learner_user_id AS user_id, count(*)::int AS cert_count
      FROM learner_certificates
      WHERE org_id = ${dbOrgId}
      GROUP BY learner_user_id
    `;
    const certMap: Record<string, number> = {};
    for (const r of certRows) {
      certMap[r.user_id as string] = r.cert_count as number;
    }

    return {
      ok: true,
      data: rows.map((r) => ({
        userId: r.user_id as string,
        verbalResponseCount: r.verbal_count as number,
        audioRecordingsCount: r.audio_count as number,
        transcriptCount: r.transcript_count as number,
        certificateCount: certMap[r.user_id as string] ?? 0,
      })),
    };
  });
};
