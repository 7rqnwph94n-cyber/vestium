import { describe, expect, it } from 'vitest';
import { scanTick, initialEngineState, defaultInputs } from './engine';

describe('ladder engine', () => {
  it('handles seal-in start and stop behavior', () => {
    const startPressed = scanTick(initialEngineState, { ...defaultInputs, I_Start: true }, 100);
    expect(startPressed.state.motor).toBe(true);

    const releasedStart = scanTick(startPressed.state, defaultInputs, 100);
    expect(releasedStart.state.motor).toBe(true);

    const stopPressed = scanTick(releasedStart.state, { ...defaultInputs, I_Stop: true }, 100);
    expect(stopPressed.state.motor).toBe(false);
  });

  it('accumulates TON only while enabled and resets when false', () => {
    let state = initialEngineState;
    state = scanTick(state, { ...defaultInputs, I_Start: true }, 100).state;

    for (let i = 0; i < 30; i += 1) {
      state = scanTick(state, defaultInputs, 100).state;
    }

    expect(state.timer.dn).toBe(true);
    expect(state.lamp).toBe(true);

    const dropped = scanTick(state, { ...defaultInputs, I_Stop: true }, 100).state;
    expect(dropped.timer.accMs).toBe(0);
    expect(dropped.timer.dn).toBe(false);
  });

  it('increments CTU on rising edges and resets', () => {
    let state = initialEngineState;
    state = scanTick(state, { ...defaultInputs, I_Pulse: true }, 100).state;
    expect(state.counter.acc).toBe(1);

    state = scanTick(state, { ...defaultInputs, I_Pulse: true }, 100).state;
    expect(state.counter.acc).toBe(1);

    state = scanTick(state, defaultInputs, 100).state;
    state = scanTick(state, { ...defaultInputs, I_Pulse: true }, 100).state;
    expect(state.counter.acc).toBe(2);

    state = scanTick(state, { ...defaultInputs, I_Reset: true }, 100).state;
    expect(state.counter.acc).toBe(0);
  });

  it('applies fault effects in runtime behavior', () => {
    const withFault = scanTick(initialEngineState, { ...defaultInputs, I_Start: true }, 100, 'start_stuck_off');
    expect(withFault.effectiveInputs.I_Start).toBe(false);
    expect(withFault.state.motor).toBe(false);
  });
});
