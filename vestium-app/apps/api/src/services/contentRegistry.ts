// ─── Content Registry Service ────────────────────────────────────────────────
// Manages the content_registry table — the universal index of all governed
// content items. Every content-type CRUD route calls registerContent() on
// creation and updateRegistryStatus() on status transitions.

import { sql } from '../db/client.js';

export type ContentType = 'module' | 'sop' | 'rams' | 'permit' | 'toolbox_talk' | 'qr_pack';

export interface ContentRegistryEntry {
  id: string;
  contentType: ContentType;
  orgId: string;
  title: string;
  status: 'draft' | 'in_review' | 'deployed' | 'stale';
  contentHash: string | null;
  sourceEntityId: string;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Register a new content item. Returns the registry ID. Upserts on conflict. */
export async function registerContent(
  contentType: ContentType,
  orgId: string,
  sourceEntityId: string,
  title: string,
): Promise<string> {
  const rows = await sql`
    INSERT INTO content_registry (content_type, org_id, source_entity_id, title)
    VALUES (${contentType}, ${orgId}, ${sourceEntityId}, ${title})
    ON CONFLICT (content_type, source_entity_id) DO UPDATE
      SET title = EXCLUDED.title, updated_at = now()
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

/** Update registry status + optional content hash. */
export async function updateRegistryStatus(
  registryId: string,
  status: 'draft' | 'in_review' | 'deployed' | 'stale',
  contentHash?: string,
): Promise<void> {
  await sql`
    UPDATE content_registry
    SET status       = ${status},
        content_hash = COALESCE(${contentHash ?? null}, content_hash),
        deployed_at  = CASE WHEN ${status} = 'deployed' THEN now() ELSE deployed_at END,
        updated_at   = now()
    WHERE id = ${registryId}
  `;
}

/** Look up registry ID by content type + source entity ID. */
export async function getRegistryIdByEntity(
  contentType: ContentType,
  sourceEntityId: string,
): Promise<string | null> {
  const rows = await sql`
    SELECT id FROM content_registry
    WHERE content_type = ${contentType} AND source_entity_id = ${sourceEntityId}
  `;
  return rows[0] ? (rows[0] as { id: string }).id : null;
}

/** Get a full registry entry by ID. */
export async function getRegistryEntry(registryId: string): Promise<ContentRegistryEntry | null> {
  const rows = await sql`
    SELECT id, content_type, org_id, title, status, content_hash,
           source_entity_id, deployed_at, created_at, updated_at
    FROM content_registry
    WHERE id = ${registryId}
  `;
  if (!rows[0]) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    id: r.id as string,
    contentType: r.content_type as ContentType,
    orgId: r.org_id as string,
    title: r.title as string,
    status: r.status as ContentRegistryEntry['status'],
    contentHash: r.content_hash as string | null,
    sourceEntityId: r.source_entity_id as string,
    deployedAt: r.deployed_at as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** List registry entries for an org, optionally filtered by type and/or status. */
export async function listRegistryEntries(
  orgId: string,
  filters?: { contentType?: ContentType; status?: string },
): Promise<ContentRegistryEntry[]> {
  const rows = await sql`
    SELECT id, content_type, org_id, title, status, content_hash,
           source_entity_id, deployed_at, created_at, updated_at
    FROM content_registry
    WHERE org_id = ${orgId}
      AND (${filters?.contentType ?? null}::text IS NULL OR content_type = ${filters?.contentType ?? null})
      AND (${filters?.status ?? null}::text IS NULL OR status = ${filters?.status ?? null})
    ORDER BY created_at DESC
  `;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      contentType: row.content_type as ContentType,
      orgId: row.org_id as string,
      title: row.title as string,
      status: row.status as ContentRegistryEntry['status'],
      contentHash: row.content_hash as string | null,
      sourceEntityId: row.source_entity_id as string,
      deployedAt: row.deployed_at as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  });
}
