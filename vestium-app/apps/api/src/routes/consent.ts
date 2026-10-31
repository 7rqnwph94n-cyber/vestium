// ─── Consent Routes ──────────────────────────────────────────────────────────
// Consent grant/revoke for learner data processing (audio, transcripts, etc.)

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import type { ApiResponse } from '@complianceforge/types';

const CONSENT_TYPES = ['audio_capture', 'transcript_storage', 'data_processing', 'certificate_issuance'] as const;

const GrantConsentSchema = z.object({
  consentType: z.enum(CONSENT_TYPES),
  consentVersion: z.string().min(1),
});

interface ConsentStatus {
  consentType: string;
  granted: boolean;
  consentVersion: string;
  grantedAt: string;
  revokedAt: string | null;
}

export const consentRoutes: FastifyPluginAsync = async (app) => {

  // POST /api/consent — record consent grant
  app.post('/', async (request, reply): Promise<ApiResponse<ConsentStatus>> => {
    const { userId, orgId } = request.auth;
    if (!orgId || !userId) { reply.status(400); return { ok: false, error: 'Auth context required' }; }

    const parsed = GrantConsentSchema.safeParse(request.body);
    if (!parsed.success) { reply.status(400); return { ok: false, error: 'Invalid request body' }; }

    const { consentType, consentVersion } = parsed.data;

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'] ?? null;

    const rows = await sql`
      INSERT INTO consent_records (user_id, org_id, consent_type, consent_version, granted, ip_address, user_agent)
      VALUES (${userId}, ${dbOrgId}, ${consentType}, ${consentVersion}, true, ${ipAddress}, ${userAgent})
      RETURNING id, consent_type, granted, consent_version, granted_at, revoked_at
    `;

    const row = rows[0] as Record<string, unknown>;

    await writeAuditLog({
      orgId: dbOrgId, userId,
      action: 'consent_granted',
      payload: { consentType, consentVersion },
    });

    return {
      ok: true,
      data: {
        consentType: row.consent_type as string,
        granted: row.granted as boolean,
        consentVersion: row.consent_version as string,
        grantedAt: String(row.granted_at),
        revokedAt: null,
      },
    };
  });

  // GET /api/consent/status — get own consent status per type
  app.get('/status', async (request, reply): Promise<ApiResponse<ConsentStatus[]>> => {
    const { userId, orgId } = request.auth;
    if (!orgId || !userId) { reply.status(400); return { ok: false, error: 'Auth context required' }; }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    // Get latest consent per type (most recent granted_at)
    const rows = await sql`
      SELECT DISTINCT ON (consent_type)
        consent_type, granted, consent_version, granted_at, revoked_at
      FROM consent_records
      WHERE user_id = ${userId} AND org_id = ${dbOrgId}
      ORDER BY consent_type, granted_at DESC
    `;

    return {
      ok: true,
      data: rows.map((r) => ({
        consentType: r.consent_type as string,
        granted: (r.granted as boolean) && !(r.revoked_at),
        consentVersion: r.consent_version as string,
        grantedAt: String(r.granted_at),
        revokedAt: r.revoked_at ? String(r.revoked_at) : null,
      })),
    };
  });

  // DELETE /api/consent/:consentType — revoke consent
  app.delete<{ Params: { consentType: string } }>('/:consentType', async (request, reply): Promise<ApiResponse<{ revoked: boolean }>> => {
    const { userId, orgId } = request.auth;
    const { consentType } = request.params;
    if (!orgId || !userId) { reply.status(400); return { ok: false, error: 'Auth context required' }; }

    if (!CONSENT_TYPES.includes(consentType as typeof CONSENT_TYPES[number])) {
      reply.status(400); return { ok: false, error: 'Invalid consent type' };
    }

    const orgRows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${orgId}`;
    if (!orgRows[0]) { reply.status(404); return { ok: false, error: 'Org not found' }; }
    const dbOrgId = (orgRows[0] as { id: string }).id;

    await sql`
      UPDATE consent_records
      SET revoked_at = now()
      WHERE user_id = ${userId} AND org_id = ${dbOrgId}
        AND consent_type = ${consentType} AND revoked_at IS NULL
    `;

    await writeAuditLog({
      orgId: dbOrgId, userId,
      action: 'consent_revoked',
      payload: { consentType },
    });

    return { ok: true, data: { revoked: true } };
  });
};
