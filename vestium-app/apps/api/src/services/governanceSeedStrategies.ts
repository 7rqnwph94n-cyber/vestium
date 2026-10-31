// ─── Governance Seed Strategies ──────────────────────────────────────────────
// Each content type registers a function that knows how to extract findings
// from its generation output and seed them into governed_findings.
// Called by POST /api/governance/:registryId/seed-findings.

import type { ContentType } from './contentRegistry.js';

export interface SeedFindingsResult {
  created: number;
  skipped: number;
}

export type SeedFindingsStrategy = (
  registryId: string,
  sourceEntityId: string,
  orgId: string,
) => Promise<SeedFindingsResult>;

const strategies = new Map<ContentType, SeedFindingsStrategy>();

export function registerSeedStrategy(
  contentType: ContentType,
  strategy: SeedFindingsStrategy,
): void {
  strategies.set(contentType, strategy);
}

export function getSeedStrategy(contentType: ContentType): SeedFindingsStrategy | undefined {
  return strategies.get(contentType);
}
