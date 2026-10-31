import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useTheme } from '../../lib/training-core/ThemeContext';
import type { TrainingMission } from '../../lib/training-core/types';

type MissionResult = {
  missionId: string;
  choiceIndex: number;
  score: number;
  passed: boolean;
};

export const DutyHolderAssessmentPage = () => {
  const { currentTheme } = useTheme();
  const missions = (currentTheme.missions ?? []) as TrainingMission[];

  // Only show missions that have branches (compliance decision points)
  const assessmentMissions = missions.filter(
    (m) => Array.isArray(m.branches) && m.branches.length > 0
  );

  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<MissionResult[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  if (assessmentMissions.length === 0) {
    return <Navigate to={`/${currentTheme.id}/dashboard`} replace />;
  }

  const mission = assessmentMissions[index];
  const allDone = started && index >= assessmentMissions.length;

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxScore = assessmentMissions.reduce((sum, m) => {
    const branches = m.branches ?? [];
    return sum + Math.max(...branches.map((b) => b.score), 0);
  }, 0);
  const passedCount = results.filter((r) => r.passed).length;

  const handleReveal = () => {
    if (selectedChoice === null) return;
    setRevealed(true);
  };

  const handleNext = () => {
    if (!mission || selectedChoice === null) return;
    const branch = mission.branches?.[selectedChoice];
    if (!branch) return;
    const maxBranchScore = Math.max(...(mission.branches ?? []).map((b) => b.score));
    setResults((prev) => [
      ...prev,
      {
        missionId: mission.id,
        choiceIndex: selectedChoice,
        score: branch.score,
        passed: branch.score >= maxBranchScore
      }
    ]);
    setSelectedChoice(null);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  if (!started) {
    return (
      <div className="space-y-4">
        <Card title="Duty Holder Compliance Assessment">
          <p className="text-sm text-theme-secondary">
            Scenario-based assessment of duty holder obligations. Each scenario presents a
            workplace situation — select the response that best fulfils the relevant regulatory
            duty and review the compliance rationale.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded border border-theme-border bg-theme-base p-2">
              <p className="text-theme-muted">Scenarios</p>
              <p className="font-semibold text-theme-text">{assessmentMissions.length}</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-base p-2">
              <p className="text-theme-muted">Max score</p>
              <p className="font-semibold text-amber-300">{maxScore}</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-base p-2">
              <p className="text-theme-muted">Format</p>
              <p className="font-semibold text-theme-text">Scenario + choice</p>
            </div>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                setStarted(true);
                setIndex(0);
                setResults([]);
                setSelectedChoice(null);
                setRevealed(false);
              }}
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Start Assessment
            </button>
          </div>
        </Card>

        {/* Mission preview list */}
        <Card title="Assessment Scenarios">
          <div className="space-y-2 text-xs">
            {assessmentMissions.map((m, idx) => (
              <div
                key={m.id}
                className="rounded border border-theme-border bg-theme-base p-3"
              >
                <p className="font-semibold text-theme-text">
                  {idx + 1}. {m.title}
                </p>
                {m.description ? (
                  <p className="mt-1 text-theme-secondary line-clamp-2">{m.description}</p>
                ) : null}
                {m.stageMin !== undefined || m.stageMax !== undefined ? (
                  <p className="mt-1 text-theme-muted">
                    Stage {m.stageMin ?? '?'}
                    {m.stageMax !== undefined && m.stageMax !== m.stageMin ? `–${m.stageMax}` : ''}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (allDone) {
    const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    return (
      <div className="space-y-4">
        <Card title="Assessment Complete">
          <p className="text-sm text-theme-secondary">
            Score: <span className="font-semibold text-amber-300">{totalScore}</span> / {maxScore}{' '}
            ({pct}%)
          </p>
          <p className="mt-1 text-xs text-theme-secondary">
            Best-practice responses: {passedCount}/{assessmentMissions.length}
          </p>
          {pct >= 80 ? (
            <p className="mt-2 text-xs text-emerald-300">
              Competent — demonstrates understanding of duty holder obligations.
            </p>
          ) : pct >= 60 ? (
            <p className="mt-2 text-xs text-amber-300">
              Developing — review the rationale for missed scenarios before re-sitting.
            </p>
          ) : (
            <p className="mt-2 text-xs text-rose-300">
              Further study required — return to the relevant lessons before re-sitting.
            </p>
          )}

          <div className="mt-4 space-y-2 text-xs">
            {results.map((result, idx) => {
              const m = assessmentMissions.find((m) => m.id === result.missionId);
              const branch = m?.branches?.[result.choiceIndex];
              return (
                <div
                  key={result.missionId}
                  className={`rounded border p-3 ${
                    result.passed
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-amber-500/30 bg-amber-500/5'
                  }`}
                >
                  <p className="font-semibold text-theme-text">
                    {idx + 1}. {m?.title ?? result.missionId}
                  </p>
                  <p className="mt-1 text-theme-secondary">
                    Your choice: {branch?.choice ?? '—'}
                  </p>
                  {branch?.feedback ? (
                    <p className="mt-1 text-theme-secondary">{branch.feedback}</p>
                  ) : null}
                  <p className={`mt-1 ${result.passed ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {result.passed ? 'Best-practice response' : 'Sub-optimal response'} · {result.score} pts
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                setStarted(false);
                setIndex(0);
                setResults([]);
                setSelectedChoice(null);
                setRevealed(false);
              }}
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Restart Assessment
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (!mission) return null;

  const branches = mission.branches ?? [];
  const selectedBranch = selectedChoice !== null ? branches[selectedChoice] : null;
  const maxBranchScore = Math.max(...branches.map((b) => b.score), 0);

  return (
    <div className="space-y-4">
      <Card title={`Duty Holder Compliance Assessment — Scenario ${index + 1} / ${assessmentMissions.length}`}>
        <div className="rounded border border-sky-500/20 bg-sky-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
            {mission.title}
          </p>
          <p className="mt-2 text-sm text-theme-text">{mission.description}</p>
          {mission.whyItMatters ? (
            <p className="mt-2 text-xs text-theme-secondary">
              Regulatory significance: {mission.whyItMatters}
            </p>
          ) : null}
        </div>

        {!revealed ? (
          <>
            <p className="mt-4 text-xs font-semibold text-theme-secondary">
              As the duty holder, which response best fulfils your regulatory obligations?
            </p>
            <div className="mt-2 space-y-2">
              {branches.map((branch, i) => (
                <label
                  key={i}
                  className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-xs transition-colors ${
                    selectedChoice === i
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-100'
                      : 'border-theme-border bg-theme-base text-theme-secondary hover:border-theme-border'
                  }`}
                >
                  <input
                    type="radio"
                    name={`mission-${mission.id}`}
                    checked={selectedChoice === i}
                    onChange={() => setSelectedChoice(i)}
                    className="mt-0.5 shrink-0"
                  />
                  {branch.choice}
                </label>
              ))}
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={handleReveal}
                disabled={selectedChoice === null}
                className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Response
              </button>
            </div>
          </>
        ) : selectedBranch ? (
          <>
            <div className="mt-4 space-y-3">
              <div className={`rounded border p-3 text-xs ${
                selectedBranch.score >= maxBranchScore
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-amber-500/30 bg-amber-500/5'
              }`}>
                <p className="font-semibold text-theme-text">Your response:</p>
                <p className="mt-1 text-theme-secondary">{selectedBranch.choice}</p>
                <p className={`mt-2 font-semibold ${
                  selectedBranch.score >= maxBranchScore ? 'text-emerald-300' : 'text-amber-300'
                }`}>
                  {selectedBranch.score >= maxBranchScore ? 'Best-practice response' : 'Sub-optimal response'} · {selectedBranch.score} pts
                </p>
              </div>

              <div className="rounded border border-theme-border bg-theme-base p-3 text-xs">
                <p className="font-semibold text-amber-300">Compliance Rationale</p>
                <p className="mt-1 text-theme-secondary">{selectedBranch.feedback}</p>
              </div>

              <div className="rounded border border-theme-border bg-theme-base p-3 text-xs">
                <p className="font-semibold text-theme-secondary">Regulatory Outcome</p>
                <p className="mt-1 text-theme-secondary">{selectedBranch.outcome}</p>
              </div>
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={handleNext}
                className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              >
                {index + 1 < assessmentMissions.length ? 'Next Scenario →' : 'See Results'}
              </button>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
};
