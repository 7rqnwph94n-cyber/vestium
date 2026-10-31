// ─── RAMS Review Page ─────────────────────────────────────────────────────────
// Thin wrapper around GovernedReviewPage with RAMS-specific content renderer.
// Loads RAMS data, resolves registryId, and delegates governance to shared layer.

import { useState, useEffect, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Card } from '../../components/Card';
import { GovernedReviewPage, type ContentRendererProps } from '../governance/GovernedReviewPage';
import { getRams, getRamsGenerationStatus } from '../../lib/api/client';
import type { RamsRecord } from '@complianceforge/types';
import { mapRamsJobState } from '../../lib/mappers';

const RISK_COLOR = (score: number) => {
  if (score >= 16) return 'bg-red-600/30 text-red-200 border-red-500/40';
  if (score >= 10) return 'bg-orange-600/30 text-orange-200 border-orange-500/40';
  if (score >= 5) return 'bg-amber-600/30 text-amber-200 border-amber-500/40';
  return 'bg-emerald-600/30 text-emerald-200 border-emerald-500/40';
};

interface RamsDraft {
  title: string;
  scope: string;
  applicableRegulations: string[];
  hazardMatrix: Array<{
    id: string; hazard: string; activity: string; personsAtRisk: string[];
    initialLikelihood: number; initialSeverity: number; initialRiskScore: number;
    controls: string[]; regulatoryBasis: string[];
    residualLikelihood: number; residualSeverity: number; residualRiskScore: number;
    sourceRef: string | null;
  }>;
  methodStatement: Array<{
    stepNumber: number; action: string; hazardRefs: string[];
    controls: string[]; ppe: string[]; checkpoints: string[];
    sourceRef: string | null;
  }>;
  emergencyProcedures: string[];
  permits: string[];
  reviewFrequency: string;
}

