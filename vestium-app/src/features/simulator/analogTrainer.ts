import type { AnalogTrainerSnapshot } from './missions';

export type AnalogTrainerState = AnalogTrainerSnapshot;
export type AnalogFaultId = AnalogTrainerSnapshot['faultId'];
export type AnalogDiagnosisSelection = NonNullable<AnalogTrainerSnapshot['diagnosis']>['selected'];

export const analogDiagnosisLabel: Record<AnalogDiagnosisSelection, string> = {
  open_loop: 'Open loop / no current',
  short_circuit: 'Shorted loop / max input',
  scaling_fault: 'Scaling / zero-span configuration fault',
  healthy: 'Healthy signal path',
  unknown: 'Unknown'
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const buildAnalogTrainerState = (
  signalPercent: number,
  faultId: AnalogFaultId,
  previousDiagnosis: AnalogTrainerState['diagnosis'] = null
): AnalogTrainerState => {
  const pct = clamp(signalPercent, 0, 100);
  const expectedEU = pct;
  let loopCurrentmA = 4 + (pct / 100) * 16;
  let rawCounts = Math.round((pct / 100) * 27648);

  if (faultId === 'open_loop') {
    loopCurrentmA = 0.1;
    rawCounts = 0;
  } else if (faultId === 'short_circuit') {
    loopCurrentmA = 22;
    rawCounts = 32767;
  }

  let scaledEU = (rawCounts / 27648) * 100;
  if (faultId === 'wrong_zero_offset') {
    scaledEU += 10;
  } else if (faultId === 'wrong_span') {
    scaledEU = (rawCounts / 27648) * 120;
  }

  return {
    signalPercent: pct,
    faultId,
    loopCurrentmA,
    rawCounts,
    expectedEU,
    scaledEU: Number(scaledEU.toFixed(1)),
    diagnosis: previousDiagnosis
  };
};

