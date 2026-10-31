import type { TrainingStage, TrainingMission, TrainingQuestion } from '../../../lib/training-core/types';
import type { WorkplaceContext, WorkplaceClassificationResult } from '../../regulatory/types';

// ─── Step keys ───────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'streaming' | 'done' | 'error';

export interface StepResult {
  stepKey: string;
  status: StepStatus;
  rawOutput: string;
  parsedJson: unknown;
  validationErrors: ValidationError[];
  tokensUsed: number;
  retryCount: number;
}

// ─── Preflight result ────────────────────────────────────────────────────────

export interface PreflightResult {
  clearEnough: boolean;
  issues: string[];
  suggestedImprovement?: string;
}

// ─── Domain configuration (user inputs from setup panel) ─────────────────────

export interface DomainConfig {
  moduleId: string;
  domainPrompt: string;
  audienceDescription: string;
  objectives: string[];
  stageCount: number;
  lessonsPerStage: number;
  missionCount: number;
  fastMode?: boolean;
  sourceReferences: string[];
  // Compliance mode — present when generating regulatory H&S content
  workplaceContext?: WorkplaceContext;
  regulatoryClassification?: WorkplaceClassificationResult;
}

// Re-export for convenience so callers don't need to import from regulatory directly
export type { WorkplaceContext, WorkplaceClassificationResult };

// ─── Job (accumulated state across the full generation run) ──────────────────

export interface GenerationJob extends DomainConfig {
  steps: Record<string, StepResult>;
  stepSequence: string[];           // ordered list of stepKeys for this job
  currentStepKey: string;
  estimatedTokens: number;
  actualTokensUsed: number;
}

export interface StepExecutionTelemetry {
  stepKey: string;
  attempts: number;
  successCount: number;
  failureCount: number;
  cancelCount: number;
  totalDurationMs: number;
  lastDurationMs: number;
  totalTokensUsed: number;
  lastStatus: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
  lastError?: string;
  firstStartedAt?: string;
  lastFinishedAt?: string;
}

export interface GenerationTelemetry {
  steps: Record<string, StepExecutionTelemetry>;
  totals: {
    attempts: number;
    successes: number;
    failures: number;
    cancels: number;
    totalDurationMs: number;
    totalTokensUsed: number;
    avgStepDurationMs: number;
    failureRatePct: number;
  };
}

// ─── Blueprint output (Step 0) ───────────────────────────────────────────────

export interface BlueprintStage {
  id: number;
  title: string;
  description: string;
  stageObjective: string;
  prerequisiteCompetencies: string[];
  lessonTitles: string[];
  testQuestionCount: number;
  learningArc: 'conceptual-first' | 'procedural-first' | 'diagnostic-focus';
}

export interface BlueprintOutput {
  blueprint: BlueprintStage[];
}

// ─── Stage lesson output (Steps 1...N) ───────────────────────────────────────

export interface StageLessonsOutput {
  stage: Omit<TrainingStage, 'test'>;   // test comes from a separate step
}

// ─── Stage test output (Steps 1...N) ─────────────────────────────────────────

export interface StageTestOutput {
  test: TrainingStage['test'];
}

// ─── Missions output ──────────────────────────────────────────────────────────

export interface MissionsOutput {
  missions: TrainingMission[];
}

// ─── Placement assessment output ──────────────────────────────────────────────

export interface PlacementAssessmentOutput {
  placementAssessment: {
    title?: string;
    quizTitle?: string;
    introText?: string;
    completedResultLabel?: string;
    recommendedStartTitle?: string;
    recommendedStartHint?: string;
    questions: TrainingQuestion[];
    recommendationThresholds: Array<{
      minScore: number;
      stage: number;
    }>;
  };
}

// ─── Lesson mission map output (practical gating scaffolding) ────────────────

export interface LessonMissionMapOutput {
  lessonMissionMap: Record<
    string,
    {
      lessonId: string;
      missionIds: string[];
      rationale: string;
    }
  >;
}

// ─── Source attribution output ────────────────────────────────────────────────

export interface SourceCatalogEntry {
  id: string;
  title: string;
  url: string;
  notes?: string;
  publisher?: string;
  reliability?: 'authoritative' | 'reputable' | 'secondary';
  year?: number;
  lastVerified?: string; // ISO date (YYYY-MM-DD)
}

export interface SourceAttributionOutput {
  sourceCatalog: SourceCatalogEntry[];
  citationMap: {
    lessonCitations: Record<string, string[]>;
    missionCitations: Record<string, string[]>;
  };
}

