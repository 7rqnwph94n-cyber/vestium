/**
 * FieldChecksPanel — Simulated electrical measurements for Stage 2+ learners.
 *
 * Industrial fidelity assumption note:
 * This panel models a simplified 24 VDC control circuit. Real control panels
 * may use different voltages (120 VAC, 48 VDC, etc.) and more complex wiring.
 * Safety circuits (e-stop chains, safety relays) are modeled as standard
 * controller inputs here — actual hardwired safety systems would not be software-readable.
 * The goal is to teach fault-domain separation (logic vs wiring vs device), not
 * to model a specific product.
 */

import { memo } from 'react';
import { FaultId } from '../../types/simulator';
import { ScanResult, EngineState, Inputs } from '../../types/simulator';

interface FieldMeasurement {
  label: string;
  /** Nominal voltage in healthy state */
  nominalV: number;
  /** Actual simulated reading (V) */
  readingV: number;
  /** What the controller program sees for this signal */
  controlTagValue: boolean;
  /** Healthy = reading matches expected for current commanded state */
  healthy: boolean;
  /** Explanation of what this measurement tells you */
  tooltip: string;
  /** Domain where the discrepancy lives, if any */
  faultDomain?: 'wiring' | 'device' | 'logic' | 'config';
}

/**
 * Derive simulated field readings from current simulator state and active fault.
 * Readings are simplified 24V DC control circuit model.
 */
