import type { ThemeConfig, TrainingToolKey } from './types';

export type ResolvedToolAvailability = Record<TrainingToolKey, boolean>;

const ALL_TOOLS: TrainingToolKey[] = [
  'simulator',
  'review',
  'builder',
  'faultCampaign',
  'pidIntro',
  'capstone'
];

function hasSimulatorArtifacts(theme: ThemeConfig): boolean {
  const hasMissions = Array.isArray(theme.missions) && theme.missions.length > 0;
  const hasLessonMissionRequirements =
    Boolean(theme.simulatorData?.lessonMissionRequirements) &&
    Object.keys(theme.simulatorData?.lessonMissionRequirements ?? {}).length > 0;
  return hasMissions || hasLessonMissionRequirements;
}

function inferArtifactPresence(theme: ThemeConfig, tool: TrainingToolKey): boolean {
  if (tool === 'simulator') return hasSimulatorArtifacts(theme);
  if (tool === 'review') return Boolean(theme.flags?.hasAdaptiveReview ?? true);
  return false;
}

export function resolveToolAvailability(theme: ThemeConfig): ResolvedToolAvailability {
  const availability = theme.tooling?.availability ?? {};
  const artifacts = theme.tooling?.artifacts ?? {};

  const resolved = {} as ResolvedToolAvailability;
  for (const tool of ALL_TOOLS) {
    const enabledByConfig =
      availability[tool] ??
      (tool === 'simulator'
        ? Boolean(theme.flags?.hasSimulator)
        : tool === 'review'
          ? Boolean(theme.flags?.hasAdaptiveReview)
          : false);
    const hasArtifacts = artifacts[tool] ?? inferArtifactPresence(theme, tool);
    resolved[tool] = Boolean(enabledByConfig && hasArtifacts);
  }

  return resolved;
}
