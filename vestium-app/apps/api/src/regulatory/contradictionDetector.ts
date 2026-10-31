// ─── Regulatory contradiction detection ──────────────────────────────────────
// Pure-function logic for detecting AI-vs-regulation conflicts in fact-check
// results. These contradictions get surfaced in the Reviewer Portal for
// human-in-the-loop resolution.
//
// Design principle: the AI should never be trusted on regulatory claims.
// This module flags every case where the AI says "pass" but the regulatory
// schema suggests otherwise — forcing the manager to make the call.

import type {
  ContradictionSource,
  RegulatoryContradiction,
  FindingSeverity,
} from '@complianceforge/types';

// ─── Stored types (match generation pipeline output) ────────────────────────

export interface FactCheckItem {
  claim: string;
  relatedItemId: string;
  relatedItemType: 'lesson' | 'mission' | 'placement' | 'general';
  verdict: 'supported' | 'unsupported' | 'ambiguous' | 'disputed';
  severity: 'low' | 'medium' | 'high' | 'regulatory';
  rationale: string;
}

export interface ContradictionCandidate {
  item: FactCheckItem;
  findingId: string;
  findingSeverity: FindingSeverity;
}

// ─── Regulatory keyword patterns ────────────────────────────────────────────
// Patterns that indicate the claim involves legally binding requirements.
// When these appear in a "supported" verdict, we still flag for human review
// because the stakes are too high to trust AI alone.

const REGULATORY_CLAIM_PATTERNS = [
  /\b(reg(ulation)?\.?\s*\d+)/i,           // "Reg 3", "Regulation 7(1)"
  /\b(mhswr|coshh|dsear|puwer|loler|cdm)\b/i, // Statutory instrument acronyms
  /\b(manual handling|working at height|confined space)\b/i,
  /\b(ACOP|approved code of practice)\b/i,
  /\b(HSE|health and safety executive)\b/i,
  /\b(section\s+\d+\s+HSWA)\b/i,           // "Section 33 HSWA 1974"
  /\b(unlimited fine|imprisonment)\b/i,      // Penalty language
  /\b(duty holder|competent person)\b/i,
  /\b(risk assessment|method statement|safe system of work)\b/i,
  /\b(statutory instrument|SI\s+\d{4}\/\d+)\b/i,
];

// ─── Core detection ─────────────────────────────────────────────────────────

/**
 * Detects regulatory contradictions in fact-check results.
 *
 * A "contradiction" is any case where:
 * 1. The AI marked a claim as "supported" but the claim involves regulatory
 *    language that should be verified by a human (high-stakes trust gap)
 * 2. The AI marked a claim as "unsupported" or "ambiguous" and the claim
 *    involves regulatory duties (the AI might be wrong about what the law says)
 * 3. Cross-model verification disagreed (when available)
 */
export function detectContradictions(
  items: FactCheckItem[],
  findingMap: Map<string, { findingId: string; severity: FindingSeverity }>,
): RegulatoryContradiction[] {
  const contradictions: RegulatoryContradiction[] = [];

  for (const item of items) {
    const isRegulatoryLanguage = REGULATORY_CLAIM_PATTERNS.some((p) =>
      p.test(item.claim) || p.test(item.rationale)
    );

    if (!isRegulatoryLanguage) continue;

    const findingEntry = findingMap.get(
      `${item.relatedItemType}:${item.relatedItemId}`
    );

    // Case 1: AI says "supported" + regulatory language — requires human verification
    // for both 'regulatory' and 'high' severity. The platform cannot trust AI-alone
    // verdicts on high-stakes regulatory claims regardless of the "supported" verdict:
    // the AI may be wrong about what the law actually requires in a specific context.
    //   severity 'regulatory' | 'high' → manager MUST verify (requiresHumanResolution: true)
    //   severity 'low' | 'medium'      → skip (AI-supported claims at this level are trusted)
    if (item.verdict === 'supported') {
      if (item.severity === 'low' || item.severity === 'medium') continue;
      contradictions.push({
        findingId: findingEntry?.findingId ?? '',
        aiVerdict: 'Pass — AI assessed claim as supported',
        regulatoryPosition:
          `Claim references a statutory duty: "${truncate(item.claim, 120)}". ` +
          'AI-supported regulatory claims require independent human verification before deployment.',
        regulatoryRef: extractRegulatoryRef(item.claim) ?? 'Unresolved reference',
        confidence: verdictToConfidence(item.verdict, item.severity),
        source: 'fact-check' as ContradictionSource,
        requiresHumanResolution: true,
      });
    }

    // Case 2: AI says "unsupported", "ambiguous", or "disputed" (cross-model disagreement)
    // — the finding already exists in the reviewer portal, but we enrich it with contradiction metadata
    if (item.verdict === 'unsupported' || item.verdict === 'ambiguous' || item.verdict === 'disputed') {
      const verdictLabel =
        item.verdict === 'unsupported' ? 'Fail — AI could not verify claim against sources'
        : item.verdict === 'disputed'  ? 'Disputed — Anthropic and Gemini models disagreed on this claim'
        : 'Ambiguous — AI uncertain about claim accuracy';
      contradictions.push({
        findingId: findingEntry?.findingId ?? '',
        aiVerdict: verdictLabel,
        regulatoryPosition:
          `AI rationale: "${truncate(item.rationale, 200)}". ` +
          (item.verdict === 'disputed'
            ? 'Cross-model disagreement — mandatory human resolution required.'
            : 'This involves regulated content and cannot be auto-dismissed.'),
        regulatoryRef: extractRegulatoryRef(item.claim) ?? extractRegulatoryRef(item.rationale) ?? 'Unresolved reference',
        confidence: verdictToConfidence(item.verdict, item.severity),
        source: 'fact-check' as ContradictionSource,
        requiresHumanResolution: true,
      });
    }
  }

  return contradictions;
}

