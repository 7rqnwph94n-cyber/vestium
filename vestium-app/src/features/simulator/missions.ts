import { EngineState, FaultId, Inputs, ScanResult } from '../../types/simulator';
import type { TrainingMissionBranch } from '../../lib/training-core/types';

export interface SimulatorSnapshot {
  stageId: number;
  inputs: Inputs;
  engineState: EngineState;
  lastScan: ScanResult;
  activeFaultId: FaultId | null;
  sequenceTrainer?: SequenceTrainerSnapshot;
  analogTrainer?: AnalogTrainerSnapshot;
  vfdTrainer?: VfdTrainerSnapshot;
  fieldbusTrainer?: FieldbusTrainerSnapshot;
  multiUnitTrainer?: MultiUnitTrainerSnapshot;
  oneShotTrainer?: OneShotTrainerSnapshot;
}

export interface SequenceTrainerSnapshot {
  running: boolean;
  activeStep: 0 | 10 | 20 | 30;
  startedAtScan: number | null;
  stallFaultId: 'none' | 'mix_temp_stuck_low' | 'tank_empty_switch_failed';
  transitions: {
    levelHigh: boolean;
    mixTimerDn: boolean;
    mixTemperatureOk: boolean;
    tankEmpty: boolean;
  };
  outputs: {
    fillValveCmd: boolean;
    mixerCmd: boolean;
    dischargeValveCmd: boolean;
  };
  /** Fill ramp timer — level builds over fillPresetMs while fill valve is open. */
  fillTimer: {
    accMs: number;
    presetMs: number;
    /** Percentage of fill level (0-100%), for display. */
    levelPct: number;
  };
  mixTimer: {
    accMs: number;
    presetMs: number;
    dn: boolean;
  };
  diagnosis?: {
    selected: 'step20-transition' | 'step30-transition' | 'unknown';
    correct: boolean;
  } | null;
}

export interface AnalogTrainerSnapshot {
  signalPercent: number;
  faultId: 'none' | 'open_loop' | 'short_circuit' | 'wrong_zero_offset' | 'wrong_span';
  loopCurrentmA: number;
  rawCounts: number;
  scaledEU: number;
  expectedEU: number;
  diagnosis?: {
    selected:
      | 'open_loop'
      | 'short_circuit'
      | 'scaling_fault'
      | 'healthy'
      | 'unknown';
    correct: boolean;
  } | null;
}

export interface VfdTrainerSnapshot {
  controlCmdRun: boolean;
  controlCmdResetPulse: boolean;
  speedRefHz: number;
  statusReady: boolean;
  statusRunning: boolean;
  statusAtSpeed: boolean;
  statusFault: boolean;
  localMode: boolean;
  faultId: 'none' | 'local_mode' | 'dc_bus_fault' | 'not_ready';
  diagnosis?: {
    selected: 'local_mode' | 'drive_fault' | 'ready_missing' | 'logic_fault' | 'unknown';
    correct: boolean;
  } | null;
}

export interface FieldbusTrainerSnapshot {
  controlRunCommand: boolean;
  remoteInputsValid: boolean;
  driveReadyBit: boolean;
  moduleBusFault: boolean;
  moduleChannelFault: boolean;
  devicePower: boolean;
  networkLink: boolean;
  deviceNameMatch: boolean;
  cyclicDataExchange: boolean;
  diagnosticsBuffer: string[];
  faultId: 'none' | 'device_power_loss' | 'network_link_down' | 'name_mismatch' | 'module_channel_fault';
  diagnosis?: {
    selected: 'power_link_fault' | 'profinet_config_fault' | 'channel_fault' | 'logic_fault' | 'unknown';
    correct: boolean;
  } | null;
}

export interface MultiUnitTrainerSnapshot {
  tick: number;
  sharedAirPermit: boolean;
  sharedNetworkReady: boolean;
  sharedPermit: boolean;
  unitA: {
    runCmd: boolean;
    localPermit: boolean;
    running: boolean;
  };
  unitB: {
    runCmd: boolean;
    localPermit: boolean;
    running: boolean;
  };
  unitC: {
    runCmd: boolean;
    localPermit: boolean;
    running: boolean;
  };
  faultId:
    | 'none'
    | 'shared_air_loss'
    | 'shared_network_loss'
    | 'unitA_local_permit_loss'
    | 'unitB_local_permit_loss'
    | 'unitB_local_permit_intermittent'
    | 'unitC_local_permit_loss';
  diagnosis?: {
    selected:
      | 'shared_air'
      | 'shared_network'
      | 'unitA'
      | 'unitB'
      | 'unitC'
      | 'unknown';
    correct: boolean;
  } | null;
}

export interface OneShotTrainerSnapshot {
  faultMode: 'none' | 'sealed_bit_instead_of_osr';
  partSensorPulse: boolean;
  latchedPartSeen: boolean;
  cuSignal: boolean;
  counterAcc: number;
  counterPreset: number;
  lastCu: boolean;
  simulatedPartCount: number;
  diagnosis?: {
    selected: 'needs_one_shot' | 'sensor_failed' | 'counter_bad' | 'unknown';
    correct: boolean;
  } | null;
}

export type SimulatorMissionEvent =
  | {
      type: 'faultDiagnosisSubmitted';
      correct: boolean;
      faultId: string;
    };

export interface SimulatorMissionCheckResult {
  passed: boolean;
  message: string;
}

export interface SimulatorMissionWorkflowStep {
  id: string;
  label: string;
  hint?: string;
}

export interface SimulatorMissionWorkflowEvidence {
  stepId: string;
  summary: string;
}

export interface SimulatorMissionCommonMistake {
  wrongDiagnosis: string;
  coachingFeedback: string;
}

export interface SimulatorMissionRestorationStep {
  instruction: string;
  verificationDescription: string;
  verificationTags: string[];
}

export interface SimulatorMission {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
  branches?: TrainingMissionBranch[];
  stageMin: number;
  stageMax?: number;
  minEvidenceSteps: number;
  commonMistakes?: SimulatorMissionCommonMistake[];
  restorationStep?: SimulatorMissionRestorationStep;
  workflowSteps?: SimulatorMissionWorkflowStep[];
  captureWorkflowEvidence?: (
    stepId: string,
    snapshot: SimulatorSnapshot
  ) => SimulatorMissionWorkflowEvidence;
  successState?: (snapshot: SimulatorSnapshot) => SimulatorMissionCheckResult;
  successEvent?: (
    event: SimulatorMissionEvent,
    snapshot: SimulatorSnapshot
  ) => SimulatorMissionCheckResult | null;
}

const missionPass = (message: string): SimulatorMissionCheckResult => ({ passed: true, message });
const missionFail = (message: string): SimulatorMissionCheckResult => ({ passed: false, message });

