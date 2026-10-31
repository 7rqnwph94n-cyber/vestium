// ─── SOP Seed Strategy ────────────────────────────────────────────────────────
// Reads sopFactCheck from sop_generation_jobs.job_state and seeds
// governed_findings for unattributed steps.
// Registered with the governance seed strategy registry at import time.

import { sql } from '../db/client.js';
import { registerSeedStrategy, type SeedFindingsResult } from './governanceSeedStrategies.js';

async function seedSopFindings(
  registryId: string,
  sourceEntityId: string,
  _orgId: string,
): Promise<SeedFindingsResult> {
  // Load SOP generation job state (v1 table)
  const [jobRow] = await sql`
    SELECT job_state FROM sop_generation_jobs
    WHERE sop_id = ${sourceEntityId} AND status = 'complete'
    LIMIT 1
  ` as Array<{ job_state: Record<string, unknown> }>;

  if (!jobRow) return { created: 0, skipped: 0 };

  const steps = jobRow.job_state.steps as Record<string, { parsedJson?: unknown }> | undefined;
  const factCheckParsed = (steps?.sopFactCheck?.parsedJson as {
    sopFactCheck?: {
      steps: Array<{ stepNumber: number; attributed: boolean; note?: string }>;
    };
  })?.sopFactCheck;

  if (!factCheckParsed) return { created: 0, skipped: 0 };

  // Get the draft build for step descriptions
  const draftParsed = (steps?.sopDraftBuild?.parsedJson as {
    sopDraftBuild?: { steps: Array<{ stepNumber: number; action: string }> };
  })?.sopDraftBuild;

  const unattributed = factCheckParsed.steps.filter((s) => !s.attributed);
  if (unattributed.length === 0) return { created: 0, skipped: 0 };

  // Get existing governed_findings to avoid duplicates
  const existing = await sql`
    SELECT location FROM governed_findings WHERE registry_id = ${registryId}
  ` as Array<{ location: string }>;
  const existingLocations = new Set(existing.map((r) => r.location));

  let created = 0;
  let skipped = 0;

  for (const step of unattributed) {
    const draftStep = draftParsed?.steps.find((ds) => ds.stepNumber === step.stepNumber);
    const location = `Step ${step.stepNumber}${draftStep ? ` — ${draftStep.action.slice(0, 80)}` : ''}`;

    if (existingLocations.has(location)) { skipped++; continue; }

    await sql`
      INSERT INTO governed_findings
        (registry_id, severity, category, description, location, source_attribution)
      VALUES (
        ${registryId},
        'high',
        'A',
        ${`Step ${step.stepNumber} cannot be attributed to uploaded source documentation. ${step.note ?? 'No citation found in source documents.'}`},
        ${location},
        ${'Procedural claim not found in uploaded source documents — must be verified or removed'}
      )
    `;
    created++;
  }

  return { created, skipped };
}

registerSeedStrategy('sop', seedSopFindings);