export const RamsReviewPage = () => {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [rams, setRams] = useState<RamsRecord | null>(null);
  const [registryId, setRegistryId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RamsDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const token = await getToken();
      if (!token) return;

      // Load RAMS record
      const ramsRes = await getRams(token, id);
      if (!ramsRes.ok) { setError(ramsRes.error); setLoading(false); return; }
      setRams(ramsRes.data.rams);

      // Load generation job state to get the draft + registryId
      const statusRes = await getRamsGenerationStatus(token, id);
      if (statusRes.ok && statusRes.data.job) {
        const { registryId: rid, draft: d } = mapRamsJobState(statusRes.data.job);
        if (rid) setRegistryId(rid);
        if (d) setDraft(d as RamsDraft);
      }

      setLoading(false);
    };
    void load();
  }, [id, getToken]);

  if (loading) return <div className="rounded border border-theme-border bg-theme-panel/60 p-4 text-sm text-theme-secondary">Loading…</div>;
  if (error || !rams) return <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error ?? 'RAMS not found'}</div>;
  if (!registryId) return <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-300">RAMS not yet registered for governance. Generate first.</div>;

  const contentRenderer = ({ findings }: ContentRendererProps): ReactNode => {
    if (!draft) {
      return (
        <Card>
          <p className="text-theme-muted text-sm italic">No draft data available.</p>
        </Card>
      );
    }

    const findingsForLocation = (loc: string) =>
      findings.filter((f) => f.location.includes(loc) && !f.disposition);

    return (
      <div className="space-y-4">
        {/* Back link */}
        <Link to={`/studio/rams/${id}`} className="text-xs text-theme-muted hover:text-theme-secondary">
          ← Back to RAMS viewer
        </Link>

        {/* Scope */}
        <Card title="Scope">
          <p className="text-sm text-theme-secondary">{draft.scope}</p>
          {draft.applicableRegulations.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {draft.applicableRegulations.map((reg, i) => (
                <span key={i} className="rounded bg-theme-surface px-2 py-0.5 text-[10px] text-amber-300">{reg}</span>
              ))}
            </div>
          )}
        </Card>

        {/* Hazard Matrix */}
        <Card title="Hazard Matrix">
          <div className="space-y-2">
            {draft.hazardMatrix.map((h) => {
              const hFindings = findingsForLocation(`Hazard ${h.id}`);
              return (
                <div key={h.id} className={`rounded border p-2.5 ${RISK_COLOR(h.initialRiskScore)}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold">{h.id}</span>
                        <span className="text-sm">{h.hazard}</span>
                        {hFindings.length > 0 && (
                          <span className="rounded bg-red-500/20 border border-red-500/40 px-1.5 py-0.5 text-[10px] text-red-300 font-semibold">
                            {hFindings.length} finding{hFindings.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs opacity-60">Activity: {h.activity}</p>
                      <p className="text-xs opacity-60">At risk: {h.personsAtRisk.join(', ')}</p>
                      {!h.sourceRef && (
                        <p className="text-xs text-red-300 mt-1 font-semibold">Unattributed</p>
                      )}
                    </div>
                    <div className="text-right text-xs space-y-0.5">
                      <div>Initial: <span className="font-bold">{h.initialLikelihood}×{h.initialSeverity} = {h.initialRiskScore}</span></div>
                      <div className={`${RISK_COLOR(h.residualRiskScore)} rounded px-1.5 py-0.5 inline-block border`}>
                        Residual: <span className="font-bold">{h.residualLikelihood}×{h.residualSeverity} = {h.residualRiskScore}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium opacity-80">Controls:</p>
                    <ul className="list-disc list-inside text-xs opacity-70 space-y-0.5">
                      {h.controls.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                    {h.regulatoryBasis.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {h.regulatoryBasis.map((r, i) => (
                          <span key={i} className="rounded bg-theme-raised/60 px-1.5 py-0.5 text-[10px]">{r}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Method Statement */}
        <Card title="Method Statement">
          <div className="space-y-2">
            {draft.methodStatement.map((step) => {
              const sFindings = findingsForLocation(`Step ${step.stepNumber}`);
              return (
                <div
                  key={step.stepNumber}
                  className={`rounded border p-2.5 ${step.sourceRef ? 'border-theme-border bg-theme-panel/60' : 'border-red-500/30 bg-red-900/10'}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 rounded bg-theme-raised px-1.5 py-0.5 text-xs font-bold">{step.stepNumber}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-theme-text">{step.action}</p>
                        {sFindings.length > 0 && (
                          <span className="rounded bg-red-500/20 border border-red-500/40 px-1.5 py-0.5 text-[10px] text-red-300 font-semibold">
                            {sFindings.length}
                          </span>
                        )}
                      </div>
                      {step.hazardRefs.length > 0 && (
                        <p className="text-xs text-amber-400 mt-0.5">Hazards: {step.hazardRefs.join(', ')}</p>
                      )}
                      {step.controls.length > 0 && (
                        <ul className="list-disc list-inside text-xs text-theme-secondary mt-0.5">
                          {step.controls.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      )}
                      {step.ppe.length > 0 && (
                        <p className="text-xs text-blue-400 mt-0.5">PPE: {step.ppe.join(', ')}</p>
                      )}
                      {step.checkpoints.length > 0 && (
                        <ul className="list-disc list-inside text-xs text-emerald-300/70 mt-0.5">
                          {step.checkpoints.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Emergency + Permits */}
        {draft.emergencyProcedures.length > 0 && (
          <Card title="Emergency Procedures">
            <ul className="list-disc list-inside text-sm text-theme-secondary space-y-1">
              {draft.emergencyProcedures.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </Card>
        )}

        {draft.permits.length > 0 && (
          <Card title="Required Permits">
            <div className="flex flex-wrap gap-2">
              {draft.permits.map((p, i) => (
                <span key={i} className="rounded bg-amber-800/30 border border-amber-600/30 px-2 py-1 text-xs text-amber-200">{p}</span>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <GovernedReviewPage
        registryId={registryId}
        contentHash={rams.contentHash ?? ''}
        contentRenderer={contentRenderer}
        title={`Review: ${rams.title}`}
        deployed={rams.status === 'deployed'}
      />
    </div>
  );
};
