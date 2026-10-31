// ─── SopCreatePage — standalone SOP creation for Studio ──────────────────────
// Workplace context intake → SOP intake → create + generate → completion.

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { WorkplaceIntakePanel } from './components/WorkplaceIntakePanel';
import type { SopConfig } from './components/WorkplaceIntakePanel';
import { GenerationProgress, type StepProgress } from './components/GenerationProgress';
import {
  createSop,
  uploadSopSourceDocument,
  startSopGenerationStream,
} from '../../lib/api/client';

type Phase = 'intake' | 'creating' | 'generating' | 'complete' | 'error';

export function SopCreatePage() {
  const { getToken } = useAuth();

  const [phase, setPhase] = useState<Phase>('intake');
  const [sopConfig, setSopConfig] = useState<SopConfig | null>(null);
  const [steps, setSteps] = useState<StepProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [completedSopId, setCompletedSopId] = useState<string | null>(null);

  // ─── Handle intake submit (SOP-only: classification done, now create SOP) ─

  const handleSubmit = useCallback(async () => {
    if (!sopConfig) return;

    const token = await getToken();
    if (!token) {
      setError('No auth token — sign in and retry.');
      setPhase('error');
      return;
    }

    setPhase('creating');
    setStatusMessage('Creating SOP record…');

    // 1. Create SOP record
    const createRes = await createSop(token, {
      title: sopConfig.procedureName,
      procedureName: sopConfig.procedureName,
      equipment: sopConfig.equipment,
      // workplace/regulatory context is loaded from DB by the backend
      workplaceContext: {},
      regulatoryClassification: {},
    });

    if (!createRes.ok) {
      setError(`Create failed: ${createRes.error}`);
      setPhase('error');
      return;
    }

    const sopId = createRes.data.id;

    // 2. Upload source documents
    setStatusMessage(`Uploading ${sopConfig.files.length} source document(s)…`);
    for (const entry of sopConfig.files) {
      const uploadRes = await uploadSopSourceDocument(token, sopId, entry.file, entry.docType);
      if (!uploadRes.ok) {
        setError(`Upload failed: ${uploadRes.error}`);
        setPhase('error');
        return;
      }
    }

    // 3. Start generation SSE
    setPhase('generating');
    setStatusMessage(null);
    setSteps([
      { key: 'sop_extract', status: 'pending' },
      { key: 'sop_structure', status: 'pending' },
      { key: 'sop_regulatory', status: 'pending' },
      { key: 'sop_assemble', status: 'pending' },
    ]);

    const controller = new AbortController();
    try {
      await startSopGenerationStream(token, sopId, (event) => {
        if (event.event === 'step_started' && event.stepKey) {
          setSteps((prev) =>
            prev.map((s) => (s.key === event.stepKey ? { ...s, status: 'running' } : s))
          );
        } else if (event.event === 'step_done' && event.stepKey) {
          setSteps((prev) =>
            prev.map((s) => (s.key === event.stepKey ? { ...s, status: 'done' } : s))
          );
        } else if (event.event === 'step_error' && event.stepKey) {
          setSteps((prev) =>
            prev.map((s) =>
              s.key === event.stepKey ? { ...s, status: 'error', error: event.error } : s
            )
          );
        } else if (event.event === 'job_complete') {
          setCompletedSopId(sopId);
          setPhase('complete');
        } else if (event.event === 'job_failed') {
          setError(event.error ?? 'SOP generation failed');
          setPhase('error');
        }
      }, controller.signal);

      // If SSE ended without terminal event
      if (phase !== 'complete' && phase !== 'error') {
        setCompletedSopId(sopId);
        setPhase('complete');
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'SOP generation failed');
        setPhase('error');
      }
    }
  }, [sopConfig, getToken, phase]);

  // ─── WorkplaceIntakePanel onSubmit — triggers SOP creation flow ────────────

  const handleIntakeSubmit = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

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
        {breadcrumb('New SOP')}
        <WorkplaceIntakePanel
          onSubmit={handleIntakeSubmit}
          apiKey=""
          sopMode="sop"
          onSopConfigChange={setSopConfig}
        />
      </div>
    );
  }

  // ─── Render: Creating ──────────────────────────────────────────────────────

  if (phase === 'creating') {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-10 px-4">
        <div className="rounded-xl border border-violet-500/30 bg-theme-panel px-6 py-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">Preparing SOP</p>
          <p className="text-sm text-theme-secondary">{statusMessage ?? 'Initialising…'}</p>
          <div className="flex gap-2 pt-1">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500" />
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500" style={{ animationDelay: '0.2s' }} />
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Generating / Error ────────────────────────────────────────────

  if (phase === 'generating' || phase === 'error') {
    return (
      <div>
        {breadcrumb('Generating SOP')}
        <GenerationProgress steps={steps} error={error} title="SOP Generation in progress…" />
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
          <h2 className="text-lg font-bold text-theme-text">SOP Generated</h2>
        </div>

        <p className="text-xs text-theme-muted">
          Status: <span className="text-amber-300 font-medium">In Review</span> — review, attest, and deploy.
        </p>

        <div className="flex items-center gap-3 pt-2">
          {completedSopId && (
            <Link
              to={`/audit/sops/${completedSopId}/review`}
              className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
            >
              Open SOP Review
            </Link>
          )}
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
