import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { defaultInputs, initialEngineState, scanTick } from '../simulator/engine';
import type { FaultId } from '../../types/simulator';
import { buildMissionSet, evaluateMissionOutcome } from '../../lib/training-core/simulator';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { resolveToolAvailability } from '../../lib/training-core/tooling';
import { useProgress } from '../progress/ProgressContext';

// ─── PLC fault campaign types ─────────────────────────────────────────────────
type CampaignScenario = {
  id: string;
  title: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  symptom: string;
  faults: FaultId[];
  expectedDiagnosis: FaultId;
  stateLines: string[];
  maxSeconds: number;
};

// ─── Regulatory breach drill types ───────────────────────────────────────────
type RegulatoryScenario = {
  id: string;
  symptomDescription: string;
  injectedIssues: string[];
  compound: boolean;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  expectedReasoningPath: string[];
  successCriteria: string[];
  scoreRange: { min: number; max: number };
};

const runScenarioSnapshot = (faultSelection: FaultId | FaultId[], script: (ctx: {
  pulse: (key: 'I_Start' | 'I_Stop' | 'I_Pulse' | 'I_Reset' | 'I_AckAlarm') => void;
  setInterlock: (closed: boolean) => void;
  tick: (count?: number) => void;
}) => void) => {
  let inputs = { ...defaultInputs };
  let state = initialEngineState;
  let last = scanTick(state, inputs, 0, faultSelection);
  state = last.state;
  const tick = (count = 1) => {
    for (let i = 0; i < count; i += 1) {
      last = scanTick(state, inputs, 100, faultSelection);
      state = last.state;
    }
  };
  const pulse = (key: 'I_Start' | 'I_Stop' | 'I_Pulse' | 'I_Reset' | 'I_AckAlarm') => {
    inputs = { ...inputs, [key]: true };
    tick(1);
    inputs = { ...inputs, [key]: false };
    tick(1);
  };
  script({
    pulse,
    setInterlock: (closed) => {
      inputs = { ...inputs, I_Interlock: closed };
      tick(1);
    },
    tick
  });
  return { state, last, inputs };
};

// ─── Regulatory Breach Identification Drill ───────────────────────────────────
type RegScenarioResult = {
  scenarioId: string;
  selfCorrect: boolean;
  scoreAwarded: number;
};

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: 'text-emerald-300',
  intermediate: 'text-amber-300',
  advanced: 'text-rose-300'
};

