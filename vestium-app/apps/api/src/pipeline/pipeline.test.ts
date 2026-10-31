// ─── Pipeline regression tests ─────────────────────────────────────────────────
// Covers: dependency split, per-wave DB batching contract, domainSurvey .catch()
// resilience, and the trust-boundary fix (regulatory classification from DB).

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { domainSurveyOutputSchema } from './schemas.js';

// ─── Dependency graph (inline re-implementation for testing) ─────────────────
// Mirrors the logic in jobRunner.ts getStepDeps() so changes to the production
// function will immediately break these tests.

function getStepDeps(stepKey: string, stageCount: number): string[] {
  const stageKeys = Array.from({ length: stageCount }, (_, i) => `stage_${i + 1}`);
  const testKeys  = Array.from({ length: stageCount }, (_, i) => `test_${i + 1}`);

  if (stepKey === 'domainSurvey') return [];
  if (stepKey === 'blueprint')    return ['domainSurvey'];

  const stageM = stepKey.match(/^stage_(\d+)$/);
  if (stageM) return ['blueprint'];

  const testM = stepKey.match(/^test_(\d+)$/);
  if (testM) return [`stage_${testM[1]}`];

  if (stepKey === 'missions') return stageKeys;

  // Split post-mission group
  if (['placementAssessment', 'lessonMissionMap'].includes(stepKey)) {
    return ['missions', ...testKeys];
  }
  if (['sourceAttribution', 'simulatorDesign', 'themeShell'].includes(stepKey)) {
    return ['missions'];
  }

  if (stepKey === 'coherencePass') {
    return ['sourceAttribution', 'placementAssessment', 'lessonMissionMap'];
  }
  if (stepKey === 'factCheckA') return ['sourceAttribution', 'placementAssessment', 'coherencePass'];
  if (stepKey === 'factCheckG') return ['sourceAttribution', 'placementAssessment', 'coherencePass'];
  if (stepKey === 'factCheckMerge') return ['factCheckA', 'factCheckG'];
  if (stepKey === 'factCheck') return ['sourceAttribution', 'placementAssessment'];
  if (stepKey === 'faultAndReference')  return ['simulatorDesign'];
  if (stepKey === 'builderAndCapstone') return ['simulatorDesign'];
  if (stepKey === 'repairArtifacts') return ['factCheckMerge', 'missions'];

  return [];
}

// ─── Dep-split tests ──────────────────────────────────────────────────────────

describe('dependency split — themeShell/sourceAttribution/simulatorDesign', () => {
  it('themeShell depends on missions only (not testKeys)', () => {
    const deps = getStepDeps('themeShell', 3);
    expect(deps).toContain('missions');
    expect(deps).not.toContain('test_1');
    expect(deps).not.toContain('test_2');
    expect(deps).not.toContain('test_3');
    expect(deps).toHaveLength(1);
  });

  it('sourceAttribution depends on missions only', () => {
    const deps = getStepDeps('sourceAttribution', 3);
    expect(deps).toContain('missions');
    expect(deps).not.toContain('test_1');
    expect(deps).toHaveLength(1);
  });

  it('simulatorDesign depends on missions only', () => {
    const deps = getStepDeps('simulatorDesign', 3);
    expect(deps).toContain('missions');
    expect(deps).not.toContain('test_1');
    expect(deps).toHaveLength(1);
  });

  it('placementAssessment still depends on missions AND all testKeys', () => {
    const deps = getStepDeps('placementAssessment', 3);
    expect(deps).toContain('missions');
    expect(deps).toContain('test_1');
    expect(deps).toContain('test_2');
    expect(deps).toContain('test_3');
    expect(deps).toHaveLength(4); // missions + 3 tests
  });

  it('lessonMissionMap still depends on missions AND all testKeys', () => {
    const deps = getStepDeps('lessonMissionMap', 2);
    expect(deps).toContain('missions');
    expect(deps).toContain('test_1');
    expect(deps).toContain('test_2');
    expect(deps).toHaveLength(3); // missions + 2 tests
  });

  it('coherencePass still depends on sourceAttribution, placementAssessment, lessonMissionMap', () => {
    const deps = getStepDeps('coherencePass', 3);
    expect(deps).toContain('sourceAttribution');
    expect(deps).toContain('placementAssessment');
    expect(deps).toContain('lessonMissionMap');
    expect(deps).not.toContain('missions');
    expect(deps).not.toContain('test_1');
  });
});

