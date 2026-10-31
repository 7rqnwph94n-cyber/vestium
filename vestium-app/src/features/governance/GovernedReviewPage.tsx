// ─── Governed Review Page ─────────────────────────────────────────────────────
// Parameterized review page for any governed content type.
// Accepts a `contentRenderer` prop — content-type-specific view component that
// shows the actual content being reviewed (module lessons, SOP steps, RAMS
// hazard matrix, etc.). The governance sidebar (findings, attestation) is shared.

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { GovernedFinding, GovernedAttestation, FindingDisposition } from '@complianceforge/types';
import { Card } from '../../components/Card';
import { FindingsList } from './FindingsList';
import { AttestationForm } from './AttestationForm';
import { DispositionModal } from './DispositionModal';
import {
  listGovernedFindings,
  disposeGovernedFinding,
  seedGovernedFindings,
  getGovernedAttestation,
  createGovernedAttestation,
  logGovernedGateOpen,
  logGovernedGateUnlock,
} from '../../lib/api/client';

export interface ContentRendererProps {
  registryId: string;
  findings: GovernedFinding[];
}

interface GovernedReviewPageProps {
  registryId: string;
  contentHash: string;
  contentRenderer: (props: ContentRendererProps) => ReactNode;
  title?: string;
  onDeploy?: () => Promise<void>;
  deployed?: boolean;
}

export const GovernedReviewPage = ({
  registryId,
  contentHash,
  contentRenderer,
  title,
  onDeploy,
  deployed,
}: GovernedReviewPageProps) => {
  const { getToken } = useAuth();

  const [findings, setFindings] = useState<GovernedFinding[]>([]);
  const [attestation, setAttestation] = useState<GovernedAttestation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gatedFinding, setGatedFinding] = useState<GovernedFinding | null>(null);

  // ─── Load findings + attestation ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [findingsRes, attRes] = await Promise.all([
        listGovernedFindings(token, registryId),
        getGovernedAttestation(token, registryId),
      ]);
      if (findingsRes.ok) setFindings(findingsRes.data);
      if (attRes.ok) setAttestation(attRes.data);
    } catch {
      setError('Failed to load governance data');
    } finally {
      setLoading(false);
    }
  }, [getToken, registryId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const undisposedCount = findings.filter((f) => !f.disposition).length;

  // ─── Seed findings ──────────────────────────────────────────────────────────
  const handleSeed = async () => {
    const token = await getToken();
    if (!token) return;
    setError(null);
    setMessage(null);
    const res = await seedGovernedFindings(token, registryId);
    if (res.ok) {
      setMessage(`Imported ${res.data.created} finding${res.data.created !== 1 ? 's' : ''}, ${res.data.skipped} skipped.`);
      void loadData();
    } else {
      setError(res.error);
    }
  };

  // ─── Dispose finding (inline for low/medium, modal handles gated) ─────────
  const handleDispose = async (findingId: string, disposition: FindingDisposition, rationale: string) => {
    const token = await getToken();
    if (!token) throw new Error('No session token');
    const res = await disposeGovernedFinding(token, findingId, { disposition, rationale });
    if (!res.ok) throw new Error(res.error);
    setFindings((prev) => prev.map((f) => (f.id === findingId ? res.data : f)));
  };

  // ─── Gated window handlers ────────────────────────────────────────────────
  const handleGateOpen = async (findingId: string) => {
    const token = await getToken();
    if (!token) return;
    await logGovernedGateOpen(token, findingId);
  };

  const handleGateUnlock = async (findingId: string, answer: string, timerDuration: number) => {
    const token = await getToken();
    if (!token) throw new Error('No session token');
    const res = await logGovernedGateUnlock(token, findingId, { answer, timerDuration });
    if (!res.ok) throw new Error(res.error);
  };

  const openGatedReview = async (findingId: string) => {
    const f = findings.find((x) => x.id === findingId);
    if (f) setGatedFinding(f);
  };

  // ─── Attestation ──────────────────────────────────────────────────────────
  const handleAttest = async (form: {
    reviewerName: string;
    reviewerRole: string;
    basisOfCompetence: string;
    regulatoryFrameworksReviewed: string[];
    explicitAcceptance: string;
    contentHashAtAttestation: string;
  }) => {
    const token = await getToken();
    if (!token) throw new Error('No session token');
    const res = await createGovernedAttestation(token, registryId, form);
    if (!res.ok) throw new Error(res.error);
    setAttestation(res.data);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="rounded border border-theme-border bg-theme-panel/60 p-4 text-sm text-theme-secondary">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {title && <h1 className="text-lg font-bold text-theme-text">{title}</h1>}

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}
      {message && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-300">{message}</div>
      )}

      <div className="flex gap-6 items-start">
        {/* Left: content-type-specific view */}
        <div className="flex-1 min-w-0">
          {contentRenderer({ registryId, findings })}
        </div>

        {/* Right: governance sidebar */}
        <div className="w-96 shrink-0 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto space-y-4 pr-1">
          {/* Findings */}
          <Card title="Findings">
            <div className="space-y-3">
              {!attestation && (
                <button
                  onClick={() => void handleSeed()}
                  className="text-xs bg-theme-raised hover:bg-theme-raised text-theme-text px-3 py-1.5 rounded transition-colors"
                >
                  Import findings
                </button>
              )}
              <FindingsList
                findings={findings}
                onDispose={handleDispose}
                onGateOpen={openGatedReview}
                disabled={!!attestation}
              />
            </div>
          </Card>

          {/* Attestation */}
          <Card title="Attestation">
            <AttestationForm
              attestation={attestation}
              undisposedCount={undisposedCount}
              contentHash={contentHash}
              onSubmit={handleAttest}
              onDeploy={onDeploy}
              deployed={deployed}
              disabled={false}
            />
          </Card>
        </div>
      </div>

      {/* Gated disposition modal */}
      {gatedFinding && (
        <DispositionModal
          finding={gatedFinding}
          onDispose={handleDispose}
          onGateOpen={handleGateOpen}
          onGateUnlock={handleGateUnlock}
          onClose={() => setGatedFinding(null)}
        />
      )}
    </div>
  );
};
