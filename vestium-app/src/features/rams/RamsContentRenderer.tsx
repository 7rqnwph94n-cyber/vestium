// ─── RAMS Content Renderer ────────────────────────────────────────────────────
// Content panel for GovernedReviewPage. Shows the RAMS document inline alongside
// the findings sidebar. Renders hazard matrix + method statement.

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Card } from '../../components/Card';
import type { ContentRendererProps } from '../governance/GovernedReviewPage';

const RISK_COLOR = (score: number) => {
  if (score >= 16) return 'bg-red-600/30 text-red-200 border-red-500/40';
  if (score >= 10) return 'bg-orange-600/30 text-orange-200 border-orange-500/40';
  if (score >= 5) return 'bg-amber-600/30 text-amber-200 border-amber-500/40';
  return 'bg-emerald-600/30 text-emerald-200 border-emerald-500/40';
};

interface HazardRow {
  id: string;
  hazard: string;
  activity: string;
  personsAtRisk: string[];
  initialRiskScore: number;
  residualRiskScore: number;
  controls: string[];
  regulatoryBasis: string[];
  sourceRef: string | null;
}

interface MethodStep {
  stepNumber: number;
  action: string;
  hazardRefs: string[];
  controls: string[];
  ppe: string[];
  checkpoints: string[];
  sourceRef: string | null;
}

interface RamsDraft {
  hazardMatrix: HazardRow[];
  methodStatement: MethodStep[];
  scope: string;
  applicableRegulations: string[];
  emergencyProcedures: string[];
  permits: string[];
}

export const RamsContentRenderer = ({ registryId, findings }: ContentRendererProps) => {
  const { getToken } = useAuth();
  const [draft] = useState<RamsDraft | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = await getToken();
      if (!token) return;

      // We need to find the ramsId from the registryId.
      // The generation status endpoint uses the ramsId, but we can look up via
      // content_registry's source_entity_id. For now, load from job state.
      // The GovernedReviewPage passes registryId — we need to get the RAMS data.

      // Try to get the draft from the generation job state
      // Since we don't have a direct registryId→ramsId API yet, we'll use a different approach
      setLoading(false);
    };
    void load();
  }, [getToken, registryId]);

  // For the review page, the RAMS content will be loaded by the parent and passed
  // via a ramsId prop. This renderer focuses on displaying the content.

  if (loading) return <p className="text-theme-muted text-sm">Loading RAMS content...</p>;

  if (!draft) {
    return (
      <Card>
        <p className="text-theme-muted text-sm italic">
          RAMS content will be displayed here once the review page loads the data.
        </p>
      </Card>
    );
  }

  const findingsForLocation = (loc: string) =>
    findings.filter((f) => f.location.includes(loc) && !f.disposition);

  return (
    <div className="space-y-4">
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
            const hazardFindings = findingsForLocation(`Hazard ${h.id}`);
            return (
              <div key={h.id} className={`rounded border p-2.5 ${RISK_COLOR(h.initialRiskScore)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{h.id}</span>
                      <span className="text-sm">{h.hazard}</span>
                      {hazardFindings.length > 0 && (
                        <span className="rounded bg-red-500/20 border border-red-500/40 px-1.5 py-0.5 text-[10px] text-red-300 font-semibold">
                          {hazardFindings.length} finding{hazardFindings.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs opacity-60">{h.activity}</p>
                  </div>
                  <div className="text-xs text-right">
                    <span className="opacity-60">Risk: </span>
                    <span className="font-bold">{h.initialRiskScore}</span>
                    <span className="opacity-60"> → </span>
                    <span className="font-bold">{h.residualRiskScore}</span>
                  </div>
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
            const stepFindings = findingsForLocation(`Step ${step.stepNumber}`);
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
                      {stepFindings.length > 0 && (
                        <span className="rounded bg-red-500/20 border border-red-500/40 px-1.5 py-0.5 text-[10px] text-red-300 font-semibold">
                          {stepFindings.length} finding{stepFindings.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {step.ppe.length > 0 && (
                      <p className="text-xs text-blue-400 mt-0.5">PPE: {step.ppe.join(', ')}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
