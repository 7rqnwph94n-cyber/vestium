/**
 * Dev-only render profiler for SimulatorPanel and its children.
 *
 * Usage (dev console):
 *   window.__SIM_PROFILER__.start()    — begin 10 s capture
 *   window.__SIM_PROFILER__.stop()     — end early + dump
 *   window.__SIM_PROFILER__.dump()     — show current stats
 *   window.__SIM_PROFILER__.reset()    — clear counters
 *
 * The profiler hooks into React.Profiler's onRender callback.
 * It tracks per-component render counts, total/avg/max durations,
 * and children that were skipped by React.memo (inferred from
 * parent-renders minus child-renders during a capture window).
 */

interface RenderEntry {
  count: number;
  totalMs: number;
  maxMs: number;
}

interface ProfilerState {
  capturing: boolean;
  startedAt: number | null;
  durationMs: number;
  components: Record<string, RenderEntry>;
}

const state: ProfilerState = {
  capturing: false,
  startedAt: null,
  durationMs: 10_000,
  components: {}
};

let stopTimer: ReturnType<typeof setTimeout> | null = null;

function record(id: string, _phase: string, actualDurationMs: number): void {
  if (!state.capturing) return;
  const entry = state.components[id] ?? { count: 0, totalMs: 0, maxMs: 0 };
  entry.count += 1;
  entry.totalMs += actualDurationMs;
  entry.maxMs = Math.max(entry.maxMs, actualDurationMs);
  state.components[id] = entry;
}

function dump(): void {
  const elapsed = state.startedAt ? Date.now() - state.startedAt : 0;
  const parentCount = state.components['SimulatorPanel']?.count ?? 0;

  console.group(
    `%c[SimProfiler] ${state.capturing ? 'CAPTURING' : 'STOPPED'} — ${(elapsed / 1000).toFixed(1)}s elapsed`,
    'color: #f59e0b; font-weight: bold'
  );

  const rows = Object.entries(state.components)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([name, entry]) => ({
      Component: name,
      Renders: entry.count,
      'Avg (ms)': (entry.totalMs / entry.count).toFixed(2),
      'Max (ms)': entry.maxMs.toFixed(2),
      'Total (ms)': entry.totalMs.toFixed(1),
      'Skipped %':
        parentCount > 0 && name !== 'SimulatorPanel'
          ? `${(((parentCount - entry.count) / parentCount) * 100).toFixed(0)}%`
          : '—'
    }));

  console.table(rows);
  console.groupEnd();
}

function start(durationMs = 10_000): void {
  reset();
  state.capturing = true;
  state.startedAt = Date.now();
  state.durationMs = durationMs;
  console.log(
    `%c[SimProfiler] Capture started — ${(durationMs / 1000).toFixed(0)}s window`,
    'color: #22c55e'
  );
  stopTimer = setTimeout(() => {
    stop();
  }, durationMs);
}

function stop(): void {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  state.capturing = false;
  dump();
}

function reset(): void {
  state.components = {};
  state.startedAt = null;
  state.capturing = false;
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
}

/** Expose on window in dev mode. */
export function installSimProfiler(): void {
  if (import.meta.env.PROD) return;
  (window as unknown as Record<string, unknown>).__SIM_PROFILER__ = { start, stop, dump, reset };
}

/**
 * Returns the onRender callback for a React.Profiler wrapper.
 * Call this once per component and pass the result as the `onRender` prop.
 */
export function getProfilerOnRender(componentId: string) {
  return (
    _id: string,
    phase: string,
    actualDuration: number
  ): void => {
    record(componentId, phase, actualDuration);
  };
}
