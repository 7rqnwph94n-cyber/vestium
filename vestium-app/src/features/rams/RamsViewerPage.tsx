// ─── RAMS Viewer Page ─────────────────────────────────────────────────────────
// Read-only view of a generated RAMS document. Shows hazard matrix, method
// statement, emergency procedures, and permits.

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Card } from '../../components/Card';
import { getRams } from '../../lib/api/client';
import type { RamsRecord, RamsSourceDocRecord } from '@complianceforge/types';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-theme-raised text-theme-secondary',
  in_review: 'bg-amber-700/40 text-amber-200',
  deployed: 'bg-emerald-700/40 text-emerald-200',
  stale: 'bg-red-700/40 text-red-200',
};

const RISK_COLOR = (score: number) => {
  if (score >= 16) return 'bg-red-600/30 text-red-200 border-red-500/40';
  if (score >= 10) return 'bg-orange-600/30 text-orange-200 border-orange-500/40';
  if (score >= 5) return 'bg-amber-600/30 text-amber-200 border-amber-500/40';
  return 'bg-emerald-600/30 text-emerald-200 border-emerald-500/40';
};

interface RamsDraft {
  title: string;
  taskDescription: string;
  location: string;
  equipment: string[];
  scope: string;
  version: string;
  applicableRegulations: string[];
  hazardMatrix: Array<{
    id: string;
    hazard: string;
    activity: string;
    personsAtRisk: string[];
    initialLikelihood: number;
    initialSeverity: number;
    initialRiskScore: number;
    controls: string[];
    regulatoryBasis: string[];
    residualLikelihood: number;
    residualSeverity: number;
    residualRiskScore: number;
    sourceRef: string | null;
  }>;
  methodStatement: Array<{
    stepNumber: number;
    action: string;
    hazardRefs: string[];
    controls: string[];
    ppe: string[];
    checkpoints: string[];
    sourceRef: string | null;
  }>;
  emergencyProcedures: string[];
  permits: string[];
  reviewFrequency: string;
}

