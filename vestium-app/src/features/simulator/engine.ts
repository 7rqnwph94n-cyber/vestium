import { Inputs, EngineState, FaultId, ScanResult } from '../../types/simulator';

export const defaultInputs: Inputs = {
  I_Start: false,
  I_Stop: false,
  I_Pulse: false,
  I_Reset: false,
  I_Interlock: true,   // Starts CLOSED (safe condition)
  I_AckAlarm: false
};

export const initialEngineState: EngineState = {
  motor: false,
  lamp: false,
  valve: false,
  runPermit: true,     // Initially permitted (interlock closed)
  alarm: false,
  timer: {
    presetMs: 3000,
    accMs: 0,
    en: false,
    dn: false
  },
  counter: {
    preset: 5,
    acc: 0,
    dn: false,
    lastCu: false
  },
  scanCount: 0
};

type FaultSelection = FaultId | FaultId[] | undefined;

const faultList = (faults: FaultSelection): FaultId[] =>
  Array.isArray(faults) ? faults : faults ? [faults] : [];

export const applyFaultToInputs = (inputs: Inputs, faults?: FaultSelection): Inputs => {
  const effective = { ...inputs };
  for (const faultId of faultList(faults)) {
    if (faultId === 'start_stuck_off') effective.I_Start = false;
    if (faultId === 'stop_stuck_on') effective.I_Stop = true;
    if (faultId === 'pulse_failed_high') effective.I_Pulse = true;
    if (faultId === 'interlock_stuck_off') effective.I_Interlock = false;
  }
  return effective;
};

export const scanTick = (
  prev: EngineState,
  rawInputs: Inputs,
  deltaMs: number,
  faults?: FaultSelection
): ScanResult => {
  const effectiveInputs = applyFaultToInputs(rawInputs, faults);
  const activeFaults = faultList(faults);
  const hasFault = (faultId: FaultId) => activeFaults.includes(faultId);

  // ── Rung 1: Interlock Permit Gate ────────────────────────────────────────
  // A guard-door or safety interlock input enables the run permit.
  // If the interlock opens, RunPermit drops and the motor rung cannot energize.
  const interlockContact = effectiveInputs.I_Interlock;
  const runPermit = interlockContact;

  // ── Rung 2: Start/Stop Seal-In (gated by RunPermit) ─────────────────────
  // Classic latching circuit: (Start OR Motor-seal) AND NOT Stop AND Permit → Motor
  const startContact = effectiveInputs.I_Start;
  const motorSealContact = prev.motor;
  const stopNCContact = !effectiveInputs.I_Stop;
  const sealInCommand = (startContact || motorSealContact) && stopNCContact && runPermit;

  let motor: boolean;
  if (hasFault('motor_coil_failed')) {
    motor = false;                // Output card/contactor failure — stays off
  } else if (hasFault('motor_runaway')) {
    motor = true;                 // Welded contactor / stuck output — stays on
  } else {
    motor = sealInCommand;
  }

  // ── Rung 3: TON Timer — Motor enables T1; T1.DN drives Lamp ─────────────
  const timerPresetMs = hasFault('timer_preset_wrong') ? 30000 : 3000;
  const timerEnable = motor;
  const resetCommand = effectiveInputs.I_Reset;
  let timerAccMs = prev.timer.accMs;

  if (resetCommand) {
    timerAccMs = 0;
  } else if (timerEnable) {
    if (hasFault('timer_not_accumulating')) {
      timerAccMs = prev.timer.accMs;   // ACC frozen — input card / instruction fault
    } else {
      timerAccMs = Math.min(timerPresetMs, prev.timer.accMs + deltaMs);
    }
  } else {
    timerAccMs = 0;   // Non-retentive: resets when enable drops
  }

  const timerDn = timerAccMs >= timerPresetMs;
  const lamp = timerDn;

  // ── Rung 4: CTU Counter — Pulse rising edge increments C1; C1.DN → Valve ─
  const counterPreset = hasFault('counter_preset_wrong') ? 99 : 5;
  const cu = effectiveInputs.I_Pulse;
  const rising = cu && !prev.counter.lastCu;
  let counterAcc = prev.counter.acc;

  if (resetCommand && !hasFault('counter_reset_broken')) {
    counterAcc = 0;
  } else if (rising) {
    counterAcc = Math.min(counterPreset, prev.counter.acc + 1);
  }

  const counterDn = counterAcc >= counterPreset;
  const valve = counterDn;

  // ── Rung 5: Alarm Latch ──────────────────────────────────────────────────
  // Two conditions trigger the alarm:
  //   a) Motor runaway: output is ON but seal-in logic says OFF (output disagrees with command)
  //   b) Interlock violation: motor was running when the interlock opened
  // The alarm latches and requires the condition to clear AND an Ack press to reset.
  const motorRunawayDetect = motor && !sealInCommand;
  const interlockViolation = prev.motor && !effectiveInputs.I_Interlock;
  const alarmCondition = motorRunawayDetect || interlockViolation;

  let alarm = prev.alarm;
  if (alarmCondition) {
    alarm = true;   // SET: latch on fault condition
  } else if (effectiveInputs.I_AckAlarm) {
    alarm = false;  // RESET: clears only when condition gone AND ack pressed
  }

  // ── Assemble state ────────────────────────────────────────────────────────
  const state: EngineState = {
    motor,
    lamp,
    valve,
    runPermit,
    alarm,
    timer: {
      presetMs: timerPresetMs,
      accMs: timerAccMs,
      en: timerEnable,
      dn: timerDn
    },
    counter: {
      preset: counterPreset,
      acc: counterAcc,
      dn: counterDn,
      lastCu: cu
    },
    scanCount: prev.scanCount + 1
  };

  return {
    effectiveInputs,
    state,
    contacts: {
      start: startContact,
      motorSeal: motorSealContact,
      stopNC: stopNCContact,
      pulse: cu,
      timerDone: timerDn,
      counterDone: counterDn,
      interlock: interlockContact,
      alarmCondition
    },
    rungs: {
      permitGate: runPermit,
      sealIn: sealInCommand,
      timerEnable,
      counter: rising,
      alarmDetect: alarmCondition
    }
  };
};
