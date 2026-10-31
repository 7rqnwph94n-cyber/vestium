// ─── Governed Attestation Form ────────────────────────────────────────────────
// Reusable attestation form for any governed content type.
// Locked until all findings are disposed. Matches existing attestation patterns.

import { useState } from 'react';
import type { GovernedAttestation } from '@complianceforge/types';

const DEFAULT_ACCEPTANCE =
  'I confirm this content accurately reflects applicable regulatory requirements ' +
  'and I accept professional responsibility for this attestation under MHSWR 1999 Reg 7.';

interface AttestationFormProps {
  attestation: GovernedAttestation | null;
  undisposedCount: number;
  contentHash: string;
  onSubmit: (form: {
    reviewerName: string;
    reviewerRole: string;
    basisOfCompetence: string;
    regulatoryFrameworksReviewed: string[];
    explicitAcceptance: string;
    contentHashAtAttestation: string;
  }) => Promise<void>;
  onDeploy?: () => Promise<void>;
  deployed?: boolean;
  disabled?: boolean;
}

export const AttestationForm = ({
  attestation,
  undisposedCount,
  contentHash,
  onSubmit,
  onDeploy,
  deployed,
  disabled,
}: AttestationFormProps) => {
  const [form, setForm] = useState({
    reviewerName: '',
    reviewerRole: '',
    basisOfCompetence: '',
    regulatoryFrameworksCsv: '',
    explicitAcceptance: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    undisposedCount === 0 &&
    form.reviewerName.trim().length > 0 &&
    form.reviewerRole.trim().length > 0 &&
    form.basisOfCompetence.trim().length > 0 &&
    form.regulatoryFrameworksCsv.trim().length > 0 &&
    form.explicitAcceptance &&
    contentHash.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        reviewerName: form.reviewerName.trim(),
        reviewerRole: form.reviewerRole.trim(),
        basisOfCompetence: form.basisOfCompetence.trim(),
        regulatoryFrameworksReviewed: form.regulatoryFrameworksCsv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        explicitAcceptance: DEFAULT_ACCEPTANCE,
        contentHashAtAttestation: contentHash,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attestation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Already attested — show read-only summary + deploy action
  if (attestation) {
    return (
      <div className="space-y-2">
        <div className="space-y-0.5 text-xs text-theme-secondary">
          <p>
            Attested by: <span className="text-theme-text">{attestation.reviewerName}</span>
          </p>
          <p>Role: {attestation.reviewerRole}</p>
          <p>At: {new Date(attestation.attestedAt).toLocaleString()}</p>
        </div>
        {onDeploy && !deployed && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
            <p className="text-xs font-semibold text-emerald-200">Ready to deploy</p>
            <button
              onClick={() => void onDeploy()}
              disabled={disabled}
              className="w-full rounded bg-emerald-500 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 transition-colors disabled:opacity-50"
            >
              Deploy
            </button>
          </div>
        )}
        {deployed && <p className="text-xs text-emerald-400">Content is deployed.</p>}
      </div>
    );
  }

  // Findings still undisposed — show lock message
  if (undisposedCount > 0) {
    return (
      <p className="text-xs text-amber-400">
        Resolve all {undisposedCount} finding{undisposedCount > 1 ? 's' : ''} before attesting.
      </p>
    );
  }

  // Attestation form
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-theme-secondary">
            Full Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.reviewerName}
            onChange={(e) => setForm({ ...form, reviewerName: e.target.value })}
            className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-theme-secondary">
            Role / Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.reviewerRole}
            onChange={(e) => setForm({ ...form, reviewerRole: e.target.value })}
            placeholder="e.g. Maintenance Supervisor, IOSH Member"
            className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-theme-secondary">
          Basis of Competence <span className="text-red-400">*</span>
        </label>
        <textarea
          value={form.basisOfCompetence}
          onChange={(e) => setForm({ ...form, basisOfCompetence: e.target.value })}
          placeholder="Training qualifications, years of relevant experience, or certification held"
          rows={2}
          className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-emerald-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-theme-secondary">
          Regulatory Frameworks <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={form.regulatoryFrameworksCsv}
          onChange={(e) => setForm({ ...form, regulatoryFrameworksCsv: e.target.value })}
          placeholder="e.g. MHSWR 1999, PUWER 1998, LOLER 1998"
          className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-emerald-500 focus:outline-none"
        />
        <p className="text-[10px] text-theme-muted">Comma-separated list of frameworks reviewed</p>
      </div>

      <div className="rounded border border-emerald-500/20 bg-theme-panel px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.explicitAcceptance}
            onChange={(e) => setForm({ ...form, explicitAcceptance: e.target.checked })}
            className="mt-0.5 flex-shrink-0"
          />
          <span className="text-xs text-theme-secondary">{DEFAULT_ACCEPTANCE}</span>
        </label>
      </div>

      <div className="text-[10px] text-theme-muted">
        Content hash: <code className="text-theme-secondary">{contentHash || 'pending'}</code>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={() => void handleSubmit()}
        disabled={!canSubmit || submitting || disabled}
        className="w-full rounded bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit Attestation'}
      </button>
    </div>
  );
};
