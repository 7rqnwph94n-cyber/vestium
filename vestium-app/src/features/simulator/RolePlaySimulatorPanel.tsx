import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { buildMissionSet } from '../../lib/training-core/simulator';
import type { TrainingMissionBranch } from '../../lib/training-core/types';
import { useProgress } from '../progress/ProgressContext';

export const RolePlaySimulatorPanel = ({ stageId }: { stageId: number }) => {
  const { currentThemeId, currentTheme } = useTheme();
  const { state, markSimulatorMissionComplete } = useProgress();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedBranchIdx, setSelectedBranchIdx] = useState<number | null>(null);
  const simulatorLabel = currentTheme.terms?.simulatorLabel ?? 'Role-Play Simulator';

  const missions = useMemo(() => {
    const missionSet = buildMissionSet(currentThemeId);
    return missionSet.missions
      .filter((mission) =>
        Array.isArray(mission.branches) &&
        mission.branches.length > 0 &&
        (mission.stageMin === undefined || stageId >= mission.stageMin) &&
        (mission.stageMax === undefined || stageId <= mission.stageMax)
      )
      .map((mission) => ({
        ...mission,
        branches: mission.branches as TrainingMissionBranch[]
      }));
  }, [currentThemeId, stageId]);

  const requestedMissionId = searchParams.get('mission');
  const selectedMission = useMemo(() => {
    if (requestedMissionId) {
      const requested = missions.find((m) => m.id === requestedMissionId);
      if (requested) return requested;
    }
    return missions[0] ?? null;
  }, [missions, requestedMissionId]);

  useEffect(() => {
    setSelectedBranchIdx(null);
  }, [selectedMission?.id]);

  useEffect(() => {
    if (!selectedMission) return;
    if (requestedMissionId === selectedMission.id) return;
    const next = new URLSearchParams(searchParams);
    next.set('mission', selectedMission.id);
    setSearchParams(next, { replace: true });
  }, [requestedMissionId, searchParams, selectedMission, setSearchParams]);

  if (missions.length === 0) {
    return (
      <div className="rounded border border-theme-border bg-theme-base p-3 text-sm text-theme-secondary">
        No {simulatorLabel.toLowerCase()} scenarios are defined for this stage yet.
      </div>
    );
  }

  if (!selectedMission) return null;
  const selectedBranch = selectedBranchIdx === null ? null : selectedMission.branches[selectedBranchIdx];
  const completed = Boolean(state.simulatorMissionsCompleted[selectedMission.id]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">Scenarios</p>
          {missions.map((mission) => {
            const active = mission.id === selectedMission.id;
            const missionDone = Boolean(state.simulatorMissionsCompleted[mission.id]);
            return (
              <button
                key={mission.id}
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('mission', mission.id);
                  setSearchParams(next, { replace: false });
                }}
                className={`w-full rounded border p-3 text-left text-xs ${
                  active
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-100'
                    : 'border-theme-border bg-theme-base text-theme-secondary hover:border-theme-border'
                }`}
              >
                <p className="font-semibold">{mission.title}</p>
                <p className="mt-1 text-theme-secondary">{mission.description}</p>
                <p className={`mt-2 ${missionDone ? 'text-emerald-300' : 'text-theme-muted'}`}>
                  {missionDone ? 'Completed' : 'Not completed'}
                </p>
              </button>
            );
          })}
        </div>

        <div className="rounded border border-theme-border bg-theme-base p-3">
          <p className="text-sm font-semibold text-theme-text">{selectedMission.title}</p>
          <p className="mt-1 text-xs text-theme-secondary">{selectedMission.description}</p>
          {selectedMission.whyItMatters ? (
            <p className="mt-2 text-xs text-theme-secondary">{selectedMission.whyItMatters}</p>
          ) : null}

          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">
              Choose your response
            </p>
            {selectedMission.branches.map((branch, idx) => (
              <button
                key={`${selectedMission.id}-${idx}`}
                type="button"
                onClick={() => {
                  setSelectedBranchIdx(idx);
                  markSimulatorMissionComplete(selectedMission.id);
                }}
                className={`w-full rounded border p-3 text-left text-xs ${
                  selectedBranchIdx === idx
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                    : 'border-theme-border bg-theme-panel text-theme-text hover:border-theme-border'
                }`}
              >
                {branch.choice}
              </button>
            ))}
          </div>

          {selectedBranch ? (
            <div className="mt-3 rounded border border-theme-border bg-theme-panel/60 p-3 text-xs">
              <p className="font-semibold text-theme-text">Outcome</p>
              <p className="mt-1 text-theme-secondary">{selectedBranch.outcome}</p>
              <p className="mt-2">
                Score:{' '}
                <span
                  className={
                    selectedBranch.score >= 80
                      ? 'text-emerald-300'
                      : selectedBranch.score >= 60
                        ? 'text-amber-300'
                        : 'text-rose-300'
                  }
                >
                  {selectedBranch.score}/100
                </span>
              </p>
              <p className="mt-1 text-theme-secondary">{selectedBranch.feedback}</p>
              <p className={`mt-2 ${completed ? 'text-emerald-300' : 'text-theme-secondary'}`}>
                {completed ? 'Scenario marked complete for stage gating.' : 'Select a response to complete this scenario.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
