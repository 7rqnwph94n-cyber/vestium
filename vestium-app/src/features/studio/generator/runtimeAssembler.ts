import type { ThemeConfig } from '../../../lib/training-core/types';
import type { AssembledModule } from './types';

// Mirrors the Tailwind accent maps in exporter.ts
const ACCENT_TEXT: Record<string, string> = {
  amber: 'text-amber-300',
  sky: 'text-sky-300',
  teal: 'text-teal-300',
  emerald: 'text-emerald-300',
  violet: 'text-violet-300',
  rose: 'text-rose-300'
};

const ACCENT_BORDER: Record<string, string> = {
  amber: 'border-amber-500/40',
  sky: 'border-sky-500/40',
  teal: 'border-teal-500/40',
  emerald: 'border-emerald-500/40',
  violet: 'border-violet-500/40',
  rose: 'border-rose-500/40'
};

const ACCENT_BG: Record<string, string> = {
  amber: 'bg-amber-500/10',
  sky: 'bg-sky-500/10',
  teal: 'bg-teal-500/10',
  emerald: 'bg-emerald-500/10',
  violet: 'bg-violet-500/10',
  rose: 'bg-rose-500/10'
};

// Generic labels that work for any domain
const GENERIC_LABELS: ThemeConfig['labels'] = {
  dashboardTitle: 'Dashboard',
  dashboardPageTitle: 'Training Dashboard',
  dashboardRecommendedNextStepTitle: 'Recommended Next Step',
  dashboardTrainingCompleteTitle: 'Training Complete',
  dashboardExtensionsTitle: 'Labs & Extensions',
  reviewTitle: 'Adaptive Review',
  adaptiveReviewPageTitle: 'Adaptive Review',
  adaptiveReviewNoDueTitle: 'No Practice Items Ready',
  fieldReferenceTitle: 'Field Reference',
  ladderBuilderTitle: 'Builder',
  faultCampaignTitle: 'Practice Campaign',
  placementTitle: 'Placement Assessment',
  sourcesTitle: 'References & Sources',
  pidIntroTitle: 'Intro Lab',
  capstoneTitle: 'Capstone',
  lessonPracticalGateTitle: 'Practical Gate',
  lessonConceptTitle: 'Concept Explanation',
  lessonScenarioTitle: 'Real Scenario',
  lessonSimulatorPracticeTitle: 'Practice',
  lessonCompletionGateTitle: 'Completion Gate',
  lessonKnowledgeCheckTitle: 'Knowledge Check',
  quizStageExamTitle: 'Stage Exam',
  quizSubmitLabel: 'Submit Quiz',
  quizRetryLabel: 'Retry',
  quizSubmitCompletionLabel: 'Submit for Completion',
  quizBackToPracticeLabel: 'Back to Practice',
  quizReturnToPracticeLabel: 'Return to Practice',
  quizStartScoredCheckLabel: 'Start scored check (counts for completion)',
  quizSeePracticeScoreLabel: 'See Practice Score',
  quizAllFilterLabel: 'All',
  quizIncorrectFilterLabel: 'Incorrect only',
  quizGoBackLabel: 'Go back',
  quizSubmitAnywayLabel: 'Submit anyway'
};

/**
 * Converts an AssembledModule (from the generator) into a full ThemeConfig
 * that can be registered in the dynamic registry for in-browser preview.
 * All data is JSON-serializable — no function fields are set.
 */