export const deriveFieldMeasurements = (
  inputs: Inputs,
  engineState: EngineState,
  lastScan: ScanResult,
  activeFaultId: FaultId | null
): FieldMeasurement[] => {
  const faultId = activeFaultId;

  // ── Control Power ──────────────────────────────────────────────────────────
  const controlPowerV = 24.0; // Simplified: always healthy (no power fault in this model)

  // ── Input: I_Start ─────────────────────────────────────────────────────────
  // Physical switch: NO pushbutton, 24V when pressed.
  // Fault: start_stuck_off forces tag FALSE regardless of field signal.
  const startTerminalV = inputs.I_Start ? 24.0 : 0.0;
  const startTagValue = lastScan.contacts.start;
  const startHealthy = faultId !== 'start_stuck_off';

  // ── Input: I_Stop ──────────────────────────────────────────────────────────
  // Physical switch: NC pushbutton, 24V at rest (not pressed).
  // Fault: stop_stuck_on forces tag TRUE regardless of field signal.
  const stopTerminalV = inputs.I_Stop ? 0.0 : 24.0; // NC: no press = 24V
  const stopTagValue = !lastScan.contacts.stopNC; // tag = I_Stop (true when pressed)
  const stopHealthy = faultId !== 'stop_stuck_on';

  // ── Input: I_Interlock ─────────────────────────────────────────────────────
  // Guard contact: closed = 24V. Open = 0V.
  // Fault: interlock_stuck_off forces tag FALSE regardless of field signal.
  const interlockTerminalV = inputs.I_Interlock ? 24.0 : 0.0;
  const interlockTagValue = lastScan.contacts.interlock;
  const interlockHealthy = faultId !== 'interlock_stuck_off';

  // ── Input: I_Pulse ─────────────────────────────────────────────────────────
  // Proximity sensor: 24V when sensing, 0V idle.
  // Fault: pulse_failed_high forces tag TRUE (stuck ON — one edge on first scan, then frozen).
  const pulseTerminalV = inputs.I_Pulse ? 24.0 : 0.0;
  const pulseTagValue = lastScan.contacts.pulse;
  const pulseHealthy = faultId !== 'pulse_failed_high';

  // ── Output: Motor / Contactor ──────────────────────────────────────────────
  // controller output coil commands contactor coil. 24V at output terminal = coil energized.
  // Fault: motor_coil_failed — output terminal is 0V even when command is TRUE
  //        (card/contactor failure: coil doesn't energize).
  // Fault: motor_runaway — output terminal is 24V even when command is FALSE
  //        (welded contactor: stays closed regardless of command).
  const motorCmdBit = lastScan.rungs.sealIn; // What logic says
  let motorTerminalV: number;
  if (faultId === 'motor_coil_failed') {
    motorTerminalV = 0.0; // No voltage to coil even though commanded
  } else if (faultId === 'motor_runaway') {
    motorTerminalV = 24.0; // Voltage present even though not commanded
  } else {
    motorTerminalV = motorCmdBit ? 24.0 : 0.0;
  }
  const motorOutputHealthy =
    faultId !== 'motor_coil_failed' && faultId !== 'motor_runaway';

  // ── Contactor coil feedback (same channel in this simplified model) ─────────
  const contactorCoilV = motorTerminalV;
  // ── Motor auxiliary feedback input (simulated) ──────────────────────────────
  // A separate aux contact/feedback input often confirms contactor picked up.
  // New faults model feedback disagreement without changing the output command.
  let motorAuxFeedbackV = engineState.motor ? 24.0 : 0.0;
  if (faultId === 'motor_feedback_stuck_off') motorAuxFeedbackV = 0.0;
  if (faultId === 'motor_feedback_stuck_on') motorAuxFeedbackV = 24.0;
  const motorAuxFeedbackTag = motorAuxFeedbackV > 20;
  const motorAuxFeedbackHealthy =
    faultId !== 'motor_feedback_stuck_off' && faultId !== 'motor_feedback_stuck_on';

  return [
    {
      label: 'Control Power Supply (24 VDC)',
      nominalV: 24.0,
      readingV: controlPowerV,
      controlTagValue: true,
      healthy: true,
      tooltip:
        'Control power feeds all input devices and the controller output commons. If this is absent, every input reads 0V and no outputs can energize.'
    },
    {
      label: 'I_Start — terminal voltage (NO button)',
      nominalV: 24.0,
      readingV: startTerminalV,
      controlTagValue: startTagValue,
      healthy: startHealthy,
      tooltip:
        'Start is a normally-open (NO) pushbutton. Terminal should read 24V while held. ' +
        (faultId === 'start_stuck_off'
          ? 'FAULT: controller reads FALSE despite the button being pressed — input card or wiring fault.'
          : '24V while pressed → 0V released is normal behavior.'),
      faultDomain: faultId === 'start_stuck_off' ? 'wiring' : undefined
    },
    {
      label: 'I_Stop — terminal voltage (NC button)',
      nominalV: 24.0,
      readingV: stopTerminalV,
      controlTagValue: stopTagValue,
      healthy: stopHealthy,
      tooltip:
        'Stop is a normally-closed (NC) pushbutton. At rest (not pressed), terminal reads 24V. When pressed, terminal drops to 0V. ' +
        (faultId === 'stop_stuck_on'
          ? 'FAULT: Terminal appears at 0V even when stop is not pressed — device or wiring fault.'
          : 'Current reading matches expected state.'),
      faultDomain: faultId === 'stop_stuck_on' ? 'device' : undefined
    },
    {
      label: 'I_Interlock — terminal voltage (guard contact)',
      nominalV: 24.0,
      readingV: interlockTerminalV,
      controlTagValue: interlockTagValue,
      healthy: interlockHealthy,
      tooltip:
        'Interlock (guard) contact: closed = 24V, open = 0V. ' +
        (faultId === 'interlock_stuck_off'
          ? 'FAULT: Reads 0V even though guard is physically closed — wiring open or contact failure.'
          : 'Reading matches guard position.'),
      faultDomain: faultId === 'interlock_stuck_off' ? 'wiring' : undefined
    },
    {
      label: 'I_Pulse — terminal voltage (proximity sensor)',
      nominalV: 24.0,
      readingV: pulseTerminalV,
      controlTagValue: pulseTagValue,
      healthy: pulseHealthy,
      tooltip:
        'Proximity sensor: 24V sensing (target present), 0V clear. ' +
        (faultId === 'pulse_failed_high'
          ? 'FAULT: Sensor output stuck HIGH (24V continuously). No rising edges after first scan — count frozen at 1. Sensor failure or wiring short.'
          : 'Reading reflects target detection.'),
      faultDomain: faultId === 'pulse_failed_high' ? 'device' : undefined
    },
    {
      label: 'Motor output — terminal voltage (contactor coil)',
      nominalV: 24.0,
      readingV: motorTerminalV,
      controlTagValue: motorCmdBit,
      healthy: motorOutputHealthy,
      tooltip:
        'controller output terminal feeds the contactor coil (24 VDC). ' +
        (faultId === 'motor_coil_failed'
          ? 'FAULT: Logic commands ON (0 V → coil terminal should be 24V) but terminal reads 0V — output card channel failed, blown fuse, or open wiring.'
          : faultId === 'motor_runaway'
          ? 'FAULT: Logic commands OFF (terminal should be 0V) but reads 24V — welded contactor or failed output card holding channel ON.'
          : 'Terminal voltage matches controller command.'),
      faultDomain:
        faultId === 'motor_coil_failed'
          ? 'wiring'
          : faultId === 'motor_runaway'
          ? 'device'
          : undefined
    },
    {
      label: 'Contactor coil voltage (field measurement)',
      nominalV: 24.0,
      readingV: contactorCoilV,
      controlTagValue: engineState.motor,
      healthy: motorOutputHealthy,
      tooltip:
        'Measure directly at the contactor coil terminals with a multimeter. ' +
        (faultId === 'motor_coil_failed'
          ? 'FAULT: 0V at coil terminals confirms the power path is open — not a logic/command issue. Check output fuse, wiring, and card channel.'
          : faultId === 'motor_runaway'
          ? 'FAULT: 24V at coil even when controller output should be off confirms a welded contact or stuck output driver.'
          : 'Matches motor output terminal — confirms power path is intact.'),
      faultDomain:
        faultId === 'motor_coil_failed'
          ? 'wiring'
          : faultId === 'motor_runaway'
          ? 'device'
          : undefined
    },
    {
      label: 'I_MotorFb — aux feedback input (simulated)',
      nominalV: 24.0,
      readingV: motorAuxFeedbackV,
      controlTagValue: motorAuxFeedbackTag,
      healthy: motorAuxFeedbackHealthy,
      tooltip:
        'Separate motor/contactor auxiliary feedback input used for command-vs-feedback checks. ' +
        (faultId === 'motor_feedback_stuck_off'
          ? 'FAULT: Feedback remains OFF even when output/motor is ON. Check aux contact, wiring, or feedback channel.'
          : faultId === 'motor_feedback_stuck_on'
          ? 'FAULT: Feedback remains ON with no motor command. Check welded aux contact, miswire, or stale status mapping.'
          : 'Feedback follows motor state in this simplified model.'),
      faultDomain:
        faultId === 'motor_feedback_stuck_off' || faultId === 'motor_feedback_stuck_on'
          ? 'device'
          : undefined
    }
  ];
};