/**
 * Detects contradictions specifically from semantic intent marking.
 * Used when the AI marks a learner response against human-defined intents.
 */
export function detectSemanticContradiction(
  aiIntentId: string,
  aiConfidence: number,
  expectedIntentIds: string[],
  findingId: string,
  claimText: string,
): RegulatoryContradiction | null {
  // If AI is confident and matches expected intent — no contradiction
  if (aiConfidence >= 0.85 && expectedIntentIds.includes(aiIntentId)) {
    return null;
  }

  // Low confidence or mismatched intent → surface for human resolution
  const isRegulatoryLanguage = REGULATORY_CLAIM_PATTERNS.some((p) =>
    p.test(claimText)
  );

  return {
    findingId,
    aiVerdict: `AI attributed intent "${aiIntentId}" (confidence: ${(aiConfidence * 100).toFixed(0)}%)`,
    regulatoryPosition: aiConfidence < 0.85
      ? 'AI confidence below threshold — manual review required for regulatory content'
      : `AI intent "${aiIntentId}" does not match expected intents: [${expectedIntentIds.join(', ')}]`,
    regulatoryRef: extractRegulatoryRef(claimText) ?? 'Learner response — intent mismatch',
    confidence: aiConfidence,
    source: 'semantic-mark' as ContradictionSource,
    requiresHumanResolution: isRegulatoryLanguage || aiConfidence < 0.70,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract the first regulatory reference from text (e.g., "MHSWR 1999 Reg 3(1)") */
export function extractRegulatoryRef(text: string): string | null {
  // Match "MHSWR 1999 Reg 3(1)" or "COSHH 2002 Reg 7"
  const schemaRefMatch = text.match(
    /\b(MHSWR|COSHH|DSEAR|PUWER|LOLER|CDM|RIDDOR|HSE)\s*(?:\d{4})?\s*(?:Reg(?:ulation)?\.?\s*\d+(?:\(\d+\))?)?/i
  );
  if (schemaRefMatch) return schemaRefMatch[0].trim();

  // Match full named regulations commonly referenced in generated claims.
  const namedRegMatch = text.match(
    /\b(Confined Spaces Regulations?\s*1997|Control of Noise at Work Regulations?\s*2005|Control of Vibration at Work Regulations?\s*2005|Manual Handling Operations Regulations?\s*1992|PPE at Work Regulations?\s*1992)\s*(?:Reg(?:ulation)?\.?\s*\d+(?:\(\d+\))?)?/i
  );
  if (namedRegMatch) return namedRegMatch[0].trim();

  // Match "Section 33 HSWA 1974"
  const hswaMatch = text.match(/\bSection\s+\d+\s+HSWA\s+\d{4}/i);
  if (hswaMatch) return hswaMatch[0].trim();

  // Match "SI 1999/3242"
  const siMatch = text.match(/\bSI\s+\d{4}\/\d+/i);
  if (siMatch) return siMatch[0].trim();

  return null;
}

function verdictToConfidence(
  verdict: 'supported' | 'unsupported' | 'ambiguous' | 'disputed',
  severity: 'low' | 'medium' | 'high' | 'regulatory',
): number {
  const base = verdict === 'supported' ? 0.85 : verdict === 'ambiguous' ? 0.50 : verdict === 'disputed' ? 0.35 : 0.20;
  const severityPenalty = (severity === 'high' || severity === 'regulatory') ? 0.10 : severity === 'medium' ? 0.05 : 0;
  return Math.max(0, base - severityPenalty);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}
