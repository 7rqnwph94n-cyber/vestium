// ─── ModuleCreatePage — streamlined module creation for Studio ───────────────
// Intake → Generation → Completion. Backend-only (no frontend pipeline).

import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { WorkplaceIntakePanel } from './components/WorkplaceIntakePanel';
import { GenerationProgress, type StepProgress } from './components/GenerationProgress';
import { useBackendGeneration } from './hooks/useBackendGeneration';
import { makeInitialJob } from './generator/types';
import type { DomainConfig } from './generator/types';

type Phase = 'intake' | 'generating' | 'complete' | 'error';

export function ModuleCreatePage() {
  const [phase, setPhase] = useState<Phase>('intake');
  const [steps, setSteps] = useState<StepProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = useState('');
  const startedRef = useRef(false);

  const bg = useBackendGeneration();

  // ─── Step state helpers ────────────────────────────────────────────────────

  const updateStep = useCallback((key: string, status: StepProgress['status'], err?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, status, error: err } : s))
    );
  }, []);

  // ─── Handle intake submit ──────────────────────────────────────────────────

  const handleSubmit = useCallback((config: DomainConfig) => {
    if (startedRef.current) return;
    startedRef.current = true;

    const job = makeInitialJob(config);
    setModuleTitle(config.domainPrompt.slice(0, 80));
    setSteps(job.stepSequence.map((key) => ({ key, status: 'pending' as const })));
    setPhase('generating');
    setError(null);

    void bg.startGeneration(job, {
      onStepStarted: (stepKey) => updateStep(stepKey, 'running'),
      onStepDone: (stepKey) => updateStep(stepKey, 'done'),
      onStepError: (stepKey, err) => updateStep(stepKey, 'error', err),
      onJobComplete: () => setPhase('complete'),
      onJobFailed: (err) => {
        setError(err);
        setPhase('error');
      },
    });
  }, [bg, updateStep]);

  // ─── Breadcrumb ────────────────────────────────────────────────────────────

  const breadcrumb = (label: string) => (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <nav className="text-xs text-theme-muted mb-4">
        <Link to="/studio" className="hover:text-theme-text transition-colors">Studio</Link>
        <span className="mx-1">/</span>
        <span className="text-theme-secondary">{label}</span>
      </nav>
    </div>
  );

  // ─── Render: Intake ────────────────────────────────────────────────────────

  if (phase === 'intake') {
    return (
      <div>
        {breadcrumb('New Module')}
        <WorkplaceIntakePanel
          onSubmit={handleSubmit}
          apiKey=""
        />
      </div>
    );
  }

  // ─── Render: Generating / Error ────────────────────────────────────────────

  if (phase === 'generating' || phase === 'error') {
    return (
      <div>
        {breadcrumb('Generating Module')}
        <GenerationProgress steps={steps} error={error} />
        {phase === 'error' && (
          <div className="mx-auto max-w-2xl px-4 flex gap-3">
            <Link
              to="/studio"
              className="rounded-lg border border-theme-border bg-theme-panel px-4 py-2 text-sm text-theme-secondary hover:text-theme-text transition-colors"
            >
              Return to Studio
            </Link>
          </div>
        )}
      </div>
    );
  }

  // ─── Render: Complete ──────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10 px-4">
      <div className="rounded-xl border border-emerald-500/40 bg-theme-panel px-6 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 text-lg">✓</span>
          <h2 className="text-lg font-bold text-theme-text">Module Generated</h2>
        </div>

        {moduleTitle && (
          <p className="text-sm text-theme-secondary">{moduleTitle}</p>
        )}

        <p className="text-xs text-theme-muted">
          Status: <span className="text-amber-300 font-medium">In Review</span> — open the Reviewer Portal to review, attest, and deploy.
        </p>

        <div className="flex items-center gap-3 pt-2">
          <Link
            to="/audit/reviewer"
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
          >
            Open Reviewer Portal
          </Link>
          <Link
            to="/studio"
            className="rounded-lg border border-theme-border bg-theme-panel px-4 py-2 text-sm text-theme-secondary hover:text-theme-text transition-colors"
          >
            Return to Studio
          </Link>
        </div>
      </div>
    </div>
  );
}
