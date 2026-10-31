// ─── Orgs routes ──────────────────────────────────────────────────────────────
// Org provisioning + profile management + onboarding completion.

import type { FastifyPluginAsync } from 'fastify';
import { createClerkClient } from '@clerk/backend';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { requireRole } from '../plugins/rbac.js';
import type { OrgRecord, ApiResponse } from '@complianceforge/types';

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export const orgsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/orgs/me — return the authenticated user's org, creating it if needed
  app.get('/me', async (request, reply): Promise<ApiResponse<OrgRecord>> => {
    const { orgId } = request.auth;

    if (!orgId) {
      reply.status(400);
      return { ok: false, error: 'No active organisation. Select an org in your Clerk session.' };
    }

    // Fetch the actual org name from Clerk — fall back to clerk_org_id if unavailable
    let orgName = orgId;
    try {
      // Personal workspace IDs are prefixed 'user_' (synthetic, no Clerk org record)
      if (!orgId.startsWith('user_')) {
        const clerkOrg = await clerkClient.organizations.getOrganization({ organizationId: orgId });
        orgName = clerkOrg.name;
      }
    } catch {
      // Non-critical — proceed with placeholder name
    }

    // Upsert org on first access; always sync name in case it changed in Clerk
    const rows = await sql`
      INSERT INTO orgs (clerk_org_id, name, tier)
      VALUES (${orgId}, ${orgName}, 1)
      ON CONFLICT (clerk_org_id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, clerk_org_id, tier, industry, workforce_size,
                onboarding_completed, onboarding_completed_at, created_at
    `;

    const org = rows[0] as Record<string, unknown>;

    return {
      ok: true,
      data: {
        id: org.id as string,
        name: org.name as string,
        clerkOrgId: org.clerk_org_id as string,
        tier: org.tier as 1 | 2,
        industry: (org.industry as string) || undefined,
        workforceSize: (org.workforce_size as string) || undefined,
        onboardingCompleted: (org.onboarding_completed as boolean) ?? false,
        createdAt: org.created_at as string,
      },
    };
  });

  // PATCH /api/orgs/me/profile — update org profile (industry, workforce_size)
  app.patch('/me/profile', {
    preHandler: [requireRole('admin')],
  }, async (request, reply): Promise<ApiResponse<OrgRecord>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active organisation' }; }

    const body = request.body as {
      industry?: string;
      workforceSize?: string;
    };

    const rows = await sql`
      UPDATE orgs SET
        industry = COALESCE(${body.industry ?? null}, industry),
        workforce_size = COALESCE(${body.workforceSize ?? null}, workforce_size)
      WHERE clerk_org_id = ${orgId}
      RETURNING id, name, clerk_org_id, tier, industry, workforce_size,
                onboarding_completed, onboarding_completed_at, created_at
    `;

    if (rows.length === 0) {
      reply.status(404);
      return { ok: false, error: 'Organisation not found' };
    }

    const org = rows[0] as Record<string, unknown>;

    return {
      ok: true,
      data: {
        id: org.id as string,
        name: org.name as string,
        clerkOrgId: org.clerk_org_id as string,
        tier: org.tier as 1 | 2,
        industry: (org.industry as string) || undefined,
        workforceSize: (org.workforce_size as string) || undefined,
        onboardingCompleted: (org.onboarding_completed as boolean) ?? false,
        createdAt: org.created_at as string,
      },
    };
  });

  // POST /api/orgs/me/onboarding-complete — mark onboarding as done
  app.post('/me/onboarding-complete', {
    preHandler: [requireRole('admin')],
  }, async (request, reply): Promise<ApiResponse<{ completed: boolean }>> => {
    const { orgId, userId, role } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active organisation' }; }

    const rows = await sql`
      UPDATE orgs SET
        onboarding_completed = true,
        onboarding_completed_at = now()
      WHERE clerk_org_id = ${orgId}
      RETURNING id
    `;

    if (rows.length === 0) {
      reply.status(404);
      return { ok: false, error: 'Organisation not found' };
    }

    const dbOrgId = rows[0].id as string;

    await writeAuditLog({
      orgId: dbOrgId,
      userId,
      userRole: role,
      action: 'onboarding_completed',
      payload: {},
    });

    return { ok: true, data: { completed: true } };
  });
};
