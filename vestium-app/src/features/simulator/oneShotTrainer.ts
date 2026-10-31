import type { OneShotTrainerSnapshot } from './missions';

export type OneShotTrainerState = OneShotTrainerSnapshot;
export type OneShotDiagnosisSelection = NonNullable<OneShotTrainerSnapshot['diagnosis']>['selected'];

export const initialOneShotTrainerState = (): OneShotTrainerState => ({
  faultMode: 'sealed_bit_instead_of_osr',
  partSensorPulse: false,
  latchedPartSeen: false,
  cuSignal: false,
  counterAcc: 0,
  counterPreset: 5,
  lastCu: false,
  simulatedPartCount: 0,
  diagnosis: null
});

export const oneShotDiagnosisLabel: Record<OneShotDiagnosisSelection, string> = {
  needs_one_shot: 'CU path needs OSR/OSF one-shot (latched bit used instead)',
  sensor_failed: 'Sensor device/pulse failed',
  counter_bad: 'Counter instruction/module fault',
  unknown: 'Unknown'
};

export const tickOneShotTrainer = (
  prev: OneShotTrainerState,
  partPulseInput: boolean
): OneShotTrainerState => {
  const next = { ...prev, partSensorPulse: partPulseInput };
  const sensorRising = partPulseInput && !prev.partSensorPulse;

  if (next.faultMode === 'sealed_bit_instead_of_osr') {
    if (sensorRising) next.latchedPartSeen = true;
    next.cuSignal = next.latchedPartSeen;
  } else {
    next.latchedPartSeen = partPulseInput;
    next.cuSignal = sensorRising;
  }

  const cuRising = next.cuSignal && !prev.lastCu;
  if (cuRising) {
    next.counterAcc = Math.min(next.counterPreset, prev.counterAcc + 1);
  }
  next.lastCu = next.cuSignal;
  return next;
};

