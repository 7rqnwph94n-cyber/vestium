// ─── Audit Hub Page ───────────────────────────────────────────────────────────
// Director/auditor dashboard: summary stats, review queue, director view,
// certificate ledger placeholder.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Card } from '../../components/Card';
import { isBackendMode, listModules, listSops, listRams } from '../../lib/api/client';
import { useOrgRole } from '../../hooks/useOrgRole';

interface ContentCounts {
  inReview: { modules: number; sops: number; rams: number };
  deployed: number;
  stale: number;
  total: number;
}

const EMPTY: ContentCounts = { inReview: { modules: 0, sops: 0, rams: 0 }, deployed: 0, stale: 0, total: 0 };

export const AuditHubPage = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { canReview } = useOrgRole();
  const [counts, setCounts] = useState<ContentCounts>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isBackendMode() || !isLoaded || !isSignedIn) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const token = await getToken();
      if (!token || cancelled) return;

      const c: ContentCounts = { inReview: { modules: 0, sops: 0, rams: 0 }, deployed: 0, stale: 0, total: 0 };

      const modRes = await listModules(token);
      if (modRes.ok) {
        c.inReview.modules = modRes.data.filter((m) => m.status === 'in_review').length;
        c.deployed += modRes.data.filter((m) => m.status === 'deployed').length;
        c.stale += modRes.data.filter((m) => m.status === 'stale').length;
        c.total += modRes.data.length;
      }

      const sopRes = await listSops(token);
      if (sopRes.ok) {
        c.inReview.sops = sopRes.data.filter((s) => s.status === 'in_review').length;
        c.deployed += sopRes.data.filter((s) => s.status === 'deployed').length;
        c.stale += sopRes.data.filter((s) => s.status === 'stale').length;
        c.total += sopRes.data.length;
      }

      const ramsRes = await listRams(token);
      if (ramsRes.ok) {
        c.inReview.rams = ramsRes.data.filter((r) => r.status === 'in_review').length;
        c.deployed += ramsRes.data.filter((r) => r.status === 'deployed').length;
        c.stale += ramsRes.data.filter((r) => r.status === 'stale').length;
        c.total += ramsRes.data.length;
      }

      if (!cancelled) {
        setCounts(c);
        setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken]);

  const totalQueue = counts.inReview.modules + counts.inReview.sops + counts.inReview.rams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-theme-text">Audit</h1>
        <p className="text-sm text-theme-secondary mt-1">Governance oversight and evidence verification</p>
      </div>

      {/* Summary stats */}
      {!loading && counts.total > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border border-theme-border bg-theme-panel/60 px-4 py-3 text-center">
            <p className="text-lg font-bold text-theme-text">{counts.total}</p>
            <p className="text-[10px] text-theme-muted uppercase tracking-wide">Total</p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-900/10 px-4 py-3 text-center">
            <p className="text-lg font-bold text-emerald-300">{counts.deployed}</p>
            <p className="text-[10px] text-emerald-500 uppercase tracking-wide">Deployed</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-900/10 px-4 py-3 text-center">
            <p className="text-lg font-bold text-amber-300">{totalQueue}</p>
            <p className="text-[10px] text-amber-500 uppercase tracking-wide">In Review</p>
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-900/10 px-4 py-3 text-center">
            <p className="text-lg font-bold text-red-300">{counts.stale}</p>
            <p className="text-[10px] text-red-500 uppercase tracking-wide">Stale</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Review queue — links to Create (creator is the reviewer) */}
        {canReview && (
          <Link to="/audit/reviewer">
            <Card className="hover:border-theme-border transition-colors h-full">
              <h3 className="text-sm font-semibold text-theme-text">Review Queue</h3>
              <p className="text-xs text-theme-secondary mt-1">Content awaiting review and attestation</p>
              {loading ? (
                <p className="text-xs text-theme-muted mt-2">Loading…</p>
              ) : (
                <div className="mt-3 space-y-1">
                  {totalQueue === 0 ? (
                    <p className="text-xs text-emerald-400">Queue clear</p>
                  ) : (
                    <>
                      {counts.inReview.modules > 0 && <p className="text-xs text-amber-300">{counts.inReview.modules} module{counts.inReview.modules !== 1 ? 's' : ''}</p>}
                      {counts.inReview.sops > 0 && <p className="text-xs text-amber-300">{counts.inReview.sops} SOP{counts.inReview.sops !== 1 ? 's' : ''}</p>}
                      {counts.inReview.rams > 0 && <p className="text-xs text-amber-300">{counts.inReview.rams} RAMS</p>}
                    </>
                  )}
                </div>
              )}
            </Card>
          </Link>
        )}

        {/* Director dashboard */}
        <Link to="/audit/director">
          <Card className="hover:border-theme-border transition-colors h-full">
            <h3 className="text-sm font-semibold text-theme-text">Director Dashboard</h3>
            <p className="text-xs text-theme-secondary mt-1">Organisational overview and deployment status</p>
            {!loading && (
              <p className="text-xs text-theme-muted mt-3">{counts.deployed} deployed, {counts.stale} stale</p>
            )}
          </Card>
        </Link>

        {/* Certificate ledger */}
        <Card className="opacity-50">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-theme-text">Certificate Ledger</h3>
            <span className="rounded bg-theme-surface px-1.5 py-0.5 text-[10px] text-theme-muted">Coming soon</span>
          </div>
          <p className="text-xs text-theme-secondary mt-1">Full certificate chain with SHA-256 hash verification</p>
        </Card>
      </div>

      {/* Stale content warning */}
      {!loading && counts.stale > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/10 px-4 py-3">
          <p className="text-sm text-red-200 font-semibold">{counts.stale} stale content item{counts.stale !== 1 ? 's' : ''}</p>
          <p className="text-xs text-red-400 mt-1">
            Stale content may no longer reflect current regulatory requirements. Review and regenerate in the
            {' '}<Link to="/studio" className="underline hover:text-red-200">Studio</Link>.
          </p>
        </div>
      )}
    </div>
  );
};