export const RamsViewerPage = () => {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [rams, setRams] = useState<RamsRecord | null>(null);
  const [sourceDocs, setSourceDocs] = useState<RamsSourceDocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const token = await getToken();
      if (!token) return;
      const res = await getRams(token, id);
      if (res.ok) {
        setRams(res.data.rams);
        setSourceDocs(res.data.sourceDocs);
      } else {
        setError(res.error);
      }
      setLoading(false);
    };
    void load();
  }, [id, getToken]);

  if (loading) return <p className="text-theme-muted text-sm p-4">Loading RAMS...</p>;
  if (error || !rams) return <p className="text-red-400 text-sm p-4">{error ?? 'RAMS not found'}</p>;

  // Extract the draft from generationMetadata or job state
  const draft = extractDraft(rams);

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      {/* Header */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-theme-text">{rams.title}</h1>
            <p className="text-sm text-theme-secondary">{rams.taskDescription}</p>
            {rams.location && <p className="text-xs text-theme-muted mt-1">Location: {rams.location}</p>}
            {rams.equipment.length > 0 && (
              <p className="text-xs text-theme-muted">Equipment: {rams.equipment.join(', ')}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-1 text-xs font-semibold ${STATUS_STYLES[rams.status] ?? STATUS_STYLES.draft}`}>
              {rams.status.replace('_', ' ')}
            </span>
            {(rams.status === 'in_review' || rams.status === 'deployed') && (
              <Link
                to={`/audit/rams/${rams.id}/review`}
                className="rounded bg-amber-700/40 px-3 py-1 text-xs text-amber-200 hover:bg-amber-700/60 transition-colors"
              >
                Review
              </Link>
            )}
          </div>
        </div>
      </Card>

      {/* Source Documents */}
      {sourceDocs.length > 0 && (
        <Card title="Source Documents">
          <div className="space-y-1">
            {sourceDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 text-xs text-theme-secondary">
                <span className="rounded bg-theme-surface px-1.5 py-0.5 text-[10px]">{doc.docType.replace('_', ' ')}</span>
                <span className="text-theme-secondary">{doc.filename}</span>
                {doc.pageCount && <span className="text-theme-muted">({doc.pageCount} pages)</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!draft ? (
        <Card>
          <p className="text-theme-muted text-sm italic">
            {rams.status === 'draft' ? 'RAMS not yet generated. Start generation to create the document.' : 'No generation data available.'}
          </p>
        </Card>
      ) : (
        <>
          {/* Scope + Regulations */}
          <Card title="Scope">
            <p className="text-sm text-theme-secondary">{draft.scope}</p>
            {draft.applicableRegulations.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-theme-secondary mb-1">Applicable Regulations:</p>
                <div className="flex flex-wrap gap-1">
                  {draft.applicableRegulations.map((reg, i) => (
                    <span key={i} className="rounded bg-theme-surface px-2 py-0.5 text-[10px] text-amber-300">{reg}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Hazard Matrix */}
          <Card title="Hazard Matrix">
            <div className="space-y-3">
              {draft.hazardMatrix.map((h) => (
                <div key={h.id} className={`rounded border p-3 ${RISK_COLOR(h.initialRiskScore)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold">{h.id}</span>
                        <span className="text-sm font-medium">{h.hazard}</span>
                      </div>
                      <p className="text-xs opacity-70">Activity: {h.activity}</p>
                      <p className="text-xs opacity-70">At risk: {h.personsAtRisk.join(', ')}</p>
                      {!h.sourceRef && (
                        <p className="text-xs text-red-300 mt-1 font-semibold">Unattributed — Cat A finding</p>
                      )}
                    </div>
                    <div className="text-right text-xs space-y-0.5">
                      <div>
                        Initial: <span className="font-bold">{h.initialLikelihood}×{h.initialSeverity} = {h.initialRiskScore}</span>
                      </div>
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
              ))}
            </div>
          </Card>

          {/* Method Statement */}
          <Card title="Method Statement">
            <div className="space-y-3">
              {draft.methodStatement.map((step) => (
                <div
                  key={step.stepNumber}
                  className={`rounded border p-3 ${step.sourceRef ? 'border-theme-border bg-theme-panel/60' : 'border-red-500/30 bg-red-900/10'}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 rounded bg-theme-raised px-2 py-0.5 text-xs font-bold text-theme-text">
                      {step.stepNumber}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-theme-text">{step.action}</p>
                      {step.hazardRefs.length > 0 && (
                        <p className="text-xs text-amber-400 mt-1">Hazards: {step.hazardRefs.join(', ')}</p>
                      )}
                      {step.controls.length > 0 && (
                        <div className="mt-1">
                          <p className="text-xs text-theme-muted">Controls:</p>
                          <ul className="list-disc list-inside text-xs text-theme-secondary">
                            {step.controls.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                      {step.ppe.length > 0 && (
                        <p className="text-xs text-blue-400 mt-1">PPE: {step.ppe.join(', ')}</p>
                      )}
                      {step.checkpoints.length > 0 && (
                        <div className="mt-1">
                          <p className="text-xs text-emerald-400">Checkpoints:</p>
                          <ul className="list-disc list-inside text-xs text-emerald-300/70">
                            {step.checkpoints.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                      {!step.sourceRef && (
                        <p className="text-xs text-red-300 mt-1 font-semibold">Unattributed — Cat A finding</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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

          {draft.reviewFrequency && (
            <Card>
              <p className="text-xs text-theme-secondary">Review frequency: <span className="text-theme-text">{draft.reviewFrequency}</span></p>
              <p className="text-xs text-theme-muted mt-1">Version: {draft.version}</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

function extractDraft(rams: RamsRecord): RamsDraft | null {
  // The draft build is stored in the job_state under ramsDraftBuild step
  const meta = rams.generationMetadata;
  if (meta && typeof meta === 'object' && 'ramsDraftBuild' in meta) {
    return meta.ramsDraftBuild as RamsDraft;
  }
  return null;
}
