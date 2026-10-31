// ─── Module Snapshots Service ─────────────────────────────────────────────────
// Creates and queries WORM-protected content snapshots for immutable versioning.
// Version numbering is auto-incrementing per module (advisory-lock serialised).

import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';

export interface ModuleSnapshot {
  id: string;
  moduleId: string;
  version: number;
  contentHash: string;
  content: unknown;
  triggerEvent: 'generation_complete' | 'attestation' | 'redeployment';
  createdBy: string;
  createdAt: string;
}

export type ModuleSnapshotSummary = Omit<ModuleSnapshot, 'content'>;

/**
 * Create a snapshot of the current module content.
 * Uses advisory lock per module to serialise version assignment.
 * Writes a WORM audit event on success.
 */
export async function createModuleSnapshot(
  moduleId: string,
  contentHash: string,
  content: unknown,
  triggerEvent: ModuleSnapshot['triggerEvent'],
  createdBy: string,
  orgId: string,
): Promise<ModuleSnapshotSummary> {
  const rows = await sql`
    WITH _lock AS (
      SELECT pg_advisory_xact_lock(hashtext(${moduleId}), 1)
    ),
    next_version AS (
      SELECT COALESCE(MAX(version), 0) + 1 AS v
      FROM module_snapshots
      WHERE module_id = ${moduleId}
    )
    INSERT INTO module_snapshots (module_id, version, content_hash, content, trigger_event, created_by)
    SELECT ${moduleId}, v, ${contentHash}, ${JSON.stringify(content)}::jsonb, ${triggerEvent}, ${createdBy}
    FROM next_version
    RETURNING id, module_id, version, content_hash, trigger_event, created_by, created_at
  `;

  const row = rows[0] as Record<string, unknown>;
  const snapshot: ModuleSnapshotSummary = {
    id: row.id as string,
    moduleId: row.module_id as string,
    version: row.version as number,
    contentHash: row.content_hash as string,
    triggerEvent: row.trigger_event as ModuleSnapshot['triggerEvent'],
    createdBy: row.created_by as string,
    createdAt: String(row.created_at),
  };

  // WORM audit trail — best-effort (audit failure should not block snapshot return)
  try {
    await writeAuditLog({
      orgId,
      moduleId,
      userId: createdBy,
      action: 'snapshot_created',
      payload: { version: snapshot.version, contentHash, triggerEvent },
    });
  } catch {
    console.warn('[snapshots] Audit log write failed for snapshot v%d of %s', snapshot.version, moduleId);
  }

  return snapshot;
}

/** List versions for a module (metadata only, no content). */
export async function listModuleVersions(moduleId: string): Promise<ModuleSnapshotSummary[]> {
  const rows = await sql`
    SELECT id, module_id, version, content_hash, trigger_event, created_by, created_at
    FROM module_snapshots
    WHERE module_id = ${moduleId}
    ORDER BY version ASC
  `;
  return rows.map((row) => ({
    id: row.id as string,
    moduleId: row.module_id as string,
    version: row.version as number,
    contentHash: row.content_hash as string,
    triggerEvent: row.trigger_event as ModuleSnapshot['triggerEvent'],
    createdBy: row.created_by as string,
    createdAt: String(row.created_at),
  }));
}

/** Get a specific version with full content. */
export async function getModuleVersion(moduleId: string, version: number): Promise<ModuleSnapshot | null> {
  const rows = await sql`
    SELECT id, module_id, version, content_hash, content, trigger_event, created_by, created_at
    FROM module_snapshots
    WHERE module_id = ${moduleId} AND version = ${version}
  `;
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    moduleId: row.module_id as string,
    version: row.version as number,
    contentHash: row.content_hash as string,
    content: row.content,
    triggerEvent: row.trigger_event as ModuleSnapshot['triggerEvent'],
    createdBy: row.created_by as string,
    createdAt: String(row.created_at),
  };
}

/** Get latest snapshot version number for a module. Returns null if no snapshots exist. */
export async function getLatestSnapshotVersion(moduleId: string): Promise<number | null> {
  const rows = await sql`
    SELECT version FROM module_snapshots
    WHERE module_id = ${moduleId}
    ORDER BY version DESC LIMIT 1
  `;
  return rows[0] ? (rows[0] as { version: number }).version : null;
}
