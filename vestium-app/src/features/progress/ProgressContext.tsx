import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ProgressState } from '../../types/progress';
import { loadProgress, saveProgress } from './persistence';
import {
  completeLesson,
  completeSimulatorMission,
  completeStageTest,
  initialProgressState,
  recordFaultAttempt,
  applyPlacementAssessment,
  recordQuizReviewResults,
  recordAdaptiveReviewResponse,
  awardAchievementFlag,
  recordFaultCampaignRun
} from './store';
import { TrainingQuestion } from '../../lib/training-core/types';

interface ProgressContextValue {
  state: ProgressState;
  markLessonComplete: (lessonId: string) => void;
  submitStageTest: (stageId: number, score: number, passed: boolean) => void;
  resetProgress: () => void;
  addFaultAttempt: (stageId: number, faultId: string, correct: boolean) => void;
  markSimulatorMissionComplete: (missionId: string) => void;
  submitPlacementAssessment: (score: number, recommendedStage: number) => void;
  recordQuizResultsForReview: (
    scope: { sourceType: 'lesson' | 'stageTest'; themeId?: string; stageId: number; lessonId?: string; sourceTitle: string },
    questions: TrainingQuestion[],
    answers: Record<string, string | boolean>
  ) => void;
  submitAdaptiveReviewResponse: (reviewKey: string, correct: boolean) => void;
  awardAchievement: (key: string) => void;
  saveFaultCampaignRun: (score: number, correctCount: number) => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export const ProgressProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<ProgressState>(() => loadProgress());

  useEffect(() => {
    saveProgress(state);
  }, [state]);

  const value = useMemo<ProgressContextValue>(
    () => ({
      state,
      markLessonComplete: (lessonId: string) => setState((prev) => completeLesson(prev, lessonId)),
      submitStageTest: (stageId: number, score: number, passed: boolean) =>
        setState((prev) => completeStageTest(prev, stageId, passed, score)),
      resetProgress: () => setState(initialProgressState),
      addFaultAttempt: (stageId: number, faultId: string, correct: boolean) =>
        setState((prev) => recordFaultAttempt(prev, stageId, faultId, correct)),
      markSimulatorMissionComplete: (missionId: string) =>
        setState((prev) => completeSimulatorMission(prev, missionId)),
      submitPlacementAssessment: (score: number, recommendedStage: number) =>
        setState((prev) => applyPlacementAssessment(prev, score, recommendedStage)),
      recordQuizResultsForReview: (scope, questions, answers) =>
        setState((prev) => recordQuizReviewResults(prev, scope, questions, answers)),
      submitAdaptiveReviewResponse: (reviewKey, correct) =>
        setState((prev) => recordAdaptiveReviewResponse(prev, reviewKey, correct)),
      awardAchievement: (key) =>
        setState((prev) => awardAchievementFlag(prev, key)),
      saveFaultCampaignRun: (score, correctCount) =>
        setState((prev) => recordFaultCampaignRun(prev, score, correctCount))
    }),
    [state]
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};

export const useProgress = (): ProgressContextValue => {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error('useProgress must be used within ProgressProvider');
  }
  return ctx;
};
