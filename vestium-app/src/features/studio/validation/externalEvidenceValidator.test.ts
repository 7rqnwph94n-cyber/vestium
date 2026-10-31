import { afterEach, describe, expect, it, vi } from 'vitest';
import { runExternalEvidenceValidation } from './externalEvidenceValidator';
import type { AssembledModule } from '../generator/types';
import * as evidenceProviders from './evidenceProviders';

function makeAssembled(
  sourceCatalog: AssembledModule['sourceCatalog'],
  factCheckItems: NonNullable<AssembledModule['factCheck']>['items']
): AssembledModule {
  return {
    curriculum: [],
    missions: [],
    placementAssessment: null,
    lessonMissionMap: {},
    sourceCatalog,
    citationMap: {
      lessonCitations: {},
      missionCitations: {}
    },
    factCheck: { items: factCheckItems },
    advancedArtifacts: null,
    themeShell: {
      id: 'mod',
      title: 'Module',
      icon: 'Wrench',
      shortDescription: 'desc',
      description: 'desc',
      suggestedAccentColor: 'amber',
      flags: {
        hasSimulator: true,
        hasPlacement: true,
        hasAdaptiveReview: true
      },
      terms: {
        primaryDiscipline: 'Engineering',
        simulatorLabel: 'Simulator'
      }
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('externalEvidenceValidator governance contracts', () => {
  it('downgrades confidence when all discovery providers fail', async () => {
    vi.spyOn(evidenceProviders, 'getEvidenceProvider').mockImplementation(() => ({
      id: 'crossref',
      discoverSources: async () => {
        throw new Error('provider down');
      },
      verifyClaim: async () => []
    }));

    const assembled = makeAssembled(
      [{ id: 'src1', title: 'Blog', url: 'https://example.com/a', reliability: 'secondary' }],
      [
        {
          id: 'fc1',
          claim: 'critical claim',
          relatedItemId: 's1-l1',
          relatedItemType: 'lesson',
          sourceIds: ['src1'],
          verdict: 'supported',
          severity: 'high',
          rationale: 'r'
        }
      ]
    );

    const errors = await runExternalEvidenceValidation({
      moduleId: 'm1',
      domainPrompt: 'engineering controller safety',
      objectives: ['validate safety'],
      assembled
    });

    expect(errors.some((e) => e.rule === 'EXTERNAL_DISCOVERY_UNAVAILABLE')).toBe(true);
    expect(
      errors.some(
        (e) => e.rule === 'FACT_CHECK_CONFIDENCE_DOWNGRADED' && e.path === 'factCheck.items[0].verdict' && e.severity === 'error'
      )
    ).toBe(true);
  });

  it('flags discovery high-reputation gap even when catalog has trusted sources', async () => {
    vi.spyOn(evidenceProviders, 'getEvidenceProvider').mockImplementation(() => ({
      id: 'crossref',
      discoverSources: async () => [
        {
          provider: 'crossref',
          title: 'Low quality source',
          url: 'https://example.com/low',
          reliability: 'secondary'
        }
      ],
      verifyClaim: async () => []
    }));

    const assembled = makeAssembled(
      [{ id: 'src1', title: 'NIST', url: 'https://www.nist.gov/doc', reliability: 'authoritative' }],
      [
        {
          id: 'fc2',
          claim: 'medium claim',
          relatedItemId: 'm1',
          relatedItemType: 'mission',
          sourceIds: ['src1'],
          verdict: 'supported',
          severity: 'medium',
          rationale: 'r'
        }
      ]
    );

    const errors = await runExternalEvidenceValidation({
      moduleId: 'm2',
      domainPrompt: 'engineering controls',
      objectives: ['diagnostics'],
      assembled
    });

    expect(errors.some((e) => e.rule === 'EXTERNAL_DISCOVERY_HIGH_REPUTATION_GAP')).toBe(true);
    expect(errors.some((e) => e.rule === 'FACT_CHECK_CONFIDENCE_DOWNGRADED')).toBe(true);
  });
});
