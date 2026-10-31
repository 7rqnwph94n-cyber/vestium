import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { cx } from '../../utils/classNames';
import { deleteSop, isBackendMode, listSops } from '../../lib/api/client';
import type { SopRecord } from '@complianceforge/types';

const STATUS_STYLE: Record<string, string> = {
  draft:     'border-theme-border text-theme-secondary',
  in_review: 'border-amber-500/60 text-amber-300',
  deployed:  'border-emerald-500/60 text-emerald-300',
  stale:     'border-red-500/60 text-red-300',
};

const STATUS_LABEL: Record<string, string> = {
  draft:     'Draft',
  in_review: 'In Review',
  deployed:  'Deployed',
  stale:     'Stale',
};

const isFailed = (sop: SopRecord) => sop.generationMetadata.failed === true;

export const SopListSection = () => {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [sops, setSops] = useState<SopRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isBackendMode() || !isLoaded || !isSignedIn) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getToken().then(async (token) => {
      if (!token || cancelled) return;
      const res = await listSops(token);
      if (cancelled) return;
      if (res.ok) {
        setSops(res.data);
      } else {
        setError(res.error);
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load SOPs');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [getToken, isLoaded, isSignedIn]);

  const handleDelete = async (sopId: string) => {
    if (confirmDeleteId !== sopId) {
      setConfirmDeleteId(sopId);
      setDeleteError(null);
      return;
    }
    setConfirmDeleteId(null);
    setDeletingId(sopId);
    setDeleteError(null);
    try {
      const token = await getToken();
      if (!token) { setDeleteError('No auth token'); return; }
      const res = await deleteSop(token, sopId);
      if (res.ok) {
        setSops((prev) => prev.filter((s) => s.id !== sopId));
      } else {
        setDeleteError(res.error ?? 'Delete failed');
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isBackendMode() || !isSignedIn) return null;
  if (!loading && sops.length === 0 && !error) return null;

  return (
    <section className="space-y-3 rounded-xl border border-theme-border bg-theme-panel/60 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-theme-text">Standard Operating Procedures</h2>
          <p className="text-xs text-theme-muted mt-0.5">Source-document-attributed, regulatory-controlled SOPs</p>
        </div>
        <div className="flex items-center gap-3">
          {loading ? <span className="text-xs text-theme-secondary">Loading…</span> : null}
          <button
            type="button"
            onClick={() => navigate('/studio')}
            className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            + New SOP
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
      {deleteError ? <p className="text-sm text-red-400">Delete failed: {deleteError}</p> : null}

      {sops.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sops.map((sop) => (
            <div
              key={sop.id}
              className="flex flex-col justify-between gap-3 rounded-xl border border-theme-border bg-theme-surface/50 px-4 py-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span
                    className={cx(
                      'rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                      STATUS_STYLE[sop.status] ?? 'border-theme-border text-theme-secondary'
                    )}
                  >
                    {STATUS_LABEL[sop.status] ?? sop.status}
                  </span>
                  {isFailed(sop) ? (
                    <span className="rounded border border-red-500/60 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-300 uppercase tracking-wide">
                      Failed
                    </span>
                  ) : null}
                  {sop.moduleId ? (
                    <span className="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-300">
                      Paired
                    </span>
                  ) : (
                    <span className="rounded border border-theme-border px-2 py-0.5 text-[11px] text-theme-muted">
                      Standalone
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-theme-text leading-snug">{sop.procedureName}</p>
                <p className="text-xs text-theme-muted truncate">{sop.equipment}</p>
                <p className="text-[11px] text-theme-muted">
                  {new Date(sop.createdAt).toLocaleDateString('en-GB')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {sop.status === 'in_review' ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/sops/${sop.id}/review`)}
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
                  >
                    Review
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate(`/sops/${sop.id}`)}
                  className="rounded border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-secondary hover:border-theme-border hover:text-theme-text transition-colors"
                >
                  View
                </button>
                {sop.status === 'draft' && isFailed(sop) ? (
                  <button
                    type="button"
                    onClick={() => navigate('/studio')}
                    className="rounded border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 transition-colors"
                  >
                    Retry
                  </button>
                ) : null}
                {sop.status === 'draft' ? (
                  <button
                    type="button"
                    disabled={deletingId === sop.id}
                    onClick={() => void handleDelete(sop.id)}
                    className={confirmDeleteId === sop.id
                      ? 'rounded border border-red-500/60 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 transition-colors'
                      : 'rounded border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-secondary hover:border-red-500/60 hover:text-red-300 transition-colors'}
                  >
                    {deletingId === sop.id ? '…' : confirmDeleteId === sop.id ? 'Confirm?' : 'Delete'}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};
