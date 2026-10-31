// ─── Org Members routes ──────────────────────────────────────────────────────
// CRUD for the local org_members table + Clerk invitation flow.
// Lazy-syncs the calling user on every request if not yet in the table.

import type { FastifyPluginAsync } from 'fastify';
import { createClerkClient } from '@clerk/backend';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { requireRole } from '../plugins/rbac.js';
import { mapClerkRole } from '../plugins/clerk.js';
import type { OrgMemberRecord, OrgRole, ApiResponse } from '@complianceforge/types';

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Resolve DB org id from Clerk org id. Returns null if not found. */
async function resolveOrgId(clerkOrgId: string): Promise<string | null> {
  const rows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${clerkOrgId}`;
  return rows[0]?.id ?? null;
}

/** Map a DB row to the DTO. */
function toMemberRecord(row: Record<string, unknown>): OrgMemberRecord {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    clerkUserId: row.clerk_user_id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as OrgRole,
    jobTitle: (row.job_title as string) || undefined,
    department: (row.department as string) || undefined,
    status: row.status as 'active' | 'invited' | 'suspended',
    invitedAt: row.invited_at ? String(row.invited_at) : undefined,
    joinedAt: row.joined_at ? String(row.joined_at) : undefined,
  };
}

/**
 * Lazy-sync: ensure the calling user exists in org_members.
 * Called on every request — the upsert is a no-op if the row already exists.
 */
async function ensureMemberRecord(
  dbOrgId: string,
  clerkUserId: string,
  role: OrgRole,
  clerkOrgId: string,
): Promise<void> {
  // Try to fetch name + email from Clerk (best-effort)
  let email = `${clerkUserId}@unknown`;
  let name = clerkUserId;
  try {
    if (!clerkOrgId.startsWith('user_')) {
      const memberships = await clerkClient.organizations.getOrganizationMembershipList({
        organizationId: clerkOrgId,
      });
      const match = memberships.data.find(
        (m) => m.publicUserData?.userId === clerkUserId,
      );
      if (match?.publicUserData) {
        email = match.publicUserData.identifier ?? email;
        name =
          [match.publicUserData.firstName, match.publicUserData.lastName]
            .filter(Boolean)
            .join(' ') || name;
      }
    }
  } catch {
    // Non-critical — proceed with placeholder data
  }

  await sql`
    INSERT INTO org_members (org_id, clerk_user_id, email, name, role, status, joined_at)
    VALUES (${dbOrgId}, ${clerkUserId}, ${email}, ${name}, ${role}, 'active', now())
    ON CONFLICT (org_id, clerk_user_id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      updated_at = now()
  `;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export const membersRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /api/members — list org members ───────────────────────────────────
  app.get('/', {
    preHandler: [requireRole('admin', 'hr_manager')],
  }, async (request, reply): Promise<ApiResponse<OrgMemberRecord[]>> => {
    const { orgId, userId, role } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active organisation' }; }

    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Organisation not found' }; }

    // Lazy-sync caller
    await ensureMemberRecord(dbOrgId, userId, role, orgId);

    const rows = await sql`
      SELECT * FROM org_members WHERE org_id = ${dbOrgId} ORDER BY name ASC
    `;

    return { ok: true, data: rows.map(toMemberRecord) };
  });

  // ── POST /api/members/invite — invite employee(s) ────────────────────────
  app.post('/invite', {
    preHandler: [requireRole('admin', 'hr_manager')],
  }, async (request, reply): Promise<ApiResponse<{ invited: number; errors: string[] }>> => {
    const { orgId, userId, role: callerRole } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active organisation' }; }

    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Organisation not found' }; }

    const body = request.body as {
      invites: Array<{ email: string; name: string; role: OrgRole }>;
    };

    if (!body?.invites || !Array.isArray(body.invites) || body.invites.length === 0) {
      reply.status(400);
      return { ok: false, error: 'invites array is required' };
    }

    const VALID_ROLES: OrgRole[] = ['admin', 'hr_manager', 'reviewer', 'learner'];
    let invited = 0;
    const errors: string[] = [];

    for (const inv of body.invites) {
      if (!inv.email || !inv.name) {
        errors.push(`Missing email or name for invite`);
        continue;
      }
      const invRole = VALID_ROLES.includes(inv.role) ? inv.role : 'learner';

      try {
        // Send Clerk org invitation
        if (!orgId.startsWith('user_')) {
          const clerkRoleKey = invRole === 'learner' ? 'org:member' : `org:${invRole}`;
          await clerkClient.organizations.createOrganizationInvitation({
            organizationId: orgId,
            emailAddress: inv.email,
            role: clerkRoleKey,
            inviterUserId: userId,
          });
        }

        // Insert local record
        await sql`
          INSERT INTO org_members (org_id, clerk_user_id, email, name, role, status, invited_at)
          VALUES (${dbOrgId}, ${`pending_${inv.email}`}, ${inv.email}, ${inv.name}, ${invRole}, 'invited', now())
          ON CONFLICT (org_id, clerk_user_id) DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            status = 'invited',
            invited_at = now(),
            updated_at = now()
        `;

        await writeAuditLog({
          orgId: dbOrgId,
          userId,
          userRole: callerRole,
          action: 'member_invited',
          payload: { email: inv.email, name: inv.name, role: invRole },
        });

        invited++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Failed to invite ${inv.email}: ${msg}`);
      }
    }

    return { ok: true, data: { invited, errors } };
  });

  // ── PATCH /api/members/:id — update member details ───────────────────────
  app.patch('/:id', {
    preHandler: [requireRole('admin', 'hr_manager')],
  }, async (request, reply): Promise<ApiResponse<OrgMemberRecord>> => {
    const { orgId, userId, role: callerRole } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active organisation' }; }

    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Organisation not found' }; }

    const { id } = request.params as { id: string };
    const body = request.body as {
      role?: OrgRole;
      jobTitle?: string;
      department?: string;
    };

    // Verify member belongs to this org
    const existing = await sql`
      SELECT * FROM org_members WHERE id = ${id} AND org_id = ${dbOrgId}
    `;
    if (existing.length === 0) {
      reply.status(404);
      return { ok: false, error: 'Member not found' };
    }

    const oldRole = existing[0].role as string;

    const rows = await sql`
      UPDATE org_members SET
        role = COALESCE(${body.role ?? null}, role),
        job_title = COALESCE(${body.jobTitle ?? null}, job_title),
        department = COALESCE(${body.department ?? null}, department),
        updated_at = now()
      WHERE id = ${id} AND org_id = ${dbOrgId}
      RETURNING *
    `;

    if (body.role && body.role !== oldRole) {
      await writeAuditLog({
        orgId: dbOrgId,
        userId,
        userRole: callerRole,
        action: 'member_role_changed',
        payload: { memberId: id, oldRole, newRole: body.role },
      });
    }

    return { ok: true, data: toMemberRecord(rows[0]) };
  });

  // ── PATCH /api/members/:id/suspend — suspend member ──────────────────────
  app.patch('/:id/suspend', {
    preHandler: [requireRole('admin')],
  }, async (request, reply): Promise<ApiResponse<OrgMemberRecord>> => {
    const { orgId, userId, role: callerRole } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active organisation' }; }

    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Organisation not found' }; }

    const { id } = request.params as { id: string };

    const rows = await sql`
      UPDATE org_members SET status = 'suspended', updated_at = now()
      WHERE id = ${id} AND org_id = ${dbOrgId}
      RETURNING *
    `;

    if (rows.length === 0) {
      reply.status(404);
      return { ok: false, error: 'Member not found' };
    }

    await writeAuditLog({
      orgId: dbOrgId,
      userId,
      userRole: callerRole,
      action: 'member_suspended',
      payload: { memberId: id },
    });

    return { ok: true, data: toMemberRecord(rows[0]) };
  });

  // ── DELETE /api/members/:id — remove member ──────────────────────────────
  app.delete('/:id', {
    preHandler: [requireRole('admin')],
  }, async (request, reply): Promise<ApiResponse<{ deleted: boolean }>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active organisation' }; }

    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Organisation not found' }; }

    const { id } = request.params as { id: string };

    const rows = await sql`
      DELETE FROM org_members WHERE id = ${id} AND org_id = ${dbOrgId} RETURNING id
    `;

    if (rows.length === 0) {
      reply.status(404);
      return { ok: false, error: 'Member not found' };
    }

    return { ok: true, data: { deleted: true } };
  });

  // ── POST /api/members/sync — pull members from Clerk ─────────────────────
  app.post('/sync', {
    preHandler: [requireRole('admin')],
  }, async (request, reply): Promise<ApiResponse<{ synced: number }>> => {
    const { orgId, role: callerRole } = request.auth;
    if (!orgId || orgId.startsWith('user_')) {
      reply.status(400);
      return { ok: false, error: 'Sync requires a real Clerk organisation' };
    }

    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Organisation not found' }; }

    const memberships = await clerkClient.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 500,
    });

    let synced = 0;
    for (const m of memberships.data) {
      const clerkUserId = m.publicUserData?.userId;
      if (!clerkUserId) continue;

      const email = m.publicUserData?.identifier ?? `${clerkUserId}@unknown`;
      const name = [m.publicUserData?.firstName, m.publicUserData?.lastName]
        .filter(Boolean)
        .join(' ') || clerkUserId;
      const role = mapClerkRole(m.role);

      await sql`
        INSERT INTO org_members (org_id, clerk_user_id, email, name, role, status, joined_at)
        VALUES (${dbOrgId}, ${clerkUserId}, ${email}, ${name}, ${role}, 'active', now())
        ON CONFLICT (org_id, clerk_user_id) DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          status = 'active',
          updated_at = now()
      `;
      synced++;
    }

    return { ok: true, data: { synced } };
  });
};
