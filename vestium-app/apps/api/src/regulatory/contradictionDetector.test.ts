import { describe, it, expect } from 'vitest';
import {
  detectContradictions,
  detectSemanticContradiction,
  extractRegulatoryRef,
  type FactCheckItem,
} from './contradictionDetector.js';
import type { FindingSeverity } from '@complianceforge/types';

// ─── extractRegulatoryRef ───────────────────────────────────────────────────

describe('extractRegulatoryRef', () => {
  it('extracts MHSWR regulation references', () => {
    expect(extractRegulatoryRef('See MHSWR 1999 Reg 3(1) for details')).toBe('MHSWR 1999 Reg 3(1)');
  });

  it('extracts COSHH references', () => {
    expect(extractRegulatoryRef('Under COSHH 2002 Reg 7')).toBe('COSHH 2002 Reg 7');
  });

  it('extracts HSWA section references', () => {
    expect(extractRegulatoryRef('Breach of Section 33 HSWA 1974')).toBe('Section 33 HSWA 1974');
  });

  it('extracts SI references', () => {
    expect(extractRegulatoryRef('Published as SI 1999/3242')).toBe('SI 1999/3242');
  });

  it('returns null for non-regulatory text', () => {
    expect(extractRegulatoryRef('The weather was nice today')).toBeNull();
  });

  it('extracts LOLER references', () => {
    expect(extractRegulatoryRef('LOLER requires inspection')).toBe('LOLER');
  });
});

// ─── detectContradictions ───────────────────────────────────────────────────

describe('detectContradictions', () => {
  const makeFindingMap = (entries: [string, string, FindingSeverity][] = []) => {
    const map = new Map<string, { findingId: string; severity: FindingSeverity }>();
    for (const [key, id, sev] of entries) {
      map.set(key, { findingId: id, severity: sev });
    }
    return map;
  };

  it('flags supported claims that reference regulations', () => {
    const items: FactCheckItem[] = [{
      claim: 'MHSWR 1999 Reg 3 requires a suitable and sufficient risk assessment',
      relatedItemId: 'lesson-1',
      relatedItemType: 'lesson',
      verdict: 'supported',
      severity: 'high',
      rationale: 'Verified against L21 ACOP',
    }];

    const result = detectContradictions(items, makeFindingMap());
    expect(result.length).toBe(1);
    expect(result[0].requiresHumanResolution).toBe(true);
    expect(result[0].source).toBe('fact-check');
    expect(result[0].regulatoryRef).toContain('MHSWR');
  });

  it('flags unsupported claims that reference regulations', () => {
    const items: FactCheckItem[] = [{
      claim: 'COSHH 2002 requires annual health surveillance',
      relatedItemId: 'lesson-2',
      relatedItemType: 'lesson',
      verdict: 'unsupported',
      severity: 'high',
      rationale: 'No source confirms annual frequency',
    }];

    const findingMap = makeFindingMap([
      ['lesson:lesson-2', 'finding-abc', 'regulatory'],
    ]);

    const result = detectContradictions(items, findingMap);
    expect(result.length).toBe(1);
    expect(result[0].findingId).toBe('finding-abc');
    expect(result[0].aiVerdict).toContain('Fail');
  });

  it('ignores non-regulatory claims', () => {
    const items: FactCheckItem[] = [{
      claim: 'Good teamwork improves morale',
      relatedItemId: 'lesson-3',
      relatedItemType: 'lesson',
      verdict: 'supported',
      severity: 'low',
      rationale: 'Common knowledge',
    }];

    const result = detectContradictions(items, makeFindingMap());
    expect(result.length).toBe(0);
  });

  it('detects regulatory language in rationale even if claim is generic', () => {
    const items: FactCheckItem[] = [{
      claim: 'Workers must be properly trained',
      relatedItemId: 'lesson-4',
      relatedItemType: 'lesson',
      verdict: 'ambiguous',
      severity: 'medium',
      rationale: 'Linked to MHSWR 1999 Reg 13 but scope unclear for this context',
    }];

    const result = detectContradictions(items, makeFindingMap());
    expect(result.length).toBe(1);
    expect(result[0].source).toBe('fact-check');
  });

  it('assigns lower confidence to high-severity unsupported items', () => {
    const items: FactCheckItem[] = [{
      claim: 'PUWER requires guards on all equipment',
      relatedItemId: 'lesson-5',
      relatedItemType: 'lesson',
      verdict: 'unsupported',
      severity: 'high',
      rationale: 'PUWER does not universally mandate guards',
    }];

    const result = detectContradictions(items, makeFindingMap());
    expect(result[0].confidence).toBeLessThan(0.20);
  });
});

// ─── detectSemanticContradiction ────────────────────────────────────────────

describe('detectSemanticContradiction', () => {
  it('returns null when AI is confident and intent matches', () => {
    const result = detectSemanticContradiction(
      'PHYSICAL_BARRIER',
      0.92,
      ['PHYSICAL_BARRIER', 'SITE_CONSTRAINT'],
      'finding-1',
      'I could not get the ladder up the stairs'
    );
    expect(result).toBeNull();
  });

  it('flags low confidence on regulatory content', () => {
    const result = detectSemanticContradiction(
      'PHYSICAL_BARRIER',
      0.55,
      ['PHYSICAL_BARRIER'],
      'finding-2',
      'The risk assessment under MHSWR 1999 was inadequate'
    );
    expect(result).not.toBeNull();
    expect(result!.source).toBe('semantic-mark');
    expect(result!.requiresHumanResolution).toBe(true);
  });

  it('flags mismatched intent even at high confidence', () => {
    const result = detectSemanticContradiction(
      'SHORTCUT_SEEKING',
      0.90,
      ['PHYSICAL_BARRIER', 'SITE_CONSTRAINT'],
      'finding-3',
      'I just skipped the confined space check'
    );
    expect(result).not.toBeNull();
    expect(result!.aiVerdict).toContain('SHORTCUT_SEEKING');
  });
});
