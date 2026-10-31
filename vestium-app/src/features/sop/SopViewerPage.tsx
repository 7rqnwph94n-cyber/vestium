import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { getSop, getSopAttestation } from '../../lib/api/client';
import type { SopRecord, SopSourceDocRecord, SopAttestationRecord } from '@complianceforge/types';
import { extractSopDraft } from '../../lib/mappers';

interface SopStep {
  stepNumber: number;
  action: string;
  safetyControls: string[];
  regulatoryBasis: string[];
  sourceRef: { docTitle: string; page?: number; section?: string; quote?: string } | null;
  criticalValues?: Array<{ label: string; value: string; unit?: string }>;
  warnings?: string[];
}

interface SopDocument {
  title: string;
  procedureName: string;
  equipment: string;
  scope: string;
  version: string;
  applicableRegulations: string[];
  prerequisites: { ppe: string[]; conditions: string[]; documents: string[] };
  steps: SopStep[];
  postProcedure: string[];
  emergencyActions: string[];
}

function extractSopDocument(sop: SopRecord): SopDocument | null {
  return extractSopDraft<SopDocument>(sop.generationMetadata);
}

const STATUS_STYLES: Record<string, string> = {
  draft:     'border-theme-border text-theme-secondary bg-theme-surface',
  in_review: 'border-amber-500/60 text-amber-300 bg-amber-500/10',
  deployed:  'border-emerald-500/60 text-emerald-300 bg-emerald-500/10',
  stale:     'border-red-500/60 text-red-300 bg-red-500/10',
};

