// ─── RAMS Seed Strategy ──────────────────────────────────────────────────────
// Reads ramsFactCheck from content_generation_jobs.job_state and seeds
// governed_findings for any unattributed hazards/method steps.
// Registered with the governance seed strategy registry at import time.

import { sql } from '../db/client.js';
import { registerSeedStrategy, type SeedFindingsResult } from './governanceSeedStrategies.js';

async function seedRamsFindings(
  registryId: string,
  _sourceEntityId: string,
  _orgId: string,
): Promise<SeedFindingsResult> {
  // Load the job state
  const [jobRow] = await sql`
    SELECT job_state FROM content_generation_jobs
    WHERE registry_id = ${registryId} AND status = 'complete'
  ` as Array<{ job_state: Record<string, unknown> }>;

  if (!jobRow) {
    return { created: 0, skipped: 0 };
  }

  const factCheckStep = jobRow.job_state.steps as Record<string, { parsedJson?: unknown }> | undefined;
  const ramsFactCheck = (factCheckStep?.ramsFactCheck?.parsedJson as {
    ramsFactCheck?: {
      hazards: Array<{ id: string; attributed: boolean; note?: string }>;
      methodSteps: Array<{ stepNumber: number; attributed: boolean; note?: string }>;
    };
  })?.ramsFactCheck;

  if (!ramsFactCheck) {
    return { created: 0, skipped: 0 };
  }

  // Get existing findings to avoid duplicates
  const existing = await sql`
    SELECT location FROM governed_findings WHERE registry_id = ${registryId}
  ` as Array<{ location: string }>;
  const existingLocations = new Set(existing.map((r) => r.location));

  let created = 0;
  let skipped = 0;

  // Load draft build for descriptions
  const draftStep = factCheckStep?.ramsDraftBuild?.parsedJson as {
    ramsDraftBuild?: {
      hazardMatrix: Array<{ id: string; hazard: string }>;
      methodStatement: Array<{ stepNumber: number; action: string }>;
    };
  } | undefined;
  const draft = draftStep?.ramsDraftBuild;

  // Seed unattributed hazards
  for (const h of ramsFactCheck.hazards.filter((h) => !h.attributed)) {
    const hazardEntry = draft?.hazardMatrix.find((hm) => hm.id === h.id);
    const location = `Hazard ${h.id}${hazardEntry ? ` — ${hazardEntry.hazard.slice(0, 80)}` : ''}`;

    if (existingLocations.has(location)) { skipped++; continue; }

    await sql`
      INSERT INTO governed_findings (registry_id, severity, category, description, location, source_attribution)
      VALUES (
        ${registryId},
        'high',
        'A',
        ${`Hazard "${hazardEntry?.hazard ?? h.id}" cannot be attributed to uploaded source documentation. ${h.note ?? 'No citation found.'}`},
        ${location},
        ${'Hazard claim not found in uploaded source documents — must be verified or removed'}
      )
    `;
    created++;
  }

  // Seed unattributed method steps
  for (const step of ramsFactCheck.methodSteps.filter((s) => !s.attributed)) {
    const methodStep = draft?.methodStatement.find((ms) => ms.stepNumber === step.stepNumber);
    const location = `Step ${step.stepNumber}${methodStep ? ` — ${methodStep.action.slice(0, 80)}` : ''}`;

    if (existingLocations.has(location)) { skipped++; continue; }

    await sql`
      INSERT INTO governed_findings (registry_id, severity, category, description, location, source_attribution)
      VALUES (
        ${registryId},
        'high',
        'A',
        ${`Method step ${step.stepNumber} cannot be attributed to uploaded source documentation. ${step.note ?? 'No citation found.'}`},
        ${location},
        ${'Method statement claim not found in uploaded source documents — must be verified or removed'}
      )
    `;
    created++;
  }

  return { created, skipped };
}

// Self-register at import time
registerSeedStrategy('rams', seedRamsFindings);