// ─── Fact-check output ────────────────────────────────────────────────────────

export interface FactCheckItem {
  id: string;
  claim: string;
  relatedItemId: string;
  relatedItemType: 'lesson' | 'mission' | 'placement' | 'general';
  sourceIds: string[];
  verdict: 'supported' | 'unsupported' | 'ambiguous' | 'disputed';
  severity: 'low' | 'medium' | 'high' | 'regulatory';
  rationale: string;
}

export interface FactCheckOutput {
  factCheck: {
    items: FactCheckItem[];
    summary?: {
      supported: number;
      unsupported: number;
      ambiguous: number;
    };
  };
}

// ─── Theme shell output ───────────────────────────────────────────────────────

export interface ThemeShellOutput {
  id: string;
  title: string;
  icon: string;
  shortDescription: string;
  description: string;
  suggestedAccentColor: 'amber' | 'sky' | 'teal' | 'emerald' | 'violet' | 'rose';
  flags: {
    hasSimulator: boolean;
    hasPlacement: boolean;
    hasAdaptiveReview: boolean;
  };
  terms: {
    primaryDiscipline: string;
    simulatorLabel: string;
  };
  labels?: {
    dashboardExtensionsTitle?: string;
    ladderBuilderTitle?: string;
    faultCampaignTitle?: string;
    capstoneTitle?: string;
    fieldReferenceTitle?: string;
    sourcesTitle?: string;
    pidIntroTitle?: string;
  };
  tooling?: {
    availability?: {
      simulator?: boolean;
      review?: boolean;
      builder?: boolean;
      faultCampaign?: boolean;
      pidIntro?: boolean;
      capstone?: boolean;
    };
    artifacts?: {
      simulator?: boolean;
      review?: boolean;
      builder?: boolean;
      faultCampaign?: boolean;
      pidIntro?: boolean;
      capstone?: boolean;
    };
    stagePlans?: Array<{
      stageId: number;
      primaryTool: 'simulator' | 'review' | 'builder' | 'faultCampaign' | 'pidIntro' | 'capstone';
      supportingTools?: Array<'simulator' | 'review' | 'builder' | 'faultCampaign' | 'pidIntro' | 'capstone'>;
      rationale: string;
    }>;
  };
}

export interface ThemeShellEnvelope {
  themeShell: ThemeShellOutput;
}

// ─── Advanced artifacts output (simulator/campaign/reference/builder/capstone) ──

export interface AdvancedArtifactsOutput {
  advancedArtifacts: {
    simulatorDesign: {
      concept: string;
      learnerControls: string[];
      stateVariables: Array<{ name: string; description: string }>;
      visibleOutcomes: string[];
      subsystems: Array<{ id: string; title: string; purpose: string }>;
      tickModel: {
        model: string;
        stepMs: number;
        updateSequence: string[];
      };
      faultInjectionModel: {
        injectableFaultTypes: string[];
        examples: string[];
      };
      trainerPanels: Array<{
        id: string;
        title: string;
        stageMin: number;
        stageMax: number;
        focus: string;
      }>;
    };
    faultScenarioCampaign: {
      scenarios: Array<{
        id: string;
        symptomDescription: string;
        injectedIssues: string[];
        compound: boolean;
        difficulty: 'beginner' | 'intermediate' | 'advanced';
        expectedReasoningPath: string[];
        successCriteria: string[];
        scoreRange: { min: number; max: number };
      }>;
    };
    fieldReferenceCards: Array<{
      id: string;
      title: string;
      purpose: string;
      checklist: string[];
      preventsMistake: string;
    }>;
    builderExercises: Array<{
      id: string;
      title: string;
      templateType: string;
      paletteItems: string[];
      requiredSlots: string[];
      validationLogic: string;
      testCases: Array<{ id: string; input: string; expected: string }>;
    }>;
    capstoneChallenge: {
      title: string;
      requiredMissionIds: string[];
      optionalBonusMissionIds: string[];
      scoringRubric: Array<{ criterion: string; weight: number; description: string }>;
      guidanceBands: Array<{ band: string; minScore: number; maxScore: number; guidance: string }>;
      reportFields: string[];
    };
    progressionScoringRules: {
      missionScoring: string;
      faultCampaignScoring: string;
      stageProgression: string;
      capstonePassThreshold: number;
    };
    implementationNotes: {
      dataModelNotes: string[];
      renderingHints: string[];
      idConventions: string[];
    };
  };
}

// ─── Advanced artifacts split outputs ────────────────────────────────────────

export interface SimulatorDesignOutput {
  simulatorDesign: AdvancedArtifactsOutput['advancedArtifacts']['simulatorDesign'];
}

