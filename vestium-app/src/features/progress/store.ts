import { ProgressState } from '../../types/progress';
import { TrainingQuestion } from '../../lib/training-core/types';
import { DEFAULT_THEME_ID } from '../../lib/training-core/registry';
import { LESSON_XP, TEST_XP } from '../../utils/constants';

const getAdaptiveItems = (state: ProgressState) => state.adaptiveItems ?? state.reviewItems ?? {};

const withAdaptiveItems = (
  state: ProgressState,
  items: NonNullable<ProgressState['adaptiveItems']>
): ProgressState => ({
  ...state,
  adaptiveItems: items,
  // Keep legacy key in sync for compatibility with older code/saved state.
  reviewItems: items
});

export const initialProgressState: ProgressState = {
  xp: 0,
  lessonsCompleted: {},
  simulatorMissionsCompleted: {},
  stageTestsPassed: {},
  badges: [],
  stageTestScores: {},
  faultAttempts: [],
  placementAssessmentCompleted: false,
  placementScore: undefined,
  placementRecommendedStage: undefined,
  placementUnlockedStage: 1,
  adaptiveItems: {},
  reviewItems: {},
  achievementFlags: {},
  faultCampaign: {
    completedRuns: 0
  }
};

export const completeLesson = (state: ProgressState, lessonId: string): ProgressState => {
  if (state.lessonsCompleted[lessonId]) {
    return state;
  }
  return {
    ...state,
    xp: state.xp + LESSON_XP,
    lessonsCompleted: {
      ...state.lessonsCompleted,
      [lessonId]: true
    }
  };
};

export const completeStageTest = (state: ProgressState, stageId: number, passed: boolean, score: number): ProgressState => {
  const alreadyPassed = Boolean(state.stageTestsPassed[stageId]);
  const next: ProgressState = {
    ...state,
    stageTestScores: {
      ...state.stageTestScores,
      [stageId]: score
    }
  };
  if (!passed || alreadyPassed) {
    return next;
  }
  return {
    ...next,
    xp: next.xp + TEST_XP,
    stageTestsPassed: {
      ...next.stageTestsPassed,
      [stageId]: true
    },
    badges: next.badges.includes(stageId) ? next.badges : [...next.badges, stageId]
  };
};

export const recordFaultAttempt = (state: ProgressState, stageId: number, faultId: string, correct: boolean): ProgressState => ({
  ...state,
  faultAttempts: [
    {
      stageId,
      faultId,
      correct,
      at: new Date().toISOString()
    },
    ...state.faultAttempts
  ].slice(0, 50)
});

export const completeSimulatorMission = (state: ProgressState, missionId: string): ProgressState => {
  if (state.simulatorMissionsCompleted[missionId]) {
    return state;
  }
  return {
    ...state,
    simulatorMissionsCompleted: {
      ...state.simulatorMissionsCompleted,
      [missionId]: true
    }
  };
};

export const applyPlacementAssessment = (
  state: ProgressState,
  score: number,
  recommendedStage: number
): ProgressState => ({
  ...state,
  placementAssessmentCompleted: true,
  placementScore: score,
  placementRecommendedStage: recommendedStage,
  placementUnlockedStage: Math.max(state.placementUnlockedStage ?? 1, recommendedStage)
});

const addDays = (base: Date, days: number): Date => {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
};

const nextIntervalDays = (previousInterval: number, repetitions: number, correct: boolean): number => {
  if (!correct) return 0;
  if (repetitions <= 1) return 1;
  if (repetitions === 2) return 3;
  return Math.max(7, Math.round(previousInterval * 2));
};

