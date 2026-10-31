import type { VfdTrainerSnapshot } from './missions';

export type VfdTrainerState = VfdTrainerSnapshot;
export type VfdFaultId = VfdTrainerSnapshot['faultId'];
export type VfdDiagnosisSelection = NonNullable<VfdTrainerSnapshot['diagnosis']>['selected'];

export const initialVfdTrainerState = (): VfdTrainerState => ({
  controlCmdRun: false,
  controlCmdResetPulse: false,
  speedRefHz: 30,
  statusReady: true,
  statusRunning: false,
  statusAtSpeed: false,
  statusFault: false,
  localMode: false,
  faultId: 'none',
  diagnosis: null
});

export const deriveVfdTrainerState = (
  prev: VfdTrainerState,
  patch: Partial<VfdTrainerState> = {}
): VfdTrainerState => {
  const next: VfdTrainerState = { ...prev, ...patch };

  if (next.controlCmdResetPulse) {
    if (next.faultId === 'dc_bus_fault') {
      next.faultId = 'none';
    }
    next.controlCmdResetPulse = false;
  }

  if (next.faultId === 'local_mode') {
    next.localMode = true;
    next.statusFault = false;
    next.statusReady = false;
  } else if (next.faultId === 'dc_bus_fault') {
    next.localMode = false;
    next.statusFault = true;
    next.statusReady = false;
  } else if (next.faultId === 'not_ready') {
    next.localMode = false;
    next.statusFault = false;
    next.statusReady = false;
  } else {
    next.localMode = false;
    next.statusFault = false;
    next.statusReady = true;
  }

  const runPermitted = next.controlCmdRun && next.statusReady && !next.statusFault && !next.localMode;
  next.statusRunning = runPermitted;
  next.statusAtSpeed = runPermitted && next.speedRefHz >= 5;
  return next;
};

export const vfdDiagnosisLabel: Record<VfdDiagnosisSelection, string> = {
  local_mode: 'Drive is in LOCAL mode',
  drive_fault: 'Drive fault active',
  ready_missing: 'Drive not ready / no ready handshake',
  logic_fault: 'controller logic/command fault',
  unknown: 'Unknown'
};

