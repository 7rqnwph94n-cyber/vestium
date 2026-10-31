// ─── Review Policy ────────────────────────────────────────────────────────────
// Pure, testable policy functions for the reviewer workflow.
// Extracted from review.ts so they can be covered by unit tests independently
// of the HTTP layer. These encode the platform's regulatory risk rules and
// must not be changed without updating reviewPolicy.test.ts.

import type { FindingSeverity } from '@complianceforge/types';

export type StoredFactCheckItem = {
  claim: string;
  relatedItemId: string;
  relatedItemType: 'lesson' | 'mission' | 'placement' | 'general';
  verdict: 'supported' | 'unsupported' | 'ambiguous' | 'disputed';
  severity: 'low' | 'medium' | 'high';
  rationale: string;
};

const LEGAL_SIGNAL = /\b(reg(ulation)?|mhswr|coshh|dsear|puwer|loler|manual handling|cdm)\b/i;

/**
 * Upgrades a fact-check item's severity to 'regulatory' when the text contains
 * legal framework keywords AND the base severity is already 'high'.
 * This prevents AI-confidence from masking regulatory-duty violations.
 */
export function deriveFindingSeverity(item: StoredFactCheckItem): FindingSeverity {
  const text = `${item.claim} ${item.rationale}`;
  // 'disputed' = cross-model disagreement — minimum 'high', upgrade to 'regulatory' on legal signal
  if (item.verdict === 'disputed') {
    return LEGAL_SIGNAL.test(text) ? 'regulatory' : 'high';
  }
  if (item.severity === 'high' && LEGAL_SIGNAL.test(text)) return 'regulatory';
  return item.severity;
}

/**
 * Maps finding severity to Cat A / Cat B.
 * Cat A (regulatory/high): non-dismissable; require explicit human disposition.
 * Cat B (medium/low): advisory; can be accepted without escalation.
 */
export function deriveFindingCategory(severity: FindingSeverity): 'A' | 'B' {
  return severity === 'regulatory' || severity === 'high' ? 'A' : 'B';
}

/**
 * Validates attestation preconditions.
 * An attestation cannot be submitted while any finding is undisposed.
 * This is the hard-stop that fulfils the platform's MHSWR Reg 7 obligation —
 * the reviewer must actively resolve every flagged issue before legally transferring
 * responsibility.
 */
export function validateAttestationPreconditions(undisposedCount: number): {
  ok: boolean;
  error?: string;
} {
  if (undisposedCount > 0) {
    return {
      ok: false,
      error: `Cannot attest: ${undisposedCount} finding(s) still undisposed.`,
    };
  }
  return { ok: true };
}
