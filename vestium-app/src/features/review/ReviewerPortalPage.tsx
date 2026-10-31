import { useEffect, useMemo, useState } from 'react';
import { useAuth, SignInButton, SignedOut, SignedIn } from '@clerk/clerk-react';
import type { AttestationRecord, ModuleRecord, RegulatoryContradiction, ReviewFinding } from '@complianceforge/types';
import {
  createAttestation,
  createFinding,
  downloadAuditPack,
  generateModuleCert,
  getAttestation,
  getLearnerModule,
  isBackendMode,
  listContradictions,
  listFindings,
  listModules,
  seedFindingsFromGeneration,
  setFindingDisposition,
} from '../../lib/api/client';
import { Card } from '../../components/Card';
import { DiagramRenderer } from '../../components/DiagramRenderer';
import { GatedWindowModal } from './GatedWindowModal';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import type { AssembledModule } from '../studio/generator/types';
import type { TrainingLesson, TrainingStage, TrainingQuestion } from '../../lib/training-core/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  deployed: 'Deployed',
};

const EMPTY_FINDING = {
  severity: 'medium' as const,
  category: 'B' as const,
  description: '',
  location: '',
  regulatoryRef: '',
};

const DEFAULT_ACCEPTANCE =
  'I attest that this module has been reviewed and accepted under my professional responsibility.';

