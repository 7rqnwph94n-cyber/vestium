import { describe, expect, it } from 'vitest';
import type { TrainingLesson, TrainingStage } from '../../lib/training-core/types';
import { canAttemptStageTest, isStageUnlocked, stageCompletionBreakdown, stageCompletionPercent } from './gating';
import { getRequiredMissionIdsForLessons } from '../simulator/lessonMissionRequirements';
import { completeLesson, completeSimulatorMission, completeStageTest, initialProgressState } from './store';

// ─── Inline mock curriculum ───────────────────────────────────────────────────
// The static module registry is empty (all modules are generated at runtime).
// These minimal stage stubs satisfy the gating logic under test: only lesson.id
// and stage.id are accessed by the gating functions.
//
// Stage 2 lesson IDs are chosen to match lessonMissionRequirements:
//   's2-l2' → ['seal-in-hold']
//   's2-l3' → ['timer-lamp-delay', 'counter-valve-done', 'one-shot-counter-diagnosis']

const lesson = (id: string): TrainingLesson =>
  ({ id, title: id, objective: '', concept: [], diagrams: [], workedExample: '', quiz: [],
     youTry: { type: 'mcq', prompt: '', options: [], answer: '', feedback: '' } } as TrainingLesson);

const mockStage2: TrainingStage = {
  id: 2,
  title: 'Stage 2',
  description: 'Timer and counter fundamentals',
  lessons: [lesson('s2-l1'), lesson('s2-l2'), lesson('s2-l3')],
  test: [],
};

const curriculum: TrainingStage[] = [
  { id: 1, title: 'Stage 1', description: 'Foundations', lessons: [lesson('s1-l1')], test: [] },
  mockStage2,
];

describe('progress gating', () => {
  it('locks stage until previous stage test is passed', () => {
    expect(isStageUnlocked(initialProgressState, 1)).toBe(true);
    expect(isStageUnlocked(initialProgressState, 2)).toBe(false);

    const afterPass = completeStageTest(initialProgressState, 1, true, 90);
    expect(isStageUnlocked(afterPass, 2)).toBe(true);
  });

  it('awards lesson XP and test XP once', () => {
    const afterLesson = completeLesson(initialProgressState, 's1-l1');
    const lessonRepeat = completeLesson(afterLesson, 's1-l1');
    expect(afterLesson.xp).toBe(10);
    expect(lessonRepeat.xp).toBe(10);

    const afterTest = completeStageTest(afterLesson, 1, true, 88);
    const testRepeat = completeStageTest(afterTest, 1, true, 99);
    expect(afterTest.xp).toBe(35);
    expect(testRepeat.xp).toBe(35);
  });

  it('computes stage progress including missions and test gate', () => {
    // Progress counts lessons + required missions + test (1 unit).
    // Stage 2 has required missions (s2-l2 → seal-in-hold; s2-l3 → timer/counter missions).
    const afterStage1Pass = completeStageTest(initialProgressState, 1, true, 90);
    const stage2 = curriculum[1];
    const requiredMissions = getRequiredMissionIdsForLessons(stage2.lessons.map((l) => l.id));
    const totalUnits = stage2.lessons.length + requiredMissions.length + 1;

    const oneLesson = completeLesson(afterStage1Pass, stage2.lessons[0].id);
    expect(stageCompletionPercent(oneLesson, stage2)).toBe(
      Math.round((1 / totalUnits) * 100)
    );

    // After completing 1 mission and 1 lesson:
    const withMission = completeSimulatorMission(oneLesson, requiredMissions[0]);
    expect(stageCompletionPercent(withMission, stage2)).toBe(
      Math.round((2 / totalUnits) * 100)
    );

    // After passing stage test additionally:
    const passed = completeStageTest(withMission, 2, true, 85);
    expect(stageCompletionPercent(passed, stage2)).toBe(
      Math.round((3 / totalUnits) * 100)
    );

    // Breakdown object also exposes granular counts:
    const bd = stageCompletionBreakdown(passed, stage2);
    expect(bd.completedLessons).toBe(1);
    expect(bd.totalLessons).toBe(stage2.lessons.length);
    expect(bd.completedMissions).toBe(1);
    expect(bd.totalMissions).toBe(requiredMissions.length);
    expect(bd.testPassed).toBe(true);
  });

  it('requires all lessons complete before stage test attempt is allowed', () => {
    // Stage 2 has required missions; completing lessons alone is not sufficient.
    const afterStage1Pass = completeStageTest(initialProgressState, 1, true, 90);
    const stage2 = curriculum[1];

    expect(canAttemptStageTest(afterStage1Pass, stage2)).toBe(false);

    const withLessons = stage2.lessons.reduce((acc, lesson) => completeLesson(acc, lesson.id), afterStage1Pass);
    expect(canAttemptStageTest(withLessons, stage2)).toBe(false);

    const requiredMissions = getRequiredMissionIdsForLessons(stage2.lessons.map((l) => l.id));
    const withAllMissions = requiredMissions.reduce((acc, id) => completeSimulatorMission(acc, id), withLessons);
    expect(canAttemptStageTest(withAllMissions, stage2)).toBe(true);
  });

  it('requires stage practical simulator missions when configured for that stage', () => {
    const stage2 = curriculum[1];
    const afterStage1Pass = completeStageTest(initialProgressState, 1, true, 90);
    const withStage2Lessons = stage2.lessons.reduce(
      (acc, lesson) => completeLesson(acc, lesson.id),
      afterStage1Pass
    );

    expect(canAttemptStageTest(withStage2Lessons, stage2)).toBe(false);

    const withMissions = ['seal-in-hold', 'timer-lamp-delay', 'counter-valve-done', 'one-shot-counter-diagnosis'].reduce(
      (acc, missionId) => completeSimulatorMission(acc, missionId),
      withStage2Lessons
    );

    expect(canAttemptStageTest(withMissions, stage2)).toBe(true);
  });
});
