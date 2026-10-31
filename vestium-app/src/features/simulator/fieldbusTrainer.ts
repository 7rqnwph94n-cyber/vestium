import type { FieldbusTrainerSnapshot } from './missions';

export type FieldbusTrainerState = FieldbusTrainerSnapshot;
export type FieldbusFaultId = FieldbusTrainerSnapshot['faultId'];
export type FieldbusDiagnosisSelection = NonNullable<FieldbusTrainerSnapshot['diagnosis']>['selected'];

export const initialFieldbusTrainerState = (): FieldbusTrainerState => ({
  controlRunCommand: true,
  remoteInputsValid: true,
  driveReadyBit: true,
  moduleBusFault: false,
  moduleChannelFault: false,
  devicePower: true,
  networkLink: true,
  deviceNameMatch: true,
  cyclicDataExchange: true,
  diagnosticsBuffer: ['No active diagnostics. All configured devices exchanging cyclic data.'],
  faultId: 'none',
  diagnosis: null
});

export const deriveFieldbusTrainerState = (
  prev: FieldbusTrainerState,
  patch: Partial<FieldbusTrainerState> = {}
): FieldbusTrainerState => {
  const next: FieldbusTrainerState = { ...prev, ...patch };

  if (next.faultId === 'device_power_loss') {
    next.devicePower = false;
    next.networkLink = false;
    next.deviceNameMatch = true;
    next.moduleBusFault = true;
    next.moduleChannelFault = false;
    next.cyclicDataExchange = false;
    next.remoteInputsValid = false;
    next.driveReadyBit = false;
    next.diagnosticsBuffer = [
      'PROFINET device not reachable (possible device power loss).',
      'I/O data exchange stopped for remote device.',
      'Module bus fault active on remote station.'
    ];
  } else if (next.faultId === 'network_link_down') {
    next.devicePower = true;
    next.networkLink = false;
    next.deviceNameMatch = true;
    next.moduleBusFault = true;
    next.moduleChannelFault = false;
    next.cyclicDataExchange = false;
    next.remoteInputsValid = false;
    next.driveReadyBit = false;
    next.diagnosticsBuffer = [
      'PROFINET link/device not reachable.',
      'Cyclic data exchange interrupted.',
      'Remote inputs invalid/defaulted due to communication loss.'
    ];
  } else if (next.faultId === 'name_mismatch') {
    next.devicePower = true;
    next.networkLink = true;
    next.deviceNameMatch = false;
    next.moduleBusFault = true;
    next.moduleChannelFault = false;
    next.cyclicDataExchange = false;
    next.remoteInputsValid = false;
    next.driveReadyBit = false;
    next.diagnosticsBuffer = [
      'Configured PROFINET device name mismatch after replacement.',
      'Device present on network but not exchanging configured cyclic data.',
      'Drive ready bit missing due to device configuration mismatch.'
    ];
  } else if (next.faultId === 'module_channel_fault') {
    next.devicePower = true;
    next.networkLink = true;
    next.deviceNameMatch = true;
    next.moduleBusFault = false;
    next.moduleChannelFault = true;
    next.cyclicDataExchange = true;
    next.remoteInputsValid = true;
    next.driveReadyBit = true;
    next.diagnosticsBuffer = [
      'Remote AI/DI module channel diagnostic active.',
      'Channel fault present (wire break/overflow) on one channel.',
      'Device communication remains healthy.'
    ];
  } else {
    next.devicePower = true;
    next.networkLink = true;
    next.deviceNameMatch = true;
    next.moduleBusFault = false;
    next.moduleChannelFault = false;
    next.cyclicDataExchange = true;
    next.remoteInputsValid = true;
    next.driveReadyBit = true;
    next.diagnosticsBuffer = ['No active diagnostics. All configured devices exchanging cyclic data.'];
  }

  return next;
};

export const fieldbusDiagnosisLabel: Record<FieldbusDiagnosisSelection, string> = {
  power_link_fault: 'Device power/link/network availability fault',
  profinet_config_fault: 'PROFINET naming/configuration mismatch',
  channel_fault: 'Remote module channel fault (device comms healthy)',
  logic_fault: 'controller logic fault',
  unknown: 'Unknown'
};