export function buildRuntimeThemeConfig(
  moduleId: string,
  assembled: AssembledModule
): ThemeConfig {
  const shell = assembled.themeShell;
  const color = shell.suggestedAccentColor ?? 'amber';

  // Artifact presence derived strictly from what was actually assembled — never trust model flags.
  const resolvedArtifacts: NonNullable<NonNullable<ThemeConfig['tooling']>['artifacts']> = {
    simulator: assembled.missions.length > 0 || Object.keys(assembled.lessonMissionMap ?? {}).length > 0,
    review: shell.flags.hasAdaptiveReview,
    builder: Boolean(assembled.advancedArtifacts?.builderExercises?.length),
    faultCampaign: Boolean(assembled.advancedArtifacts?.faultScenarioCampaign?.scenarios?.length),
    pidIntro: false,
    capstone: Boolean(assembled.advancedArtifacts?.capstoneChallenge)
  };

  // Availability mirrors artifacts for generated tools — if we generated it, it's available.
  // simulator/review are controlled by domain flags; builder/faultCampaign/capstone follow artifacts.
  const resolvedAvailability: NonNullable<NonNullable<ThemeConfig['tooling']>['availability']> = {
    simulator: resolvedArtifacts.simulator || shell.flags.hasSimulator,
    review: shell.flags.hasAdaptiveReview,
    builder: resolvedArtifacts.builder,
    faultCampaign: resolvedArtifacts.faultCampaign,
    pidIntro: false,
    capstone: resolvedArtifacts.capstone
  };

  const fallbackTooling: ThemeConfig['tooling'] = {
    availability: resolvedAvailability,
    artifacts: resolvedArtifacts,
    stagePlans: assembled.curriculum.map((stage) => ({
      stageId: stage.id,
      primaryTool: shell.flags.hasSimulator ? 'simulator' : 'review',
      supportingTools: shell.flags.hasSimulator && shell.flags.hasAdaptiveReview ? ['review'] : undefined,
      rationale: shell.flags.hasSimulator
        ? 'Practice core decisions in simulator scenarios, then reinforce weak points in adaptive review.'
        : 'Use adaptive review to retain core concepts while progressing through stage assessments.'
    }))
  };

  // Domain-specific labels from the model, falling back to generic for any key not provided.
  const mergedLabels: ThemeConfig['labels'] = { ...GENERIC_LABELS, ...(shell.labels ?? {}) };

  return {
    id: moduleId,
    title: shell.title,
    icon: shell.icon,
    shortDescription: shell.shortDescription,
    description: shell.description,
    curriculum: assembled.curriculum,
    missions: assembled.missions,
    className: '',
    colors: {
      pageClassName: '',
      accentTextClassName: ACCENT_TEXT[color] ?? 'text-amber-300',
      accentBorderClassName: ACCENT_BORDER[color] ?? 'border-amber-500/40',
      accentBgClassName: ACCENT_BG[color] ?? 'bg-amber-500/10'
    },
    labels: mergedLabels,
    terms: {
      primaryDiscipline: shell.terms.primaryDiscipline,
      simulatorLabel: shell.terms.simulatorLabel
    },
    tooling: shell.tooling
      ? { ...shell.tooling, availability: resolvedAvailability, artifacts: resolvedArtifacts }
      : fallbackTooling,
    simulatorData: {
      lessonMissionRequirements: assembled.lessonMissionMap ?? {},
      faults: assembled.advancedArtifacts?.faultScenarioCampaign?.scenarios ?? [],
      simulatorDesign: assembled.advancedArtifacts?.simulatorDesign,
      fieldReferenceCards: assembled.advancedArtifacts?.fieldReferenceCards,
      builderExercises: assembled.advancedArtifacts?.builderExercises,
      capstoneChallenge: assembled.advancedArtifacts?.capstoneChallenge,
      progressionScoringRules: assembled.advancedArtifacts?.progressionScoringRules,
      implementationNotes: assembled.advancedArtifacts?.implementationNotes,
      sourceCatalog: assembled.sourceCatalog,
      citationMap: assembled.citationMap
    },
    placementAssessment: assembled.placementAssessment
      ? (() => {
          const { recommendationThresholds, ...rest } = assembled.placementAssessment;
          return {
            ...rest,
            recommendStage: (score: number) => {
              const thresholds = [...(recommendationThresholds ?? [])]
              .sort((a, b) => b.minScore - a.minScore);
              const matched = thresholds.find((t) => score >= t.minScore);
              return matched?.stage ?? 1;
            }
          };
        })()
      : undefined,
    flags: {
      hasSimulator: shell.flags.hasSimulator,
      hasPlacement: Boolean(assembled.placementAssessment && shell.flags.hasPlacement),
      hasAdaptiveReview: shell.flags.hasAdaptiveReview,
      hasSiemensTrack: false     // generated modules never have vendor track
    }
  };
}