export const recordQuizReviewResults = (
  state: ProgressState,
  scope: {
    sourceType: 'lesson' | 'stageTest';
    themeId?: string;
    stageId: number;
    lessonId?: string;
    sourceTitle: string;
  },
  questions: TrainingQuestion[],
  answers: Record<string, string | boolean>
): ProgressState => {
  const now = new Date();
  const current = getAdaptiveItems(state);
  const nextItems = { ...current };

  questions.forEach((q) => {
    // Verbal questions are evidence artifacts, not SRS review items — skip them here.
    if (q.type === 'verbal') return;
    const themeKey = scope.themeId ?? DEFAULT_THEME_ID;
    const key = `${themeKey}:${scope.sourceType}:${scope.stageId}:${scope.lessonId ?? 'stage'}:${q.id}`;
    const correct = answers[q.id] === q.answer;
    const existing = current[key];
    const prevRepetitions = existing?.repetitions ?? 0;
    const repetitions = correct ? prevRepetitions + 1 : 0;
    const intervalDays = nextIntervalDays(existing?.intervalDays ?? 0, repetitions, correct);
    const dueAt = correct ? addDays(now, intervalDays) : now;

    nextItems[key] = {
      key,
      themeId: themeKey,
      sourceType: scope.sourceType,
      stageId: scope.stageId,
      lessonId: scope.lessonId,
      sourceTitle: scope.sourceTitle,
      contentItemId: q.id,
      questionId: q.id,
      prompt: q.prompt,
      type: q.type as 'mcq' | 'tf',
      options: q.type === 'mcq' ? q.options : undefined,
      answer: q.answer ?? '',
      explanation: q.explanation,
      dueAt: dueAt.toISOString(),
      lastReviewedAt: now.toISOString(),
      intervalDays,
      repetitions,
      totalAttempts: (existing?.totalAttempts ?? 0) + 1,
      totalCorrect: (existing?.totalCorrect ?? 0) + (correct ? 1 : 0),
      performance: {
        totalAttempts: (existing?.totalAttempts ?? 0) + 1,
        totalCorrect: (existing?.totalCorrect ?? 0) + (correct ? 1 : 0)
      }
    };
  });

  return withAdaptiveItems(state, nextItems);
};

export const recordAdaptiveReviewResponse = (
  state: ProgressState,
  reviewKey: string,
  correct: boolean
): ProgressState => {
  const current = getAdaptiveItems(state);
  const item = current[reviewKey];
  if (!item) return state;
  const now = new Date();
  const repetitions = correct ? item.repetitions + 1 : 0;
  const intervalDays = nextIntervalDays(item.intervalDays, repetitions, correct);
  const dueAt = correct ? addDays(now, intervalDays) : now;
  const nextItems = {
    ...current,
    [reviewKey]: {
      ...item,
      dueAt: dueAt.toISOString(),
      lastReviewedAt: now.toISOString(),
      intervalDays,
      repetitions,
      totalAttempts: item.totalAttempts + 1,
      totalCorrect: item.totalCorrect + (correct ? 1 : 0),
      performance: {
        totalAttempts: item.totalAttempts + 1,
        totalCorrect: item.totalCorrect + (correct ? 1 : 0)
      }
    }
  };
  return withAdaptiveItems(state, nextItems);
};

// Generic aliases for future module-agnostic naming.
export const recordQuestionResultsForAdaptiveReview = recordQuizReviewResults;
export const recordAdaptiveItemResponse = recordAdaptiveReviewResponse;

export const awardAchievementFlag = (
  state: ProgressState,
  key: string
): ProgressState => ({
  ...state,
  achievementFlags: {
    ...(state.achievementFlags ?? {}),
    [key]: true
  }
});

export const recordFaultCampaignRun = (
  state: ProgressState,
  score: number,
  correctCount: number
): ProgressState => {
  const current = state.faultCampaign ?? { completedRuns: 0 };
  return {
    ...state,
    faultCampaign: {
      completedRuns: current.completedRuns + 1,
      lastRunAt: new Date().toISOString(),
      bestScore:
        current.bestScore === undefined ? score : Math.max(current.bestScore, score),
      bestCorrectCount:
        current.bestCorrectCount === undefined
          ? correctCount
          : Math.max(current.bestCorrectCount, correctCount)
    }
  };
};
