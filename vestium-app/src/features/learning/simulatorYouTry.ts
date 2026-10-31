import { defaultInputs, initialEngineState, scanTick } from '../simulator/engine';
import type { FaultId } from '../../types/simulator';

export interface SimulatorYouTryChallenge {
  prompt: string;
  stateLines: string[];
  options: string[];
  answer: string;
  feedback: string;
}

const runEngineSnapshot = (
  faultId: FaultId | undefined,
  script: (ctx: {
    pulseStart: () => void;
    pulsePulse: () => void;
    pulseReset: () => void;
    setInterlock: (value: boolean) => void;
    tick: (n?: number) => void;
  }) => void
) => {
  let inputs = { ...defaultInputs };
  let state = initialEngineState;
  let last = scanTick(state, inputs, 0, faultId);
  state = last.state;

  const tick = (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      last = scanTick(state, inputs, 100, faultId);
      state = last.state;
    }
  };

  const pulse = (key: 'I_Start' | 'I_Pulse' | 'I_Reset') => {
    inputs = { ...inputs, [key]: true };
    tick(1);
    inputs = { ...inputs, [key]: false };
    tick(1);
  };

  script({
    pulseStart: () => pulse('I_Start'),
    pulsePulse: () => pulse('I_Pulse'),
    pulseReset: () => pulse('I_Reset'),
    setInterlock: (value) => {
      inputs = { ...inputs, I_Interlock: value };
      tick(1);
    },
    tick
  });

  return { inputs, state, last };
};

const engineFaultChallenge = (
  faultId: FaultId,
  prompt: string,
  options: string[],
  answer: string,
  feedback: string,
  script: Parameters<typeof runEngineSnapshot>[1]
): SimulatorYouTryChallenge => {
  const snapshot = runEngineSnapshot(faultId, script);
  return {
    prompt,
    stateLines: [
      `RunPermit=${snapshot.state.runPermit} | Motor=${snapshot.state.motor} | Lamp=${snapshot.state.lamp} | Valve=${snapshot.state.valve}`,
      `Rungs: Permit=${snapshot.last.rungs.permitGate} SealIn=${snapshot.last.rungs.sealIn} TimerEN=${snapshot.last.rungs.timerEnable} CounterEdge=${snapshot.last.rungs.counter}`,
      `Timer EN/DN ACC/PRE=${snapshot.state.timer.en}/${snapshot.state.timer.dn} ${snapshot.state.timer.accMs}/${snapshot.state.timer.presetMs} ms`,
      `Counter ACC/PV/DN=${snapshot.state.counter.acc}/${snapshot.state.counter.preset}/${snapshot.state.counter.dn}`
    ],
    options,
    answer,
    feedback
  };
};

export const getSimulatorYouTryChallenge = (
  lessonId: string
): SimulatorYouTryChallenge | null => {
  switch (lessonId) {
    case 's1-l3':
    case 's5-l1':
      return engineFaultChallenge(
        'interlock_stuck_off',
        'Simulator snapshot: Start is being pressed, but the motor never starts. What is the most likely root cause?',
        [
          'Missing permit / interlock path is blocking the rung',
          'Timer ACC is frozen and preventing the motor from starting',
          'Counter preset is too high'
        ],
        'Missing permit / interlock path is blocking the rung',
        'RunPermit is false while start logic is being attempted. This is a permit/interlock chain problem, not a timer/counter issue.',
        ({ pulseStart }) => pulseStart()
      );
    case 's1-l4':
    case 's1-l4b':
      return engineFaultChallenge(
        'motor_coil_failed',
        'Simulator snapshot: Logic path is true but the motor never energizes. Which fault domain should you suspect first?',
        [
          'Output/device electrical path fault (coil/output card/contactor path)',
          'NC stop instruction semantics',
          'Counter reset logic'
        ],
        'Output/device electrical path fault (coil/output card/contactor path)',
        'Seal-in command is true but motor output remains off. That pattern points to output/device layer failure, not command-path logic.',
        ({ pulseStart, tick }) => {
          pulseStart();
          tick(5);
        }
      );
    case 's2-l2':
      return engineFaultChallenge(
        'stop_stuck_on',
        'Simulator snapshot: Start is pulsed but the motor never seals in. Which contact behavior best explains this?',
        [
          'Stop NC contact is evaluating false every scan',
          'The motor seal branch energizes too early',
          'The CTU increments on every scan'
        ],
        'Stop NC contact is evaluating false every scan',
        'A stuck Stop signal makes the NC stop instruction false continuously, so the seal-in rung cannot energize.',
        ({ pulseStart }) => pulseStart()
      );
    case 's2-l3':
      return engineFaultChallenge(
        'pulse_failed_high',
        'Simulator snapshot: Pulse button is repeatedly used, but the counter appears frozen after one increment. What is the most likely cause?',
        [
          'No new rising edges are reaching the CTU CU input',
          'Timer preset is too high',
          'RunPermit is false'
        ],
        'No new rising edges are reaching the CTU CU input',
        'CTU increments on false-to-true transitions only. A stuck-high or latched-high CU path produces one count, then no more edges.',
        ({ pulsePulse, tick }) => {
          pulsePulse();
          tick(2);
          pulsePulse();
          tick(2);
        }
      );
    case 's2-l4':
      return engineFaultChallenge(
        'timer_preset_wrong',
        'Simulator snapshot: Motor runs and T1.ACC rises, but T1.DN takes much longer than expected. Best diagnosis?',
        [
          'Timer preset is misconfigured too high',
          'Timer ACC is frozen',
          'Interlock is open'
        ],
        'Timer preset is misconfigured too high',
        'ACC rising normally with delayed DN points to a preset issue, not a frozen accumulator.',
        ({ pulseStart, tick }) => {
          pulseStart();
          tick(40);
        }
      );
    case 's5-l2':
      return engineFaultChallenge(
        'timer_not_accumulating',
        'Simulator snapshot: Motor is ON and T1.EN is true, but T1.ACC stays at 0. What is the most likely root cause?',
        [
          'Timer accumulator/instruction path fault (ACC frozen)',
          'Wrong timer preset only',
          'Counter reset rung issue'
        ],
        'Timer accumulator/instruction path fault (ACC frozen)',
        'Motor ON + T1.EN true proves enable path. Frozen ACC points to timer/instruction/register behavior, not just preset value.',
        ({ pulseStart, tick }) => {
          pulseStart();
          tick(20);
        }
      );
    case 's5-l3':
      return engineFaultChallenge(
        'timer_preset_wrong',
        'Simulator snapshot: You are building a hypothesis. Which explanation best fits the observed timer behavior?',
        [
          'T1 preset is wrong (ACC rises normally, DN arrives late)',
          'Start button is stuck off',
          'Interlock contact is open'
        ],
        'T1 preset is wrong (ACC rises normally, DN arrives late)',
        'This is the strongest hypothesis because it matches both the ACC trend and the delayed DN consequence.',
        ({ pulseStart, tick }) => {
          pulseStart();
          tick(50);
        }
      );
    default:
      return null;
  }
};