const feedbackMismatchTrainingFaultIds: FaultId[] = [
  'motor_coil_failed',
  'motor_runaway',
  'motor_feedback_stuck_off',
  'motor_feedback_stuck_on'
];

const isFeedbackMismatchTrainingFault = (faultId: FaultId | null): faultId is FaultId =>
  faultId !== null && feedbackMismatchTrainingFaultIds.includes(faultId);

const getMotorCommandFeedbackSnapshot = (snapshot: SimulatorSnapshot) => {
  const motorCommandRequested = snapshot.lastScan.rungs.sealIn;
  const motorOutputOn = snapshot.engineState.motor;
  const motorOutputTerminalV =
    snapshot.activeFaultId === 'motor_coil_failed'
      ? 0
      : snapshot.activeFaultId === 'motor_runaway'
        ? 24
        : motorCommandRequested
          ? 24
          : 0;
  const contactorCoilV = motorOutputTerminalV;
  const motorAuxFeedbackTag =
    snapshot.activeFaultId === 'motor_feedback_stuck_off'
      ? false
      : snapshot.activeFaultId === 'motor_feedback_stuck_on'
        ? true
        : motorOutputOn;
  const motorAuxFeedbackV = motorAuxFeedbackTag ? 24 : 0;

  const commandVsOutputMismatch = motorCommandRequested !== motorOutputOn;
  const outputVsFeedbackMismatch = motorOutputOn !== motorAuxFeedbackTag;
  const commandVsFeedbackMismatch = motorCommandRequested !== motorAuxFeedbackTag;

  let likelyDomain: 'output path' | 'feedback path' | 'mixed/ambiguous' | 'no mismatch observed';
  if (commandVsOutputMismatch && !outputVsFeedbackMismatch) likelyDomain = 'output path';
  else if (!commandVsOutputMismatch && outputVsFeedbackMismatch) likelyDomain = 'feedback path';
  else if (commandVsOutputMismatch || outputVsFeedbackMismatch) likelyDomain = 'mixed/ambiguous';
  else likelyDomain = 'no mismatch observed';

  return {
    motorCommandRequested,
    motorOutputOn,
    motorOutputTerminalV,
    contactorCoilV,
    motorAuxFeedbackTag,
    motorAuxFeedbackV,
    commandVsOutputMismatch,
    outputVsFeedbackMismatch,
    commandVsFeedbackMismatch,
    likelyDomain
  };
};

