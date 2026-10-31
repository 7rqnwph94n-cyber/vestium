import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { getDirectorView } from '../../lib/api/client';
import type { DirectorModuleRecord } from '@complianceforge/types';

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function relativeDate(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

const STATUS_STYLES: Record<string, string> = {
  stale:     'border-red-500/60 text-red-300 bg-red-500/10',
  deployed:  'border-emerald-500/60 text-emerald-300 bg-emerald-500/10',
  in_review: 'border-amber-500/60 text-amber-300 bg-amber-500/10',
  draft:     'border-theme-border text-theme-secondary bg-theme-surface',
};

const STATUS_LABELS: Record<string, string> = {
  stale: 'Stale', deployed: 'Deployed', in_review: 'In Review', draft: 'Draft',
};

export const DirectorDashboardPage = () => {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [modules, setModules] = useState<DirectorModuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token) { setError('Session expired. Please sign in again.'); setLoading(false); return; }
      const res = await getDirectorView(token);
      if (cancelled) return;
      if (!res.ok) { setError(res.error ?? 'Failed to load'); setLoading(false); return; }
      setModules(res.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const total     = modules.length;
  const deployed  = modules.filter((m) => m.status === 'deployed').length;
  const stale     = modules.filter((m) => m.status === 'stale').length;
  const inReview  = modules.filter((m) => m.status === 'in_review').length;

  if (loading) {
    return (
      <div className="rounded border border-theme-border bg-theme-panel p-4 text-sm text-theme-secondary">
        Loading Director's View…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-theme-text">Director's View</h1>
          <p className="mt-0.5 text-xs text-theme-secondary">
            All attested modules, compliance status, and who approved each release.
          </p>
        </div>
        <Link
          to="/studio"
          className="text-xs text-theme-secondary hover:text-theme-text transition-colors"
        >
          ← Studio
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded border border-theme-border bg-theme-panel p-4 text-center">
          <p className="text-2xl font-bold text-theme-text">{total}</p>
          <p className="mt-1 text-xs text-theme-muted">Total Modules</p>
        </div>
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-300">{deployed}</p>
          <p className="mt-1 text-xs text-emerald-500">Deployed</p>
        </div>
        <div className={`rounded border p-4 text-center ${stale > 0 ? 'border-red-500/40 bg-red-500/5' : 'border-theme-border bg-theme-panel'}`}>
          <p className={`text-2xl font-bold ${stale > 0 ? 'text-red-300' : 'text-theme-secondary'}`}>{stale}</p>
          <p className={`mt-1 text-xs ${stale > 0 ? 'text-red-500' : 'text-theme-muted'}`}>
            {stale > 0 ? '⚠ Stale — Action Required' : 'Stale'}
          </p>
        </div>
        <div className="rounded border border-amber-500/20 bg-amber-500/5 p-4 text-center">
          <p className="text-2xl font-bold text-amber-300">{inReview}</p>
          <p className="mt-1 text-xs text-amber-500">Under Review</p>
        </div>
      </div>

      {/* Module table */}
      {total === 0 ? (
        <div className="rounded border border-theme-border bg-theme-panel p-8 text-center">
          <p className="text-sm text-theme-secondary">No modules yet.</p>
          <p className="mt-1 text-xs text-theme-muted">
            Generate your first module in{' '}
            <Link to="/studio/new/module" className="text-amber-400 hover:underline">Studio</Link>.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-theme-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-theme-border bg-theme-panel">
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary">Module</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary hidden sm:table-cell">Schema</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary hidden md:table-cell">Attested by</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary hidden md:table-cell">Attestation</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary hidden lg:table-cell">Last updated</th>
                <th className="px-4 py-3 text-right font-semibold text-theme-secondary">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border-subtle">
              {modules.map((m) => (
                <tr
                  key={m.id}
                  className={`transition-colors hover:bg-theme-surface ${
                    m.status === 'stale' ? 'border-l-2 border-l-red-500/60' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-theme-text leading-snug">{m.title}</p>
                    {m.status === 'stale' && (
                      <p className="mt-0.5 text-red-400">Regulation updated — regeneration required</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[m.status] ?? STATUS_STYLES.draft}`}>
                      {STATUS_LABELS[m.status] ?? m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-theme-secondary">
                    {m.primarySchema ?? '—'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {m.reviewerName ? (
                      <div>
                        <p className="text-theme-text">{m.reviewerName}</p>
                        <p className="text-theme-muted">{m.reviewerRole}</p>
                      </div>
                    ) : (
                      <span className="text-theme-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-theme-secondary">
                    {m.attestedAt ? (
                      <span title={formatDate(m.attestedAt)}>{relativeDate(m.attestedAt)}</span>
                    ) : (
                      <span className="text-theme-muted">Not attested</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-theme-muted">
                    {relativeDate(m.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.status === 'in_review' && (
                      <button
                        type="button"
                        onClick={() => navigate('/audit/reviewer')}
                        className="rounded border border-amber-500/50 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
                      >
                        Review
                      </button>
                    )}
                    {m.status === 'stale' && (
                      <button
                        type="button"
                        onClick={() => navigate('/studio/new/module')}
                        className="rounded border border-red-500/50 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/10 transition-colors"
                      >
                        Regenerate
                      </button>
                    )}
                    {m.status === 'deployed' && (
                      <Link
                        to="/studio"
                        className="rounded border border-emerald-500/50 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 transition-colors inline-block"
                      >
                        View
                      </Link>
                    )}
                    {m.status === 'draft' && (
                      <span className="text-theme-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stale advisory note */}
      {stale > 0 && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-300">
          <p className="font-semibold">
            {stale} module{stale !== 1 ? 's require' : ' requires'} attention.
          </p>
          <p className="mt-1 text-red-400">
            Stale modules must not be used for new learner enrolments until they have been
            regenerated and re-attested by a competent person reviewer. Using stale modules
            constitutes a potential breach of MHSWR 1999 Reg 13 (training on changed risks).
          </p>
        </div>
      )}
    </div>
  );
};
