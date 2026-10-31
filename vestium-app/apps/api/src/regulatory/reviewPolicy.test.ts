import { describe, it, expect } from 'vitest';
import {
  deriveFindingSeverity,
  deriveFindingCategory,
  validateAttestationPreconditions,
  type StoredFactCheckItem,
} from './reviewPolicy.js';

// ─── deriveFindingSeverity ────────────────────────────────────────────────────

describe('deriveFindingSeverity', () => {
  it('upgrades high + MHSWR keyword in claim to regulatory', () => {
    const item: StoredFactCheckItem = {
      claim: 'MHSWR requires a suitable and sufficient risk assessment',
      relatedItemId: 'lesson-1',
      relatedItemType: 'lesson',
      verdict: 'unsupported',
      severity: 'high',
      rationale: 'No source confirms this obligation',
    };
    expect(deriveFindingSeverity(item)).toBe('regulatory');
  });

  it('upgrades high + COSHH keyword in rationale to regulatory', () => {
    const item: StoredFactCheckItem = {
      claim: 'Adequate ventilation must be provided',
      relatedItemId: 'lesson-2',
      relatedItemType: 'lesson',
      verdict: 'unsupported',
      severity: 'high',
      rationale: 'This is a COSHH control measure',
    };
    expect(deriveFindingSeverity(item)).toBe('regulatory');
  });

  it('does not upgrade medium + legal keyword — medium stays medium', () => {
    const item: StoredFactCheckItem = {
      claim: 'PUWER requires pre-use checks',
      relatedItemId: 'lesson-3',
      relatedItemType: 'lesson',
      verdict: 'supported',
      severity: 'medium',
      rationale: 'Source confirms PUWER obligation',
    };
    expect(deriveFindingSeverity(item)).toBe('medium');
  });

  it('does not upgrade high + no legal keyword — high stays high', () => {
    const item: StoredFactCheckItem = {
      claim: 'Good teamwork improves safety culture',
      relatedItemId: 'lesson-4',
      relatedItemType: 'lesson',
      verdict: 'unsupported',
      severity: 'high',
      rationale: 'No regulatory source cites this',
    };
    expect(deriveFindingSeverity(item)).toBe('high');
  });

  it('returns low unchanged', () => {
    const item: StoredFactCheckItem = {
      claim: 'Remember to tidy up after work',
      relatedItemId: 'lesson-5',
      relatedItemType: 'lesson',
      verdict: 'supported',
      severity: 'low',
      rationale: 'General housekeeping',
    };
    expect(deriveFindingSeverity(item)).toBe('low');
  });

  it('upgrades high + LOLER keyword to regulatory', () => {
    const item: StoredFactCheckItem = {
      claim: 'Lifting equipment must have a thorough examination',
      relatedItemId: 'lesson-6',
      relatedItemType: 'lesson',
      verdict: 'unsupported',
      severity: 'high',
      rationale: 'LOLER Reg 9 mandates this',
    };
    expect(deriveFindingSeverity(item)).toBe('regulatory');
  });

  it('disputed + legal keyword → regulatory (minimum high, upgraded)', () => {
    const item: StoredFactCheckItem = {
      claim: 'COSHH requires substance substitution where reasonably practicable',
      relatedItemId: 'lesson-7',
      relatedItemType: 'lesson',
      verdict: 'disputed',
      severity: 'medium',
      rationale: 'Models disagreed on scope of COSHH Reg 7',
    };
    expect(deriveFindingSeverity(item)).toBe('regulatory');
  });

  it('disputed + no legal keyword → high (minimum floor)', () => {
    const item: StoredFactCheckItem = {
      claim: 'Supervisors must conduct daily briefings',
      relatedItemId: 'lesson-8',
      relatedItemType: 'lesson',
      verdict: 'disputed',
      severity: 'low',
      rationale: 'Models disagreed on whether this is mandatory or advisory',
    };
    expect(deriveFindingSeverity(item)).toBe('high');
  });

  it('disputed always produces Cat A finding', () => {
    const item: StoredFactCheckItem = {
      claim: 'Any disputed claim',
      relatedItemId: 'lesson-9',
      relatedItemType: 'lesson',
      verdict: 'disputed',
      severity: 'low',
      rationale: 'Cross-model disagreement',
    };
    const severity = deriveFindingSeverity(item);
    expect(deriveFindingCategory(severity)).toBe('A');
  });
});

// ─── deriveFindingCategory ────────────────────────────────────────────────────

describe('deriveFindingCategory', () => {
  it('maps regulatory severity to Cat A', () => {
    expect(deriveFindingCategory('regulatory')).toBe('A');
  });

  it('maps high severity to Cat A', () => {
    expect(deriveFindingCategory('high')).toBe('A');
  });

  it('maps medium severity to Cat B', () => {
    expect(deriveFindingCategory('medium')).toBe('B');
  });

  it('maps low severity to Cat B', () => {
    expect(deriveFindingCategory('low')).toBe('B');
  });
});

// ─── validateAttestationPreconditions ────────────────────────────────────────

describe('validateAttestationPreconditions', () => {
  it('returns ok when no undisposed findings', () => {
    const result = validateAttestationPreconditions(0);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('blocks attestation when 1 finding is undisposed', () => {
    const result = validateAttestationPreconditions(1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('1 finding(s) still undisposed');
  });

  it('blocks attestation when multiple findings are undisposed', () => {
    const result = validateAttestationPreconditions(5);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('5 finding(s) still undisposed');
  });

  it('error message names the exact count', () => {
    const result = validateAttestationPreconditions(12);
    expect(result.error).toContain('12');
  });
});
