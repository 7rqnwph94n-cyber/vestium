// ─── Module Seed Strategy ─────────────────────────────────────────────────────
// Reads factCheckMerge/factCheck from generation_jobs.job_state and seeds
// governed_findings for unsupported/disputed/unverified claims.
// Registered with the governance seed strategy registry at import time.

import { sql } from '../db/client.js';
import { registerSeedStrategy, type SeedFindingsResult } from './governanceSeedStrategies.js';
import {
  deriveFindingSeverity,
  deriveFindingCategory,
  type StoredFactCheckItem,
} from '../regulatory/reviewPolicy.js';

async function seedModuleFindings(
  registryId: string,
  sourceEntityId: string,
  _orgId: string,
): Promise<SeedFindingsResult> {
  // Load generation job state (v1 table)
  const [jobRow] = await sql`
    SELECT job_state FROM generation_jobs
    WHERE module_id = ${sourceEntityId} AND status = 'complete'
    LIMIT 1
  ` as Array<{ job_state: Record<string, unknown> }>;

  if (!jobRow) return { created: 0, skipped: 0 };

  const steps = jobRow.job_state.steps as Record<string, { parsedJson?: unknown }> | undefined;
  const factCheckStep = steps?.factCheckMerge ?? steps?.factCheck;
  const factCheckParsed = (factCheckStep?.parsedJson as {
    factCheck?: { items?: StoredFactCheckItem[] };
  })?.factCheck;
  const items = factCheckParsed?.items ?? [];

  if (items.length === 0) return { created: 0, skipped: 0 };

  const candidates = items.filter((i) => i.verdict !== 'supported');

  // Get existing governed_findings to avoid duplicates
  const existing = await sql`
    SELECT location FROM governed_findings WHERE registry_id = ${registryId}
  ` as Array<{ location: string }>;
  const existingLocations = new Set(existing.map((r) => r.location));

  let created = 0;
  let skipped = 0;

  for (const item of candidates) {
    const location = item.relatedItemId ?? 'Module-level claim';
    if (existingLocations.has(location)) { skipped++; continue; }

    const severity = deriveFindingSeverity(item);
    const category = deriveFindingCategory(severity);

    await sql`
      INSERT INTO governed_findings
        (registry_id, severity, category, description, location, regulatory_ref)
      VALUES (
        ${registryId},
        ${severity},
        ${category},
        ${`${item.verdict}: ${item.claim}${item.rationale ? ` — ${item.rationale}` : ''}`},
        ${location},
        ${null}
      )
    `;
    created++;
  }

  return { created, skipped };
}

registerSeedStrategy('module', seedModuleFindings);
