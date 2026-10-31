import { describe, it, expect, vi } from 'vitest';

// Mock the DB client before importing orgContextBuilder (which imports sql at top level)
vi.mock('../db/client.js', () => ({ sql: vi.fn() }));

import { extractStageTopics, extractDomainInsights, extractCoveredRegulations } from './orgContextBuilder.js';
import { buildOrgContextBlock } from '../pipeline/prompts.js';
import type { DistilledOrgContextDTO } from '@complianceforge/types';

// ─── extractStageTopics ─────────────────────────────────────────────────────

describe('extractStageTopics', () => {
  it('extracts stage titles and lesson titles from blueprint', () => {
    const jobState = {
      steps: {
        blueprint: {
          parsedJson: {
            blueprint: [
              {
                title: 'Stage 1: MHSWR Foundations',
                lessons: [
                  { title: 'Duty of Care Hierarchy' },
                  { title: 'Risk Assessment Basics' },
                ],
              },
              {
                title: 'Stage 2: Practical Application',
                lessons: [
                  { title: 'PPE Selection' },
                ],
              },
            ],
          },
        },
      },
    };
    const topics = extractStageTopics(jobState as never);
    expect(topics).toEqual([
      'Stage 1: MHSWR Foundations',
      'Duty of Care Hierarchy',
      'Risk Assessment Basics',
      'Stage 2: Practical Application',
      'PPE Selection',
    ]);
  });

  it('returns empty array when no blueprint step exists', () => {
    expect(extractStageTopics(null)).toEqual([]);
    expect(extractStageTopics({ steps: {} })).toEqual([]);
    expect(extractStageTopics({ steps: { blueprint: {} } } as never)).toEqual([]);
  });

  it('handles blueprint with no lessons', () => {
    const jobState = {
      steps: {
        blueprint: {
          parsedJson: {
            blueprint: [{ title: 'Standalone Stage' }],
          },
        },
      },
    };
    expect(extractStageTopics(jobState as never)).toEqual(['Standalone Stage']);
  });
});

// ─── extractDomainInsights ──────────────────────────────────────────────────

describe('extractDomainInsights', () => {
  it('extracts mandatory topics and enforcement priorities', () => {
    const jobState = {
      groundTruth: {
        mandatoryTopics: ['Risk assessment', 'PPE'],
        enforcementPriorities: ['MHSWR Reg 7 competence'],
      },
    };
    const insights = extractDomainInsights(jobState as never);
    expect(insights).toEqual(['Risk assessment', 'PPE', 'MHSWR Reg 7 competence']);
  });

  it('returns empty when no groundTruth', () => {
    expect(extractDomainInsights(null)).toEqual([]);
    expect(extractDomainInsights({})).toEqual([]);
  });
});

// ─── extractCoveredRegulations ──────────────────────────────────────────────

describe('extractCoveredRegulations', () => {
  it('extracts regulatory refs from ground truth', () => {
    const jobState = {
      groundTruth: {
        regulatoryRefs: ['MHSWR 1999 Reg 3', 'COSHH 2002 Reg 6'],
      },
    };
    expect(extractCoveredRegulations(jobState as never)).toEqual([
      'MHSWR 1999 Reg 3',
      'COSHH 2002 Reg 6',
    ]);
  });

  it('returns empty when no ground truth', () => {
    expect(extractCoveredRegulations(null)).toEqual([]);
  });
});

// ─── buildOrgContextBlock ───────────────────────────────────────────────────

describe('buildOrgContextBlock', () => {
  it('returns empty string when undefined', () => {
    expect(buildOrgContextBlock(undefined)).toBe('');
  });

  it('returns empty string when all arrays are empty', () => {
    const empty: DistilledOrgContextDTO = {
      coveredTopics: [],
      coveredRegulations: [],
      reviewerCorrections: [],
      domainInsights: [],
      moduleSummaries: [],
    };
    expect(buildOrgContextBlock(empty)).toBe('');
  });

  it('includes COVERED_TOPICS section when topics present', () => {
    const ctx: DistilledOrgContextDTO = {
      coveredTopics: ['Risk assessment', 'PPE selection'],
      coveredRegulations: [],
      reviewerCorrections: [],
      domainInsights: [],
      moduleSummaries: [],
    };
    const block = buildOrgContextBlock(ctx);
    expect(block).toContain('<COVERED_TOPICS>');
    expect(block).toContain('Risk assessment');
    expect(block).toContain('PPE selection');
    expect(block).toContain('</COVERED_TOPICS>');
  });

  it('includes REVIEWER_CORRECTIONS with hard constraint language', () => {
    const ctx: DistilledOrgContextDTO = {
      coveredTopics: [],
      coveredRegulations: [],
      reviewerCorrections: [
        {
          moduleTitle: 'Welding Safety',
          finding: 'PPE guidance was incorrect for TIG welding',
          disposition: 'amended',
          rationale: 'Auto-darkening lenses are mandatory for TIG',
          regulatoryRef: 'PUWER 1998 Reg 4',
        },
      ],
      domainInsights: [],
      moduleSummaries: [],
    };
    const block = buildOrgContextBlock(ctx);
    expect(block).toContain('<REVIEWER_CORRECTIONS>');
    expect(block).toContain('hard constraints');
    expect(block).toContain('competent person');
    expect(block).toContain('[AMENDED]');
    expect(block).toContain('PPE guidance was incorrect for TIG welding');
    expect(block).toContain('PUWER 1998 Reg 4');
    expect(block).toContain('</REVIEWER_CORRECTIONS>');
  });

  it('includes PRIOR_MODULES section when module summaries present', () => {
    const ctx: DistilledOrgContextDTO = {
      coveredTopics: [],
      coveredRegulations: [],
      reviewerCorrections: [],
      domainInsights: [],
      moduleSummaries: [
        {
          moduleId: 'abc-123',
          title: 'Welding Safety',
          deployedAt: '2025-12-01T00:00:00Z',
          stageTopics: ['Arc Welding Basics', 'PPE Requirements'],
        },
      ],
    };
    const block = buildOrgContextBlock(ctx);
    expect(block).toContain('<PRIOR_MODULES>');
    expect(block).toContain('Welding Safety');
    expect(block).toContain('2025-12-01');
    expect(block).toContain('</PRIOR_MODULES>');
  });

  it('wraps all sections in <ORG_CONTEXT> root tag', () => {
    const ctx: DistilledOrgContextDTO = {
      coveredTopics: ['Topic A'],
      coveredRegulations: ['Reg 1'],
      reviewerCorrections: [],
      domainInsights: ['Insight 1'],
      moduleSummaries: [],
    };
    const block = buildOrgContextBlock(ctx);
    expect(block).toContain('<ORG_CONTEXT>');
    expect(block).toContain('</ORG_CONTEXT>');
  });

  it('omits sections when their arrays are empty', () => {
    const ctx: DistilledOrgContextDTO = {
      coveredTopics: ['Only topic'],
      coveredRegulations: [],
      reviewerCorrections: [],
      domainInsights: [],
      moduleSummaries: [],
    };
    const block = buildOrgContextBlock(ctx);
    expect(block).toContain('<COVERED_TOPICS>');
    expect(block).not.toContain('<COVERED_REGULATIONS>');
    expect(block).not.toContain('<REVIEWER_CORRECTIONS>');
    expect(block).not.toContain('<DOMAIN_INSIGHTS>');
    expect(block).not.toContain('<PRIOR_MODULES>');
  });
});
