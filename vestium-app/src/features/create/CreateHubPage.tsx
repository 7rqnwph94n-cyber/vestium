// ─── Create Hub Page ──────────────────────────────────────────────────────────
// Portal for content creation: "What do you want to create?"
// Card grid for content types + in-progress drafts list.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Card } from '../../components/Card';
import { isBackendMode, listModules, listSops, listRams } from '../../lib/api/client';

interface ContentTypeCard {
  title: string;
  to: string;
  purpose: string;
  inputs: string;
  outputs: string;
  available: boolean;
}

const CONTENT_TYPES: ContentTypeCard[] = [
  {
    title: 'Training Module',
    to: '/create/module',
    purpose: 'MHSWR Reg 7 compliant competency training with staged assessments',
    inputs: 'Workplace context, regulatory classification, industry operations',
    outputs: 'Multi-stage curriculum, quizzes, learner certificates, audit trail',
    available: true,
  },
  {
    title: 'SOP / SSOW',
    to: '/create/sop',
    purpose: 'Standard Operating Procedures with regulatory traceability',
    inputs: 'Procedure description, equipment, source documents (PDF)',
    outputs: 'Step-by-step procedure, safety controls, regulatory references',
    available: true,
  },
  {
    title: 'RAMS',
    to: '/create/rams',
    purpose: 'Risk Assessment & Method Statement with hazard-control matrix',
    inputs: 'Task description, location, equipment, source documents',
    outputs: 'Hazard matrix, method statement, emergency procedures, permits',
    available: true,
  },
  {
    title: 'Permit Pack',
    to: '/create/permit',
    purpose: 'Permit to work packs with cross-referenced controls',
    inputs: 'Work activity, location, duration, associated RAMS',
    outputs: 'Permit document, sign-off sheet, control checklist',
    available: false,
  },
];

const STATUS_STYLE: Record<string, string> = {
  draft: 'text-theme-secondary border-theme-border',
  in_review: 'text-amber-300 border-amber-500/60',
  deployed: 'text-emerald-300 border-emerald-500/60',
  stale: 'text-red-300 border-red-500/60',
};

interface DraftItem {
  id: string;
  title: string;
  type: 'module' | 'sop' | 'rams';
  status: string;
  updatedAt: string;
  viewPath: string;
  reviewPath?: string;
}

export const CreateHubPage = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isBackendMode() || !isLoaded || !isSignedIn) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const token = await getToken();
      if (!token || cancelled) return;

      const items: DraftItem[] = [];

      // Load modules (draft/in_review/stale)
      const modRes = await listModules(token);
      if (modRes.ok) {
        for (const m of modRes.data) {
          if (m.status === 'deployed') continue;
          items.push({
            id: m.id, title: m.title, type: 'module', status: m.status,
            updatedAt: m.updatedAt,
            viewPath: `/create/modules`,
            reviewPath: m.status === 'in_review' ? `/create/reviewer` : undefined,
          });
        }
      }

      // Load SOPs
      const sopRes = await listSops(token);
      if (sopRes.ok) {
        for (const s of sopRes.data) {
          if (s.status === 'deployed') continue;
          items.push({
            id: s.id, title: s.title, type: 'sop', status: s.status,
            updatedAt: s.updatedAt,
            viewPath: `/create/sops/${s.id}`,
            reviewPath: s.status === 'in_review' ? `/create/sops/${s.id}/review` : undefined,
          });
        }
      }

      // Load RAMS
      const ramsRes = await listRams(token);
      if (ramsRes.ok) {
        for (const r of ramsRes.data) {
          if (r.status === 'deployed') continue;
          items.push({
            id: r.id, title: r.title, type: 'rams', status: r.status,
            updatedAt: r.updatedAt,
            viewPath: `/create/rams/${r.id}`,
            reviewPath: r.status === 'in_review' ? `/create/rams/${r.id}/review` : undefined,
          });
        }
      }

      // Sort by most recently updated
      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      if (!cancelled) {
        setDrafts(items);
        setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-theme-text">Create</h1>
        <p className="text-sm text-theme-secondary mt-1">What do you want to create?</p>
      </div>

      {/* Content type cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {CONTENT_TYPES.map((ct) => (
          <Card key={ct.title} className={ct.available ? 'hover:border-theme-border transition-colors' : 'opacity-50'}>
            {ct.available ? (
              <Link to={ct.to} className="block space-y-2">
                <h3 className="text-base font-semibold text-theme-text">{ct.title}</h3>
                <p className="text-xs text-theme-secondary">{ct.purpose}</p>
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] text-theme-muted"><span className="text-theme-secondary font-medium">Inputs:</span> {ct.inputs}</p>
                  <p className="text-[10px] text-theme-muted"><span className="text-theme-secondary font-medium">Outputs:</span> {ct.outputs}</p>
                </div>
              </Link>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-theme-text">{ct.title}</h3>
                  <span className="rounded bg-theme-surface px-1.5 py-0.5 text-[10px] text-theme-muted">Coming soon</span>
                </div>
                <p className="text-xs text-theme-secondary">{ct.purpose}</p>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Review queue shortcut */}
      {drafts.some((d) => d.status === 'in_review') && (
        <Link
          to="/create/reviewer"
          className="block rounded-xl border border-amber-500/30 bg-amber-900/10 px-4 py-3 text-sm text-amber-200 hover:bg-amber-900/20 transition-colors"
        >
          {drafts.filter((d) => d.status === 'in_review').length} item{drafts.filter((d) => d.status === 'in_review').length !== 1 ? 's' : ''} awaiting review
          <span className="text-xs text-amber-400 ml-2">Open reviewer queue &rarr;</span>
        </Link>
      )}

      {/* In-progress drafts */}
      {(drafts.length > 0 || loading) && (
        <div>
          <h2 className="text-sm font-semibold text-theme-secondary mb-3">In Progress</h2>
          {loading ? (
            <p className="text-xs text-theme-muted">Loading drafts...</p>
          ) : (
            <div className="space-y-2">
              {drafts.map((d) => (
                <div key={`${d.type}-${d.id}`} className="flex items-center justify-between rounded border border-theme-border bg-theme-panel/60 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded bg-theme-surface px-1.5 py-0.5 text-[10px] text-theme-muted uppercase">{d.type}</span>
                    <span className="text-sm text-theme-text truncate">{d.title}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[d.status] ?? STATUS_STYLE.draft}`}>
                      {d.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link to={d.viewPath} className="text-xs text-theme-secondary hover:text-theme-text">View</Link>
                    {d.reviewPath && (
                      <Link to={d.reviewPath} className="text-xs text-amber-400 hover:text-amber-200">Review</Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
