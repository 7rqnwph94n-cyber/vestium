// ─── GatedWindowModal ──────────────────────────────────────────────────────────
// Non-dismissable 3-stage review gate for regulatory and high-severity findings.
//
// Stage 1 — Counting: mandatory minimum read time proportional to finding length
//   (word_count / 200) × 60 s, clamped 30–180 s. Reviewer cannot proceed early.
//
// Stage 2 — Question: Haiku-generated comprehension question about the specific
//   finding. Reviewer must provide an answer. Not graded — tests engagement.
//
// Stage 3 — Disposing: standard disposition controls (accepted / amended / escalated).
//
// Gate open + unlock events are WORM-logged server-side via review.ts routes.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { ReviewFinding } from '@complianceforge/types';
import { openGate, unlockGate } from '../../lib/api/client';

interface Props {
  finding: ReviewFinding;
  moduleId: string;
  onComplete: (disposition: 'accepted' | 'amended' | 'escalated', rationale: string) => void;
}

type Stage = 'counting' | 'question' | 'disposing';

// SVG ring — mirrors VerbalQuestionModal
const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringOffset(remaining: number, total: number): number {
  return CIRCUMFERENCE * (1 - remaining / total);
}

function computeReadTimeSecs(finding: ReviewFinding): number {
  const text = `${finding.description} ${finding.regulatoryRef ?? ''}`;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(180, Math.max(30, Math.ceil(words / 200) * 60));
}

export function GatedWindowModal({ finding, moduleId, onComplete }: Props) {
  const { getToken } = useAuth();
  const [stage, setStage] = useState<Stage>('counting');
  const totalSecs = useRef(computeReadTimeSecs(finding)).current;
  const [remaining, setRemaining] = useState(totalSecs);
  const [cognitiveQuestion, setCognitiveQuestion] = useState<string | null>(null);
  const [cognitiveAnswer, setCognitiveAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const minRationale = finding.severity === 'regulatory' ? 10 : 5;
  const rationaleOk = rationale.trim().length >= minRationale;
  const dashoffset = stage === 'counting' ? ringOffset(remaining, totalSecs) : 0;

  // ── Fetch cognitive question + log gate-open on mount ──────────────────────
  useEffect(() => {
    let active = true;
    const init = async () => {
      const token = await getToken();
      if (!token || !active) return;
      try {
        const res = await openGate(token, moduleId, finding.id, finding.description, finding.regulatoryRef);
        if (active && res.ok) setCognitiveQuestion(res.data.question);
      } catch {
        // Non-critical — generic fallback question is shown
      }
    };
    void init();
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Countdown for stage 1 ──────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'counting') return;
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setStage('question');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  // ── Submit cognitive answer + log gate-unlock ──────────────────────────────
  const onSubmitAnswer = useCallback(async () => {
    if (!cognitiveAnswer.trim()) return;
    setUnlocking(true);
    try {
      const token = await getToken();
      if (token) await unlockGate(token, finding.id, cognitiveAnswer);
    } catch {
      // Non-critical
    } finally {
      setUnlocking(false);
      setStage('disposing');
    }
  }, [finding.id, cognitiveAnswer, getToken]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Regulatory finding review gate"
      className="fixed inset-0 z-50 flex items-center justify-center bg-theme-panel/95 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl mx-4 rounded-2xl bg-theme-surface border border-red-800/50 shadow-2xl p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto">

        {/* Header — always visible */}
        <div>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase mb-3 ${
            finding.severity === 'regulatory'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-orange-500/20 text-orange-400'
          }`}>
            {finding.severity === 'regulatory' ? 'Regulatory' : 'High Severity'} — Mandatory Review Gate
          </span>
          {finding.regulatoryRef && (
            <p className="text-amber-400 text-xs font-medium mb-2">{finding.regulatoryRef}</p>
          )}
          <p className="text-theme-text text-sm leading-relaxed">{finding.description}</p>
        </div>

        {/* Stage 1: Counting */}
        {stage === 'counting' && (
          <div className="flex flex-col items-center gap-4">
            <svg width="100" height="100" className="-rotate-90">
              <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#1e293b" strokeWidth="8" />
              <circle
                cx="50" cy="50" r={RADIUS}
                fill="none"
                stroke={finding.severity === 'regulatory' ? '#ef4444' : '#f97316'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashoffset}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
              <text
                x="50" y="50"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ transform: 'rotate(90deg)', transformOrigin: '50px 50px' }}
                fill="#f8fafc"
                fontSize="20"
                fontWeight="bold"
              >
                {remaining}
              </text>
            </svg>
            <p className="text-theme-secondary text-sm text-center">
              Read this finding carefully. You may not proceed for {totalSecs} seconds.
            </p>
            <p className="text-theme-muted text-xs text-center">
              This mandatory review period is permanently recorded in the audit log.
            </p>
          </div>
        )}

        {/* Stage 2: Cognitive question */}
        {stage === 'question' && (
          <div className="flex flex-col gap-3">
            <div className="rounded border border-theme-border bg-theme-panel/60 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400 mb-2">
                Regulatory Comprehension Check
              </p>
              <p className="text-sm text-theme-text">
                {cognitiveQuestion ?? 'Based on this finding, what specific regulatory duty is being flagged and why does it matter for this workplace?'}
              </p>
            </div>
            <textarea
              value={cognitiveAnswer}
              onChange={(e) => setCognitiveAnswer(e.target.value)}
              rows={3}
              className="w-full rounded border border-theme-border bg-theme-panel px-3 py-2 text-sm text-theme-text placeholder:text-theme-muted"
              placeholder="Your answer…"
            />
            <button
              type="button"
              disabled={!cognitiveAnswer.trim() || unlocking}
              onClick={() => void onSubmitAnswer()}
              className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 py-2 text-sm font-semibold text-slate-950 transition-colors"
            >
              {unlocking ? 'Confirming…' : 'Submit answer'}
            </button>
            <p className="text-theme-muted text-xs text-center">
              Your response is recorded in the audit log. There is no pass/fail — this confirms your engagement.
            </p>
          </div>
        )}

        {/* Stage 3: Disposition */}
        {stage === 'disposing' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-emerald-400 font-medium">
              Review gate complete. Record your resolution below.
            </p>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              className="w-full rounded border border-theme-border bg-theme-panel px-3 py-2 text-sm text-theme-text placeholder:text-theme-muted"
              placeholder={`Resolution rationale (${minRationale}+ characters required)`}
            />
            <div className="flex gap-2">
              {(['accepted', 'amended', 'escalated'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={!rationaleOk}
                  onClick={() => onComplete(d, rationale)}
                  className={`flex-1 rounded border py-2 text-xs font-semibold disabled:opacity-40 transition-colors ${
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
          </div>
        )}
      </div>
    </div>
  );
}
