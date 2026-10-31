import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useProgress } from '../progress/ProgressContext';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { resolveToolAvailability } from '../../lib/training-core/tooling';

// Capstone config is stored in simulatorData.capstoneChallenge
type CapstoneChallengeConfig = {
  requiredMissionIds: string[];
  optionalMissionIds?: string[];
  missionTitles?: Record<string, string>;
  maxMinutes?: number;
  faultDomains?: string[];
  processChecks?: Array<{ key: string; label: string }>;
};

const DEFAULT_PROCESS_CHECKS = [
  { key: 'definedSymptomFirst', label: 'Defined the observable symptom before taking action' },
  { key: 'usedEvidenceNotGuessing', label: 'Based decisions on evidence, not assumptions' },
  { key: 'followedHierarchy', label: 'Applied the correct hierarchy or control sequence' },
  { key: 'documentedActions', label: 'Documented the corrective and preventive actions taken' }
];

export const CapstoneChallengePage = () => {
  const { currentTheme } = useTheme();
  const capstoneConfig = currentTheme.simulatorData?.capstoneChallenge as CapstoneChallengeConfig | undefined;
  const enabled = resolveToolAvailability(currentTheme).capstone && Boolean(capstoneConfig?.requiredMissionIds?.length);

  // ─── All hooks before conditional returns ──────────────────────────────────
  const { state } = useProgress();
  const [candidateName, setCandidateName] = useState('');
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [incidentSummary, setIncidentSummary] = useState('');
  const [rootCauseSummary, setRootCauseSummary] = useState('');
  const [preventionActions, setPreventionActions] = useState('');

  const processCheckDefs = capstoneConfig?.processChecks ?? DEFAULT_PROCESS_CHECKS;
  const [processChecks, setProcessChecks] = useState<Record<string, boolean>>(
    () => Object.fromEntries(processCheckDefs.map((c) => [c.key, false]))
  );

  const requiredMissionIds = capstoneConfig?.requiredMissionIds ?? [];
  const optionalMissionIds = capstoneConfig?.optionalMissionIds ?? [];
  const missionTitles = capstoneConfig?.missionTitles ?? {};
  const maxChallengeMinutes = capstoneConfig?.maxMinutes ?? 45;
  const faultDomains = capstoneConfig?.faultDomains ?? ['Evidence gathering', 'Root cause analysis', 'Corrective action'];

  const now = new Date();
  const elapsedMinutes = useMemo(() => {
    if (!startedAt) return 0;
    const end = endedAt ? new Date(endedAt) : now;
    return Math.max(0, (end.getTime() - new Date(startedAt).getTime()) / 60000);
  }, [startedAt, endedAt, now]);

  const requiredCompleted = requiredMissionIds.filter((id) => state.simulatorMissionsCompleted[id]).length;
  const optionalCompleted = optionalMissionIds.filter((id) => state.simulatorMissionsCompleted[id]).length;
  const processCheckCount = Object.values(processChecks).filter(Boolean).length;

  const scoreBreakdown = useMemo(() => {
    const missionScore = requiredMissionIds.length > 0
      ? Math.round((requiredCompleted / requiredMissionIds.length) * 60)
      : 0;
    const optionalBonus = optionalCompleted > 0 ? 5 : 0;
    const timeScore = !startedAt
      ? 0
      : elapsedMinutes <= Math.floor(maxChallengeMinutes * 0.55)
        ? 20
        : elapsedMinutes <= maxChallengeMinutes
          ? 10
          : 5;
    const processScore = processCheckDefs.length > 0
      ? Math.round((processCheckCount / processCheckDefs.length) * 20)
      : 0;
    const total = Math.min(100, missionScore + optionalBonus + timeScore + processScore);
    return { missionScore, optionalBonus, timeScore, processScore, total };
  }, [requiredCompleted, optionalCompleted, startedAt, elapsedMinutes, processCheckCount, maxChallengeMinutes, processCheckDefs.length, requiredMissionIds.length]);

  const reportPayload = useMemo(
    () => ({
      generatedAt: new Date().toISOString(),
      challenge: currentTheme.labels?.capstoneTitle ?? 'Capstone Challenge',
      candidateName,
      startedAt,
      endedAt,
      elapsedMinutes: Number(elapsedMinutes.toFixed(2)),
      requiredMissionIds,
      optionalMissionIds,
      requiredCompleted,
      optionalCompleted,
      processChecks,
      scoreBreakdown,
      incidentSummary,
      rootCauseSummary,
      preventionActions,
      recentFaultAttempts: state.faultAttempts.slice(0, 10)
    }),
    [candidateName, startedAt, endedAt, elapsedMinutes, requiredCompleted, optionalCompleted,
     processChecks, scoreBreakdown, incidentSummary, rootCauseSummary, preventionActions,
     state.faultAttempts, requiredMissionIds, optionalMissionIds, currentTheme.labels?.capstoneTitle]
  );

  if (!enabled) return <Navigate to={`/${currentTheme.id}/dashboard`} replace />;

  const pageTitle = currentTheme.labels?.capstoneTitle ?? 'Capstone Challenge';

  const downloadReport = () => {
    const blob = new Blob([JSON.stringify(reportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `capstone-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card title={pageTitle}>
        <p className="text-sm text-theme-secondary">
          Timed, evidence-oriented capstone assessment. Scores mission completion, process discipline, and time-to-completion.
        </p>
        <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-200">Practice Capstone Shell — Not Formally Validated</p>
          <p className="mt-1 text-xs text-theme-secondary">
            This score is useful for self-practice, coaching, and internal training discussion. It is not a formally validated certification or independently proctored assessment.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={candidateName}
            onChange={(event) => setCandidateName(event.target.value)}
            placeholder="Candidate name"
            className="rounded border border-theme-border bg-theme-panel px-3 py-2 text-xs text-theme-text"
          />
          <button
            type="button"
            onClick={() => { setStartedAt(new Date().toISOString()); setEndedAt(null); }}
            className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            Start / Restart Timer
          </button>
          <button
            type="button"
            onClick={() => setEndedAt(new Date().toISOString())}
            disabled={!startedAt}
            className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            Stop Timer
          </button>
          <span className="rounded border border-theme-border px-2 py-1 text-xs text-theme-secondary">
            Elapsed: {elapsedMinutes.toFixed(1)} min
          </span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <Card title="Capstone Workflow" className="space-y-3">
            <p className="text-xs text-theme-secondary">
              Work through the capstone systematically: define the situation, gather evidence, identify root cause, then document actions and prevention.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              {(['Symptom', ...faultDomains.slice(0, 2), 'Actions'] as string[]).map((domain, i) => (
                <div key={domain} className="rounded border border-theme-border bg-theme-base p-2">
                  <p className={`font-semibold ${['text-amber-300','text-sky-300','text-emerald-300','text-violet-300'][i % 4]}`}>{domain}</p>
                  <p className="mt-1 text-theme-secondary">
                    {i === 0 ? 'Observed vs expected outcome'
                     : i === faultDomains.slice(0, 2).length + 1 ? 'Checklist discipline + corrective/preventive actions'
                     : faultDomains[i - 1]}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Required Challenge Tasks">
            <p className="text-xs text-theme-secondary">
              Complete these practical missions. This shell reads your mission completion state.
            </p>
            <div className="mt-3 space-y-2">
              {requiredMissionIds.map((missionId) => (
                <div key={missionId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-theme-border bg-theme-base p-2">
                  <span className="text-xs text-theme-text">{missionTitles[missionId] ?? missionId}</span>
                  <span className={`text-xs ${state.simulatorMissionsCompleted[missionId] ? 'text-emerald-300' : 'text-theme-secondary'}`}>
                    {state.simulatorMissionsCompleted[missionId] ? 'Complete' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {optionalMissionIds.length > 0 && (
            <Card title="Optional Bonus Task">
              {optionalMissionIds.map((missionId) => (
                <div key={missionId} className="flex items-center justify-between rounded border border-theme-border bg-theme-base p-2">
                  <span className="text-xs text-theme-text">{missionTitles[missionId] ?? missionId}</span>
                  <span className={`text-xs ${state.simulatorMissionsCompleted[missionId] ? 'text-emerald-300' : 'text-theme-secondary'}`}>
                    {state.simulatorMissionsCompleted[missionId] ? 'Complete (+5 bonus)' : 'Pending'}
                  </span>
                </div>
              ))}
            </Card>
          )}

          <Card title="Process Discipline Checklist">
            <div className="space-y-2">
              {processCheckDefs.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 rounded border border-theme-border bg-theme-base p-2 text-xs text-theme-text">
                  <input
                    type="checkbox"
                    checked={processChecks[key] ?? false}
                    onChange={(event) =>
                      setProcessChecks((prev) => ({ ...prev, [key]: event.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </Card>

          <Card title="Incident Report Fields">
            <div className="space-y-3">
              <textarea
                value={incidentSummary}
                onChange={(event) => setIncidentSummary(event.target.value)}
                placeholder="Symptom / incident summary"
                className="h-24 w-full rounded border border-theme-border bg-theme-panel p-2 text-xs text-theme-text"
              />
              <textarea
                value={rootCauseSummary}
                onChange={(event) => setRootCauseSummary(event.target.value)}
                placeholder="Root cause summary"
                className="h-24 w-full rounded border border-theme-border bg-theme-panel p-2 text-xs text-theme-text"
              />
              <textarea
                value={preventionActions}
                onChange={(event) => setPreventionActions(event.target.value)}
                placeholder="Corrective and preventive actions"
                className="h-24 w-full rounded border border-theme-border bg-theme-panel p-2 text-xs text-theme-text"
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Capstone Score Report">
            <div className="mb-3 rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-theme-secondary">
              Practice scoring aid only. Useful for tracking training progress, but not a validated certification result.
            </div>
            <div className="space-y-2 text-xs">
              <p className="text-theme-secondary">Required missions: <span className="text-amber-300">{requiredCompleted}/{requiredMissionIds.length}</span> ({scoreBreakdown.missionScore}/60)</p>
              <p className="text-theme-secondary">Optional bonus: <span className="text-amber-300">{scoreBreakdown.optionalBonus}/5</span></p>
              <p className="text-theme-secondary">Time score: <span className="text-amber-300">{scoreBreakdown.timeScore}/20</span></p>
              <p className="text-theme-secondary">Process score: <span className="text-amber-300">{scoreBreakdown.processScore}/20</span></p>
              <p className="mt-2 text-lg font-semibold text-emerald-300">Total: {scoreBreakdown.total}/100</p>
            </div>
            <div className="mt-3 rounded border border-theme-border bg-theme-base p-3 text-xs text-theme-secondary">
              <p className="font-semibold text-theme-secondary">Practice guidance bands</p>
              <p className="mt-1">90+: Strong training result for internal coaching review</p>
              <p>75–89: Good base; improve process discipline / repeatability</p>
              <p>&lt;75: Repeat targeted missions and adaptive review before retake</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadReport}
                className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Download Practice Report JSON
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text"
              >
                Print / Save PDF
              </button>
            </div>
          </Card>

          <Card title="Recent Practice Evidence">
            <div className="space-y-2 text-xs text-theme-secondary">
              {state.faultAttempts.length === 0 ? (
                <p>No attempts recorded yet.</p>
              ) : (
                state.faultAttempts.slice(0, 8).map((attempt, idx) => (
                  <p key={`${attempt.at}-${idx}`}>
                    {new Date(attempt.at).toLocaleString()} | Stage {attempt.stageId} | {attempt.correct ? 'Correct' : 'Incorrect'} | {attempt.faultId}
                  </p>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
