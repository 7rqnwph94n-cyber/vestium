import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { resolveToolAvailability } from '../../lib/training-core/tooling';

type Sample = { t: number; pv: number; output: number; sp: number };

export const PidIntroPage = () => {
  const { currentTheme } = useTheme();
  const enabled = resolveToolAvailability(currentTheme).pidIntro;
  if (!enabled) return <Navigate to={`/${currentTheme.id}/dashboard`} replace />;
  const [running, setRunning] = useState(true);
  const [sp, setSp] = useState(60);
  const [pv, setPv] = useState(20);
  const [pGain, setPGain] = useState(1.2);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setT((prevT) => {
        const error = sp - pv;
        const rawOutput = pGain * error;
        const output = Math.max(0, Math.min(100, rawOutput));
        // Simple first-order lag process + slight overshoot tendency at high output
        setPv((prevPv) => {
          const processTarget = output;
          const nextPv = prevPv + (processTarget - prevPv) * 0.08;
          const clipped = Math.max(0, Math.min(100, nextPv));
          setSamples((prev) =>
            [...prev, { t: prevT + 0.2, pv: clipped, output, sp }].slice(-120)
          );
          return clipped;
        });
        return Number((prevT + 0.2).toFixed(1));
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, [running, pGain, pv, sp]);

  const latestOutput = samples[samples.length - 1]?.output ?? 0;

  const chartPoints = useMemo(() => {
    if (samples.length === 0) return { pv: '', sp: '', output: '' };
    const width = 600;
    const height = 220;
    const maxT = samples[samples.length - 1].t || 1;
    const x = (time: number) => (time / Math.max(maxT, 1)) * width;
    const y = (value: number) => height - (value / 100) * height;
    const line = (selector: (s: Sample) => number) =>
      samples.map((s) => `${x(s.t)},${y(selector(s))}`).join(' ');
    return {
      pv: line((s) => s.pv),
      sp: line((s) => s.sp),
      output: line((s) => s.output)
    };
  }, [samples]);

  const behaviorHint =
    pGain < 0.8
      ? 'Low P gain: response will be slow and may settle below setpoint if load changes.'
      : pGain > 2.2
        ? 'High P gain: response becomes aggressive and can overshoot/oscillate.'
        : 'Moderate P gain: faster response with better stability for this simple model.';

  return (
    <div className="space-y-4">
      <Card title="PID Loop Introduction (BU5)">
        <p className="text-sm text-theme-secondary">
          P-only loop behavior trainer. Learn to recognize setpoint (SP), process variable (PV), and controller output response.
        </p>
        <p className="mt-2 text-xs text-theme-secondary">
          This is an intuition-building simulator, not a full tuning course.
        </p>
      </Card>

      <Card title="Controls">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="pid-sp" className="text-theme-secondary">Setpoint (SP)</label>
              <span className="text-amber-300">{sp.toFixed(0)}</span>
            </div>
            <input
              id="pid-sp"
              type="range"
              min={0}
              max={100}
              step={1}
              value={sp}
              onChange={(e) => setSp(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="pid-pgain" className="text-theme-secondary">P Gain</label>
              <span className="text-sky-300">{pGain.toFixed(2)}</span>
            </div>
            <input
              id="pid-pgain"
              type="range"
              min={0.2}
              max={3.5}
              step={0.05}
              value={pGain}
              onChange={(e) => setPGain(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => setRunning((v) => !v)}
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              {running ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPv(20);
                setT(0);
                setSamples([]);
              }}
              className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
            >
              Reset Loop
            </button>
          </div>
        </div>
      </Card>

      <Card title="Loop View">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded border border-theme-border bg-theme-base p-3">
            <svg viewBox="0 0 600 220" className="w-full rounded bg-theme-base">
              <rect x="0" y="0" width="600" height="220" fill="transparent" />
              {[25, 50, 75].map((v) => (
                <line key={v} x1="0" y1={220 - (v / 100) * 220} x2="600" y2={220 - (v / 100) * 220} stroke="#1e293b" strokeWidth="1" />
              ))}
              {chartPoints.sp ? <polyline fill="none" stroke="#f59e0b" strokeWidth="2" points={chartPoints.sp} /> : null}
              {chartPoints.pv ? <polyline fill="none" stroke="#38bdf8" strokeWidth="2" points={chartPoints.pv} /> : null}
              {chartPoints.output ? <polyline fill="none" stroke="#22c55e" strokeWidth="2" points={chartPoints.output} opacity="0.8" /> : null}
            </svg>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span className="text-amber-300">SP</span>
              <span className="text-sky-300">PV</span>
              <span className="text-emerald-300">Controller Output</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded border border-theme-border bg-theme-base p-3 text-xs">
              <p className="font-semibold text-theme-secondary">Current Values</p>
              <p className="mt-2 text-theme-secondary">SP: <span className="text-amber-300">{sp.toFixed(1)}</span></p>
              <p className="text-theme-secondary">PV: <span className="text-sky-300">{pv.toFixed(1)}</span></p>
              <p className="text-theme-secondary">Output: <span className="text-emerald-300">{latestOutput.toFixed(1)}</span></p>
              <p className="text-theme-muted">Time: {t.toFixed(1)} s</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-base p-3 text-xs">
              <p className="font-semibold text-theme-secondary">What To Look For</p>
              <ul className="mt-2 space-y-1 text-theme-secondary">
                <li>Slow rise to SP = low controller aggressiveness</li>
                <li>Overshoot / oscillation = gain too high for process dynamics</li>
                <li>Controller output saturation (0 or 100) = large error / aggressive response</li>
              </ul>
              <p className="mt-3 text-amber-200">{behaviorHint}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
