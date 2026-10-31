import { Fault } from '../../types/simulator';

export const faults: Fault[] = [
  // ── Original six faults ──────────────────────────────────────────────────
  {
    id: 'start_stuck_off',
    label: 'Start input stuck OFF',
    explanation: 'The start signal never becomes true. Seal-in rung cannot initially energize the motor coil — start contact remains FALSE even when the button is pressed.',
    difficulty: 'beginner'
  },
  {
    id: 'stop_stuck_on',
    label: 'Stop input stuck ON',
    explanation: 'Stop appears continuously pressed. The NC stop contact evaluates FALSE every scan, breaking the motor rung and preventing any start attempt.',
    difficulty: 'beginner'
  },
  {
    id: 'motor_coil_failed',
    label: 'Motor output coil failed',
    explanation: 'Logic may command motor ON, but the physical output is forced off — contactor coil burnout or output card fault. Timer enable and downstream logic never progress.',
    difficulty: 'intermediate'
  },
  {
    id: 'timer_preset_wrong',
    label: 'Timer preset too high (30 s)',
    explanation: 'Timer preset is misconfigured to 30 seconds instead of 3 s. T1.ACC rises normally but T1.DN does not arrive until 30 s of continuous motor run — lamp indication appears far later than expected.',
    difficulty: 'beginner'
  },
  {
    id: 'pulse_failed_high',
    label: 'Pulse sensor failed HIGH (stuck ON)',
    explanation: 'Pulse signal is stuck true. CTU sees one rising edge on the first scan then no further false-to-true transitions, so the count appears frozen at 1.',
    difficulty: 'intermediate'
  },
  {
    id: 'counter_preset_wrong',
    label: 'Counter preset too high (99)',
    explanation: 'Counter preset is set to 99 instead of 5. The valve done condition never arrives during normal operation — C1.ACC climbs but C1.DN stays false indefinitely.',
    difficulty: 'beginner'
  },

  // ── Four new faults ───────────────────────────────────────────────────────
  {
    id: 'interlock_stuck_off',
    label: 'Safety interlock stuck OFF',
    explanation: 'The interlock input is forced false, so RunPermit is never true. The motor rung cannot energize despite Start contact reading TRUE — the block is in the permit chain, not the start circuit.',
    difficulty: 'beginner'
  },
  {
    id: 'motor_runaway',
    label: 'Motor output stuck ON (runaway)',
    explanation: 'The output is held true regardless of seal-in logic — welded contactor or stuck output card. Stop has no effect: seal-in rung drops FALSE but motor remains ON, triggering the alarm latch.',
    difficulty: 'advanced'
  },
  {
    id: 'motor_feedback_stuck_off',
    label: 'Motor aux feedback stuck OFF',
    explanation:
      'The motor/contactor auxiliary feedback input never turns on even when the motor output command energizes. This trains command-vs-feedback mismatch diagnosis without assuming the controller output itself failed.',
    difficulty: 'advanced'
  },
  {
    id: 'motor_feedback_stuck_on',
    label: 'Motor aux feedback stuck ON',
    explanation:
      'The motor/contactor auxiliary feedback input remains true even when the motor command is off. This can mimic welded feedback contacts, miswired feedback, or stale status and must be separated from a real runaway output.',
    difficulty: 'advanced'
  },
  {
    id: 'timer_not_accumulating',
    label: 'Timer ACC frozen at zero',
    explanation: 'Timer enable (T1.EN) is true — the motor is running — but T1.ACC never increments. This indicates a timer instruction fault or input-image freeze rather than a preset misconfiguration. Lamp never turns on.',
    difficulty: 'intermediate'
  },
  {
    id: 'counter_reset_broken',
    label: 'Counter reset has no effect',
    explanation: 'Pressing Reset clears the timer and other state but leaves C1.ACC unchanged — a broken reset rung or miswired RES instruction. If the counter has reached preset the valve stays energized and cannot be cleared.',
    difficulty: 'advanced'
  }
];

const difficultyRank: Record<Fault['difficulty'], number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3
};

export const maxFaultDifficultyForStage = (stageId: number): Fault['difficulty'] => {
  if (stageId <= 2) return 'beginner';
  if (stageId <= 4) return 'intermediate';
  return 'advanced';
};

export const faultsForStage = (stageId: number): Fault[] => {
  const maxRank = difficultyRank[maxFaultDifficultyForStage(stageId)];
  return faults.filter((fault) => difficultyRank[fault.difficulty] <= maxRank);
};

export const randomFault = (pool: Fault[] = faults): Fault =>
  pool[Math.floor(Math.random() * pool.length)];
