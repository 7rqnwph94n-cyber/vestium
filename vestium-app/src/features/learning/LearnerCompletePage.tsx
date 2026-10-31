import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useProgress } from '../progress/ProgressContext';
import { issueLearnerCert, getLearnerCertPdfUrl } from '../../lib/api/client';
import type { LearnerCertRecord } from '@complianceforge/types';

const PASS_THRESHOLD = 70;

function deriveScore(stageTestScores: Record<number, number>): number {
  const scores = Object.values(stageTestScores);
  if (scores.length === 0) return 100;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

export const LearnerCompletePage = () => {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { user } = useUser();
  const { state } = useProgress();

  const score = deriveScore(state.stageTestScores);
  const passed = score >= PASS_THRESHOLD;

  const [learnerName, setLearnerName] = useState(user?.fullName ?? '');
  const [cert, setCert] = useState<LearnerCertRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!moduleId || !learnerName.trim()) return;
    setSubmitting(true);
    setError(null);

    const token = await getToken();
    if (!token) {
      setError('Not signed in');
      setSubmitting(false);
      return;
    }

    const res = await issueLearnerCert(token, moduleId, {
      learnerName: learnerName.trim(),
      learnerUserId: user?.id ?? '',
      score,
      passThreshold: PASS_THRESHOLD,
    });

    if (!res.ok) {
      setError(res.error);
      setSubmitting(false);
      return;
    }

    setCert(res.data);
    setSubmitting(false);
  };

  if (cert) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-theme-base p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Certificate issued
            </p>
            <p className="mt-2 text-base font-semibold text-theme-text">{cert.learnerName}</p>
            <p className="mt-1 text-xs text-theme-secondary">Cert number: {cert.certNumber}</p>
            <p className="mt-1 text-xs text-theme-secondary">
              Score: {cert.score}% · {cert.passed ? 'Passed' : 'Not passed'} (threshold {cert.passThreshold}%)
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href={getLearnerCertPdfUrl(cert.certNumber)}
              download
              className="block rounded bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-slate-950 hover:bg-amber-300"
            >
              Download PDF certificate
            </a>
            <button
              type="button"
              onClick={() => navigate('/modules')}
              className="rounded border border-theme-border px-4 py-2 text-sm text-theme-secondary hover:text-theme-text"
            >
              Back to modules
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-theme-base p-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-theme-text">Module complete</h1>
          <p className="mt-1 text-sm text-theme-secondary">
            Your average score across all stage assessments:{' '}
            <span className={passed ? 'text-emerald-300' : 'text-amber-300'}>
              {score}%
            </span>
            {passed ? ' — passed' : ` — below the ${PASS_THRESHOLD}% threshold`}
          </p>
        </div>

        {!passed ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-200">
              Your score is below the pass threshold. You can still issue a completion
              record, but it will be marked as not passed.
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          <label className="block text-sm text-theme-secondary">
            Full name for certificate
            <input
              type="text"
              value={learnerName}
              onChange={(e) => setLearnerName(e.target.value)}
              placeholder="Your full name"
              className="mt-1 block w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text placeholder:text-theme-muted focus:border-amber-500/60 focus:outline-none"
            />
          </label>

          {error ? (
            <p className="text-sm text-amber-300">{error}</p>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !learnerName.trim()}
            className="w-full rounded bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Issuing certificate…' : 'Issue certificate'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/modules')}
            className="w-full rounded border border-theme-border px-4 py-2 text-sm text-theme-secondary hover:text-theme-text"
          >
            Back to modules
          </button>
        </div>
      </div>
    </div>
  );
};
