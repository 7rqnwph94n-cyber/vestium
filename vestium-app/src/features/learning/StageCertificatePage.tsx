import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { useProgress } from '../progress/ProgressContext';
import { isStageUnlocked } from '../progress/gating';

const storageKey = 'training.certificateName';

export const StageCertificatePage = () => {
  const { currentTheme } = useTheme();
  const params = useParams();
  const stageId = Number(params.stageId);
  const stage = currentTheme.curriculum.find((s) => s.id === stageId);
  const { state } = useProgress();
  const [learnerName, setLearnerName] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) setLearnerName(saved);
  }, []);

  if (!stage) return <Navigate to="/" replace />;
  if (!isStageUnlocked(state, stage.id)) return <Navigate to="/" replace />;

  const passed = Boolean(state.stageTestsPassed[stage.id]);
  const score = state.stageTestScores[stage.id] ?? null;
  const issueDate = useMemo(
    () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    []
  );

  const onNameChange = (value: string) => {
    setLearnerName(value);
    window.localStorage.setItem(storageKey, value);
  };

  if (!passed) {
    return (
      <div className="space-y-4">
        <Card title="Stage Completion Certificate">
          <p className="text-sm text-theme-secondary">
            Certificate is available after passing the Stage {stage.id} test.
          </p>
          <div className="mt-3">
            <Link
              to={`/stage/${stage.id}`}
              className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text"
            >
              Back to Stage
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Stage Completion Certificate (Training)">
        <p className="text-xs text-theme-secondary">
          Printable training certificate for completed stage work. Use browser Print and select “Save as PDF” if needed.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-theme-secondary">Learner Name</span>
            <input
              value={learnerName}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Enter learner name"
              className="w-full rounded border border-theme-border bg-theme-base px-3 py-2 text-sm text-theme-text placeholder:text-theme-muted"
            />
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Print / Save PDF
          </button>
        </div>
      </Card>

      <Card className="border-amber-500/30 bg-gradient-to-b from-slate-900 to-slate-950 print:shadow-none">
        <div className="rounded-lg border border-amber-500/30 p-6">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-amber-300">Training App</p>
          <h2 className="mt-3 text-center text-2xl font-semibold text-theme-text">
            Stage Completion Certificate
          </h2>
          <p className="mt-2 text-center text-sm text-theme-secondary">Training completion record for staged learning and simulator practice</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded border border-theme-border bg-theme-panel/70 p-4">
              <p className="text-xs uppercase tracking-wide text-theme-muted">Learner</p>
              <p className="mt-1 text-lg text-theme-text">{learnerName.trim() || '________________'}</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-panel/70 p-4">
              <p className="text-xs uppercase tracking-wide text-theme-muted">Date</p>
              <p className="mt-1 text-lg text-theme-text">{issueDate}</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-panel/70 p-4">
              <p className="text-xs uppercase tracking-wide text-theme-muted">Stage</p>
              <p className="mt-1 text-lg text-theme-text">
                Stage {stage.id}: {stage.title}
              </p>
            </div>
            <div className="rounded border border-theme-border bg-theme-panel/70 p-4">
              <p className="text-xs uppercase tracking-wide text-theme-muted">Stage Test Score</p>
              <p className="mt-1 text-lg text-emerald-300">{score}%</p>
            </div>
          </div>

          <div className="mt-6 rounded border border-theme-border bg-theme-base p-4 text-xs text-theme-secondary">
            This certificate records in-app stage completion and stage test performance. It is a training artifact, not an accredited qualification.
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Link
          to={`/stage/${stage.id}`}
          className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text"
        >
          Back to Stage
        </Link>
      </div>
    </div>
  );
};
