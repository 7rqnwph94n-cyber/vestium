# SimulatorPanel Performance Baseline

Captured: 2026-03-09 (commit TBD — post Fix #4)

## What Changed (Fix #4)

| Phase | Change | Impact |
|-------|--------|--------|
| 1 | `React.memo` on all 8 child components | Children skip re-render when props haven't changed |
| 2 | 13 inline `(x) => setter(x)` replaced with direct setter refs | Stable references — memo can skip |
| 2 | 7 `useCallback`-wrapped handlers | Stable references for handlers with deps |
| 3 | `missionSnapshot` useMemo -> lazy `getMissionSnapshot()` | No object allocation on every 100ms tick |

## Before (estimated from code analysis)

- **Tick rate:** 100ms (10 Hz)
- **setState calls per tick:** 6 (engineState, lastScan, processTankLevelPct, sequenceTrainer, multiUnitTrainer, oneShotTrainer)
- **React 18 batching:** All 6 coalesce into 1 re-render per tick
- **Child re-renders per tick:** 8/8 (all children re-rendered — no memo, all inline closures)
- **missionSnapshot:** New object allocated every tick via useMemo (11 deps, most change every tick)
- **Estimated renders per 10s capture:** ~100 parent + ~800 child (100 x 8 visible children)

## After (expected from architectural changes)

- **Parent renders per tick:** 1 (unchanged — tick still fires)
- **Child renders per tick:** Depends on which props changed:
  - `ProcessSystemView`: Re-renders only when engineState.motor/valve or processTankLevelPct change (most ticks)
  - `FieldChecksPanel`: Re-renders only when inputs/engineState/lastScan change (most ticks)
  - `AnalogTrainerSection`: Skips unless analogTrainer/selectedAnalogFaultId/selectedAnalogDiagnosis change
  - `VfdFieldbusTrainerSection`: Skips unless vfd/fieldbus trainer state changes
  - `SequenceTrainerSection`: Skips unless sequenceTrainer state changes (only during sequence runs)
  - `MultiUnitTrainerSection`: Skips unless multiUnitTrainer state changes (only during multi-unit exercises)
  - `FaultPracticeSection`: Skips unless activeFault/selectedFaultId/etc change (user-driven only)
  - `SimulatorMissionPanel`: Skips unless missions/statuses/selectedMissionId change (user-driven only)
- **missionSnapshot:** Zero allocations per tick (lazy, computed only on user events)
- **Expected renders per 10s capture:** ~100 parent + ~200-300 child (down from ~800)

## How to Capture

1. Start dev server: `pnpm dev --host 127.0.0.1`
2. Navigate to a stage with the ladder logic simulator visible
3. Open browser console
4. Run: `__SIM_PROFILER__.start(10000)` (10 second capture)
5. Let the simulator tick for the full 10 seconds without interaction
6. Results auto-dump to console as a table showing:
   - Per-component render count
   - Avg/max render duration (ms)
   - Skipped % (parent renders minus child renders / parent renders)

### Expected baseline (10s idle capture, no user interaction)

| Component | Expected Renders | Skipped % |
|-----------|-----------------|-----------|
| SimulatorPanel | ~100 | — |
| ProcessSystemView | ~100 | ~0% (engineState changes every tick) |
| FieldChecksPanel | ~100 | ~0% (engineState/lastScan change every tick) |
| AnalogTrainerSection | ~0 | ~100% (no analog state changes when idle) |
| SequenceTrainerSection | 0-100 | 0-100% (depends on whether sequence is running) |
| MultiUnitTrainerSection | 0-100 | 0-100% (depends on whether multi-unit exercise is active) |
| VfdFieldbusTrainerSection | ~0 | ~100% (no VFD state changes when idle) |
| FaultPracticeSection | ~0 | ~100% (no fault state changes when idle) |
| SimulatorMissionPanel | ~0 | ~100% (no mission state changes when idle) |

### Key regression signals

- If ANY child shows ~100 renders during an idle capture while it should be ~0, a prop stability regression has occurred (likely an inline closure was reintroduced or a useCallback dep became unstable).
- If `SimulatorPanel` renders significantly exceed 100 per 10s, the tick interval has been changed.
- If `missionSnapshot` allocation reappears in the flamegraph, the lazy getter was reverted.

## Profiler API

```js
window.__SIM_PROFILER__.start(ms)  // Begin capture (default 10s)
window.__SIM_PROFILER__.stop()     // End early + dump results
window.__SIM_PROFILER__.dump()     // Show current stats
window.__SIM_PROFILER__.reset()    // Clear counters
```

Dev-only — stripped from production builds via `import.meta.env.PROD` guard.