const severityRank: Record<ReviewFinding['severity'], number> = {
  regulatory: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const severityColour: Record<ReviewFinding['severity'], string> = {
  regulatory: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  low: 'bg-theme-raised text-theme-secondary border-theme-border',
};

function isVerificationItem(c: RegulatoryContradiction): boolean {
  return c.aiVerdict.toLowerCase().startsWith('pass');
}

// ─── Finding location helpers ─────────────────────────────────────────────────

function findingsForLoc(findings: ReviewFinding[], lessonId: string): ReviewFinding[] {
  // Match seeded findings ("lesson:s1-l1", "quiz:s1-l1-q0") and manual freetext
  // by checking if the finding location string contains the lesson id.
  return findings.filter((f) => f.location.toLowerCase().includes(lessonId.toLowerCase()));
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ReviewerPortalPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  // Module list
  const [modules, setModules] = useState<ModuleRecord[]>([]);
  const [moduleId, setModuleId] = useState('');

  // Review data
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [contradictions, setContradictions] = useState<RegulatoryContradiction[]>([]);
  const [attestation, setAttestation] = useState<AttestationRecord | null>(null);

  // Module content (assembled curriculum for content panel)
  const [moduleContent, setModuleContent] = useState<AssembledModule | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [downloadingPack, setDownloadingPack] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Finding form
  const [newFinding, setNewFinding] = useState(EMPTY_FINDING);
  const [showAddFinding, setShowAddFinding] = useState(false);

  // Attestation form
  const [attestationForm, setAttestationForm] = useState({
    reviewerName: '',
    reviewerRole: '',
    basisOfCompetence: '',
    regulatoryFrameworksCsv: '',
    explicitAcceptance: DEFAULT_ACCEPTANCE,
    contentHashAtAttestation: '',
  });

  // ── Derived state ───────────────────────────────────────────────────────────

  const undisposedCount = useMemo(
    () => findings.filter((f) => !f.disposition).length,
    [findings]
  );

  const sortedFindings = useMemo(
    () =>
      [...findings].sort((a, b) => {
        const aDisposed = Boolean(a.disposition);
        const bDisposed = Boolean(b.disposition);
        if (aDisposed !== bDisposed) return aDisposed ? 1 : -1;
        return severityRank[a.severity] - severityRank[b.severity];
      }),
    [findings]
  );

  const canSubmitAttestation =
    undisposedCount === 0 &&
    attestationForm.reviewerName.trim().length > 0 &&
    attestationForm.reviewerRole.trim().length > 0 &&
    attestationForm.basisOfCompetence.trim().length > 0 &&
    attestationForm.regulatoryFrameworksCsv.trim().length > 0 &&
    attestationForm.explicitAcceptance.trim().length > 0 &&
    attestationForm.contentHashAtAttestation.trim().length > 0;

  const selectedModule = modules.find((m) => m.id === moduleId);
  const verificationItems = contradictions.filter(isVerificationItem);
  const contradictionItems = contradictions.filter((c) => !isVerificationItem(c));
  const actionableContradictions = contradictionItems.filter((c) => c.requiresHumanResolution);

  // ── Load module list ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isBackendMode()) return;
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      const token = await getToken();
      if (!token) { if (!cancelled) { setError('Session expired. Please sign in again.'); setLoading(false); } return; }
      const res = await listModules(token);
      if (!cancelled) {
        if (!res.ok) { setError(res.error); }
        else {
          const reviewable = res.data.filter((m) => m.status !== 'draft');
          setModules(reviewable);
          setModuleId((prev) => prev || reviewable[0]?.id || '');
        }
        setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [getToken, isLoaded, isSignedIn]);

  // ── Load review data + module content when module changes ───────────────────

  useEffect(() => {
    if (!moduleId) {
      setFindings([]); setContradictions([]); setAttestation(null); setModuleContent(null);
      return;
    }
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    const load = async () => {
      const token = await getToken();
      if (!token) return;
      setContentLoading(true);

      const [findingsRes, attestationRes, contradictionsRes, contentRes] = await Promise.all([
        listFindings(token, moduleId),
        getAttestation(token, moduleId),
        listContradictions(token, moduleId),
        getLearnerModule(token, moduleId),
      ]);

      if (!cancelled) {
        const loadedFindings = findingsRes.ok ? findingsRes.data : [];
        const loadedAttestation = attestationRes.ok ? attestationRes.data : null;
        if (findingsRes.ok) setFindings(loadedFindings);
        else setError(findingsRes.error);
        setAttestation(loadedAttestation);
        setContradictions(contradictionsRes.ok ? contradictionsRes.data : []);
        setModuleContent(contentRes.ok ? contentRes.data as AssembledModule : null);
        setContentLoading(false);

        // Auto-import findings on first load if none exist and not yet attested
        if (loadedFindings.length === 0 && !loadedAttestation) {
          const seedRes = await seedFindingsFromGeneration(token, moduleId);
          if (!cancelled && seedRes.ok && seedRes.data.created > 0) {
            const refreshed = await listFindings(token, moduleId);
            if (!cancelled && refreshed.ok) setFindings(refreshed.data);
            setMessage(`Auto-imported ${seedRes.data.created} finding${seedRes.data.created !== 1 ? 's' : ''} from automated checks.`);
          }
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [getToken, isLoaded, isSignedIn, moduleId]);

  // ── Populate attestation form defaults from selected module ─────────────────

  useEffect(() => {
    if (!selectedModule) return;
    setAttestationForm((prev) => ({
      ...prev,
      regulatoryFrameworksCsv:
        prev.regulatoryFrameworksCsv ||
        selectedModule.regulatoryClassification.primarySchemaTitle ||
        'MHSWR 1999',
      contentHashAtAttestation:
        prev.contentHashAtAttestation || selectedModule.contentHash || `pending-${selectedModule.id}`,
    }));
  }, [selectedModule]);

  // ── Action handlers ─────────────────────────────────────────────────────────

  const onCreateFinding = async () => {
    setMessage(null); setError(null);
    if (!moduleId) { setError('Select a module first.'); return; }
    if (!newFinding.description.trim() || !newFinding.location.trim()) {
      setError('Finding description and location are required.'); return;
    }
    const token = await getToken();
    if (!token) { setError('Session expired. Please sign in again.'); return; }
    const res = await createFinding(token, moduleId, {
      severity: newFinding.severity,
      category: newFinding.category,
      description: newFinding.description.trim(),
      location: newFinding.location.trim(),
      regulatoryRef: newFinding.regulatoryRef.trim() || undefined,
    });
    if (!res.ok) { setError(res.error); return; }
    setFindings((prev) => [...prev, res.data]);
    setNewFinding(EMPTY_FINDING);
    setMessage('Finding added.');
  };

  const onDisposition = async (
    finding: ReviewFinding,
    findingId: string,
    disposition: 'accepted' | 'amended' | 'escalated',
    rationale: string
  ) => {
    setMessage(null); setError(null);
    const minRationale = finding.severity === 'regulatory' ? 10 : 5;
    if (rationale.trim().length < minRationale) {
      setError(
        finding.severity === 'regulatory'
          ? 'Regulatory findings require rationale of at least 10 characters.'
          : 'Resolution rationale must be at least 5 characters.'
      );
      return;
    }
    const token = await getToken();
    if (!token) { setError('Session expired. Please sign in again.'); return; }
    const res = await setFindingDisposition(token, findingId, { disposition, rationale });
    if (!res.ok) { setError(res.error); return; }
    setFindings((prev) => prev.map((f) => (f.id === findingId ? res.data : f)));
    setMessage('Finding resolution saved.');
  };

  const onAttest = async () => {
    setMessage(null); setError(null);
    if (!moduleId) { setError('Select a module first.'); return; }
    const token = await getToken();
    if (!token) { setError('Session expired. Please sign in again.'); return; }
    const res = await createAttestation(token, moduleId, {
      reviewerName: attestationForm.reviewerName.trim(),
      reviewerRole: attestationForm.reviewerRole.trim(),
      basisOfCompetence: attestationForm.basisOfCompetence.trim(),
      regulatoryFrameworksReviewed: attestationForm.regulatoryFrameworksCsv.split(',').map((s) => s.trim()).filter(Boolean),
      explicitAcceptance: attestationForm.explicitAcceptance.trim(),
      contentHashAtAttestation: attestationForm.contentHashAtAttestation.trim(),
    });
    if (!res.ok) { setError(res.error); return; }
    setAttestation(res.data);
    setMessage('Attestation completed.');
  };

  const onDeploy = async () => {
    setMessage(null); setError(null);
    if (!moduleId) { setError('Select a module first.'); return; }
    const token = await getToken();
    if (!token) { setError('Session expired. Please sign in again.'); return; }
    setDeploying(true);
    try {
      const res = await generateModuleCert(token, moduleId);
      if (!res.ok) { setError(res.error); return; }
      setModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, status: 'deployed' as const } : m)));
      const snapLabel = res.data.snapshotVersion != null ? ` (snapshot v${res.data.snapshotVersion})` : '';
      setMessage(`Module deployed. Certificate ${res.data.certNumber} issued${snapLabel}.`);
    } finally {
      setDeploying(false);
    }
  };

  const onDownloadAuditPack = async () => {
    if (!moduleId) return;
    const token = await getToken();
    if (!token) { setError('Session expired. Please sign in again.'); return; }
    setDownloadingPack(true);
    setError(null);
    try {
      const blob = await downloadAuditPack(token, moduleId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-pack-${moduleId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Audit pack downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingPack(false);
    }
  };

  const [batchResolving, setBatchResolving] = useState(false);

  const onBatchResolve = async () => {
    setMessage(null); setError(null);
    const nonGated = findings.filter((f) => !f.disposition && f.severity !== 'regulatory' && f.severity !== 'high');
    if (nonGated.length === 0) return;
    const token = await getToken();
    if (!token) { setError('Session expired. Please sign in again.'); return; }
    setBatchResolving(true);
    try {
      const results = await Promise.allSettled(
        nonGated.map((f) =>
          setFindingDisposition(token, f.id, { disposition: 'accepted', rationale: 'Accepted — advisory finding reviewed.' })
        )
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.ok);
      if (succeeded.length > 0) {
        const refreshed = await listFindings(token, moduleId);
        if (refreshed.ok) setFindings(refreshed.data);
      }
      setMessage(`Resolved ${succeeded.length} of ${nonGated.length} advisory finding${nonGated.length !== 1 ? 's' : ''}.`);
    } finally {
      setBatchResolving(false);
    }
  };

  const onSeedFindings = async () => {
    setMessage(null); setError(null);
    if (!moduleId) { setError('Select a module first.'); return; }
    const token = await getToken();
    if (!token) { setError('Session expired. Please sign in again.'); return; }
    const res = await seedFindingsFromGeneration(token, moduleId);
    if (!res.ok) { setError(res.error); return; }
    const findingsRes = await listFindings(token, moduleId);
    if (findingsRes.ok) setFindings(findingsRes.data);
    setMessage(`Imported ${res.data.created} finding${res.data.created !== 1 ? 's' : ''} from automated checks.`);
  };

  // ── Guard: backend mode ─────────────────────────────────────────────────────

  if (!isBackendMode()) {
    return (
      <Card>
        <p className="text-sm text-theme-secondary">
          Reviewer Portal requires a backend connection. Please contact your administrator.
        </p>
      </Card>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-theme-border bg-theme-panel px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-base font-semibold text-theme-text">Reviewer Portal</h1>
          <SignedOut>
            <SignInButton mode="modal">
              <button type="button" className="rounded border border-theme-border px-3 py-1 text-xs text-theme-text">
                Sign in to review
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <select
              className="rounded border border-theme-border bg-theme-surface px-3 py-1.5 text-sm text-theme-text"
              value={moduleId}
              onChange={(e) => { setModuleId(e.target.value); setMessage(null); setError(null); }}
            >
              <option value="">Select module…</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({statusLabels[m.status] ?? m.status})
                </option>
              ))}
            </select>
          </SignedIn>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {loading ? <span className="text-theme-secondary">Loading…</span> : null}
          {undisposedCount > 0 ? (
            <span className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-300">
              {undisposedCount} pending review
            </span>
          ) : moduleId ? (
            <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
              All findings reviewed
            </span>
          ) : null}
          {actionableContradictions.length > 0 ? (
            <span className="rounded border border-red-500/50 bg-red-500/10 px-2 py-0.5 font-semibold text-red-300">
              {actionableContradictions.length} contradiction(s)
            </span>
          ) : null}
          {verificationItems.length > 0 ? (
            <span className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-300">
              {verificationItems.length} verification(s)
            </span>
          ) : null}
          {selectedModule?.status && selectedModule.status !== 'deployed' ? (
            <button
              type="button"
              disabled={deploying || !attestation}
              onClick={() => void onDeploy()}
              title={!attestation ? 'Complete attestation first' : undefined}
              className="rounded bg-emerald-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              {deploying ? 'Deploying…' : attestation ? 'Deploy module' : 'Deploy module (attest first)'}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Status messages ── */}
      {error ? <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-300">{message}</div> : null}

      {moduleId ? (
        <div className="flex gap-6 items-start">
          {/* ── Left: module content ── */}
          <div className="flex-1 min-w-0 space-y-4">
            {contentLoading ? (
              <div className="rounded border border-theme-border bg-theme-panel px-6 py-10 text-center text-sm text-theme-secondary">
                Loading module content…
              </div>
            ) : moduleContent ? (
              <ModuleContentView
                curriculum={moduleContent.curriculum}
                findings={findings}
              />
            ) : (
              <div className="rounded border border-theme-border bg-theme-panel px-6 py-10 text-center text-sm text-theme-secondary">
                Module content unavailable — the module may still be generating.
              </div>
            )}
          </div>

          {/* ── Right: review sidebar ── */}
          <div className="w-96 shrink-0 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto space-y-4 pr-1">
            {/* Verification queue + contradictions */}
            {contradictions.length > 0 ? (
              <Card className="space-y-3 border-red-800/50">
                {verificationItems.length > 0 ? (
                  <>
                    <h2 className="text-sm font-semibold text-amber-300">
                      Regulatory Verification Queue
                      <span className="ml-2 rounded bg-amber-900/50 px-1.5 py-0.5 text-xs">
                        {verificationItems.length} require human verification
                      </span>
                    </h2>
                    <p className="text-xs text-theme-secondary">
                      AI assessed these statutory claims as supported. They still require independent human verification before deployment.
                    </p>
                    {verificationItems.map((c, i) => (
                      <ContradictionRow key={`verify-${c.findingId}-${i}`} contradiction={c} />
                    ))}
                  </>
                ) : null}
                {contradictionItems.length > 0 ? (
                  <>
                    <h2 className="text-sm font-semibold text-red-300">
                      Regulatory Contradictions
                      <span className="ml-2 rounded bg-red-900/50 px-1.5 py-0.5 text-xs">
                        {actionableContradictions.length} require action
                      </span>
                    </h2>
                    <p className="text-xs text-theme-secondary">
                      AI outputs that conflict with the regulatory source position or remain unresolved. Your decision is permanently recorded in the audit log.
                    </p>
                    {contradictionItems.map((c, i) => (
                      <ContradictionRow key={`contra-${c.findingId}-${i}`} contradiction={c} />
                    ))}
                  </>
                ) : null}
              </Card>
            ) : null}

            {/* Findings list */}
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-theme-text">Findings</h2>
                <div className="flex items-center gap-1.5">
                  {(() => {
                    const nonGatedUndisposed = findings.filter((f) => !f.disposition && f.severity !== 'regulatory' && f.severity !== 'high');
                    return nonGatedUndisposed.length > 0 && !attestation ? (
                      <button
                        type="button"
                        disabled={batchResolving}
                        onClick={() => void onBatchResolve()}
                        className="rounded border border-emerald-500/50 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                      >
                        {batchResolving ? 'Resolving…' : `Accept all ${nonGatedUndisposed.length} advisory`}
                      </button>
                    ) : null;
                  })()}
                  <button
                    type="button"
                    onClick={() => void onSeedFindings()}
                    className="rounded border border-sky-500/50 px-2 py-0.5 text-xs text-sky-300 hover:bg-sky-500/10"
                  >
                    Import findings
                  </button>
                </div>
              </div>
              {sortedFindings.length === 0 ? (
                <p className="text-xs text-theme-secondary">No findings yet. Import from the automated checks or add manually below.</p>
              ) : (
                sortedFindings.map((f) => (
                  <FindingRow key={f.id} finding={f} moduleId={moduleId} onDisposition={onDisposition} />
                ))
              )}
            </Card>

            {/* Add finding (collapsed by default) */}
            <Card className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAddFinding((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <h2 className="text-sm font-semibold text-theme-text">Add Finding</h2>
                <span className="text-xs text-theme-muted">{showAddFinding ? 'Hide' : 'Show'}</span>
              </button>
              {showAddFinding && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                      value={newFinding.severity}
                      onChange={(e) => setNewFinding((p) => ({ ...p, severity: e.target.value as typeof p.severity }))}
                    >
                      <option value="regulatory">Regulatory</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <select
                      className="rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                      value={newFinding.category}
                      onChange={(e) => setNewFinding((p) => ({ ...p, category: e.target.value as typeof p.category }))}
                    >
                      <option value="A">Category A — Regulatory Error</option>
                      <option value="B">Category B — Advisory</option>
                    </select>
                  </div>
                  <input
                    className="w-full rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                    placeholder="Location (e.g. Stage 1, Lesson 2)"
                    value={newFinding.location}
                    onChange={(e) => setNewFinding((p) => ({ ...p, location: e.target.value }))}
                  />
                  <input
                    className="w-full rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                    placeholder="Regulatory reference (optional)"
                    value={newFinding.regulatoryRef}
                    onChange={(e) => setNewFinding((p) => ({ ...p, regulatoryRef: e.target.value }))}
                  />
                  <textarea
                    className="w-full rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                    rows={3}
                    placeholder="Finding description"
                    value={newFinding.description}
                    onChange={(e) => setNewFinding((p) => ({ ...p, description: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => void onCreateFinding()}
                    className="w-full rounded bg-amber-400 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300"
                  >
                    Add finding
                  </button>
                </div>
              )}
            </Card>

            {/* Attestation */}
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold text-theme-text">Attestation</h2>
              {attestation ? (
                <div className="space-y-2">
                  <div className="space-y-0.5 text-xs text-theme-secondary">
                    <p>Attested by: <span className="text-theme-text">{attestation.reviewerName}</span></p>
                    <p>Role: {attestation.reviewerRole}</p>
                    <p>At: {new Date(attestation.attestedAt).toLocaleString()}</p>
                    {attestation.snapshotVersion != null && (
                      <p>Snapshot: <span className="font-mono text-theme-text">v{attestation.snapshotVersion}</span></p>
                    )}
                  </div>
                  {selectedModule?.status !== 'deployed' ? (
                    <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                      <p className="text-xs font-semibold text-emerald-200">Ready to deploy</p>
                      <p className="text-xs text-theme-secondary">
                        Deploying issues the module certificate and makes it available to learners.
                      </p>
                      <button
                        type="button"
                        disabled={deploying}
                        onClick={() => void onDeploy()}
                        className="w-full rounded bg-emerald-500 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
                      >
                        {deploying ? 'Deploying…' : 'Deploy module'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-emerald-400">Module is deployed.</p>
                      <button
                        type="button"
                        disabled={downloadingPack}
                        onClick={() => void onDownloadAuditPack()}
                        className="w-full rounded border border-amber-500/50 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
                      >
                        {downloadingPack ? 'Generating\u2026' : 'Download Audit Pack'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {undisposedCount > 0 ? (
                    <p className="text-xs text-amber-300">
                      {undisposedCount} finding{undisposedCount !== 1 ? 's' : ''} pending review — attestation locked.
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-300">All findings reviewed. You may proceed with attestation.</p>
                  )}
                  <input
                    className="w-full rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                    placeholder="Reviewer name"
                    value={attestationForm.reviewerName}
                    onChange={(e) => setAttestationForm((p) => ({ ...p, reviewerName: e.target.value }))}
                  />
                  <input
                    className="w-full rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                    placeholder="Reviewer role"
                    value={attestationForm.reviewerRole}
                    onChange={(e) => setAttestationForm((p) => ({ ...p, reviewerRole: e.target.value }))}
                  />
                  <textarea
                    className="w-full rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                    rows={2}
                    placeholder="Professional qualifications and basis of competence"
                    value={attestationForm.basisOfCompetence}
                    onChange={(e) => setAttestationForm((p) => ({ ...p, basisOfCompetence: e.target.value }))}
                  />
                  <input
                    className="w-full rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                    placeholder="Regulatory frameworks reviewed (e.g. MHSWR 1999, PUWER 1998)"
                    value={attestationForm.regulatoryFrameworksCsv}
                    onChange={(e) => setAttestationForm((p) => ({ ...p, regulatoryFrameworksCsv: e.target.value }))}
                  />
                  <textarea
                    className="w-full rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
                    rows={2}
                    placeholder="Explicit acceptance statement"
                    value={attestationForm.explicitAcceptance}
                    onChange={(e) => setAttestationForm((p) => ({ ...p, explicitAcceptance: e.target.value }))}
                  />
                  <input type="hidden" value={attestationForm.contentHashAtAttestation} />
                  <button
                    type="button"
                    disabled={!canSubmitAttestation}
                    onClick={() => void onAttest()}
                    className="w-full rounded bg-sky-400 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-40"
                  >
                    Complete attestation
                  </button>
                </div>
              )}
            </Card>

            {/* Version History */}
            <VersionHistoryPanel
              moduleId={moduleId}
              attestationSnapshotVersion={attestation?.snapshotVersion}
            />
          </div>
        </div>
      ) : (
        <Card>
          <p className="text-sm text-theme-secondary">Select a module above to begin review.</p>
        </Card>
      )}
    </div>
  );
}

// ─── Module content viewer ────────────────────────────────────────────────────

function ModuleContentView(props: {
  curriculum: TrainingStage[];
  findings: ReviewFinding[];
}) {
  const { curriculum, findings } = props;
  return (
    <div className="space-y-6">
      {curriculum.map((stage) => (
        <StageSection key={stage.id} stage={stage} findings={findings} />
      ))}
    </div>
  );
}

function StageSection(props: { stage: TrainingStage; findings: ReviewFinding[] }) {
  const { stage, findings } = props;
  return (
    <div className="rounded-lg border border-theme-border bg-theme-panel overflow-hidden">
      {/* Stage header */}
      <div className="border-b border-theme-border bg-theme-surface px-5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-0.5">
          Stage {stage.id}
        </p>
        <h2 className="text-base font-semibold text-theme-text">{stage.title}</h2>
        {stage.description ? (
          <p className="mt-1 text-xs text-theme-secondary">{stage.description}</p>
        ) : null}
      </div>

      {/* Lessons */}
      <div className="divide-y divide-theme-border-subtle">
        {stage.lessons.map((lesson) => (
          <LessonSection key={lesson.id} lesson={lesson} stageId={stage.id} findings={findings} />
        ))}
      </div>

      {/* Stage test */}
      {stage.test.length > 0 ? (
        <div className="border-t border-theme-border bg-theme-surface px-5 py-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
            Stage {stage.id} Test — {stage.test.length} question{stage.test.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {stage.test.map((q, i) => (
              <QuestionCard key={q.id} question={q} index={i} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LessonSection(props: {
  lesson: TrainingLesson;
  stageId: number;
  findings: ReviewFinding[];
}) {
  const { lesson, findings } = props;
  const [expanded, setExpanded] = useState(true);

  const lessonFindings = findingsForLoc(findings, lesson.id);
  const undisposedLessonFindings = lessonFindings.filter((f) => !f.disposition);

  return (
    <div className="px-5 py-4">
      {/* Lesson header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">
              Lesson {lesson.id}
            </span>
            {lessonFindings.length > 0 ? (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                undisposedLessonFindings.length > 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              }`}>
                {undisposedLessonFindings.length > 0
                  ? `⚠ ${undisposedLessonFindings.length} finding${undisposedLessonFindings.length !== 1 ? 's' : ''}`
                  : `✓ ${lessonFindings.length} reviewed`}
              </span>
            ) : null}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-theme-text">{lesson.title}</h3>
          {lesson.objective ? (
            <p className="mt-0.5 text-xs text-theme-secondary italic">{lesson.objective}</p>
          ) : null}
        </div>
        <span className="mt-1 shrink-0 text-theme-muted">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4">
          {/* Concept paragraphs */}
          {lesson.concept.length > 0 ? (
            <div className="space-y-2">
              {lesson.concept.map((para, i) => (
                <p key={i} className="text-sm leading-relaxed text-theme-secondary">
                  {para}
                </p>
              ))}
            </div>
          ) : null}

          {/* Worked example */}
          {lesson.workedExample ? (
            <div className="rounded border border-theme-border bg-theme-surface px-4 py-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-sky-500">
                Worked Example
              </p>
              <p className="text-sm leading-relaxed text-theme-secondary">{lesson.workedExample}</p>
            </div>
          ) : null}

          {/* Diagrams */}
          {lesson.diagrams.length > 0 ? (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                Diagrams — {lesson.diagrams.length}
              </p>
              <div className="space-y-3">
                {lesson.diagrams.map((diagram) => (
                  <div key={diagram.id} className="rounded border border-theme-border bg-theme-surface px-3 py-2.5">
                    <DiagramRenderer diagram={diagram} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Quiz questions */}
          {lesson.quiz.length > 0 ? (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                Quiz — {lesson.quiz.length} question{lesson.quiz.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {lesson.quiz.map((q, i) => (
                  <QuestionCard key={q.id} question={q} index={i} />
                ))}
              </div>
            </div>
          ) : null}

          {/* Inline finding list for this lesson */}
          {lessonFindings.length > 0 ? (
            <div className="rounded border border-amber-700/40 bg-amber-950/20 px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Review Findings for this lesson
              </p>
              {lessonFindings.map((f) => (
                <div key={f.id} className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${severityColour[f.severity]}`}>
                    {f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-theme-text leading-snug">{f.description.split('\n')[0]}</p>
                    {f.disposition ? (
                      <p className="text-[10px] text-theme-muted mt-0.5">Resolved: {f.disposition.charAt(0).toUpperCase() + f.disposition.slice(1)}</p>
                    ) : (
                      <p className="text-[10px] text-amber-400 mt-0.5">Pending review — see sidebar</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QuestionCard(props: { question: TrainingQuestion; index: number }) {
  const { question, index } = props;
  const hasOptions = Array.isArray(question.options) && question.options.length > 0;
  const isTf = question.type === 'tf';
  const isVerbal = question.type === 'verbal';
  const hasAnswer = typeof question.answer !== 'undefined';
  const tfAnswerLabel =
    typeof question.answer === 'boolean' ? (question.answer ? 'True' : 'False') : null;

  return (
    <div className="rounded border border-theme-border bg-theme-surface px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="shrink-0 rounded bg-theme-raised px-1.5 py-0.5 text-[10px] font-bold text-theme-secondary">
          Q{index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-theme-text leading-snug">{question.prompt}</p>
          {hasOptions ? (
            <ul className="mt-1.5 space-y-0.5">
              {question.options!.map((opt, i) => (
                <li
                  key={i}
                  className={`text-xs ${
                    opt === question.answer
                      ? 'text-emerald-300 font-medium'
                      : 'text-theme-secondary'
                  }`}
                >
                  {String.fromCharCode(65 + i)}. {opt}
                  {opt === question.answer ? ' ✓' : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {isTf ? (
            <p className="mt-1.5 text-xs text-emerald-300">
              Correct answer: {tfAnswerLabel ?? 'Not set'}
            </p>
          ) : null}
          {!isTf && !isVerbal && !hasOptions ? (
            <p className="mt-1.5 text-xs text-emerald-300">
              Correct answer: {hasAnswer ? String(question.answer) : 'Not set'}
            </p>
          ) : null}
          {isVerbal ? (
            <p className="mt-1.5 text-xs text-sky-300">
              Verbal check: no fixed answer key
              {question.timerSeconds ? ` (${question.timerSeconds}s)` : ''}
            </p>
          ) : null}
          {question.explanation ? (
            <p className="mt-1.5 text-[11px] text-theme-muted italic">{question.explanation}</p>
          ) : null}
          {question.regulatoryRef ? (
            <p className="mt-1 text-[11px] font-medium text-amber-400">{question.regulatoryRef}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Finding row (sidebar) ────────────────────────────────────────────────────

function FindingRow(props: {
  finding: ReviewFinding;
  moduleId: string;
  onDisposition: (
    finding: ReviewFinding,
    findingId: string,
    disposition: 'accepted' | 'amended' | 'escalated',
    rationale: string
  ) => Promise<void>;
}) {
  const { finding, moduleId, onDisposition } = props;
  const [rationale, setRationale] = useState(finding.dispositionRationale ?? '');
  const [gateOpen, setGateOpen] = useState(false);
  const minRationale = finding.severity === 'regulatory' ? 10 : 5;
  const rationaleOk = rationale.trim().length >= minRationale;
  const needsGate = !finding.disposition && (finding.severity === 'regulatory' || finding.severity === 'high');

  return (
    <>
      {gateOpen && (
        <GatedWindowModal
          finding={finding}
          moduleId={moduleId}
          onComplete={(disposition, gateRationale) => {
            setGateOpen(false);
            void onDisposition(finding, finding.id, disposition, gateRationale);
          }}
        />
      )}
      <div className={`rounded border p-2.5 space-y-2 ${
        finding.disposition ? 'border-theme-border bg-theme-panel opacity-70' : 'border-theme-border bg-theme-panel'
      }`}>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className={`rounded border px-1.5 py-0.5 font-bold ${severityColour[finding.severity]}`}>
            {finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}
          </span>
          <span className="rounded border border-theme-border px-1.5 py-0.5 text-theme-secondary">Cat {finding.category}</span>
          <span className="text-theme-secondary truncate max-w-[160px]" title={finding.location}>{finding.location}</span>
        </div>
        <p className="text-xs text-theme-text leading-snug">{finding.description.split('\n')[0]}</p>
        {finding.regulatoryRef ? (
          <p className="text-[11px] text-amber-300">Ref: {finding.regulatoryRef}</p>
        ) : null}

        {finding.disposition ? (
          <p className="text-[11px] text-emerald-400">
            {finding.disposition} — {finding.dispositionRationale?.slice(0, 80)}
          </p>
        ) : needsGate ? (
          <button
            type="button"
            onClick={() => setGateOpen(true)}
            className="w-full rounded border border-red-500/50 py-1.5 text-[10px] font-semibold text-red-300 hover:bg-red-500/10"
          >
            Review finding →
          </button>
        ) : (
          <>
            <textarea
              className="w-full rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text"
              rows={2}
              placeholder={`Rationale (${minRationale}+ chars)`}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
            <div className="flex gap-1.5">
              {(['accepted', 'amended', 'escalated'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={!rationaleOk}
                  onClick={() => void onDisposition(finding, finding.id, d, rationale)}
                  className={`flex-1 rounded border py-1 text-[10px] font-semibold disabled:opacity-40 ${
                    d === 'accepted'
                      ? 'border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/10'
                      : d === 'amended'
                      ? 'border-amber-500/60 text-amber-300 hover:bg-amber-500/10'
                      : 'border-red-500/60 text-red-300 hover:bg-red-500/10'
                  }`}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Contradiction row (sidebar) ──────────────────────────────────────────────

function ContradictionRow(props: { contradiction: RegulatoryContradiction }) {
  const { contradiction: c } = props;
  const confidencePct = (c.confidence * 100).toFixed(0);
  const verificationOnly = isVerificationItem(c);

  return (
    <div className={`rounded border p-2.5 space-y-2 text-xs ${
      c.requiresHumanResolution
        ? verificationOnly
          ? 'border-amber-700/60 bg-amber-950/30'
          : 'border-red-700/60 bg-red-950/30'
        : 'border-theme-border bg-theme-base'
    }`}>
      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
          c.requiresHumanResolution
            ? verificationOnly
              ? 'bg-amber-900/60 text-amber-200'
              : 'bg-red-900/60 text-red-200'
            : 'bg-theme-panel text-theme-text'
        }`}>
          {c.requiresHumanResolution
            ? verificationOnly
              ? 'Requires Verification'
              : 'Requires Your Decision'
            : 'Advisory'}
        </span>
        <span className="font-mono text-[10px] text-theme-secondary">AI confidence: {confidencePct}%</span>
      </div>
      <div className="space-y-1.5">
        <div className="rounded bg-theme-panel px-2 py-1.5">
          <p className="text-[10px] font-bold uppercase text-theme-muted mb-0.5">AI Assessment</p>
          <p className="text-theme-secondary">{c.aiVerdict}</p>
        </div>
        <div className="rounded bg-red-950/40 px-2 py-1.5">
          <p className="text-[10px] font-bold uppercase text-red-400 mb-0.5">Regulatory Position</p>
          <p className="text-theme-text">{c.regulatoryPosition}</p>
        </div>
      </div>
      <p className="text-[11px] text-amber-300">Ref: {c.regulatoryRef}</p>
    </div>
  );
}
