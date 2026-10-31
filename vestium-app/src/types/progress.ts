export interface ProgressState {
  xp: number;
  lessonsCompleted: Record<string, boolean>;
  simulatorMissionsCompleted: Record<string, boolean>;
  stageTestsPassed: Record<number, boolean>;
  badges: number[];
  stageTestScores: Record<number, number>;
  faultAttempts: Array<{ stageId: number; correct: boolean; faultId: string; at: string }>;
  placementAssessmentCompleted?: boolean;
  placementScore?: number;
  placementRecommendedStage?: number;
  placementUnlockedStage?: number;
  adaptiveItems?: Record<string, AdaptiveItem>;
  // Backward-compatible alias during adaptive-review generalization.
  reviewItems?: Record<string, AdaptiveItem>;
  achievementFlags?: Record<string, boolean>;
  faultCampaign?: {
    bestScore?: number;
    bestCorrectCount?: number;
    completedRuns: number;
    lastRunAt?: string;
  };
}

export interface AdaptiveItem {
  key: string;
  themeId?: string;
  sourceType: 'lesson' | 'stageTest';
  stageId: number;
  lessonId?: string;
  sourceTitle: string;
  contentItemId?: string;
  questionId: string;
  prompt: string;
  type: 'mcq' | 'tf';
  options?: string[];
  answer: string | boolean;
  explanation: string;
  dueAt: string;
  lastReviewedAt?: string;
  intervalDays: number;
  repetitions: number;
  totalAttempts: number;
  totalCorrect: number;
  performance?: {
    totalAttempts: number;
    totalCorrect: number;
  };
}