export interface FaultAndReferenceOutput {
  faultScenarioCampaign: AdvancedArtifactsOutput['advancedArtifacts']['faultScenarioCampaign'];
  fieldReferenceCards: AdvancedArtifactsOutput['advancedArtifacts']['fieldReferenceCards'];
}

export interface BuilderAndCapstoneOutput {
  builderExercises: AdvancedArtifactsOutput['advancedArtifacts']['builderExercises'];
  capstoneChallenge: AdvancedArtifactsOutput['advancedArtifacts']['capstoneChallenge'];
  progressionScoringRules: AdvancedArtifactsOutput['advancedArtifacts']['progressionScoringRules'];
  implementationNotes: AdvancedArtifactsOutput['advancedArtifacts']['implementationNotes'];
}

// ─── Assembled module (assembled from all steps before export) ────────────────

export interface AssembledModule {
  curriculum: TrainingStage[];
  missions: TrainingMission[];
  placementAssessment: PlacementAssessmentOutput['placementAssessment'] | null;
  lessonMissionMap: LessonMissionMapOutput['lessonMissionMap'];
  sourceCatalog: SourceCatalogEntry[];
  citationMap: SourceAttributionOutput['citationMap'];
  factCheck: FactCheckOutput['factCheck'] | null;
  advancedArtifacts: AdvancedArtifactsOutput['advancedArtifacts'] | null;
  themeShell: ThemeShellOutput;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationError {
  severity: 'error' | 'warning';
  path: string;
  rule: string;
  message: string;
}

export interface ModuleReviewFinding {
  severity: 'error' | 'warning';
  title: string;
  evidencePath: string;
  message: string;
  recommendation: string;
}

export interface ModuleReviewReport {
  overallScore: number; // 0..100
  scaffoldingScore: number; // 0..100
  publishReadyScore: number; // 0..100
  verdict:
    | 'must-have killer app in niche'
    | 'strong contender'
    | 'solid good enough'
    | 'niche specialized'
    | 'has potential not there yet'
    | 'below average hard to recommend';
  oneSentenceRecommendation: string;
  strengths: string[];
  criticalFindings: ModuleReviewFinding[];
  priorities: string[];
  notes?: string;
}

// ─── Export result ────────────────────────────────────────────────────────────

export interface ExportResult {
  themeFile: string;           // content of the generated .ts file
  registrySnippet: string;     // code the dev pastes into registry.ts
  companionNotes?: string;     // optional notes for placement + lesson-mission map integration
  fileName: string;            // e.g. "hydraulicsTheme.ts"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildStepSequence(stageCount: number): string[] {
  const steps: string[] = ['blueprint'];
  for (let i = 1; i <= stageCount; i++) {
    steps.push(`stage_${i}`);
    steps.push(`test_${i}`);
  }
  steps.push(
    'missions',
    'placementAssessment',
    'lessonMissionMap',
    'sourceAttribution',
    'coherencePass',       // Phase 3: cross-stage coherence analysis
    'factCheckA',          // Phase 4A: Anthropic fact-check
    'factCheckG',          // Phase 4G: Gemini fact-check
    'factCheckMerge',      // Phase 4 merge: disagreements → disputed
    // advancedArtifacts is split into 3 focused sub-steps for reliability:
    'simulatorDesign',    // simulatorDesign section only
    'faultAndReference',  // faultScenarioCampaign (20) + fieldReferenceCards (5)
    'builderAndCapstone', // builderExercises (4) + capstoneChallenge + scoringRules + notes
    'themeShell',
    'repairArtifacts'     // Phase 5: post-pipeline self-healing
  );
  return steps;
}

export function makeEmptyStepResult(stepKey: string): StepResult {
  return {
    stepKey,
    status: 'pending',
    rawOutput: '',
    parsedJson: null,
    validationErrors: [],
    tokensUsed: 0,
    retryCount: 0
  };
}

export function makeInitialJob(config: DomainConfig): GenerationJob {
  const sequence = buildStepSequence(config.stageCount);
  const steps: Record<string, StepResult> = {};
  for (const key of sequence) {
    steps[key] = makeEmptyStepResult(key);
  }
  return {
    ...config,
    steps,
    stepSequence: sequence,
    currentStepKey: sequence[0],
    estimatedTokens: 0,
    actualTokensUsed: 0
  };
}

export function stageIndexFromKey(key: string): number {
  const m = key.match(/^(?:stage|test)_(\d+)$/);
  return m ? parseInt(m[1], 10) : -1;
}

