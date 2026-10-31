// ─── VerbalQuestionModal ──────────────────────────────────────────────────────
// Non-dismissable full-screen overlay that:
//  1. Counts down 3 s (requests mic during countdown)
//  2. Records up to timerSeconds of WebM Opus audio
//  3. Converts to base64, POSTs to /api/verbal/:moduleId/:lessonId/:questionId
//  4. Shows "done" or "denied" state, then calls onComplete()
//
// State machine: 'countdown' → 'recording' → 'submitting' → 'done'
//                'countdown' → 'denied' (mic unavailable)

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { submitVerbalResponse } from '../../lib/api/client';
import type { TrainingQuestion } from '../../lib/training-core/types';

interface Props {
  question:  TrainingQuestion;
  moduleId:  string;
  lessonId:  string;
  onComplete: () => void;
}

type State = 'countdown' | 'recording' | 'submitting' | 'done' | 'denied';

// SVG ring constants
const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringOffset(remaining: number, total: number): number {
  const fraction = remaining / total;
  return CIRCUMFERENCE * (1 - fraction);
}

export function VerbalQuestionModal({ question, moduleId, lessonId, onComplete }: Props) {
  const { getToken } = useAuth();
  const [state, setState] = useState<State>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [remaining, setRemaining] = useState(question.timerSeconds ?? 60);

  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const startMsRef  = useRef<number>(0);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const timerSeconds = question.timerSeconds ?? 60;

  // ─── Request mic and start countdown ──────────────────────────────────────

  useEffect(() => {
    let isMounted = true;

    async function requestMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        // 3-second countdown
        let n = 3;
        setCountdown(n);
        const tick = setInterval(() => {
          n -= 1;
          if (n <= 0) {
            clearInterval(tick);
            if (isMounted) startRecording(stream);
          } else {
            setCountdown(n);
          }
        }, 1000);

        return () => clearInterval(tick);
      } catch {
        if (isMounted) {
          setState('denied');
          void submitNoResponse();
        }
      }
    }

    void requestMic();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Recording ────────────────────────────────────────────────────────────

  function startRecording(stream: MediaStream) {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];
    startMsRef.current = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => void handleRecordingStop(mimeType);
    recorder.start(250); // collect chunks every 250 ms
    setState('recording');
    setRemaining(timerSeconds);

    // Countdown timer
    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          stopRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  async function handleRecordingStop(mimeType: string) {
    setState('submitting');
    const blob    = new Blob(chunksRef.current, { type: mimeType });
    const durationMs = Date.now() - startMsRef.current;

    const base64 = await blobToBase64(blob);
    await submit({ audioBase64: base64, mimeType, durationMs, answered: true });
  }

  // ─── Submit helpers ───────────────────────────────────────────────────────

  async function submitNoResponse() {
    await submit({ answered: false });
  }

  async function submit(extra: {
    audioBase64?: string;
    mimeType?: string;
    durationMs?: number;
    answered: boolean;
  }) {
    try {
      const token = await getToken();
      if (!token) return;
      await submitVerbalResponse(
        token,
        { moduleId, lessonId, questionId: question.id },
        {
          ...extra,
          questionPrompt: question.prompt,
          regulatoryRef:  question.regulatoryRef,
          timerSeconds,
          expectedKeywords: question.expectedKeywords,
          minKeywordHits: question.minKeywordHits,
        }
      );
    } catch (err) {
      console.error('[VerbalModal] submit error:', err);
    } finally {
      setState(extra.answered ? 'done' : 'denied');
      setTimeout(onComplete, extra.answered ? 2000 : 3000);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const dashoffset = state === 'recording' ? ringOffset(remaining, timerSeconds) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verbal competency check"
      className="fixed inset-0 z-50 flex items-center justify-center bg-theme-panel/95 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-theme-surface border border-theme-border shadow-2xl p-8 flex flex-col items-center gap-6">

        {/* Header */}
        <div className="text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold tracking-wide uppercase mb-3">
            Verbal Question (Timed)
          </span>
          {question.regulatoryRef && (
            <p className="text-theme-secondary text-xs mb-2">{question.regulatoryRef}</p>
          )}
          <p className="text-theme-text text-lg font-medium leading-snug">
            {question.prompt}
          </p>
        </div>

        {/* State-specific content */}
        {state === 'countdown' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500 flex items-center justify-center">
              <span className="text-amber-400 text-4xl font-bold">{countdown}</span>
            </div>
            <p className="text-theme-secondary text-sm text-center">
              Recording begins shortly — prepare your answer.
            </p>
          </div>
        )}

        {state === 'recording' && (
          <div className="flex flex-col items-center gap-4">
            {/* Circular countdown ring */}
            <svg width="100" height="100" className="-rotate-90">
              <circle
                cx="50" cy="50" r={RADIUS}
                fill="none" stroke="#1e293b" strokeWidth="8"
              />
              <circle
                cx="50" cy="50" r={RADIUS}
                fill="none" stroke="#f59e0b" strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashoffset}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
              <text
                x="50" y="50"
                textAnchor="middle"
                dominantBaseline="central"
                className="rotate-90"
                style={{ transform: 'rotate(90deg)', transformOrigin: '50px 50px' }}
                fill="#f8fafc"
                fontSize="20"
                fontWeight="bold"
              >
                {remaining}
              </text>
            </svg>

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-theme-secondary text-sm">Recording…</span>
            </div>

            <button
              onClick={stopRecording}
              className="mt-1 px-6 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm transition-colors"
            >
              Submit answer
            </button>
          </div>
        )}

        {state === 'submitting' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-theme-secondary text-sm">Submitting…</p>
          </div>
        )}

        {state === 'done' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-theme-text text-sm text-center">
              Your answer has been submitted for review.
            </p>
          </div>
        )}

        {state === 'denied' && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
              </svg>
            </div>
            <p className="text-theme-secondary text-sm text-center">
              Microphone unavailable or time expired — this response has been recorded as unanswered.
            </p>
          </div>
        )}

        {/* Instruction footer */}
        {(state === 'countdown' || state === 'recording') && (
          <p className="text-theme-muted text-xs text-center">
            Speak clearly. You have {timerSeconds} seconds. This response is stored as a compliance evidence record.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix to get raw base64
      resolve(result.split(',')[1] ?? '');
    };
    reader.readAsDataURL(blob);
  });
}
