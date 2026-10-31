import { describe, it, expect } from 'vitest';
import type { ProgressState } from '../../types/progress';
import type { Stage } from '../../lib/training-core/types';
import { findFirstIncompleteStage, getNextStepPath, getContinuePath } from './useNextStep';

// Minimal stage factory
function makeStage(id: number, lessonIds: string[]): Stage {
  return {
    id,
    title: `Stage ${id}`,
    description: `Stage ${id} description`,
    lessons: lessonIds.map((lid) => ({
      id: lid,
      title: `Lesson ${lid}`,
      objective: 'Test objective',
      conceptSections: [],
      quiz: [],
    })),
    test: { questions: [] },
  } as unknown as Stage;
}

// Minimal progress state factory
function makeState(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    lessonsCompleted: {},
    stageTestsPassed: {},
    stageTestScores: {},
    faultAttempts: {},
    simulatorMissionsCompleted: {},
    xp: 0,
    badges: [],
    placementAssessmentCompleted: false,
    placementScore: 0,
    placementRecommendedStage: 1,
    ...overrides,
  } as ProgressState;
}

const curriculum = [
  makeStage(1, ['s1-l1', 's1-l2']),
  makeStage(2, ['s2-l1', 's2-l2']),
  makeStage(3, ['s3-l1']),
];

describe('findFirstIncompleteStage', () => {
  it('returns the first stage when nothing is completed', () => {
    const state = makeState();
    const result = findFirstIncompleteStage(state, curriculum);
    expect(result?.id).toBe(1);
  });

  it('returns stage 2 when stage 1 test is passed', () => {
    const state = makeState({ stageTestsPassed: { 1: true } });
    const result = findFirstIncompleteStage(state, curriculum);
    expect(result?.id).toBe(2);
  });

  it('returns undefined when all stages are passed', () => {
    const state = makeState({ stageTestsPassed: { 1: true, 2: true, 3: true } });
    const result = findFirstIncompleteStage(state, curriculum);
    expect(result).toBeUndefined();
  });
});

describe('getNextStepPath', () => {
  it('points to the first incomplete lesson', () => {
    const state = makeState({ lessonsCompleted: { 's1-l1': true } });
    const result = getNextStepPath(state, curriculum, 'test-theme');
    expect(result).not.toBeNull();
    expect(result!.to).toBe('/stage/1/lesson/s1-l2');
    expect(result!.label).toContain('Stage 1');
  });

  it('points to the stage test when all lessons are done', () => {
    const state = makeState({
      lessonsCompleted: { 's1-l1': true, 's1-l2': true },
    });
    const result = getNextStepPath(state, curriculum, 'test-theme');
    expect(result).not.toBeNull();
    expect(result!.to).toBe('/stage/1/test');
  });

  it('returns null when all stages are complete', () => {
    const state = makeState({ stageTestsPassed: { 1: true, 2: true, 3: true } });
    const result = getNextStepPath(state, curriculum, 'test-theme');
    expect(result).toBeNull();
  });

  it('skips to the next unlocked stage when the current is passed', () => {
    const state = makeState({ stageTestsPassed: { 1: true } });
    const result = getNextStepPath(state, curriculum, 'test-theme');
    expect(result).not.toBeNull();
    expect(result!.to).toBe('/stage/2/lesson/s2-l1');
  });
});

describe('getContinuePath', () => {
  it('returns the next lesson path when there is an active stage', () => {
    const state = makeState();
    const path = getContinuePath(state, curriculum, 'test-theme');
    expect(path).toBe('/stage/1/lesson/s1-l1');
  });

  it('returns /dashboard when all stages are complete and no review items', () => {
    const state = makeState({ stageTestsPassed: { 1: true, 2: true, 3: true } });
    const path = getContinuePath(state, curriculum, 'test-theme');
    expect(path).toBe('/dashboard');
  });
});
