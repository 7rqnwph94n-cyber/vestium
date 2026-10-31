// ─── Create RAMS Page ─────────────────────────────────────────────────────────
// Thin page wrapper for RamsIntakePanel. Loads org context to provide
// workplaceContext + regulatoryClassification, then navigates to viewer on creation.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Card } from '../../components/Card';
import { RamsIntakePanel } from '../rams/RamsIntakePanel';
import { getOrgContext } from '../../lib/api/client';
import type { OrgContextDTO } from '@complianceforge/types';
import { EMPTY_WORKPLACE_CONTEXT } from '../../lib/mappers';

export const CreateRamsPage = () => {
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

  if (loading) return <p className="text-sm text-theme-muted p-4">Loading organisation context...</p>;

  const workplaceContext = orgCtx?.workplaceContext ?? EMPTY_WORKPLACE_CONTEXT;
  const regulatoryClassification = {};

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-theme-text">Create RAMS</h1>
        <p className="text-sm text-theme-secondary mt-1">Risk Assessment & Method Statement</p>
      </div>

      <RamsIntakePanel
        workplaceContext={workplaceContext}
        regulatoryClassification={regulatoryClassification}
        onCreated={(rams) => navigate(`/create/rams/${rams.id}`)}
      />

      {!orgCtx && (
        <Card>
          <p className="text-xs text-amber-400">
            No organisation context found. Complete onboarding first for better regulatory classification.
          </p>
        </Card>
      )}
    </div>
  );
};
