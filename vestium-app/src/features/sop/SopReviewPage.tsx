import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  getSop, getSopFindings, disposeSopFinding, seedSopFindings,
  getSopAttestation, createSopAttestation,
} from '../../lib/api/client';
import type { SopRecord, SopReviewFinding, SopAttestationRecord } from '@complianceforge/types';

const SEV_STYLES: Record<string, string> = {
  regulatory: 'border-red-500/60 bg-red-500/10 text-red-300',
  high:       'border-orange-500/60 bg-orange-500/10 text-orange-300',
  medium:     'border-amber-500/60 bg-amber-500/10 text-amber-300',
  low:        'border-theme-border bg-theme-surface text-theme-secondary',
};

const CAT_LABELS: Record<string, string> = {
  A: 'Category A — Regulatory',
  B: 'Category B — Advisory',
};

export const SopReviewPage = () => {
  const { id: sopId } = useParams<{ id: string }>();
  const { getToken } = useAuth();

  const [sop, setSop] = useState<SopRecord | null>(null);
  const [findings, setFindings] = useState<SopReviewFinding[]>([]);
  const [attestation, setAttestation] = useState<SopAttestationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Disposition inline state
  const [disposingId, setDisposingId] = useState<string | null>(null);
  const [dispForm, setDispForm] = useState<{ disposition: 'accepted' | 'amended' | 'escalated'; rationale: string }>({
    disposition: 'accepted', rationale: '',
  });
  const [dispError, setDispError] = useState<string | null>(null);

  // Attestation form
  const [attForm, setAttForm] = useState({
    reviewerName: '', reviewerRole: '', basisOfCompetence: '',
    regulatoryFrameworksReviewed: '', explicitAcceptance: false,
  });
  const [attError, setAttError] = useState<string | null>(null);
  const [attSubmitting, setAttSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!sopId) return;
    const token = await getToken();
    if (!token) { setError('Session expired. Please sign in again.'); return; }
    const [sopRes, findRes, attRes] = await Promise.all([
      getSop(token, sopId),
      getSopFindings(token, sopId),
      getSopAttestation(token, sopId),
    ]);
    if (!sopRes.ok) { setError(sopRes.error ?? 'Failed to load'); return; }
    setSop(sopRes.data.sop);
    const loadedFindings = findRes.ok ? findRes.data : [];
    const loadedAttestation = attRes.ok ? attRes.data : null;
    setFindings(loadedFindings);
    if (loadedAttestation) setAttestation(loadedAttestation);

    // Auto-import findings on first load if none exist and not yet attested
    if (loadedFindings.length === 0 && !loadedAttestation && sopId) {
      const seedRes = await seedSopFindings(token, sopId);
      if (seedRes.ok) {
        const refreshed = await getSopFindings(token, sopId);
        if (refreshed.ok) setFindings(refreshed.data);
      }
    }
  }, [sopId, getToken]);

  useEffect(() => {
    void loadData().then(() => setLoading(false));
  }, [loadData]);

  const handleSeed = async () => {
    if (!sopId) return;
    setSeeding(true);
    const token = await getToken();
    if (token) await seedSopFindings(token, sopId);
    await loadData();
    setSeeding(false);
  };

  const startDispose = (id: string) => {
    setDisposingId(id);
    setDispForm({ disposition: 'accepted', rationale: '' });
    setDispError(null);
  };

  const submitDispose = async () => {
    if (!disposingId) return;
    const token = await getToken();
    if (!token) return;
    const res = await disposeSopFinding(token, disposingId, dispForm);
    if (!res.ok) { setDispError(res.error ?? 'Failed to resolve finding'); return; }
    setFindings(findings.map((f) => f.id === disposingId ? res.data : f));
    setDisposingId(null);
  };

  const submitAttestation = async () => {
    if (!sopId || !sop) return;
    if (!attForm.reviewerName.trim() || !attForm.reviewerRole.trim() || !attForm.basisOfCompetence.trim()) {
      setAttError('Please complete all fields.'); return;
    }
    if (!attForm.explicitAcceptance) {
      setAttError('You must confirm the declaration.'); return;
    }
    setAttSubmitting(true);
    setAttError(null);
    const token = await getToken();
    if (!token) { setAttSubmitting(false); return; }
    const res = await createSopAttestation(token, sopId, {
      reviewerName: attForm.reviewerName,
      reviewerRole: attForm.reviewerRole,
      basisOfCompetence: attForm.basisOfCompetence,
      regulatoryFrameworksReviewed: attForm.regulatoryFrameworksReviewed
        .split(',').map((s) => s.trim()).filter(Boolean),
      explicitAcceptance: 'I confirm this standard operating procedure accurately reflects the manufacturer\'s instructions and incorporates all applicable regulatory controls.',
      contentHashAtAttestation: sop.contentHash ?? 'draft',
    });
    if (!res.ok) { setAttError(res.error ?? 'Failed to attest'); setAttSubmitting(false); return; }
    setAttestation(res.data);
    setAttSubmitting(false);
    await loadData();
  };

  if (loading) return (
    <div className="rounded border border-theme-border bg-theme-panel/60 p-4 text-sm text-theme-secondary">Loading…</div>
  );
  if (error || !sop) return (
    <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error ?? 'SOP not found'}</div>
  );

  const undisposed = findings.filter((f) => !f.disposition);
  const nonGatedUndisposed = undisposed.filter((f) => f.severity !== 'regulatory' && f.severity !== 'high');
  const catA = findings.filter((f) => f.category === 'A');
  const [batchResolving, setBatchResolving] = useState(false);

  const handleBatchResolve = async () => {
    if (nonGatedUndisposed.length === 0) return;
    const token = await getToken();
    if (!token) return;
    setBatchResolving(true);
    try {
      await Promise.allSettled(
        nonGatedUndisposed.map((f) =>
          disposeSopFinding(token, f.id, { disposition: 'accepted', rationale: 'Accepted — advisory finding reviewed.' })
        )
      );
      await loadData();
    } finally {
      setBatchResolving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">SOP Review</p>
          <h1 className="mt-1 text-lg font-semibold text-theme-text">{sop.procedureName}</h1>
          <p className="mt-0.5 text-sm text-theme-secondary">{sop.equipment}</p>
        </div>
        <Link
          to={`/studio/sop/${sopId}`}
          className="text-xs text-theme-secondary hover:text-theme-text transition-colors flex-shrink-0"
        >
          ← View SOP
        </Link>
      </div>

      {/* Attestation complete banner */}
      {attestation && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
          <p className="font-semibold">SOP Attested</p>
          <p className="mt-0.5">
            {attestation.reviewerName} ({attestation.reviewerRole}) —{' '}
            {new Date(attestation.attestedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      )}

      {/* Seed findings + batch resolve */}
      {!attestation && (
        <div className="flex items-center justify-between rounded border border-theme-border bg-theme-panel/60 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-theme-secondary">Import findings from automated checks</p>
            <p className="text-xs text-theme-muted">Auto-populates Category A findings for unattributed procedure steps.</p>
          </div>
          <div className="flex items-center gap-2">
            {nonGatedUndisposed.length > 0 && (
              <button
                type="button"
                onClick={() => void handleBatchResolve()}
                disabled={batchResolving}
                className="rounded border border-emerald-500/50 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
              >
                {batchResolving ? 'Resolving…' : `Accept all ${nonGatedUndisposed.length} advisory`}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSeed()}
              disabled={seeding}
              className="rounded border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-secondary hover:border-theme-border transition-colors disabled:opacity-50"
            >
              {seeding ? 'Importing…' : 'Import Findings'}
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded border border-theme-border bg-theme-panel p-3 text-center">
          <p className="text-2xl font-bold text-theme-text">{findings.length}</p>
          <p className="mt-0.5 text-xs text-theme-muted">Total</p>
        </div>
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-center">
          <p className="text-2xl font-bold text-red-300">{catA.length}</p>
          <p className="mt-0.5 text-xs text-red-500">Cat A</p>
        </div>
        <div className={`rounded border p-3 text-center ${undisposed.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-theme-border bg-theme-panel'}`}>
          <p className={`text-2xl font-bold ${undisposed.length > 0 ? 'text-amber-300' : 'text-theme-secondary'}`}>{undisposed.length}</p>
          <p className={`mt-0.5 text-xs ${undisposed.length > 0 ? 'text-amber-500' : 'text-theme-muted'}`}>Pending Review</p>
        </div>
        <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
          <p className="text-2xl font-bold text-emerald-300">{findings.length - undisposed.length}</p>
          <p className="mt-0.5 text-xs text-emerald-500">Reviewed</p>
        </div>
      </div>

      {/* Findings list */}
      {findings.length === 0 ? (
        <div className="rounded border border-theme-border bg-theme-panel/60 p-6 text-center text-sm text-theme-secondary">
          No findings yet. Import from automated checks or add manually.
        </div>
      ) : (
        <div className="space-y-3">
          {findings.map((f) => (
            <div
              key={f.id}
              className={`rounded border px-4 py-4 ${f.category === 'A' ? 'border-l-2 border-l-red-500/60 border-theme-border' : 'border-theme-border'} bg-theme-panel/60`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${SEV_STYLES[f.severity] ?? SEV_STYLES.low}`}>
                      {f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}
                    </span>
                    <span className="inline-block rounded border border-theme-border bg-theme-surface px-2 py-0.5 text-xs text-theme-secondary">
                      {CAT_LABELS[f.category]}
                    </span>
                  </div>
                  <p className="text-xs text-theme-secondary">{f.description}</p>
                  <p className="text-xs text-theme-muted">{f.location}</p>
                  {f.regulatoryRef && <p className="text-xs text-theme-muted">{f.regulatoryRef}</p>}
                  {f.sourceAttribution && <p className="text-xs text-amber-600">{f.sourceAttribution}</p>}
                  {f.disposition && (
                    <p className="text-xs text-emerald-400">
                      Resolved: {f.disposition.charAt(0).toUpperCase() + f.disposition.slice(1)} — {f.dispositionRationale}
                    </p>
                  )}
                </div>
                {!attestation && !f.disposition && (
                  <button
                    type="button"
                    onClick={() => startDispose(f.id)}
                    className="flex-shrink-0 rounded border border-amber-500/50 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
                  >
                    Resolve
                  </button>
                )}
              </div>

              {/* Inline disposition form */}
              {disposingId === f.id && (
                <div className="mt-3 space-y-2 border-t border-theme-border pt-3">
                  <select
                    value={dispForm.disposition}
                    onChange={(e) => setDispForm({ ...dispForm, disposition: e.target.value as typeof dispForm.disposition })}
                    className="w-full rounded border border-theme-border bg-theme-surface px-2 py-1.5 text-xs text-theme-secondary focus:border-amber-500 focus:outline-none"
                  >
                    <option value="accepted">Accepted — finding is valid, content updated</option>
                    <option value="amended">Amended — content corrected to address finding</option>
                    <option value="escalated">Escalated — requires senior review before deploy</option>
                  </select>
                  <textarea
                    value={dispForm.rationale}
                    onChange={(e) => setDispForm({ ...dispForm, rationale: e.target.value })}
                    placeholder={f.category === 'A' ? 'Rationale required (min 10 chars) for Cat A findings' : 'Rationale (recommended)'}
                    rows={2}
                    className="w-full rounded border border-theme-border bg-theme-surface px-2 py-1.5 text-xs text-theme-secondary placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                  />
                  {dispError && <p className="text-xs text-red-400">{dispError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void submitDispose()}
                      className="rounded border border-emerald-500/50 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                    >
                      Confirm Resolution
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisposingId(null)}
                      className="rounded border border-theme-border px-3 py-1 text-xs text-theme-secondary hover:border-theme-border transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Attestation form */}
      {!attestation && undisposed.length === 0 && findings.length >= 0 && (
        <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-5 py-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-emerald-300">Competent Person Attestation</p>
            <p className="mt-1 text-xs text-theme-secondary">
              By signing below, you transfer professional responsibility for the technical accuracy and regulatory compliance of this SOP.
              This attestation is permanently recorded in the audit log.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-theme-secondary">Full Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={attForm.reviewerName}
                onChange={(e) => setAttForm({ ...attForm, reviewerName: e.target.value })}
                className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-theme-secondary">Role / Title <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={attForm.reviewerRole}
                onChange={(e) => setAttForm({ ...attForm, reviewerRole: e.target.value })}
                placeholder="e.g. Maintenance Supervisor, IOSH Member"
                className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-theme-secondary">Basis of Competence <span className="text-red-400">*</span></label>
            <textarea
              value={attForm.basisOfCompetence}
              onChange={(e) => setAttForm({ ...attForm, basisOfCompetence: e.target.value })}
              placeholder="Training qualifications, years of relevant experience, or certification held"
              rows={2}
              className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-theme-secondary">Regulatory Frameworks Reviewed (comma-separated)</label>
            <input
              type="text"
              value={attForm.regulatoryFrameworksReviewed}
              onChange={(e) => setAttForm({ ...attForm, regulatoryFrameworksReviewed: e.target.value })}
              placeholder="e.g. PUWER 1998, COSHH 2002, MHSWR 1999"
              className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="rounded border border-emerald-500/20 bg-theme-panel px-4 py-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={attForm.explicitAcceptance}
                onChange={(e) => setAttForm({ ...attForm, explicitAcceptance: e.target.checked })}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-xs text-theme-secondary">
                I confirm this standard operating procedure accurately reflects the manufacturer's instructions and incorporates all applicable regulatory controls for this task and equipment. I accept professional responsibility for this attestation under MHSWR 1999 Reg 7.
              </span>
            </label>
          </div>
          {attError && <p className="text-xs text-red-400">{attError}</p>}
          <button
            type="button"
            onClick={() => void submitAttestation()}
            disabled={attSubmitting || !attForm.explicitAcceptance}
            className="rounded border border-emerald-500 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {attSubmitting ? 'Attesting…' : 'Attest SOP'}
          </button>
        </div>
      )}

      {!attestation && undisposed.length > 0 && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
          {undisposed.length} finding{undisposed.length !== 1 ? 's' : ''} must be resolved before attestation can proceed.
        </div>
      )}
    </div>
  );
};
