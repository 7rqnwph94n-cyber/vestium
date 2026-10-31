import { useMemo } from 'react';
import { ProgressState } from '../../types/progress';
import { Stage } from '../../lib/training-core/types';
import { isStageUnlocked, stageCompletionBreakdown } from './gating';
import { getDueReviewItems } from './review';
import { DEFAULT_THEME_ID } from '../../lib/training-core/registry';

export interface NextStepHint {
  label: string;
  to: string;
  helper?: string;
}

/**
 * Finds the first incomplete but unlocked stage in a curriculum.
 */
export function findFirstIncompleteStage(state: ProgressState, curriculum: Stage[]): Stage | undefined {
  return curriculum.find((stage) => isStageUnlocked(state, stage.id) && !state.stageTestsPassed[stage.id]);
}

/**
 * Determines the path to the next logical step for a learner:
 * 1. Next incomplete lesson in the first unlocked stage
 * 2. Incomplete simulator missions in that stage
 * 3. The stage test
 * 4. Adaptive review if items are due
 * 5. Dashboard fallback
 */
export function getNextStepPath(
  state: ProgressState,
  curriculum: Stage[],
  _themeId: string,
  simulatorLabel = 'Simulator',
): NextStepHint | null {
  const firstIncompleteStage = findFirstIncompleteStage(state, curriculum);

  if (firstIncompleteStage) {
    const nextLesson = firstIncompleteStage.lessons.find((l) => !state.lessonsCompleted[l.id]);
    if (nextLesson) {
      return {
        label: `Continue Stage ${firstIncompleteStage.id}: "${nextLesson.title}"`,
        to: `/stage/${firstIncompleteStage.id}/lesson/${nextLesson.id}`,
        helper: 'Continue the next lesson in your current unlocked stage.',
      };
    }
    const bd = stageCompletionBreakdown(state, firstIncompleteStage);
    if (bd.completedMissions < bd.totalMissions) {
      return {
        label: `Stage ${firstIncompleteStage.id}: Complete simulator missions`,
        to: `/stage/${firstIncompleteStage.id}`,
        helper: `Practical ${simulatorLabel.toLowerCase()} missions are still blocking the stage test.`,
      };
    }
    return {
      label: `Stage ${firstIncompleteStage.id}: Take the stage test`,
      to: `/stage/${firstIncompleteStage.id}/test`,
      helper: 'All lessons and required simulator missions are complete.',
    };
  }

  return null;
}

/**
 * Returns the continue path for the header nav button.
 * Falls back to adaptive review or dashboard.
 */
export function getContinuePath(
  state: ProgressState,
  curriculum: Stage[],
  themeId: string,
): string {
  const hint = getNextStepPath(state, curriculum, themeId);
  if (hint) return hint.to;

  const dueReviewCount = getDueReviewItems(state).filter(
    (item) => (item.themeId ?? DEFAULT_THEME_ID) === themeId,
  ).length;
  return dueReviewCount > 0 ? '/review' : '/dashboard';
}

/**
 * React hook wrapping the next-step logic for use in components.
 */
export function useNextStep(
  state: ProgressState,
  curriculum: Stage[],
  themeId: string,
  simulatorLabel?: string,
) {
  return useMemo(() => {
    const firstIncompleteStage = findFirstIncompleteStage(state, curriculum);
    const nextStep = getNextStepPath(state, curriculum, themeId, simulatorLabel);
    const continuePath = getContinuePath(state, curriculum, themeId);

    return {
      firstIncompleteStage,
      nextStep,
      continuePath,
      recommendedStageId: firstIncompleteStage?.id ?? null,
    };
  }, [state, curriculum, themeId, simulatorLabel]);
}
