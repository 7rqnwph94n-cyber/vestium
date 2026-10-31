import type { Fault } from '../../types/simulator';
import { DEFAULT_THEME_ID, modulesRegistry } from './registry';
import type { ThemeConfig } from './types';
import type { SimulatorMission } from '../../features/simulator/missions';
import type { LessonMissionRequirement } from '../../features/simulator/lessonMissionRequirements';

type SimulatorDataBag = {
  lessonMissionRequirements?: Record<string, LessonMissionRequirement>;
  faults?: Fault[];
};

export interface TrainingMissionSet {
  themeId: string;
  missions: SimulatorMission[];
  lessonMissionRequirements: Record<string, LessonMissionRequirement>;
  faults: Fault[];
}

export interface MissionOutcomeResult {
  score: number;
  passed: boolean;
  feedback: string;
}

type MissionOutcomeRubric =
  | ((answers: unknown) => MissionOutcomeResult)
  | {
      score?: number;
      passed?: boolean;
      feedback?: string;
    };

const getThemeConfig = (themeId: string): ThemeConfig | undefined =>
  modulesRegistry[themeId] ?? modulesRegistry[DEFAULT_THEME_ID];

const getSimulatorDataBag = (themeId: string): SimulatorDataBag => {
  const theme = getThemeConfig(themeId);
  return theme ? ((theme.simulatorData ?? {}) as SimulatorDataBag) : {};
};

export const buildMissionSet = (themeId: string = DEFAULT_THEME_ID): TrainingMissionSet => {
  const theme = getThemeConfig(themeId);
  if (!theme) {
    // Dynamic (backend-generated) module — no static simulator data.
    return { themeId, missions: [], lessonMissionRequirements: {}, faults: [] };
  }
  const simulatorData = getSimulatorDataBag(theme.id);
  return {
    themeId: theme.id,
    missions: (theme.missions ?? []) as SimulatorMission[],
    lessonMissionRequirements: simulatorData.lessonMissionRequirements ?? {},
    faults: simulatorData.faults ?? []
  };
};

export const getTrainingMissionById = (
  missionId: string,
  themeId: string = DEFAULT_THEME_ID
): SimulatorMission | undefined => {
  const { missions } = buildMissionSet(themeId);
  return missions.find((mission) => mission.id === missionId);
};

export const getRequiredTrainingMissionIdsForLessons = (
  lessonIds: string[],
  themeId: string = DEFAULT_THEME_ID
): string[] => {
  const { lessonMissionRequirements } = buildMissionSet(themeId);
  const ids = new Set<string>();
  lessonIds.forEach((lessonId) => {
    const requirement = lessonMissionRequirements[lessonId];
    requirement?.missionIds.forEach((missionId) => ids.add(missionId));
  });
  return [...ids];
};

export const getTrainingLessonMissionRequirement = (
  lessonId: string,
  themeId: string = DEFAULT_THEME_ID
): LessonMissionRequirement | undefined => buildMissionSet(themeId).lessonMissionRequirements[lessonId];

export const getTrainingFaults = (themeId: string = DEFAULT_THEME_ID): Fault[] =>
  buildMissionSet(themeId).faults;

export const evaluateMissionOutcome = (
  answers: unknown,
  rubric: MissionOutcomeRubric
): MissionOutcomeResult => {
  if (typeof rubric === 'function') {
    return rubric(answers);
  }
  return {
    score: rubric.score ?? 0,
    passed: rubric.passed ?? false,
    feedback: rubric.feedback ?? ''
  };
};
