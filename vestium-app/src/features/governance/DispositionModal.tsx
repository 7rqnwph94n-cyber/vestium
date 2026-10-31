// ─── Gated Disposition Modal ──────────────────────────────────────────────────
// Three-stage gated window for regulatory/high severity findings:
//   1. Mandatory read timer (word_count/200 * 60s, clamped 30–180s)
//   2. Cognitive comprehension question
//   3. Disposition form (accept/amend/escalate with rationale)
// Matches the existing ReviewerPortalPage gated window pattern.

import { useState, useEffect, useCallback } from 'react';
import type { GovernedFinding, FindingDisposition } from '@complianceforge/types';

type Stage = 'reading' | 'question' | 'disposition';

interface DispositionModalProps {
  finding: GovernedFinding;
  onDispose: (findingId: string, disposition: FindingDisposition, rationale: string) => Promise<void>;
  onGateOpen: (findingId: string) => Promise<void>;
  onGateUnlock: (findingId: string, answer: string, timerDuration: number) => Promise<void>;
  onClose: () => void;
}

function computeReadTime(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const raw = Math.round((words / 200) * 60);
  return Math.max(30, Math.min(180, raw));
}

export const DispositionModal = ({
  finding,
  onDispose,
  onGateOpen,
  onGateUnlock,
  onClose,
}: DispositionModalProps) => {
  const [stage, setStage] = useState<Stage>('reading');
  const [secondsLeft, setSecondsLeft] = useState(() =>
    computeReadTime(finding.description + ' ' + (finding.regulatoryRef ?? '')),
  );
  const [answer, setAnswer] = useState('');
  const [disposition, setDisposition] = useState<FindingDisposition>('accepted');
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const timerDuration = computeReadTime(
    finding.description + ' ' + (finding.regulatoryRef ?? ''),
  );

  // Log gate open on mount
  useEffect(() => {
    void onGateOpen(finding.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer
  useEffect(() => {
    if (stage !== 'reading' || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [stage, secondsLeft]);

  const handleUnlock = useCallback(async () => {
    if (answer.trim().length < 5) {
      setError('Answer must be at least 5 characters.');
      return;
    }
    setError(null);
    try {
      await onGateUnlock(finding.id, answer.trim(), timerDuration);
      setStage('disposition');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gate unlock failed');
    }
  }, [answer, finding.id, onGateUnlock, timerDuration]);

  const handleDispose = async () => {
    const minRationale = finding.category === 'A' ? 10 : 5;
    if (rationale.trim().length < minRationale) {
      setError(`Rationale must be at least ${minRationale} characters.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onDispose(finding.id, disposition, rationale.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-theme-border bg-theme-panel p-5 shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-theme-text">Gated Finding Review</h3>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-secondary text-xs"
          >
            Close
          </button>
        </div>

        {/* Finding summary */}
        <div
          className={`rounded border p-3 mb-4 ${
            finding.severity === 'regulatory'
              ? 'border-red-500/60 bg-red-500/10'
              : 'border-orange-500/60 bg-orange-500/10'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-current">
              {finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}
            </span>
            <span className="text-xs opacity-70">
              Category {finding.category}
              {finding.category === 'A' ? ' — Regulatory' : ' — Advisory'}
            </span>
          </div>
          <p className="text-sm text-theme-text">{finding.description}</p>
          {finding.regulatoryRef && (
            <p className="text-xs text-amber-300 mt-1">Ref: {finding.regulatoryRef}</p>
          )}
          <p className="text-xs opacity-50 mt-1">{finding.location}</p>
        </div>

        {/* Stage 1: Reading timer */}
        {stage === 'reading' && (
          <div className="space-y-3">
            <p className="text-xs text-theme-secondary">
              Please read the finding carefully. The gate will unlock in:
            </p>
            <div className="text-center">
              <span className="text-2xl font-mono font-bold text-amber-300">
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </span>
            </div>
            <button
              onClick={() => setStage('question')}
              disabled={secondsLeft > 0}
              className="w-full rounded bg-amber-600 py-2 text-xs font-semibold text-white hover:bg-amber-500 transition-colors disabled:opacity-40"
            >
              {secondsLeft > 0 ? 'Reading…' : 'Continue to verification'}
            </button>
          </div>
        )}

        {/* Stage 2: Comprehension question */}
        {stage === 'question' && (
          <div className="space-y-3">
            <p className="text-xs text-theme-secondary">
              In your own words, explain why this finding is significant and what the regulatory
              implications are:
            </p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              placeholder="Your answer (5+ characters)..."
              className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-amber-500 focus:outline-none"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              onClick={() => void handleUnlock()}
              disabled={answer.trim().length < 5}
              className="w-full rounded bg-amber-600 py-2 text-xs font-semibold text-white hover:bg-amber-500 transition-colors disabled:opacity-40"
            >
              Continue to resolution
            </button>
          </div>
        )}

        {/* Stage 3: Disposition */}
        {stage === 'disposition' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-theme-secondary">Resolution</label>
              <select
                value={disposition}
                onChange={(e) => setDisposition(e.target.value as FindingDisposition)}
                className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text"
              >
                <option value="accepted">Accepted</option>
                <option value="amended">Amended</option>
                <option value="escalated">Escalated</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-theme-secondary">
                Rationale{' '}
                <span className="text-theme-muted">
                  ({finding.category === 'A' ? '10' : '5'}+ chars)
                </span>
              </label>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={3}
                placeholder={
                  finding.category === 'A'
                    ? 'Rationale required (10+ chars for Cat A)...'
                    : 'Rationale (5+ chars)...'
                }
                className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-emerald-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => void handleDispose()}
                disabled={submitting}
                className="flex-1 rounded bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit Resolution'}
              </button>
              <button
                onClick={onClose}
                className="rounded bg-theme-raised px-4 py-2 text-xs text-theme-secondary hover:bg-theme-raised transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
