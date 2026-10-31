import { ProgressState } from '../../types/progress';
import { Stage } from '../../lib/training-core/types';
import { getRequiredMissionIdsForLessons } from '../simulator/lessonMissionRequirements';

export const isStageUnlocked = (state: ProgressState, stageId: number): boolean => {
  const placementUnlockedStage = state.placementUnlockedStage ?? 1;
  if (stageId <= placementUnlockedStage) return true;
  return Boolean(state.stageTestsPassed[stageId - 1]);
};

export const areAllStageLessonsComplete = (state: ProgressState, stage: Stage): boolean =>
  stage.lessons.every((lesson) => Boolean(state.lessonsCompleted[lesson.id]));

export const areStagePracticalMissionsComplete = (state: ProgressState, stage: Stage): boolean => {
  const requiredMissionIds = getRequiredMissionIdsForLessons(stage.lessons.map((lesson) => lesson.id));
  return requiredMissionIds.every((missionId) => Boolean(state.simulatorMissionsCompleted[missionId]));
};

export const canAttemptStageTest = (state: ProgressState, stage: Stage): boolean => {
  if (!isStageUnlocked(state, stage.id)) return false;
  return areAllStageLessonsComplete(state, stage) && areStagePracticalMissionsComplete(state, stage);
};

/**
 * Detailed breakdown of stage completion for UI display.
 * Missions are counted separately so learners can see what is blocking them.
 */
export interface StageCompletionBreakdown {
  completedLessons: number;
  totalLessons: number;
  completedMissions: number;
  totalMissions: number;
  testPassed: boolean;
  /** Overall 0-100 percent across lessons + missions + test */
  percent: number;
}

export const stageCompletionBreakdown = (
  state: ProgressState,
  stage: Stage
): StageCompletionBreakdown => {
  const requiredMissionIds = getRequiredMissionIdsForLessons(stage.lessons.map((l) => l.id));
  const completedLessons = stage.lessons.filter((l) => state.lessonsCompleted[l.id]).length;
  const completedMissions = requiredMissionIds.filter(
    (m) => Boolean(state.simulatorMissionsCompleted[m])
  ).length;
  const testPassed = Boolean(state.stageTestsPassed[stage.id]);

  // totalUnits = lessons + required missions + test gate (1)
  const totalUnits = stage.lessons.length + requiredMissionIds.length + 1;
  const done = completedLessons + completedMissions + (testPassed ? 1 : 0);

  return {
    completedLessons,
    totalLessons: stage.lessons.length,
    completedMissions,
    totalMissions: requiredMissionIds.length,
    testPassed,
    percent: Math.round((done / totalUnits) * 100)
  };
};

export const stageCompletionPercent = (state: ProgressState, stage: Stage): number =>
  stageCompletionBreakdown(state, stage).percent;

export const overallCompletionPercent = (state: ProgressState, stages: Stage[]): number => {
  const allBreakdowns = stages.map((stage) => stageCompletionBreakdown(state, stage));
  const totalUnits = allBreakdowns.reduce(
    (sum, b) => sum + b.totalLessons + b.totalMissions + 1,
    0
  );
  const done = allBreakdowns.reduce(
    (sum, b) =>
      sum + b.completedLessons + b.completedMissions + (b.testPassed ? 1 : 0),
    0
  );
  return Math.round((done / totalUnits) * 100);
};
