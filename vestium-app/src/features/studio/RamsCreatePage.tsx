// ─── RamsCreatePage — RAMS creation for Studio ──────────────────────────────
// Loads org context → RamsIntakePanel → navigates to detail view on creation.

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { RamsIntakePanel } from '../rams/RamsIntakePanel';
import { getOrgContext } from '../../lib/api/client';
import type { OrgContextDTO } from '@complianceforge/types';
import { EMPTY_WORKPLACE_CONTEXT } from '../../lib/mappers';

export function RamsCreatePage() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [orgCtx, setOrgCtx] = useState<OrgContextDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const res = await getOrgContext(token);
      if (!cancelled) {
        if (res.ok && res.data) setOrgCtx(res.data);
        setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [getToken]);

  if (loading) return <p className="text-sm text-theme-muted p-4">Loading organisation context…</p>;

  const workplaceContext = orgCtx?.workplaceContext ?? EMPTY_WORKPLACE_CONTEXT;
  const regulatoryClassification = {};

  return (
    <div>
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <nav className="text-xs text-theme-muted mb-4">
          <Link to="/studio" className="hover:text-theme-text transition-colors">Studio</Link>
          <span className="mx-1">/</span>
          <span className="text-theme-secondary">New RAMS</span>
        </nav>
      </div>

      <div className="mx-auto max-w-2xl px-4 space-y-5">
        <div className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5">
          <h1 className="text-xl font-bold text-theme-text">Create RAMS</h1>
          <p className="text-sm text-theme-secondary mt-1">Risk Assessment &amp; Method Statement</p>
        </div>

        <RamsIntakePanel
          workplaceContext={workplaceContext}
          regulatoryClassification={regulatoryClassification}
          onCreated={(rams) => navigate(`/studio/rams/${rams.id}`)}
        />

        {!orgCtx && (
          <div className="rounded-xl border border-amber-500/30 bg-theme-panel px-6 py-4">
            <p className="text-xs text-amber-400">
              No organisation context found. Complete onboarding first for better regulatory classification.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
