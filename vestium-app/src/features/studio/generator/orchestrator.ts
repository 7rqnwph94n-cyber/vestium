import type { TrainingStage, TrainingMission } from '../../../lib/training-core/types';
import type {
  GenerationJob,
  StageLessonsOutput,
  StageTestOutput,
  MissionsOutput,
  PlacementAssessmentOutput,
  LessonMissionMapOutput,
  SourceAttributionOutput,
  FactCheckOutput,
  AdvancedArtifactsOutput,
  SimulatorDesignOutput,
  FaultAndReferenceOutput,
  BuilderAndCapstoneOutput,
  ThemeShellEnvelope,
  AssembledModule
} from './types';

// ─── Assemble the final module from all completed step results ────────────────
// Called after all steps are done and before validation/export.

export function assembleModule(job: GenerationJob): AssembledModule {
  const curriculum: TrainingStage[] = [];

  for (let i = 1; i <= job.stageCount; i++) {
    const stageResult = job.steps[`stage_${i}`];
    const testResult = job.steps[`test_${i}`];

    if (!stageResult?.parsedJson || !testResult?.parsedJson) {
      throw new Error(`Stage ${i} or its test is not complete — cannot assemble module`);
    }

    const stageOutput = stageResult.parsedJson as StageLessonsOutput;
    const testOutput = testResult.parsedJson as StageTestOutput;

    const stage: TrainingStage = {
      ...stageOutput.stage,
      test: testOutput.test ?? []
    };
    curriculum.push(stage);
  }

  const missionsResult = job.steps['missions'];
  const missions: TrainingMission[] =
    missionsResult?.parsedJson
      ? (missionsResult.parsedJson as MissionsOutput).missions ?? []
      : [];

  const placementResult = job.steps['placementAssessment'];
  const placementAssessment =
    placementResult?.parsedJson
      ? ((placementResult.parsedJson as PlacementAssessmentOutput).placementAssessment ?? null)
      : null;

  const lessonMissionMapResult = job.steps['lessonMissionMap'];
  const lessonMissionMap =
    lessonMissionMapResult?.parsedJson
      ? ((lessonMissionMapResult.parsedJson as LessonMissionMapOutput).lessonMissionMap ?? {})
      : {};

  const sourceAttributionResult = job.steps['sourceAttribution'];
  const sourceCatalog =
    sourceAttributionResult?.parsedJson
      ? ((sourceAttributionResult.parsedJson as SourceAttributionOutput).sourceCatalog ?? [])
      : [];
  const citationMap =
    sourceAttributionResult?.parsedJson
      ? ((sourceAttributionResult.parsedJson as SourceAttributionOutput).citationMap ?? {
          lessonCitations: {},
          missionCitations: {}
        })
      : { lessonCitations: {}, missionCitations: {} };

  // Prefer factCheckMerge (dual-model pipeline); fall back to factCheck (legacy job state)
  const factCheckResult = job.steps['factCheckMerge'] ?? job.steps['factCheck'];
  const factCheck =
    factCheckResult?.parsedJson
      ? normalizeFactCheckSummary((factCheckResult.parsedJson as FactCheckOutput).factCheck ?? null)
      : null;

  const simulatorResult = job.steps['simulatorDesign']?.parsedJson as SimulatorDesignOutput | null;
  const faultRefResult = job.steps['faultAndReference']?.parsedJson as FaultAndReferenceOutput | null;
  const builderResult = job.steps['builderAndCapstone']?.parsedJson as BuilderAndCapstoneOutput | null;

  const advancedArtifacts: AdvancedArtifactsOutput['advancedArtifacts'] | null =
    simulatorResult && faultRefResult && builderResult
      ? {
          simulatorDesign: simulatorResult.simulatorDesign,
          faultScenarioCampaign: faultRefResult.faultScenarioCampaign,
          fieldReferenceCards: faultRefResult.fieldReferenceCards,
          builderExercises: builderResult.builderExercises,
          capstoneChallenge: builderResult.capstoneChallenge,
          progressionScoringRules: builderResult.progressionScoringRules,
          implementationNotes: builderResult.implementationNotes
        }
      : null;

  const shellResult = job.steps['themeShell'];
  if (!shellResult?.parsedJson) {
    throw new Error('Theme shell step is not complete — cannot assemble module');
  }
  const themeShell = (shellResult.parsedJson as ThemeShellEnvelope).themeShell;

  return {
    curriculum,
    missions,
    placementAssessment,
    lessonMissionMap,
    sourceCatalog,
    citationMap,
    factCheck,
    advancedArtifacts,
    themeShell
  };
}

function normalizeFactCheckSummary(
  factCheck: FactCheckOutput['factCheck'] | null
): FactCheckOutput['factCheck'] | null {
  if (!factCheck || !Array.isArray(factCheck.items)) return factCheck;
  let supported = 0;
  let unsupported = 0;
  let ambiguous = 0;
  for (const item of factCheck.items) {
    if (item.verdict === 'supported') supported += 1;
    if (item.verdict === 'unsupported') unsupported += 1;
    if (item.verdict === 'ambiguous') ambiguous += 1;
  }
  return {
    ...factCheck,
    summary: { supported, unsupported, ambiguous }
  };
}

// ─── Compute total tokens used across all steps ───────────────────────────────

export function totalTokensUsed(job: GenerationJob): number {
  return Object.values(job.steps).reduce((sum, step) => sum + (step?.tokensUsed ?? 0), 0);
}

// ─── Check if all required steps are done ─────────────────────────────────────

export function allStepsDone(job: GenerationJob): boolean {
  return job.stepSequence.every(
    (key) => job.steps[key]?.status === 'done'
  );
}

export function anyStepErrored(job: GenerationJob): boolean {
  return job.stepSequence.some((key) => job.steps[key]?.status === 'error');
}

// ─── Get next pending step in sequence ────────────────────────────────────────

export function nextPendingStep(job: GenerationJob): string | null {
  return (
    job.stepSequence.find((key) => job.steps[key]?.status === 'pending') ?? null
  );
}