export const SopViewerPage = () => {
  const { id: sopId } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [sop, setSop] = useState<SopRecord | null>(null);
  const [sourceDocs, setSourceDocs] = useState<SopSourceDocRecord[]>([]);
  const [attestation, setAttestation] = useState<SopAttestationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sopId) return;
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token) { setError('Not authenticated'); setLoading(false); return; }
      const [sopRes, attRes] = await Promise.all([
        getSop(token, sopId),
        getSopAttestation(token, sopId),
      ]);
      if (cancelled) return;
      if (!sopRes.ok) { setError(sopRes.error ?? 'Failed to load SOP'); setLoading(false); return; }
      setSop(sopRes.data.sop);
      setSourceDocs(sopRes.data.sourceDocs);
      if (attRes.ok) setAttestation(attRes.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sopId, getToken]);

  if (loading) return (
    <div className="rounded border border-theme-border bg-theme-panel/60 p-4 text-sm text-theme-secondary">Loading SOP…</div>
  );
  if (error || !sop) return (
    <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error ?? 'SOP not found'}</div>
  );

  const sopDoc = extractSopDocument(sop);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">Standard Operating Procedure</p>
          <h1 className="mt-1 text-lg font-bold text-theme-text">{sop.procedureName}</h1>
          <p className="mt-0.5 text-sm text-theme-secondary">{sop.equipment}</p>
          {sop.moduleId && (
            <Link to="/studio" className="mt-1 inline-block text-xs text-theme-muted hover:text-theme-secondary">
              ← Paired training module
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-block rounded border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[sop.status] ?? STATUS_STYLES.draft}`}>
            {sop.status.replace('_', ' ')}
          </span>
          <Link
            to={`/audit/sops/${sopId}/review`}
            className="rounded border border-amber-500/50 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
          >
            Review
          </Link>
        </div>
      </div>

      {/* Attestation banner */}
      {attestation && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
          <span className="font-semibold">Attested</span> by {attestation.reviewerName} ({attestation.reviewerRole}) —{' '}
          {new Date(attestation.attestedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      )}

      {sop.status === 'in_review' && !attestation && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
          This SOP is pending competent person review and attestation before it can be deployed.
        </div>
      )}

      {/* Source documents */}
      {sourceDocs.length > 0 && (
        <div className="rounded border border-theme-border bg-theme-panel/60 px-4 py-4">
          <p className="text-xs font-semibold text-theme-secondary mb-2">Source Documentation</p>
          <div className="flex flex-wrap gap-2">
            {sourceDocs.map((doc) => (
              <span key={doc.id} className="rounded border border-theme-border bg-theme-surface px-2.5 py-1 text-xs text-theme-secondary">
                {doc.filename}
                {doc.pageCount ? ` (${doc.pageCount} pp.)` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {sopDoc ? (
        <>
          {/* Scope + Applicable Regulations */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded border border-theme-border bg-theme-panel/60 px-4 py-4">
              <p className="text-xs font-semibold text-theme-secondary mb-1">Scope</p>
              <p className="text-sm text-theme-secondary">{sopDoc.scope}</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-panel/60 px-4 py-4">
              <p className="text-xs font-semibold text-theme-secondary mb-2">Applicable Regulations</p>
              <div className="flex flex-wrap gap-1.5">
                {sopDoc.applicableRegulations.map((r) => (
                  <span key={r} className="rounded border border-theme-border bg-theme-surface px-2 py-0.5 text-xs text-theme-secondary">{r}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Prerequisites */}
          <div className="rounded border border-theme-border bg-theme-panel/60 px-4 py-4 space-y-3">
            <p className="text-xs font-semibold text-theme-secondary">Prerequisites</p>
            {sopDoc.prerequisites.ppe.length > 0 && (
              <div>
                <p className="text-xs font-medium text-theme-muted mb-1">PPE Required</p>
                <ul className="space-y-0.5">
                  {sopDoc.prerequisites.ppe.map((p, i) => <li key={i} className="text-xs text-theme-secondary">• {p}</li>)}
                </ul>
              </div>
            )}
            {sopDoc.prerequisites.conditions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-theme-muted mb-1">Conditions</p>
                <ul className="space-y-0.5">
                  {sopDoc.prerequisites.conditions.map((c, i) => <li key={i} className="text-xs text-theme-secondary">• {c}</li>)}
                </ul>
              </div>
            )}
            {sopDoc.prerequisites.documents.length > 0 && (
              <div>
                <p className="text-xs font-medium text-theme-muted mb-1">Documents / Certificates to Check</p>
                <ul className="space-y-0.5">
                  {sopDoc.prerequisites.documents.map((d, i) => <li key={i} className="text-xs text-theme-secondary">• {d}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-theme-secondary">Procedure Steps</p>
            {sopDoc.steps.map((step) => (
              <div
                key={step.stepNumber}
                className={`rounded border px-4 py-4 ${step.sourceRef === null ? 'border-red-500/40 bg-red-500/5' : 'border-theme-border bg-theme-panel/60'}`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 rounded bg-theme-surface px-2 py-0.5 text-xs font-bold tabular-nums text-theme-secondary">
                    {String(step.stepNumber).padStart(2, '0')}
                  </span>
                  <div className="flex-1 space-y-2 min-w-0">
                    <p className="text-sm font-medium text-theme-text">{step.action}</p>

                    {step.criticalValues && step.criticalValues.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {step.criticalValues.map((cv, i) => (
                          <span key={i} className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
                            {cv.label}: {cv.value}{cv.unit ? ` ${cv.unit}` : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    {step.warnings && step.warnings.length > 0 && (
                      <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2">
                        {step.warnings.map((w, i) => <p key={i} className="text-xs text-red-300">⚠ {w}</p>)}
                      </div>
                    )}

                    {step.safetyControls.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-theme-muted mb-1">Safety Controls</p>
                        <ul className="space-y-0.5">
                          {step.safetyControls.map((sc, i) => <li key={i} className="text-xs text-theme-secondary">• {sc}</li>)}
                        </ul>
                      </div>
                    )}

                    {step.regulatoryBasis.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {step.regulatoryBasis.map((r, i) => (
                          <span key={i} className="rounded border border-theme-border bg-theme-surface px-2 py-0.5 text-xs text-theme-secondary">{r}</span>
                        ))}
                      </div>
                    )}

                    {step.sourceRef ? (
                      <p className="text-xs text-theme-muted">
                        Source: {step.sourceRef.docTitle}
                        {step.sourceRef.page ? `, p.${step.sourceRef.page}` : ''}
                        {step.sourceRef.section ? ` §${step.sourceRef.section}` : ''}
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-red-400">
                        ⚠ Unattributed — Cat A finding. Cannot be confirmed from uploaded source documents.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Post-procedure */}
          {sopDoc.postProcedure.length > 0 && (
            <div className="rounded border border-theme-border bg-theme-panel/60 px-4 py-4">
              <p className="text-xs font-semibold text-theme-secondary mb-2">Post-Procedure Checks</p>
              <ul className="space-y-1">
                {sopDoc.postProcedure.map((p, i) => <li key={i} className="text-xs text-theme-secondary">• {p}</li>)}
              </ul>
            </div>
          )}

          {/* Emergency actions */}
          {sopDoc.emergencyActions.length > 0 && (
            <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-4">
              <p className="text-xs font-semibold text-red-400 mb-2">Emergency Actions</p>
              <ul className="space-y-1">
                {sopDoc.emergencyActions.map((a, i) => <li key={i} className="text-xs text-red-300">• {a}</li>)}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="rounded border border-theme-border bg-theme-panel/60 px-4 py-8 text-center">
          <p className="text-sm text-theme-secondary">
            {sop.status === 'draft' ? 'SOP generation not yet complete.' : 'SOP document not available.'}
          </p>
          {sop.status === 'draft' && (
            <Link to="/studio/new/module" className="mt-2 inline-block text-xs text-amber-400 hover:underline">
              Generate in Studio →
            </Link>
          )}
        </div>
      )}
    </div>
  );
};