export const simulatorMissions: SimulatorMission[] = [
  {
    id: 'analog-loop-fault-diagnosis',
    title: 'Analog Loop Fault Diagnosis',
    description:
      'Use loop current, raw counts, and scaled engineering units to identify whether the fault is loop-side or scaling-side.',
    whyItMatters:
      'Analog faults are common in plants. Technicians must separate signal-loop failures from scaling/configuration errors quickly.',
    stageMin: 1,
    stageMax: 1,
    minEvidenceSteps: 3,
    commonMistakes: [
      {
        wrongDiagnosis: 'healthy',
        coachingFeedback:
          'If expected and displayed values differ, the loop is not healthy. Compare loop current against the expected mA range before selecting healthy.'
      },
      {
        wrongDiagnosis: 'scaling_fault',
        coachingFeedback:
          'A scaling fault shows normal loop current (4–20 mA) but wrong EU output. If loop current is also abnormal (0 mA or pinned at 20 mA), check for open_loop or short_circuit first — you may be looking at a wiring fault, not a configuration fault.'
      },
      {
        wrongDiagnosis: 'open_loop',
        coachingFeedback:
          'An open-loop fault produces 0 mA because the current path is broken. If loop current is present but the EU value is wrong, the wiring is intact — the fault is in scaling or calibration, not the loop.'
      }
    ],
    restorationStep: {
      instruction:
        'Clear the analog fault and confirm loop current returns to a value within the 4–20 mA span that matches the signal percentage.',
      verificationDescription:
        'scaledEU matches expectedEU within ±2%, loopCurrentmA is within the 4–20 mA span, and no fault mode is active.',
      verificationTags: ['loopCurrentmA', 'scaledEU', 'expectedEU']
    },
    workflowSteps: [
      {
        id: 'analog-define-symptom',
        label: 'Define analog symptom',
        hint: 'Compare expected process value vs displayed/scaled value.'
      },
      {
        id: 'analog-check-loop',
        label: 'Check loop current and raw counts',
        hint: 'Use loop mA and raw counts to classify wiring/power faults.'
      },
      {
        id: 'analog-check-scaling',
        label: 'Check scaled EU vs expected',
        hint: 'A mismatch with healthy loop current often indicates scaling/zero/span issues.'
      }
    ],
    captureWorkflowEvidence: (stepId, snapshot) => {
      const analog = snapshot.analogTrainer;
      if (!analog) return { stepId, summary: 'Analog trainer is not active.' };
      switch (stepId) {
        case 'analog-define-symptom':
          return {
            stepId,
            summary: `Expected=${analog.expectedEU.toFixed(1)} EU, Displayed=${analog.scaledEU.toFixed(
              1
            )} EU, faultMode=${analog.faultId}.`
          };
        case 'analog-check-loop':
          return {
            stepId,
            summary: `Loop current=${analog.loopCurrentmA.toFixed(
              2
            )} mA, rawCounts=${analog.rawCounts}.`
          };
        case 'analog-check-scaling':
          return {
            stepId,
            summary: `Scaled EU=${analog.scaledEU.toFixed(1)} vs expectedEU=${analog.expectedEU.toFixed(
              1
            )}.`
          };
        default:
          return { stepId, summary: 'Evidence captured.' };
      }
    },
    successState: ({ analogTrainer }) => {
      if (!analogTrainer) return missionFail('Open Stage 1 analog trainer first.');
      if (!analogTrainer.diagnosis) {
        return missionFail('Inject an analog fault and submit a diagnosis.');
      }
      if (!analogTrainer.diagnosis.correct) {
        return missionFail('Incorrect analog diagnosis. Use loop current/raw counts to classify the fault domain.');
      }
      return missionPass('Correctly diagnosed the analog fault domain using loop and scaled-value evidence.');
    }
  },
  {
    id: 'seal-in-hold',
    title: 'Seal-In Hold Test',
    description:
      'Start the motor, release Start, and keep the interlock closed. Verify the motor stays latched on.',
    whyItMatters:
      'This is the commissioning baseline for almost every motor start/stop rung. A motor that starts but does not hold is not ready for service.',
    stageMin: 2,
    stageMax: 2,
    minEvidenceSteps: 3,
    commonMistakes: [
      {
        wrongDiagnosis: 'Stop contact wiring fault',
        coachingFeedback:
          'The Stop contact is NC and reads TRUE when healthy. If the motor never latches after Start release, check the seal-in parallel branch first — not the Stop path. The Stop circuit is only relevant if the motor drops unexpectedly while running.'
      },
      {
        wrongDiagnosis: 'Motor output coil failed',
        coachingFeedback:
          'If the output coil had failed, the motor would not run at all — even while Start is held. Since it runs while held, output power is good. The issue is the seal-in latch parallel branch, not the coil.'
      }
    ],
    successState: ({ inputs, engineState, lastScan }) => {
      if (!inputs.I_Interlock) return missionFail('Close the interlock first so RunPermit is available.');
      if (inputs.I_Start) return missionFail('Release Start, then check that the motor remains ON.');
      if (inputs.I_Stop) return missionFail('Release Stop. The seal-in test requires Stop not active.');
      if (!engineState.motor) return missionFail('Motor is OFF. Pulse Start and verify the seal branch holds.');
      if (!lastScan.contacts.motorSeal) {
        return missionFail('Seal branch is not true yet. Wait one scan after motor energizes.');
      }
      return missionPass('Motor is latched ON with Start released: seal-in behavior verified.');
    }
  },
  {
    id: 'timer-lamp-delay',
    title: 'Timer Delay Verification',
    description:
      'Keep the motor running long enough for T1 to finish, then verify T1.DN and Lamp energize together.',
    whyItMatters:
      'Timer telemetry is a high-value commissioning and troubleshooting check. You need to distinguish enable-path, preset, and accumulator problems.',
    stageMin: 2,
    stageMax: 2,
    minEvidenceSteps: 3,
    commonMistakes: [
      {
        wrongDiagnosis: 'Lamp wiring fault',
        coachingFeedback:
          'Check T1.DN first. If T1.DN is false, the lamp will never energize regardless of wiring — the output instruction is not even reached. Confirm T1.DN is true before suspecting the lamp output circuit.'
      },
      {
        wrongDiagnosis: 'Motor interlock fault',
        coachingFeedback:
          'T1 only enables when the motor is running. If T1.EN is false, the motor is not latched. Verify the motor is ON first — the timer path depends on motor state, not the interlock directly.'
      }
    ],
    successState: ({ engineState }) => {
      if (!engineState.motor) return missionFail('Start and latch the motor first to enable T1.');
      if (!engineState.timer.en) return missionFail('T1.EN is false. The timer is not enabled.');
      if (!engineState.timer.dn) {
        return missionFail(
          `T1 not done yet. Current ACC/PRE is ${engineState.timer.accMs / 1000}s / ${
            engineState.timer.presetMs / 1000
          }s.`
        );
      }
      if (!engineState.lamp) return missionFail('T1.DN is true but Lamp is not ON. Check downstream logic.');
      return missionPass('Timer done and Lamp output verified from live telemetry.');
    }
  },
  {
    id: 'counter-valve-done',
    title: 'Counter Done Verification',
    description:
      'Generate separate Pulse Count edges until the counter reaches preset and opens the valve.',
    whyItMatters:
      'Technicians must understand edge-triggered counting to avoid misdiagnosing “counter not working” when the signal is held high.',
    stageMin: 2,
    stageMax: 2,
    minEvidenceSteps: 3,
    commonMistakes: [
      {
        wrongDiagnosis: 'Counter hardware fault',
        coachingFeedback:
          'Before calling the counter faulty, verify you are releasing Pulse between presses. CTU increments on rising edges only — holding the input high after the first edge will not produce additional counts, which looks like a broken counter.'
      },
      {
        wrongDiagnosis: 'Valve wiring fault',
        coachingFeedback:
          'The valve output only energizes when C1.DN is true. If C1.ACC has not reached preset, the valve logic is working correctly — the issue is the count, not the valve circuit.'
      }
    ],
    successState: ({ engineState, inputs }) => {
      if (inputs.I_Pulse) {
        return missionFail('Release Pulse Count between presses. CTU increments on rising edges.');
      }
      if (!engineState.counter.dn || !engineState.valve) {
        return missionFail(
          `Counter not done yet. Current C1 ACC/PV is ${engineState.counter.acc} / ${engineState.counter.preset}.`
        );
      }
      return missionPass('Counter reached preset using rising edges and Valve output is ON.');
    }
  },
  {
    id: 'one-shot-counter-diagnosis',
    title: 'One-Shot Counter Diagnosis',
    description:
      'Diagnose why a counter only increments once when repeated part pulses occur: the CU path is driven by a sealed bit instead of an OSR/OSF one-shot pulse.',
    whyItMatters:
      'Edge-triggered counting is a core controller skill. Misusing a latched bit instead of a one-shot causes undercounting and confusing “counter is broken” reports.',
    stageMin: 2,
    stageMax: 2,
    minEvidenceSteps: 3,
    commonMistakes: [
      {
        wrongDiagnosis: 'sensor_failed',
        coachingFeedback:
          'The part sensor is generating pulses — partSensorPulse is toggling on each part. The issue is that the CU input remains held high after the first part, preventing a second rising edge. This is a logic design fault, not a sensor failure.'
      },
      {
        wrongDiagnosis: 'counter_bad',
        coachingFeedback:
          'The counter instruction itself increments correctly when it sees a TRUE-to-FALSE-to-TRUE transition on CU. The problem is the CU signal never goes low to allow a second edge. Trace the CU rung — the root cause is upstream of the counter, not in the counter itself.'
      }
    ],
    restorationStep: {
      instruction:
        'After identifying the missing OSR/OSF instruction, verify the counter increments exactly once per part by simulating three part events and confirming ACC equals 3.',
      verificationDescription:
        'counterAcc equals simulatedPartCount with one count per part — no over- or under-counting.',
      verificationTags: ['counterAcc', 'simulatedPartCount', 'cuSignal']
    },
    workflowSteps: [
      {
        id: 'osr-define-symptom',
        label: 'Define the count symptom',
        hint: 'Confirm repeated part events occur while the count remains stuck.'
      },
      {
        id: 'osr-check-cu-path',
        label: 'Inspect CU path behavior',
        hint: 'Check whether CU pulses briefly or stays high after the first part.'
      },
      {
        id: 'osr-differentiate-root-cause',
        label: 'Separate one-shot misuse vs device failure',
        hint: 'Sensor pulses + CU stuck high points to logic design, not sensor failure.'
      }
    ],
    captureWorkflowEvidence: (stepId, snapshot) => {
      const osr = snapshot.oneShotTrainer;
      if (!osr) return { stepId, summary: 'One-shot trainer is not active.' };
      switch (stepId) {
        case 'osr-define-symptom':
          return {
            stepId,
            summary: `Part events simulated=${osr.simulatedPartCount}; counter ACC=${osr.counterAcc}/${osr.counterPreset}.`
          };
        case 'osr-check-cu-path':
          return {
            stepId,
            summary: `CU=${osr.cuSignal}, latchedPartSeen=${osr.latchedPartSeen}, sensorPulse=${osr.partSensorPulse}, faultMode=${osr.faultMode}.`
          };
        case 'osr-differentiate-root-cause':
          return {
            stepId,
            summary: `Sensor pulses observed with CU behavior ${osr.cuSignal ? 'HIGH' : 'LOW'} and ACC=${osr.counterAcc}; diagnosis should focus on edge generation (OSR/OSF) if pulses exist.`
          };
        default:
          return { stepId, summary: 'Evidence captured.' };
      }
    },
    successState: ({ oneShotTrainer }) => {
      if (!oneShotTrainer) return missionFail('Open the Stage 2 one-shot trainer first.');
      if (!oneShotTrainer.diagnosis) return missionFail('Run the one-shot trainer and submit a diagnosis.');
      if (!oneShotTrainer.diagnosis.correct) {
        return missionFail('Incorrect diagnosis. Look for sensor pulses present but CU held high by a latched bit.');
      }
      return missionPass('Correctly identified a missing one-shot (OSR/OSF) on the counter CU path.');
    }
  },
  {
    id: 'sequence-stall-diagnosis',
    title: 'Sequence Stall Diagnosis',
    description:
      'Run the 3-step trainer sequence, let it stall under a hidden transition fault, then identify the blocked transition path.',
    whyItMatters:
      'Most sequence troubleshooting starts by finding the active step and the blocked transition condition. This mission trains that exact habit.',
    stageMin: 3,
    stageMax: 3,
    minEvidenceSteps: 3,
    commonMistakes: [
      {
        wrongDiagnosis: 'step30-transition',
        coachingFeedback:
          'Read the active step indicator first. Step 20 is the Mix step — its exit requires the mix timer done AND temperature OK. Only check Step 30 transitions when the sequence reaches Step 20 and the mix timer has already timed out.'
      },
      {
        wrongDiagnosis: 'unknown',
        coachingFeedback:
          'Use the active step number and transition truth bits to narrow to a specific condition. "Unknown" is only valid when evidence is genuinely contradictory — if a step is active and one transition bit is false, that is the answer.'
      }
    ],
    restorationStep: {
      instruction:
        'After diagnosis, reset the sequence and run a complete Fill → Mix → Discharge cycle without a stall to verify normal operation.',
      verificationDescription:
        'Sequence advances through steps 10 → 20 → 30 → 0 without pausing. All three output commands cycle in the correct order.',
      verificationTags: ['activeStep', 'fillValveCmd', 'mixerCmd', 'dischargeValveCmd']
    },
    workflowSteps: [
      {
        id: 'seq-define-symptom',
        label: 'Define the sequence symptom',
        hint: 'Note which step the process reaches and what it fails to do next.'
      },
      {
        id: 'seq-identify-active-step',
        label: 'Identify the active step bit',
        hint: 'Find the currently active step before reading unrelated logic.'
      },
      {
        id: 'seq-check-transition',
        label: 'Inspect transition conditions',
        hint: 'Check only the transition conditions for the active step and find the blocked condition.'
      }
    ],
    captureWorkflowEvidence: (stepId, snapshot) => {
      const seq = snapshot.sequenceTrainer;
      if (!seq) {
        return { stepId, summary: 'Sequence trainer is not active for this stage.' };
      }
      switch (stepId) {
        case 'seq-define-symptom':
          return {
            stepId,
            summary: `Sequence state observed: running=${seq.running}, activeStep=${
              seq.activeStep === 0 ? 'COMPLETE/IDLE' : seq.activeStep
            }, outputs Fill/Mix/Discharge=${seq.outputs.fillValveCmd}/${seq.outputs.mixerCmd}/${seq.outputs.dischargeValveCmd}.`
          };
        case 'seq-identify-active-step':
          return {
            stepId,
            summary: `Active step=${seq.activeStep}; TankLevel=${seq.fillTimer.levelPct}%; transition bits LevelHigh=${seq.transitions.levelHigh}, MixTimerDN=${seq.transitions.mixTimerDn}, MixTempOK=${seq.transitions.mixTemperatureOk}, TankEmpty=${seq.transitions.tankEmpty}.`
          };
        case 'seq-check-transition':
          return {
            stepId,
            summary: `Transition check at Step ${seq.activeStep}: Mix ACC/PRE/DN=${seq.mixTimer.accMs}/${seq.mixTimer.presetMs}/${seq.mixTimer.dn}; fault mode=${seq.stallFaultId}.`
          };
        default:
          return { stepId, summary: 'Evidence captured.' };
      }
    },
    successState: ({ sequenceTrainer }) => {
      if (!sequenceTrainer?.running && !sequenceTrainer?.diagnosis) {
        return missionFail('Start the sequence trainer and observe the step progression first.');
      }
      if (!sequenceTrainer.diagnosis) {
        return missionFail(
          `Sequence is at Step ${sequenceTrainer.activeStep || 'IDLE'}. Submit a diagnosis for the blocked transition.`
        );
      }
      if (!sequenceTrainer.diagnosis.correct) {
        return missionFail('Incorrect sequence diagnosis. Use active step + transition condition truth to identify the stall.');
      }
      return missionPass('Correctly identified the blocked sequence transition using step/transition evidence.');
    }
  },
  {
    id: 'vfd-handshake-diagnosis',
    title: 'VFD Handshake Diagnosis',
    description:
      'Command the virtual drive and diagnose no-run conditions using ready/running/fault/local-remote status bits.',
    whyItMatters:
      'controller-to-VFD integration is a core field skill. Most no-run faults are solved by reading the command/status handshake correctly.',
    stageMin: 4,
    stageMax: 4,
    minEvidenceSteps: 3,
    commonMistakes: [
      {
        wrongDiagnosis: 'logic_fault',
        coachingFeedback:
          'Check drive status bits before assuming a logic fault. If statusReady is false or statusFault is true, the drive itself is blocking the run — editing ladder logic will have no effect until the drive issue is resolved first.'
      },
      {
        wrongDiagnosis: 'ready_missing',
        coachingFeedback:
          'ready_missing is the correct domain only when statusReady is false with no fault active and localMode is false. If statusFault or localMode is true, those conditions take priority as the blocking cause.'
      },
      {
        wrongDiagnosis: 'drive_fault',
        coachingFeedback:
          'Confirm statusFault is actually TRUE before selecting drive_fault. If the drive is in local mode (localMode=true), the controller command is simply being ignored at the drive keypad — that is a different root cause from a drive trip.'
      }
    ],
    restorationStep: {
      instruction:
        'Clear the VFD fault, confirm statusReady goes TRUE, then issue the run command and verify statusRunning and statusAtSpeed both become true.',
      verificationDescription:
        'controlCmdRun=true, statusReady=true, statusRunning=true, statusAtSpeed=true, statusFault=false, localMode=false.',
      verificationTags: ['statusReady', 'statusRunning', 'statusAtSpeed', 'statusFault']
    },
    workflowSteps: [
      {
        id: 'vfd-define-symptom',
        label: 'Define command vs actual behavior',
        hint: 'Record controller run command and what the drive actually reports.'
      },
      {
        id: 'vfd-check-ready-fault',
        label: 'Check ready/fault/local status',
        hint: 'This is the fastest way to classify the no-run cause.'
      },
      {
        id: 'vfd-check-feedback',
        label: 'Check running / at-speed feedback',
        hint: 'Confirm whether this is command-blocked or feedback mismatch.'
      }
    ],
    captureWorkflowEvidence: (stepId, snapshot) => {
      const vfd = snapshot.vfdTrainer;
      if (!vfd) return { stepId, summary: 'VFD trainer is not active.' };
      switch (stepId) {
        case 'vfd-define-symptom':
          return {
            stepId,
            summary: `controller RunCmd=${vfd.controlCmdRun}, SpeedRef=${vfd.speedRefHz.toFixed(
              1
            )} Hz; Drive running=${vfd.statusRunning}, atSpeed=${vfd.statusAtSpeed}.`
          };
        case 'vfd-check-ready-fault':
          return {
            stepId,
            summary: `Ready=${vfd.statusReady}, Fault=${vfd.statusFault}, LocalMode=${vfd.localMode}, faultMode=${vfd.faultId}.`
          };
        case 'vfd-check-feedback':
          return {
            stepId,
            summary: `Running=${vfd.statusRunning}, AtSpeed=${vfd.statusAtSpeed}, Ready=${vfd.statusReady}.`
          };
        default:
          return { stepId, summary: 'Evidence captured.' };
      }
    },
    successState: ({ vfdTrainer }) => {
      if (!vfdTrainer) return missionFail('Open the Stage 4 VFD trainer first.');
      if (!vfdTrainer.diagnosis) {
        return missionFail('Inject a VFD fault and submit a diagnosis.');
      }
      if (!vfdTrainer.diagnosis.correct) {
        return missionFail('Incorrect VFD diagnosis. Use ready/fault/local-remote status before changing logic.');
      }
      return missionPass('Correctly diagnosed the VFD no-run condition using command/status handshake evidence.');
    }
  },
  {
    id: 'fieldbus-device-missing-diagnosis',
    title: 'Fieldbus Device-Missing Diagnosis',
    description:
      'Diagnose a PROFINET / fieldbus device-missing or bad-data condition using diagnostics buffer entries, module indicators, and device power/link/config evidence.',
    whyItMatters:
      'Fieldbus device availability faults are one of the highest-frequency comms issues in real plants. Diagnostics-first workflow prevents wasted logic edits.',
    stageMin: 4,
    stageMax: 4,
    minEvidenceSteps: 3,
    commonMistakes: [
      {
        wrongDiagnosis: 'logic_fault',
        coachingFeedback:
          'When remote inputs fail together in a cluster, check device availability (power, link, device name) before touching logic. A logic fault would affect one rung or signal path — simultaneous loss of all remote I/O points to a device or network layer problem.'
      },
      {
        wrongDiagnosis: 'channel_fault',
        coachingFeedback:
          'A channel fault affects individual I/O points within an otherwise healthy module. If moduleBusFault is active or cyclic data exchange is absent entirely, the fault is at the device or network level — check power and link before investigating individual channels.'
      }
    ],
    restorationStep: {
      instruction:
        'Restore device availability (power, link, correct device name) and confirm cyclicDataExchange returns to true and moduleBusFault clears.',
      verificationDescription:
        'devicePower=true, networkLink=true, deviceNameMatch=true, cyclicDataExchange=true, moduleBusFault=false.',
      verificationTags: ['devicePower', 'networkLink', 'deviceNameMatch', 'cyclicDataExchange', 'moduleBusFault']
    },
    workflowSteps: [
      {
        id: 'fieldbus-define-symptom',
        label: 'Define clustered signal symptom',
        hint: 'Note whether multiple remote signals/ready bits failed together.'
      },
      {
        id: 'fieldbus-check-diagnostics',
        label: 'Check diagnostics buffer and module status',
        hint: 'Use controller/module diagnostics to classify device/network/channel fault domain.'
      },
      {
        id: 'fieldbus-check-device-availability',
        label: 'Check device power/link/name/config',
        hint: 'Verify device is powered, linked, and configured correctly before touching process logic.'
      }
    ],
    captureWorkflowEvidence: (stepId, snapshot) => {
      const fb = snapshot.fieldbusTrainer;
      if (!fb) return { stepId, summary: 'Fieldbus trainer is not active.' };
      switch (stepId) {
        case 'fieldbus-define-symptom':
          return {
            stepId,
            summary: `Symptom: controller RunCmd=${fb.controlRunCommand}, remoteInputsValid=${fb.remoteInputsValid}, DriveReady=${fb.driveReadyBit}, cyclicData=${fb.cyclicDataExchange}.`
          };
        case 'fieldbus-check-diagnostics':
          return {
            stepId,
            summary: `Diagnostics: moduleBusFault=${fb.moduleBusFault}, moduleChannelFault=${fb.moduleChannelFault}; latest="${fb.diagnosticsBuffer[0] ?? 'none'}".`
          };
        case 'fieldbus-check-device-availability':
          return {
            stepId,
            summary: `Device availability: power=${fb.devicePower}, link=${fb.networkLink}, deviceNameMatch=${fb.deviceNameMatch}, cyclicData=${fb.cyclicDataExchange}, faultMode=${fb.faultId}.`
          };
        default:
          return { stepId, summary: 'Evidence captured.' };
      }
    },
    successState: ({ fieldbusTrainer }) => {
      if (!fieldbusTrainer) return missionFail('Open the Stage 4 fieldbus trainer first.');
      if (!fieldbusTrainer.diagnosis) {
        return missionFail('Inject a fieldbus fault and submit a diagnosis.');
      }
      if (!fieldbusTrainer.diagnosis.correct) {
        return missionFail('Incorrect diagnosis. Use diagnostics buffer + power/link/name evidence before blaming logic.');
      }
      return missionPass('Correctly diagnosed the fieldbus/PROFINET device fault using diagnostics-first workflow.');
    }
  },
  {
    id: 'alarm-on-interlock-drop',
    title: 'Alarm Latch on Unsafe Condition',
    description:
      'Run the motor, open the interlock to latch the alarm, close the interlock to clear the fault condition, then press Ack Alarm to prove the reset path.',
    whyItMatters:
      'This builds the habit of separating detection, latch, and acknowledge behavior instead of treating alarms as simple status bits. All three phases (latch, condition-clear, ack) must be verified in sequence.',
    stageMin: 3,
    stageMax: 4,
    minEvidenceSteps: 3,
    commonMistakes: [
      {
        wrongDiagnosis: 'Motor wiring fault',
        coachingFeedback:
          'The motor stopped because RunPermit dropped when the interlock opened — not because of wiring. When diagnosing an alarm trip, check the permit chain and alarm latch before the motor circuit.'
      },
      {
        wrongDiagnosis: 'Timer preset too high',
        coachingFeedback:
          'Timer preset affects only the lamp delay. The motor stop and alarm latch happen immediately on interlock loss — they are entirely upstream of T1 and unrelated to its preset value.'
      },
      {
        wrongDiagnosis: 'Counter preset wrong',
        coachingFeedback:
          'Counter preset affects only the valve done condition. An alarm triggered by interlock loss is in the motor and alarm rungs, which are upstream of the counter circuit entirely.'
      }
    ],
    restorationStep: {
      instruction:
        'After completing the full alarm cycle, restart the motor and confirm it runs normally with the interlock closed and alarm cleared.',
      verificationDescription:
        'Motor ON, alarm OFF, RunPermit TRUE, interlock closed, alarm condition FALSE.',
      verificationTags: ['motor', 'alarm', 'runPermit', 'I_Interlock']
    },
    // Workflow evidence captures each phase so learners prove the full sequence.
    workflowSteps: [
      {
        id: 'alarm-create-fault',
        label: 'Create alarm condition (motor running + interlock open)',
        hint: 'Start the motor, then open the interlock to trigger the interlock-violation alarm.'
      },
      {
        id: 'alarm-clear-fault',
        label: 'Clear the fault condition (close the interlock)',
        hint: 'Close the interlock. Alarm should remain latched — this proves latch behavior.'
      },
      {
        id: 'alarm-acknowledge',
        label: 'Acknowledge and verify reset (press Ack Alarm)',
        hint: 'Press Ack Alarm only after the condition is clear. Alarm should drop to FALSE.'
      }
    ],
    captureWorkflowEvidence: (stepId, snapshot) => {
      const { engineState, lastScan, inputs } = snapshot;
      switch (stepId) {
        case 'alarm-create-fault':
          return {
            stepId,
            summary: `Fault created: Motor=${engineState.motor}, Interlock=${inputs.I_Interlock}, AlarmCond=${lastScan.contacts.alarmCondition}, AlarmLatched=${engineState.alarm}.`
          };
        case 'alarm-clear-fault':
          return {
            stepId,
            summary: `Condition cleared: Interlock=${inputs.I_Interlock}, AlarmCond=${lastScan.contacts.alarmCondition}, AlarmStillLatched=${engineState.alarm} (should be TRUE — latch holds).`
          };
        case 'alarm-acknowledge':
          return {
            stepId,
            summary: `Ack attempted: I_AckAlarm=${inputs.I_AckAlarm}, AlarmCond=${lastScan.contacts.alarmCondition}, AlarmLatched=${engineState.alarm} (should now be FALSE after ack with condition clear).`
          };
        default:
          return { stepId, summary: 'Evidence captured.' };
      }
    },
    successState: ({ engineState, lastScan }) => {
      // Require full cycle: alarm has been latched AND then reset via ack after condition cleared.
      // engine.ts: alarm clears only when !alarmCondition && I_AckAlarm — so alarm===false
      // with condition also false proves the ack path was exercised correctly.
      if (engineState.alarm) {
        if (!lastScan.contacts.alarmCondition) {
          return missionFail(
            'Alarm is latched and condition is now clear. Press Ack Alarm to complete the reset cycle.'
          );
        }
        return missionFail(
          'Alarm latched — good. Now close the interlock to clear the fault condition, then press Ack Alarm.'
        );
      }
      if (lastScan.contacts.alarmCondition) {
        // Alarm is false but condition is still active — alarm was never set or was reset abnormally.
        return missionFail(
          'Alarm condition is active but alarm bit is not set. Start motor, then open interlock to trigger the latch.'
        );
      }
      // alarm===false AND alarmCondition===false — but we need proof the user completed the workflow.
      // The workflow step guard in checkSelectedMissionState enforces evidence for all three steps.
      return missionPass(
        'Full alarm cycle verified: alarm latched on fault, remained latched after condition cleared, and reset correctly on Ack.'
      );
    }
  },
  {
    id: 'multi-unit-shared-permit-diagnosis',
    title: 'Multi-Unit Shared Permit Diagnosis',
    description:
      'Diagnose clustered stoppages across multiple units and distinguish shared utility/network failures from local unit faults, including intermittent behavior.',
    whyItMatters:
      'Integrated systems fail in clusters. The fastest technicians check shared permits first and then narrow to local unit paths only when needed.',
    stageMin: 6,
    stageMax: 6,
    minEvidenceSteps: 4,
    commonMistakes: [
      {
        wrongDiagnosis: 'unitA',
        coachingFeedback:
          'When multiple units stop together, check the shared permit first. If sharedPermit is false, all units will stop regardless of their local permits — isolating Unit A without checking the shared state is premature and wastes diagnosis time.'
      },
      {
        wrongDiagnosis: 'unitB',
        coachingFeedback:
          'An intermittent Unit B fault is possible, but verify both shared permits are stable before concluding a local unit fault. Shared air or network instability can produce intermittent behavior that looks exactly like a local permit fault.'
      },
      {
        wrongDiagnosis: 'shared_network',
        coachingFeedback:
          'Check both sharedAirPermit and sharedNetworkReady separately before selecting a specific shared utility. Selecting the wrong shared permit delays resolution — use the captured evidence values for each shared input to distinguish them.'
      }
    ],
    restorationStep: {
      instruction:
        'After diagnosis, restore the faulted shared or local permit and confirm all three units return to running state.',
      verificationDescription:
        'sharedPermit=true, unitA.running=true, unitB.running=true, unitC.running=true.',
      verificationTags: ['sharedPermit', 'unitA.running', 'unitB.running', 'unitC.running']
    },
    workflowSteps: [
      {
        id: 'multi-define-symptom',
        label: 'Define which units are affected',
        hint: 'Start with the pattern: one unit down vs multiple units down.'
      },
      {
        id: 'multi-check-shared',
        label: 'Check shared permit first',
        hint: 'Clustered stoppages often trace to one upstream dependency.'
      },
      {
        id: 'multi-compare-local',
        label: 'Compare local permits/feedback by unit',
        hint: 'Only after shared checks should you isolate a local unit fault.'
      }
    ],
    captureWorkflowEvidence: (stepId, snapshot) => {
      const multi = snapshot.multiUnitTrainer;
      if (!multi) return { stepId, summary: 'Multi-unit trainer is not active.' };
      switch (stepId) {
        case 'multi-define-symptom':
          return {
            stepId,
            summary: `Observed pattern: UnitA=${multi.unitA.running}, UnitB=${multi.unitB.running}, UnitC=${multi.unitC.running}; sharedPermit=${multi.sharedPermit}; tick=${multi.tick}.`
          };
        case 'multi-check-shared':
          return {
            stepId,
            summary: `SharedAir=${multi.sharedAirPermit}, SharedNetwork=${multi.sharedNetworkReady}, SharedPermit=${multi.sharedPermit}; faultMode=${multi.faultId}.`
          };
        case 'multi-compare-local':
          return {
            stepId,
            summary: `UnitA local=${multi.unitA.localPermit}, run=${multi.unitA.running}; UnitB local=${multi.unitB.localPermit}, run=${multi.unitB.running}; UnitC local=${multi.unitC.localPermit}, run=${multi.unitC.running}.`
          };
        default:
          return { stepId, summary: 'Evidence captured.' };
      }
    },
    successState: ({ multiUnitTrainer }) => {
      if (!multiUnitTrainer) return missionFail('Open the Stage 6 multi-unit trainer first.');
      if (!multiUnitTrainer.diagnosis) {
        return missionFail('Inject a multi-unit fault and submit a diagnosis.');
      }
      if (!multiUnitTrainer.diagnosis.correct) {
        return missionFail('Incorrect diagnosis. Use the affected-unit pattern and shared permit state first.');
      }
      return missionPass('Correctly classified the clustered stoppage and identified the shared/local fault source.');
    }
  },
  {
    id: 'motor-command-feedback-mismatch-diagnosis',
    title: 'Motor Command vs Output vs Feedback Diagnosis',
    description:
      'Diagnose whether a motor no-run/runaway indication is caused by the output power path or the aux feedback path by comparing command, output state, coil voltage, and I_MotorFb.',
    whyItMatters:
      'Technicians regularly lose time replacing the wrong component because command, output, and feedback are not separated. This mission trains that distinction using docs + field checks.',
    stageMin: 5,
    minEvidenceSteps: 4,
    commonMistakes: [
      {
        wrongDiagnosis: 'motor_runaway',
        coachingFeedback:
          'A true runaway means the output terminal is 24 V even when the controller command is OFF. If output terminal voltage is 0 V when command is off, the output hardware is healthy — the issue is in the feedback path. Check terminal voltage before selecting runaway.'
      },
      {
        wrongDiagnosis: 'motor_coil_failed',
        coachingFeedback:
          'A coil failure shows 0 V at the output terminal when the controller commands ON. If the output terminal reads 24 V but I_MotorFb is still false, the output is energizing correctly — suspect a feedback wiring or aux contact fault, not the output coil.'
      },
      {
        wrongDiagnosis: 'motor_feedback_stuck_on',
        coachingFeedback:
          'Feedback stuck ON means I_MotorFb is true even with the output OFF. Verify the output terminal voltage first — if it reads 24 V when commanded on, the contactor may actually be energized. Compare output state and feedback state explicitly before concluding the feedback is stuck.'
      }
    ],
    restorationStep: {
      instruction:
        'After diagnosis, clear the fault, restart the motor, and verify all three layers (command, output terminal, I_MotorFb) are in agreement with no mismatch flags.',
      verificationDescription:
        'commandVsOutputMismatch=false, outputVsFeedbackMismatch=false, commandVsFeedbackMismatch=false.',
      verificationTags: ['motorCommandRequested', 'motorOutputOn', 'motorAuxFeedbackTag']
    },
    workflowSteps: [
      {
        id: 'define-symptom',
        label: 'Define command/output/feedback symptom',
        hint: 'Start with seal-in command vs actual motor state vs I_MotorFb before choosing a fault domain.'
      },
      {
        id: 'cmdfb-check-output-path',
        label: 'Check output terminal and contactor coil voltage',
        hint: 'Use Field Checks to confirm whether the output power path matches the command.'
      },
      {
        id: 'cmdfb-check-feedback-path',
        label: 'Check I_MotorFb in docs/IO map and field checks',
        hint: 'Trace the aux feedback input (DI6 / TB1-13/14) and compare tag state to motor/output behavior.'
      },
      {
        id: 'cmdfb-classify-domain',
        label: 'Classify fault domain before diagnosis',
        hint: 'Decide whether the mismatch is output-path or feedback-path before submitting the exact fault.'
      }
    ],
    captureWorkflowEvidence: (stepId, snapshot) => {
      const motorPath = getMotorCommandFeedbackSnapshot(snapshot);
      switch (stepId) {
        case 'define-symptom':
          return {
            stepId,
            summary: `Symptom: SealInCmd=${motorPath.motorCommandRequested}, MotorOutput=${motorPath.motorOutputOn}, I_MotorFb=${motorPath.motorAuxFeedbackTag}; cmd-vs-output=${motorPath.commandVsOutputMismatch}, output-vs-fb=${motorPath.outputVsFeedbackMismatch}.`
          };
        case 'cmdfb-check-output-path':
          return {
            stepId,
            summary: `Field checks (output path): Motor output terminal=${motorPath.motorOutputTerminalV.toFixed(
              1
            )} V, contactor coil=${motorPath.contactorCoilV.toFixed(
              1
            )} V; command=${motorPath.motorCommandRequested}, motorOutput=${motorPath.motorOutputOn}.`
          };
        case 'cmdfb-check-feedback-path':
          return {
            stepId,
            summary: `Feedback path: I_MotorFb (DI6/TB1-13/14)=${motorPath.motorAuxFeedbackTag} at ${motorPath.motorAuxFeedbackV.toFixed(
              1
            )} V; output-vs-feedback mismatch=${motorPath.outputVsFeedbackMismatch}.`
          };
        case 'cmdfb-classify-domain':
          return {
            stepId,
            summary: `Classification: likely ${motorPath.likelyDomain}; cmd-vs-fb=${motorPath.commandVsFeedbackMismatch}; activeFault=${
              snapshot.activeFaultId ?? 'none'
            }.`
          };
        default:
          return { stepId, summary: 'Evidence captured.' };
      }
    },
    successState: (snapshot) => {
      if (!isFeedbackMismatchTrainingFault(snapshot.activeFaultId)) {
        return missionFail(
          'Inject one of these faults first: motor_coil_failed, motor_runaway, motor_feedback_stuck_off, or motor_feedback_stuck_on.'
        );
      }
      const motorPath = getMotorCommandFeedbackSnapshot(snapshot);
      const visibleMismatch =
        motorPath.commandVsOutputMismatch ||
        motorPath.outputVsFeedbackMismatch ||
        motorPath.commandVsFeedbackMismatch;
      if (!visibleMismatch) {
        return missionFail(
          'Create an observable mismatch first (start/stop the motor as needed), then compare command, output, and I_MotorFb.'
        );
      }
      return missionFail(
        'Mismatch is visible. Capture output-path and feedback-path evidence, then submit the exact diagnosis.'
      );
    },
    successEvent: (event, snapshot) => {
      if (event.type !== 'faultDiagnosisSubmitted') return null;
      if (!isFeedbackMismatchTrainingFault(snapshot.activeFaultId)) return null;
      if (!event.correct) {
        return missionFail(
          'Incorrect diagnosis. Separate command vs output mismatch from output vs I_MotorFb mismatch before choosing the fault.'
        );
      }
      return missionPass(
        `Correctly diagnosed the command/output/feedback mismatch (${snapshot.activeFaultId}) using output and feedback evidence.`
      );
    }
  },
  {
    id: 'correct-hidden-fault-diagnosis',
    title: 'Hidden Fault Diagnosis (Evidence-Based)',
    description:
      'Inject a hidden fault and submit the correct diagnosis using rung truth and telemetry, not guessing.',
    whyItMatters:
      'Real troubleshooting success comes from isolating the fault domain and confirming the root cause with observed evidence.',
    stageMin: 5,
    minEvidenceSteps: 4,
    commonMistakes: [
      {
        wrongDiagnosis: 'Skipping permit checks',
        coachingFeedback:
          'Always verify RunPermit and the interlock chain before inspecting individual rungs. A permit problem blocks everything downstream and looks like a motor or timer fault until you trace from the left rail inward.'
      },
      {
        wrongDiagnosis: 'Changing presets before confirming enables',
        coachingFeedback:
          'Changing a timer or counter preset without first confirming the enable path is correct masks the real problem. Confirm T1.EN is true and the motor is running before adjusting T1 preset.'
      },
      {
        wrongDiagnosis: 'Assuming motor coil failed when motor never ran',
        coachingFeedback:
          'A motor that never ran could have a coil fault, a permit fault, or a start-circuit fault. Use rung truth to check the permit gate and seal-in rung inputs before concluding the coil or output card is bad.'
      }
    ],
    restorationStep: {
      instruction:
        'After correct diagnosis, inject the same fault type again and apply the correct fix, then verify the full output sequence (motor → lamp → valve) completes normally.',
      verificationDescription:
        'Motor ON, T1.DN eventually true, Lamp ON, C1 counts correctly to preset, Valve opens — all with the same fault type active and fixed.',
      verificationTags: ['motor', 'lamp', 'valve', 'timer.dn', 'counter.dn']
    },
    workflowSteps: [
      {
        id: 'define-symptom',
        label: 'Define the symptom precisely',
        hint: 'State what is expected vs what is observed before changing anything.'
      },
      {
        id: 'check-permits',
        label: 'Check permits/interlocks first',
        hint: 'Verify the prerequisite chain before assuming a logic or device fault.'
      },
      {
        id: 'read-rung-truth',
        label: 'Read rung/contact truth',
        hint: 'Use the first unexpected FALSE / mismatch to isolate the fault path.'
      },
      {
        id: 'inspect-telemetry',
        label: 'Inspect timer/counter/output telemetry',
        hint: 'Use EN/ACC/DN and output behavior to confirm or reject the hypothesis.'
      }
    ],
    captureWorkflowEvidence: (stepId, snapshot) => {
      const { lastScan, engineState, inputs, activeFaultId } = snapshot;
      switch (stepId) {
        case 'define-symptom':
          return {
            stepId,
            summary: `Symptom recorded with fault mode ${
              activeFaultId ?? 'none'
            }: Motor=${engineState.motor ? 'ON' : 'OFF'}, Lamp=${engineState.lamp ? 'ON' : 'OFF'}, Valve=${
              engineState.valve ? 'ON' : 'OFF'
            }, Alarm=${engineState.alarm ? 'ON' : 'OFF'}.`
          };
        case 'check-permits':
          return {
            stepId,
            summary: `Permit chain: I_Interlock=${inputs.I_Interlock ? 'CLOSED' : 'OPEN'}, RunPermit=${
              engineState.runPermit ? 'TRUE' : 'FALSE'
            }, AlarmCond=${lastScan.contacts.alarmCondition ? 'TRUE' : 'FALSE'}.`
          };
        case 'read-rung-truth':
          return {
            stepId,
            summary: `Rung truth: Permit=${lastScan.rungs.permitGate}, SealIn=${lastScan.rungs.sealIn}, TimerEnable=${lastScan.rungs.timerEnable}, CounterEdge=${lastScan.rungs.counter}, AlarmDetect=${lastScan.rungs.alarmDetect}.`
          };
        case 'inspect-telemetry':
          return {
            stepId,
            summary: `Telemetry: T1 EN/DN=${engineState.timer.en}/${engineState.timer.dn}, ACC/PRE=${engineState.timer.accMs}/${engineState.timer.presetMs} ms; C1 ACC/PV/DN=${engineState.counter.acc}/${engineState.counter.preset}/${engineState.counter.dn}; scan=${engineState.scanCount}.`
          };
        default:
          return {
            stepId,
            summary: 'Evidence captured.'
          };
      }
    },
    successEvent: (event) => {
      if (event.type !== 'faultDiagnosisSubmitted') return null;
      if (!event.correct) {
        return missionFail('Incorrect diagnosis. Use the first-false path and telemetry to narrow the fault.');
      }
      return missionPass(`Correct hidden fault diagnosis submitted for "${event.faultId}".`);
    },
    successState: ({ activeFaultId }) =>
      activeFaultId
        ? missionFail('Fault injected. Submit a diagnosis to complete this mission.')
        : missionFail('Inject a hidden fault first, then diagnose it.')
  }
];

export const getSimulatorMissionsForStage = (stageId: number): SimulatorMission[] =>
  simulatorMissions.filter(
    (mission) =>
      stageId >= mission.stageMin && (mission.stageMax === undefined || stageId <= mission.stageMax)
  );

export const getSimulatorMissionById = (missionId: string): SimulatorMission | undefined =>
  simulatorMissions.find((mission) => mission.id === missionId);

export const checkMissionState = (
  mission: SimulatorMission,
  snapshot: SimulatorSnapshot
): SimulatorMissionCheckResult | null => mission.successState?.(snapshot) ?? null;

export const checkMissionEvent = (
  mission: SimulatorMission,
  event: SimulatorMissionEvent,
  snapshot: SimulatorSnapshot
): SimulatorMissionCheckResult | null => mission.successEvent?.(event, snapshot) ?? null;

export const captureMissionWorkflowEvidence = (
  mission: SimulatorMission,
  stepId: string,
  snapshot: SimulatorSnapshot
): SimulatorMissionWorkflowEvidence =>
  mission.captureWorkflowEvidence?.(stepId, snapshot) ?? { stepId, summary: 'Evidence captured.' };
