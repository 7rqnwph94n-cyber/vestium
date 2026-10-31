import { memo } from 'react';
import { Card } from '../../components/Card';
import { SimulatorMission, SimulatorMissionCheckResult } from './missions';

export interface MissionStatus {
  completed: boolean;
  lastResult?: SimulatorMissionCheckResult;
  completedWorkflowStepIds?: string[];
  workflowEvidenceByStepId?: Record<string, string>;
  evidenceNotes?: {
    symptom?: string;
    likelyDomain?: string;
    firstCheck?: string;
    confirmingEvidence?: string;
  };
  timeline?: Array<{
    id: string;
    kind: 'evidence' | 'diagnosis' | 'system';
    label: string;
    detail: string;
    scan: number;
  }>;
  processScore?: {
    score: number;
    max: number;
    summary: string;
  };
}

export const SimulatorMissionPanel = memo(function SimulatorMissionPanel({
  missions,
  statuses,
  selectedMissionId,
  onSelectMission,
  onCheckMission,
  onResetMissionProgress,
  onCaptureWorkflowStepEvidence,
  onResetWorkflowSteps,
  onUpdateEvidenceNotes,
  presentationMode = 'practice'
}: {
  missions: SimulatorMission[];
  statuses: Record<string, MissionStatus>;
  selectedMissionId: string | null;
  onSelectMission: (missionId: string) => void;
  onCheckMission: (missionId: string) => void;
  onResetMissionProgress: () => void;
  onCaptureWorkflowStepEvidence: (missionId: string, stepId: string) => void;
  onResetWorkflowSteps: (missionId: string) => void;
  onUpdateEvidenceNotes: (
    missionId: string,
    patch: NonNullable<MissionStatus['evidenceNotes']>
  ) => void;
  presentationMode?: 'guided' | 'practice' | 'assessment' | 'field';
}) {
  if (missions.length === 0) return null;

  const selectedMission =
    missions.find((mission) => mission.id === selectedMissionId) ?? missions[0];
  const selectedStatus = statuses[selectedMission.id];
  const completedWorkflowStepIds = selectedStatus?.completedWorkflowStepIds ?? [];
  const workflowEvidenceByStepId = selectedStatus?.workflowEvidenceByStepId ?? {};
  const evidenceNotes = selectedStatus?.evidenceNotes ?? {};
  const timeline = selectedStatus?.timeline ?? [];
  const nextWorkflowStep =
    selectedMission.workflowSteps?.find((step) => !completedWorkflowStepIds.includes(step.id)) ?? null;

  return (
    <Card title="Simulator Missions" className="space-y-3">
      <p className="text-xs text-theme-secondary">
        Practical checks for this stage. Use these to prove behavior in the simulator, not just read about it.
      </p>

      <div className="grid gap-2 md:grid-cols-2">
        {missions.map((mission) => {
          const status = statuses[mission.id];
          const selected = mission.id === selectedMission.id;
          return (
            <button
              key={mission.id}
              type="button"
              onClick={() => onSelectMission(mission.id)}
              className={`rounded border p-3 text-left transition-colors ${
                selected
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-theme-border bg-theme-base hover:border-theme-border'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-theme-text">{mission.title}</p>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] ${
                    status?.completed
                      ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border border-theme-border text-theme-secondary'
                  }`}
                >
                  {status?.completed ? 'Complete' : 'Open'}
                </span>
              </div>
              <p className="mt-1 text-xs text-theme-secondary">{mission.description}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded border border-theme-border bg-theme-base p-3">
        <p className="text-sm font-semibold text-amber-300">{selectedMission.title}</p>
        <p className="mt-1 text-xs text-theme-secondary">{selectedMission.description}</p>
        <p className="mt-2 text-xs text-theme-secondary">
          Why it matters: {selectedMission.whyItMatters}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onCheckMission(selectedMission.id)}
            className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            Check Mission State
          </button>
          <button
            type="button"
            onClick={onResetMissionProgress}
            className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
          >
            Reset Mission Progress
          </button>
        </div>

        {selectedMission.workflowSteps && selectedMission.workflowSteps.length > 0 ? (
          <div className="mt-4 rounded border border-theme-border bg-theme-panel/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">
              Guided Workflow
            </p>
            <p className="mt-1 text-xs text-theme-muted">
              Complete the troubleshooting steps in order before submitting the diagnosis.
            </p>
            <div className="mt-3 space-y-2">
              {selectedMission.workflowSteps.map((step, idx) => {
                const done = completedWorkflowStepIds.includes(step.id);
                const isNext = nextWorkflowStep?.id === step.id;
                return (
                  <div
                    key={step.id}
                    className={`rounded border p-2 ${
                      done
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : isNext
                          ? 'border-amber-500/40 bg-amber-500/10'
                          : 'border-theme-border bg-theme-base'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={`text-xs ${done ? 'text-emerald-300' : 'text-theme-text'}`}>
                        {idx + 1}. {step.label}
                      </p>
                      <button
                        type="button"
                        disabled={done || !isNext}
                        onClick={() => onCaptureWorkflowStepEvidence(selectedMission.id, step.id)}
                        className="rounded border border-theme-border px-2 py-1 text-[11px] text-theme-text disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {done ? 'Evidence Captured' : isNext ? 'Capture Evidence' : 'Locked'}
                      </button>
                    </div>
                    {step.hint && presentationMode !== 'assessment' ? (
                      <p className="mt-1 text-[11px] text-theme-muted">{step.hint}</p>
                    ) : null}
                    {workflowEvidenceByStepId[step.id] && presentationMode !== 'assessment' ? (
                      <p className="mt-1 text-[11px] text-theme-secondary">
                        Evidence: {workflowEvidenceByStepId[step.id]}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onResetWorkflowSteps(selectedMission.id)}
                className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
              >
                Reset Workflow Steps
              </button>
              {nextWorkflowStep ? (
                <p className="text-xs text-theme-secondary">
                  Next step: <span className="text-amber-300">{nextWorkflowStep.label}</span>
                </p>
              ) : (
                <p className="text-xs text-emerald-300">Workflow complete. Submit diagnosis to finish the mission.</p>
              )}
            </div>
          </div>
        ) : null}

        {selectedMission.workflowSteps && selectedMission.workflowSteps.length > 0 ? (
          <div className="mt-4 rounded border border-theme-border bg-theme-panel/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">
              Evidence Notes (Reasoning)
            </p>
            <p className="mt-1 text-xs text-theme-muted">
              Write your diagnostic path before or while you submit a diagnosis. This reduces guess-first behavior.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {[
                ['symptom', 'Observed symptom'],
                ['likelyDomain', 'Likely fault domain'],
                ['firstCheck', 'First check'],
                ['confirmingEvidence', 'Confirming evidence']
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[11px] text-theme-secondary">{label}</span>
                  <textarea
                    rows={2}
                    value={evidenceNotes[key as keyof typeof evidenceNotes] ?? ''}
                    onChange={(event) =>
                      onUpdateEvidenceNotes(selectedMission.id, {
                        symptom: evidenceNotes.symptom ?? '',
                        likelyDomain: evidenceNotes.likelyDomain ?? '',
                        firstCheck: evidenceNotes.firstCheck ?? '',
                        confirmingEvidence: evidenceNotes.confirmingEvidence ?? '',
                        [key]: event.target.value
                      })
                    }
                    className="mt-1 w-full rounded border border-theme-border bg-theme-base px-2 py-2 text-xs text-theme-text focus:border-amber-400 focus:outline-none"
                    placeholder={
                      key === 'symptom'
                        ? 'Example: Run command ON, motor not running'
                        : key === 'likelyDomain'
                          ? 'Example: device/drive status fault'
                          : key === 'firstCheck'
                            ? 'Example: check Ready/Fault/Local status'
                            : 'Example: Fault bit TRUE and LocalMode TRUE'
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {selectedStatus?.lastResult ? (
          <p
            className={`mt-3 text-xs ${
              selectedStatus.lastResult.passed ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {selectedStatus.lastResult.message}
          </p>
        ) : (
          <p className="mt-3 text-xs text-theme-muted">
            Run the simulator, then use "Check Mission State" to validate progress.
          </p>
        )}

        {selectedStatus?.processScore && presentationMode !== 'assessment' ? (
          <div className="mt-3 rounded border border-theme-border bg-theme-panel/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">
              Process Quality
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-300">
              {selectedStatus.processScore.score} / {selectedStatus.processScore.max}
            </p>
            <p className="mt-1 text-xs text-theme-secondary">{selectedStatus.processScore.summary}</p>
          </div>
        ) : null}

        {timeline.length > 0 && presentationMode !== 'assessment' ? (
          <div className="mt-3 rounded border border-theme-border bg-theme-panel/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">
              Evidence Timeline
            </p>
            <p className="mt-1 text-xs text-theme-muted">
              Timestamped troubleshooting actions for this mission attempt.
            </p>
            <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
              {[...timeline].reverse().map((entry) => (
                <div
                  key={entry.id}
                  className={`rounded border p-2 ${
                    entry.kind === 'diagnosis'
                      ? 'border-amber-500/30 bg-amber-500/10'
                      : entry.kind === 'system'
                        ? 'border-rose-500/30 bg-rose-500/10'
                        : 'border-theme-border bg-theme-base'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-theme-text">{entry.label}</p>
                    <span className="text-[10px] text-theme-muted">Scan #{entry.scan}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-theme-secondary">{entry.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
});
