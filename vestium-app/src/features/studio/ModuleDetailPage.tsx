// ─── ModuleDetailPage — single module status + actions ───────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { listModules, deleteModule } from '../../lib/api/client';
import type { ModuleRecord } from '@complianceforge/types';
import { ContentStatusChip, deriveContentStatus } from '../../components/ContentStatusChip';
import { mapGenerationMetadata } from '../../lib/mappers';

export function ModuleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [module, setModule] = useState<ModuleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      // No single-module GET endpoint exists — use list and filter
      const res = await listModules(token);
      if (cancelled) return;
      if (res.ok) {
        const found = res.data.find((m) => m.id === id);
        if (found) setModule(found);
        else setError('Module not found.');
      } else {
        setError('Failed to load module.');
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [id, getToken]);

  const handleDelete = useCallback(async () => {
    if (!id) return;
    const token = await getToken();
    if (!token) return;
    await deleteModule(token, id);
    navigate('/studio');
  }, [id, getToken, navigate]);

  if (loading) return <p className="py-10 text-center text-sm text-theme-muted">Loading…</p>;
  if (error || !module) {
    return (
      <div className="mx-auto max-w-2xl py-10 px-4 space-y-4">
        <p className="text-sm text-red-300">{error ?? 'Module not found.'}</p>
        <Link to="/studio" className="text-xs text-theme-secondary hover:text-theme-text">
          ← Back to Studio
        </Link>
      </div>
    );
  }

  const genMeta = mapGenerationMetadata(module.generationMetadata);
  const status = deriveContentStatus(module.status, genMeta);
  const regSchema = module.regulatoryClassification?.primarySchemaTitle;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6 px-4">
      {/* Breadcrumb */}
      <nav className="text-xs text-theme-muted">
        <Link to="/studio" className="hover:text-theme-text transition-colors">Studio</Link>
        <span className="mx-1">/</span>
        <span className="text-theme-secondary">{module.title}</span>
      </nav>

      {/* Header card */}
      <div className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
            Module
          </span>
          <ContentStatusChip status={status} />
        </div>

        <h1 className="text-lg font-bold text-theme-text">{module.title}</h1>

        <div className="flex flex-wrap items-center gap-3 text-xs text-theme-muted">
          {regSchema && <span>{regSchema}</span>}
          <span>Created {new Date(module.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {module.deployedAt && (
            <span>Deployed {new Date(module.deployedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          )}
          {module.contentHash && (
            <span className="font-mono text-[10px]">sha256:{module.contentHash.slice(0, 8)}…</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {status === 'in_review' && (
          <Link
            to="/audit/reviewer"
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
          >
            Open Reviewer Portal
          </Link>
        )}
        {status === 'deployed' && (
          <Link
            to={`/learn/${module.id}`}
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
          >
            View in Learn
          </Link>
        )}
        {(status === 'failed' || status === 'stale') && (
          <Link
            to="/studio/new/module"
            className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20"
          >
            Regenerate
          </Link>
        )}
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
        >
          Delete
        </button>
      </div>

      {/* Generation metadata */}
      {(genMeta.totalTokensUsed != null || genMeta.stepsCompleted != null || genMeta.failed) && (
        <div className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-theme-muted">Generation Metadata</h2>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            {genMeta.totalTokensUsed != null && (
              <div>
                <p className="text-[10px] text-theme-muted uppercase">Tokens Used</p>
                <p className="text-theme-text">{genMeta.totalTokensUsed.toLocaleString()}</p>
              </div>
            )}
            {genMeta.stepsCompleted != null && (
              <div>
                <p className="text-[10px] text-theme-muted uppercase">Steps</p>
                <p className="text-theme-text">{genMeta.stepsCompleted} / {genMeta.totalSteps ?? '?'}</p>
              </div>
            )}
            {genMeta.failed && (
              <div className="sm:col-span-2">
                <p className="text-[10px] text-red-400 uppercase">Error</p>
                <p className="text-sm text-red-300">{genMeta.error ?? 'Unknown error'}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
