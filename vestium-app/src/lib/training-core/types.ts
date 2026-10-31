export type TrainingQuestionType = 'mcq' | 'tf' | 'verbal';

export interface TrainingQuestion {
  id: string;
  type: TrainingQuestionType;
  prompt: string;
  intent?: 'application' | 'knowledge';
  options?: string[];
  answer?: string | boolean;   // optional for verbal (open-response, no correct answer key)
  explanation: string;
  regulatoryRef?: string;      // e.g. "MHSWR 1999 Reg 13(1)" — compliance modules only
  timerSeconds?: number;       // verbal only — seconds allowed to answer (default 60)
  triggerScrollPct?: number;   // verbal only — scroll depth 0.0–1.0 at which modal fires
  expectedKeywords?: string[]; // verbal only — transcript must evidence these terms/ideas
  minKeywordHits?: number;     // verbal only — minimum keyword matches required
}

export interface DiagramNode {
  id: string;
  label: string;
  active?: boolean;
}

export interface DiagramAttribution {
  sourceName: string;
  sourceUrl: string;
  creator?: string;
  licenseName: string;
  licenseUrl?: string;
  rightsStatus?: 'public-domain' | 'cc0' | 'other';
  verifiedOn?: string;
  verificationNotes?: string;
}

export interface LessonDiagram {
  id: string;
  title: string;
  kind: 'flow' | 'rung' | 'io' | 'timeline' | 'image';
  nodes: DiagramNode[];
  imageUrl?: string;
  alt?: string;
  caption?: string;
  attribution?: DiagramAttribution;
}

export interface PracticeActivity {
  type: 'ordering' | 'scenario' | 'mcq';
  prompt: string;
  options: string[];
  answer: string[] | string;
  feedback: string;
}

export interface TrainingLesson {
  id: string;
  title: string;
  objective: string;
  situationHook?: string;
  readingMinutes?: number;
  concept: string[];
  diagrams: LessonDiagram[];
  workedExample: string;
  youTry: PracticeActivity;
  quiz: TrainingQuestion[];
}

export interface TrainingStage {
  id: number;
  title: string;
  description: string;
  stageObjective?: string;
  prerequisiteCompetencies?: string[];
  lessons: TrainingLesson[];
  test: TrainingQuestion[];
}

export interface TrainingMissionBranch {
  choice: string;
  outcome: string;
  score: number;
  feedback: string;
}

export interface TrainingMission {
  id: string;
  title: string;
  description: string;
  whyItMatters?: string;
  stageMin?: number;
  stageMax?: number;
  minEvidenceSteps?: number;
  branches?: TrainingMissionBranch[];
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  curriculum: TrainingStage[];
  missions?: TrainingMission[];
}

export type TrainingToolKey =
  | 'simulator'
  | 'review'
  | 'builder'
  | 'faultCampaign'
  | 'pidIntro'
  | 'capstone';

export interface ThemeConfig extends TrainingModule {
  icon?: string;
  shortDescription?: string;
  estimatedCompletionHours?: {
    min: number;
    max: number;
  };
  className?: string;
  colors?: {
    pageClassName?: string;
    accentTextClassName?: string;
    accentBorderClassName?: string;
    accentBgClassName?: string;
  };
  labels?: {
    dashboardTitle?: string;
    dashboardPageTitle?: string;
    dashboardRecommendedNextStepTitle?: string;
    dashboardTrainingCompleteTitle?: string;
    dashboardExtensionsTitle?: string;
    reviewTitle?: string;
    adaptiveReviewPageTitle?: string;
    adaptiveReviewNoDueTitle?: string;
    fieldReferenceTitle?: string;
    ladderBuilderTitle?: string;
    faultCampaignTitle?: string;
    placementTitle?: string;
    sourcesTitle?: string;
    pidIntroTitle?: string;
    capstoneTitle?: string;
    siemensTrackTitle?: string;
    siemensTrackBreadcrumbTitle?: string;
    lessonPracticalGateTitle?: string;
    lessonSituationHookTitle?: string;
    lessonConceptTitle?: string;
    lessonScenarioTitle?: string;
    lessonSimulatorPracticeTitle?: string;
    lessonCompletionGateTitle?: string;
    lessonKnowledgeCheckTitle?: string;
    quizStageExamTitle?: string;
    quizSubmitLabel?: string;
    quizRetryLabel?: string;
    quizSubmitCompletionLabel?: string;
    quizBackToPracticeLabel?: string;
    quizReturnToPracticeLabel?: string;
    quizStartScoredCheckLabel?: string;
    quizSeePracticeScoreLabel?: string;
    quizAllFilterLabel?: string;
    quizIncorrectFilterLabel?: string;
    quizGoBackLabel?: string;
    quizSubmitAnywayLabel?: string;
  };
  terms?: {
    primaryDiscipline?: string;
    simulatorLabel?: string;
    vendorTrackBrand?: string;
  };
  tooling?: {
    availability?: Partial<Record<TrainingToolKey, boolean>>;
    artifacts?: Partial<Record<TrainingToolKey, boolean>>;
    stagePlans?: Array<{
      stageId: number;
      primaryTool: TrainingToolKey;
      supportingTools?: TrainingToolKey[];
      rationale: string;
    }>;
  };
  simulatorData?: {
    lessonMissionRequirements?: Record<string, unknown>;
    faults?: unknown[];
    simulatorDesign?: unknown;
    fieldReferenceCards?: unknown[];
    builderExercises?: unknown[];
    capstoneChallenge?: unknown;
    progressionScoringRules?: unknown;
    implementationNotes?: unknown;
    sourceCatalog?: unknown[];
    citationMap?: unknown;
  };
  placementAssessment?: {
    title?: string;
    quizTitle?: string;
    introText?: string;
    completedResultLabel?: string;
    recommendedStartTitle?: string;
    recommendedStartHint?: string;
    questions: TrainingQuestion[];
    recommendStage: (score: number) => number;
  };
  flags?: {
    hasSimulator?: boolean;
    hasPlacement?: boolean;
    hasAdaptiveReview?: boolean;
    hasSiemensTrack?: boolean;
    [key: string]: boolean | undefined;
  };
}

// Backward-compatible aliases for incremental migration.
export type QuizQuestion = TrainingQuestion;
export type YouTry = PracticeActivity;
export type Lesson = TrainingLesson;
export type Stage = TrainingStage;
