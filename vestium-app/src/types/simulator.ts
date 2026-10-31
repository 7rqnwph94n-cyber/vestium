export interface Inputs {
  I_Start: boolean;
  I_Stop: boolean;
  I_Pulse: boolean;
  I_Reset: boolean;
  I_Interlock: boolean;  // Guard door / safety interlock (true = closed/safe)
  I_AckAlarm: boolean;   // Alarm acknowledge (momentary)
}

export interface TimerState {
  presetMs: number;
  accMs: number;
  en: boolean;
  dn: boolean;
}

export interface CounterState {
  preset: number;
  acc: number;
  dn: boolean;
  lastCu: boolean;
}

export interface EngineState {
  motor: boolean;
  lamp: boolean;
  valve: boolean;
  runPermit: boolean;   // Interlock permit gate output
  alarm: boolean;       // Latched alarm bit
  timer: TimerState;
  counter: CounterState;
  scanCount: number;    // Cumulative scan count for display
}

export interface ContactTruth {
  start: boolean;
  motorSeal: boolean;
  stopNC: boolean;
  pulse: boolean;
  timerDone: boolean;
  counterDone: boolean;
  interlock: boolean;       // Interlock contact truth
  alarmCondition: boolean;  // Current alarm-triggering condition
}

export interface RungTruth {
  permitGate: boolean;  // Rung 1: interlock permit result
  sealIn: boolean;      // Rung 2: seal-in command
  timerEnable: boolean; // Rung 3: timer enable
  counter: boolean;     // Rung 4: counter rising edge
  alarmDetect: boolean; // Rung 5: alarm condition detected
}

export interface ScanResult {
  effectiveInputs: Inputs;
  state: EngineState;
  contacts: ContactTruth;
  rungs: RungTruth;
}

export type FaultId =
  | 'start_stuck_off'
  | 'stop_stuck_on'
  | 'motor_coil_failed'
  | 'timer_preset_wrong'
  | 'pulse_failed_high'
  | 'counter_preset_wrong'
  | 'interlock_stuck_off'
  | 'motor_runaway'
  | 'motor_feedback_stuck_off'
  | 'motor_feedback_stuck_on'
  | 'timer_not_accumulating'
  | 'counter_reset_broken';

export interface Fault {
  id: FaultId;
  label: string;
  explanation: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}
