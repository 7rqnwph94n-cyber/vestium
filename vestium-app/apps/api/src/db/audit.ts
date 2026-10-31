// ─── Audit log writer ─────────────────────────────────────────────────────────
// Single function for all audit writes. Every call is an INSERT — never UPDATE.
// The DB trigger on audit_log enforces immutability at the DB level.

import { sql } from './client.js';
import type { AuditAction } from '@complianceforge/types';

export async function writeAuditLog(entry: {
  orgId: string;
  moduleId?: string;
  registryId?: string;
  userId: string;
  userRole?: string;
  action: AuditAction;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await sql`
    INSERT INTO audit_log (org_id, module_id, registry_id, user_id, user_role, action, payload)
    VALUES (
      ${entry.orgId},
      ${entry.moduleId ?? null},
      ${entry.registryId ?? null},
      ${entry.userId},
      ${entry.userRole ?? null},
      ${entry.action},
      ${JSON.stringify(entry.payload ?? {})}
    )
  `;
}