const voltageColor = (reading: number, healthy: boolean): string => {
  if (!healthy) return 'text-rose-300';
  if (reading > 20) return 'text-emerald-300';
  if (reading > 0) return 'text-amber-300';
  return 'text-theme-secondary';
};

const domainBadge = (domain?: FieldMeasurement['faultDomain']) => {
  if (!domain) return null;
  const colors: Record<string, string> = {
    wiring: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    device: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    logic: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    config: 'bg-violet-500/20 text-violet-300 border-violet-500/40'
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${colors[domain] ?? ''}`}>
      {domain}
    </span>
  );
};

export const FieldChecksPanel = memo(function FieldChecksPanel({
  inputs,
  engineState,
  lastScan,
  activeFaultId
}: {
  inputs: Inputs;
  engineState: EngineState;
  lastScan: ScanResult;
  activeFaultId: FaultId | null;
}) {
  const measurements = deriveFieldMeasurements(inputs, engineState, lastScan, activeFaultId);

  return (
    <div className="space-y-3 rounded border border-theme-border bg-theme-base p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
          Field Checks — Simulated Electrical Measurements (24 VDC control circuit)
        </p>
        <p className="mt-1 text-xs text-theme-secondary">
          These readings simulate what a technician would measure with a multimeter or test light.
          Use them to separate <span className="text-orange-300">wiring/device faults</span> from{' '}
          <span className="text-sky-300">logic/config faults</span> — the first step in real electrical troubleshooting.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {measurements.map((m) => (
          <div
            key={m.label}
            className={`rounded border p-2 ${
              m.healthy
                ? 'border-theme-border bg-theme-panel/40'
                : 'border-rose-500/40 bg-rose-900/10'
            }`}
            title={m.tooltip}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-theme-secondary leading-tight">{m.label}</p>
              {domainBadge(m.faultDomain)}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className={`font-mono text-sm font-semibold ${voltageColor(m.readingV, m.healthy)}`}>
                {m.readingV.toFixed(1)} V
              </span>
              <span className="text-[10px] text-theme-muted">
                controller tag: <span className={m.controlTagValue ? 'text-amber-300' : 'text-theme-muted'}>{m.controlTagValue ? 'TRUE' : 'FALSE'}</span>
              </span>
              {!m.healthy ? (
                <span className="text-[10px] font-semibold text-rose-300">MISMATCH</span>
              ) : null}
            </div>
            {!m.healthy ? (
              <p className="mt-1 text-[10px] text-theme-secondary leading-snug">{m.tooltip}</p>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-theme-muted">
        Fidelity note: Readings are simplified 24 VDC control circuit model. Safety circuits
        (e-stop, safety relays) are modeled as standard inputs — real safety systems are hardwired
        and not software-readable. Contactor coil voltage matches output terminal in this model.
      </p>
    </div>
  );
});