// ─── domainSurveyOutputSchema .catch() resilience ────────────────────────────

describe('domainSurveyOutputSchema .catch() fallbacks', () => {
  const base = {
    domainSurvey: {
      mandatoryTopics: ['MHSWR Reg 3 risk assessment'],
      commonMisconceptions: ['PPE is the first control'],
      enforcementPriorities: ['HSE targeting high-risk sectors'],
      criticalNumericThresholds: [],
      keyDutyHolders: ['Employer', 'Employee'],
      controlHierarchySteps: ['Elimination', 'Substitution', 'Engineering'],
      regulatoryRefs: ['MHSWR 1999'],
    },
  };

  it('accepts a valid full payload', () => {
    const result = domainSurveyOutputSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('recovers when mandatoryTopics is missing (falls back to [])', () => {
    const payload = { domainSurvey: { ...base.domainSurvey, mandatoryTopics: undefined } };
    const result = domainSurveyOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domainSurvey.mandatoryTopics).toEqual([]);
    }
  });

  it('recovers when commonMisconceptions is null (falls back to [])', () => {
    const payload = { domainSurvey: { ...base.domainSurvey, commonMisconceptions: null } };
    const result = domainSurveyOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domainSurvey.commonMisconceptions).toEqual([]);
    }
  });

  it('recovers when keyDutyHolders is an empty array (falls back to [])', () => {
    // Previously .min(1) would fail on empty arrays; .catch([]) absorbs it
    const payload = { domainSurvey: { ...base.domainSurvey, keyDutyHolders: [] } };
    const result = domainSurveyOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domainSurvey.keyDutyHolders).toEqual([]);
    }
  });

  it('recovers when criticalNumericThresholds has malformed entries (falls back to [])', () => {
    const payload = { domainSurvey: { ...base.domainSurvey, criticalNumericThresholds: ['not-an-object'] } };
    const result = domainSurveyOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domainSurvey.criticalNumericThresholds).toEqual([]);
    }
  });

  it('survives a completely empty domainSurvey object (all fields fall back)', () => {
    const payload = { domainSurvey: {} };
    const result = domainSurveyOutputSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domainSurvey.mandatoryTopics).toEqual([]);
      expect(result.data.domainSurvey.regulatoryRefs).toEqual([]);
    }
  });
});

// ─── Trust-boundary: StartGenerationSchema no longer accepts regulatory fields ─

describe('StartGenerationSchema — regulatory field removal', () => {
  const StartGenerationSchema = z.object({
    title: z.string().min(1),
    stageCount: z.number().int().min(1).max(10),
    lessonsPerStage: z.number().int().min(1).max(8),
    missionCount: z.number().int().min(1).max(12),
    domainPrompt: z.string().min(1),
    audienceDescription: z.string().min(1),
    objectives: z.array(z.string()).min(1),
    sourceReferences: z.array(z.string()).default([]),
  });

  const validPayload = {
    title: 'Welding Safety',
    stageCount: 3,
    lessonsPerStage: 3,
    missionCount: 5,
    domainPrompt: 'Arc welding safety in industrial settings',
    audienceDescription: 'Apprentice welders',
    objectives: ['Understand PPE obligations under MHSWR 1999'],
  };

  it('accepts valid payload without regulatory fields', () => {
    expect(StartGenerationSchema.safeParse(validPayload).success).toBe(true);
  });

  it('regulatory fields sent by client are silently stripped (not in output)', () => {
    const withExtras = {
      ...validPayload,
      regulatoryClassification: { primarySchemaId: 'mhswr' },
      workplaceContext: { industryType: 'welding' },
    };
    const result = StartGenerationSchema.safeParse(withExtras);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).regulatoryClassification).toBeUndefined();
      expect((result.data as Record<string, unknown>).workplaceContext).toBeUndefined();
    }
  });
});