const RegulatoryBreachDrill = ({
  scenarios,
  pageTitle
}: {
  scenarios: RegulatoryScenario[];
  pageTitle: string;
}) => {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<RegScenarioResult[]>([]);

  const scenario = scenarios[index];
  const allDone = started && index >= scenarios.length;

  const totalScore = results.reduce((sum, r) => sum + r.scoreAwarded, 0);
  const maxScore = scenarios.reduce((sum, s) => sum + s.scoreRange.max, 0);
  const correctCount = results.filter((r) => r.selfCorrect).length;

  const handleSelfAssess = (correct: boolean) => {
    if (!scenario) return;
    const score = correct ? scenario.scoreRange.max : scenario.scoreRange.min;
    setResults((prev) => [
      ...prev,
      { scenarioId: scenario.id, selfCorrect: correct, scoreAwarded: score }
    ]);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  if (!started) {
    return (
      <div className="space-y-4">
        <Card title={pageTitle}>
          <p className="text-sm text-theme-secondary">
            Regulatory breach identification drill — {scenarios.length} workplace scenario
            {scenarios.length !== 1 ? 's' : ''}. Read each scenario, identify the regulatory
            duty breach, then self-assess against the model answer.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded border border-theme-border bg-theme-base p-2">
              <p className="text-theme-muted">Scenarios</p>
              <p className="font-semibold text-theme-text">{scenarios.length}</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-base p-2">
              <p className="text-theme-muted">Format</p>
              <p className="font-semibold text-theme-text">Self-assessed</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-base p-2">
              <p className="text-theme-muted">Max score</p>
              <p className="font-semibold text-amber-300">{maxScore}</p>
            </div>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                setStarted(true);
                setIndex(0);
                setResults([]);
                setRevealed(false);
              }}
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Start Drill
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (allDone) {
    return (
      <div className="space-y-4">
        <Card title="Drill Complete">
          <p className="text-sm text-theme-secondary">
            Score: <span className="font-semibold text-amber-300">{totalScore}</span> / {maxScore}
          </p>
          <p className="mt-1 text-xs text-theme-secondary">
            Correctly self-assessed: {correctCount}/{scenarios.length}
          </p>
          <div className="mt-3 space-y-2 text-xs">
            {results.map((result, idx) => {
              const meta = scenarios.find((s) => s.id === result.scenarioId);
              return (
                <div
                  key={result.scenarioId}
                  className={`rounded border p-2 ${result.selfCorrect ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}
                >
                  <p className="font-semibold text-theme-text">
                    {idx + 1}. Scenario {result.scenarioId}
                  </p>
                  <p className="text-theme-secondary">
                    {result.selfCorrect ? 'Identified correctly' : 'Missed'} · Score:{' '}
                    {result.scoreAwarded}
                  </p>
                  {meta?.injectedIssues?.[0] ? (
                    <p className="mt-1 text-theme-muted line-clamp-1">
                      Key issue: {meta.injectedIssues[0]}
                    </p>
                  ) : null}
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
                setRevealed(false);
              }}
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Restart Drill
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (!scenario) return null;

  return (
    <div className="space-y-4">
      <Card title={`${pageTitle} — Scenario ${index + 1} / ${scenarios.length}`}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={`font-semibold uppercase ${DIFFICULTY_COLOR[scenario.difficulty] ?? 'text-theme-secondary'}`}>
            {scenario.difficulty}
          </span>
          {scenario.compound ? (
            <span className="rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-amber-200">
              Compound scenario
            </span>
          ) : null}
        </div>

        <div className="mt-3 rounded border border-sky-500/20 bg-sky-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Workplace Scenario</p>
          <p className="mt-2 text-sm text-theme-text">{scenario.symptomDescription}</p>
        </div>

        {!revealed ? (
          <div className="mt-4">
            <p className="text-xs text-theme-secondary">
              Review the scenario. Identify any regulatory duty breaches, then reveal the model answer.
            </p>
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-2 rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Reveal Regulatory Analysis
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded border border-rose-500/20 bg-rose-500/5 p-3 text-xs">
              <p className="font-semibold text-rose-300">Regulatory Breaches Identified</p>
              <ol className="mt-2 space-y-1 text-theme-secondary">
                {scenario.injectedIssues.map((issue, i) => (
                  <li key={i}>{i + 1}. {issue}</li>
                ))}
              </ol>
            </div>

            {scenario.expectedReasoningPath.length > 0 ? (
              <div className="rounded border border-theme-border bg-theme-base p-3 text-xs">
                <p className="font-semibold text-amber-300">Expected Reasoning Path</p>
                <ol className="mt-2 space-y-1 text-theme-secondary">
                  {scenario.expectedReasoningPath.map((step, i) => (
                    <li key={i}>{i + 1}. {step}</li>
                  ))}
                </ol>
              </div>
            ) : null}

            {scenario.successCriteria.length > 0 ? (
              <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
                <p className="font-semibold text-emerald-300">Success Criteria</p>
                <ul className="mt-2 space-y-1 text-theme-secondary">
                  {scenario.successCriteria.map((criterion, i) => (
                    <li key={i}>• {criterion}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded border border-theme-border bg-theme-base p-3">
              <p className="text-xs font-semibold text-theme-text">Self-Assessment</p>
              <p className="mt-1 text-xs text-theme-secondary">
                Did you identify the key regulatory breach{scenario.injectedIssues.length > 1 ? 'es' : ''} before revealing?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSelfAssess(true)}
                  className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Yes — I identified it (+{scenario.scoreRange.max})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelfAssess(false)}
                  className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
                >
                  No — I missed it (+{scenario.scoreRange.min})
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── PLC scenario result type ─────────────────────────────────────────────────
type ScenarioResult = {
  scenarioId: string;
  correct: boolean;
  selectedFaultId: FaultId;
  elapsedMs: number;
};

export const FaultCampaignPage = () => {
  const { currentThemeId, currentTheme } = useTheme();
  const { state, awardAchievement, saveFaultCampaignRun } = useProgress();

  const allScenarios = (currentTheme.simulatorData?.faults ?? []) as (CampaignScenario | RegulatoryScenario)[];

  // Detect which mode based on the data format
  const plcCampaigns = allScenarios.filter(
    (s): s is CampaignScenario => Array.isArray((s as CampaignScenario).stateLines)
  );
  const regulatoryScenarios = allScenarios.filter(
    (s): s is RegulatoryScenario => typeof (s as RegulatoryScenario).symptomDescription === 'string'
  );

  const toolAvailability = resolveToolAvailability(currentTheme);
  const hasPlcMode = toolAvailability.faultCampaign && plcCampaigns.length > 0;
  const hasRegulatoryMode = regulatoryScenarios.length > 0;

  const enabled = hasPlcMode || hasRegulatoryMode;

  // ─── All hooks before conditional return ───────────────────────────────────
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [selectedFaultId, setSelectedFaultId] = useState<FaultId>(
    () => (plcCampaigns[0]?.expectedDiagnosis ?? 'start_stuck_off') as FaultId
  );
  const [results, setResults] = useState<ScenarioResult[]>([]);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const scenarioStartRef = useRef<number | null>(null);

  const scenario = plcCampaigns[index];
  const allDone = started && index >= plcCampaigns.length;
  const elapsedMs = scenarioStartRef.current ? nowMs - scenarioStartRef.current : 0;

  useEffect(() => {
    if (!started || allDone) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [started, allDone]);

  const missionSet = useMemo(() => buildMissionSet(currentThemeId), [currentThemeId]);
  const faultCatalog = missionSet.faults;

  const score = useMemo(() => {
    return results.reduce((sum, result) => {
      const scenarioMeta = plcCampaigns.find((s) => s.id === result.scenarioId);
      if (!scenarioMeta) return sum;
      const outcome = evaluateMissionOutcome(result, (attempt) => {
        const typedAttempt = attempt as { correct: boolean; elapsedMs: number };
        const correctPoints = typedAttempt.correct ? 70 : 0;
        const timeBudgetMs = scenarioMeta.maxSeconds * 1000;
        const timePoints = typedAttempt.correct
          ? Math.max(0, 30 - Math.round((Math.min(typedAttempt.elapsedMs, timeBudgetMs) / timeBudgetMs) * 30))
          : 0;
        return {
          score: correctPoints + timePoints,
          passed: typedAttempt.correct,
          feedback: typedAttempt.correct ? 'Correct diagnosis' : 'Incorrect diagnosis'
        };
      });
      return sum + outcome.score;
    }, 0);
  }, [results, plcCampaigns]);

  if (!enabled) return <Navigate to={`/${currentTheme.id}/dashboard`} replace />;

  // ─── Regulatory mode — delegate to dedicated component ────────────────────
  if (!hasPlcMode && hasRegulatoryMode) {
    return (
      <RegulatoryBreachDrill
        scenarios={regulatoryScenarios}
        pageTitle={currentTheme.labels?.faultCampaignTitle ?? 'Regulatory Breach Identification Drill'}
      />
    );
  }

  // ─── PLC fault campaign mode ──────────────────────────────────────────────
  const firstFaultId = (plcCampaigns[0]?.expectedDiagnosis ?? 'start_stuck_off') as FaultId;
  const pageTitle = currentTheme.labels?.faultCampaignTitle ?? 'Fault Campaign';

  const startCampaign = () => {
    setStarted(true);
    setIndex(0);
    setResults([]);
    setSelectedFaultId(firstFaultId);
    scenarioStartRef.current = Date.now();
    setNowMs(Date.now());
  };

  const submitDiagnosis = () => {
    if (!scenario) return;
    const elapsed = Math.max(0, Date.now() - (scenarioStartRef.current ?? Date.now()));
    const nextResults = [
      ...results,
      {
        scenarioId: scenario.id,
        correct: selectedFaultId === scenario.expectedDiagnosis,
        selectedFaultId,
        elapsedMs: elapsed
      }
    ];
    setResults(nextResults);
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (nextIndex >= plcCampaigns.length) {
      const correctCount = nextResults.filter((r) => r.correct).length;
      const finalScore = nextResults.reduce((sum, result) => {
        const meta = plcCampaigns.find((s) => s.id === result.scenarioId);
        if (!meta) return sum;
        const outcome = evaluateMissionOutcome(result, (attempt) => {
          const typedAttempt = attempt as { correct: boolean; elapsedMs: number };
          if (!typedAttempt.correct) {
            return { score: 0, passed: false, feedback: 'Incorrect diagnosis' };
          }
          const timeBudgetMs = meta.maxSeconds * 1000;
          const timePoints = Math.max(0, 30 - Math.round((Math.min(typedAttempt.elapsedMs, timeBudgetMs) / timeBudgetMs) * 30));
          return { score: 70 + timePoints, passed: true, feedback: 'Correct diagnosis' };
        });
        return sum + outcome.score;
      }, 0);
      saveFaultCampaignRun(finalScore, correctCount);
      if (correctCount >= Math.ceil(plcCampaigns.length * 0.8)) {
        awardAchievement('fault_finder_campaign');
      }
    } else {
      scenarioStartRef.current = Date.now();
      setNowMs(Date.now());
    }
  };

  const faultOptions = faultCatalog.map((f) => ({ id: f.id, label: f.label }));
  const previousRun = state.faultCampaign;

  return (
    <div className="space-y-4">
      <Card title={pageTitle}>
        <p className="text-sm text-theme-secondary">
          Structured escalating campaign: {plcCampaigns.length} scenarios scored on correct diagnosis and time.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded border border-theme-border bg-theme-base p-2">
            <p className="text-theme-muted">Scenarios</p>
            <p className="font-semibold text-theme-text">{plcCampaigns.length}</p>
          </div>
          <div className="rounded border border-theme-border bg-theme-base p-2">
            <p className="text-theme-muted">Best Score</p>
            <p className="font-semibold text-amber-300">{previousRun?.bestScore ?? '—'}</p>
          </div>
          <div className="rounded border border-theme-border bg-theme-base p-2">
            <p className="text-theme-muted">Badge</p>
            <p className={`font-semibold ${state.achievementFlags?.fault_finder_campaign ? 'text-emerald-300' : 'text-theme-secondary'}`}>
              {state.achievementFlags?.fault_finder_campaign ? 'Earned' : 'Not earned'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startCampaign}
            className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            {started ? 'Restart Campaign' : 'Start Campaign'}
          </button>
          <p className="text-xs text-theme-secondary">
            Badge threshold: {Math.ceil(plcCampaigns.length * 0.8)}/{plcCampaigns.length} correct. Time affects score, not badge eligibility.
          </p>
        </div>
      </Card>

      {!started ? null : allDone ? (
        <Card title="Campaign Results">
          <p className="text-sm text-theme-secondary">
            Final score: <span className="font-semibold text-amber-300">{score}</span> / {plcCampaigns.length * 100}
          </p>
          <p className="mt-1 text-xs text-theme-secondary">
            Correct diagnoses: {results.filter((r) => r.correct).length}/{plcCampaigns.length}
          </p>
          <div className="mt-3 space-y-2 text-xs">
            {results.map((result, idx) => {
              const meta = plcCampaigns[idx];
              return (
                <div key={result.scenarioId} className={`rounded border p-2 ${result.correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
                  <p className="font-semibold text-theme-text">{idx + 1}. {meta?.title ?? result.scenarioId}</p>
                  <p className="text-theme-secondary">
                    {result.correct ? 'Correct' : 'Incorrect'} · {Math.round(result.elapsedMs / 1000)}s · Selected: {faultCatalog.find((f) => f.id === result.selectedFaultId)?.label ?? result.selectedFaultId}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      ) : scenario ? (
        <Card title={`Scenario ${index + 1} / ${plcCampaigns.length}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-theme-text">{scenario.title}</p>
              <p className="mt-1 text-xs text-theme-secondary">{scenario.symptom}</p>
            </div>
            <div className="text-right text-xs">
              <p className={`font-semibold ${scenario.difficulty === 'advanced' ? 'text-rose-300' : scenario.difficulty === 'intermediate' ? 'text-amber-300' : 'text-emerald-300'}`}>
                {scenario.difficulty.toUpperCase()}
              </p>
              <p className={`${elapsedMs > scenario.maxSeconds * 1000 ? 'text-rose-300' : 'text-theme-secondary'}`}>
                {Math.round(elapsedMs / 1000)}s / {scenario.maxSeconds}s
              </p>
            </div>
          </div>
          <div className="mt-3 rounded border border-sky-500/20 bg-sky-500/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Telemetry Snapshot</p>
            <div className="mt-2 space-y-1 text-[11px] font-mono text-theme-secondary">
              {scenario.stateLines.map((line, idx) => (
                <p key={idx}>{line}</p>
              ))}
            </div>
          </div>
          {scenario.faults.length > 1 ? (
            <p className="mt-2 text-xs text-amber-200">
              Compound scenario: diagnose the primary root cause that best explains the current symptom first.
            </p>
          ) : null}
          <div className="mt-3 grid gap-2">
            {faultOptions.map((fault) => (
              <label key={fault.id} className="flex items-center gap-2 rounded border border-theme-border bg-theme-base p-2 text-xs text-theme-secondary">
                <input
                  type="radio"
                  name={`campaign-${scenario.id}`}
                  checked={selectedFaultId === fault.id}
                  onChange={() => setSelectedFaultId(fault.id as FaultId)}
                />
                {fault.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={submitDiagnosis}
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Submit Diagnosis
            </button>
            <p className="text-xs text-theme-muted">
              Score = correctness + time. Campaign is repeatable.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
};

// Re-export the helper so theme data files can use it to pre-compute scenario snapshots.
export { runScenarioSnapshot };
