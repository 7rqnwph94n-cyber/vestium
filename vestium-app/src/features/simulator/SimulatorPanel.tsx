import { Profiler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useProgress } from '../progress/ProgressContext';
import { Fault, FaultId, ScanResult } from '../../types/simulator';
import { getProfilerOnRender, installSimProfiler } from './useRenderProfiler';
import { scanTick, defaultInputs, initialEngineState } from './engine';
import { faultsForStage, randomFault } from '../faults/faults';
import {
  captureMissionWorkflowEvidence,
  checkMissionEvent,
  checkMissionState,
  getSimulatorMissionsForStage,
  SimulatorMissionEvent,
  SimulatorSnapshot,
  SequenceTrainerSnapshot,
  MultiUnitTrainerSnapshot
} from './missions';
import { MissionStatus, SimulatorMissionPanel } from './SimulatorMissionPanel';
import { FieldChecksPanel } from './FieldChecksPanel';
import { ProcessSystemView } from './ProcessSystemView';
import {
  deriveFieldbusTrainerState,
  fieldbusDiagnosisLabel,
  initialFieldbusTrainerState,
  type FieldbusDiagnosisSelection,
  type FieldbusFaultId,
  type FieldbusTrainerState
} from './fieldbusTrainer';
import {
  deriveVfdTrainerState,
  initialVfdTrainerState,
  vfdDiagnosisLabel,
  type VfdDiagnosisSelection,
  type VfdFaultId,
  type VfdTrainerState
} from './vfdTrainer';
import {
  buildAnalogTrainerState,
  analogDiagnosisLabel,
  type AnalogDiagnosisSelection,
  type AnalogFaultId,
  type AnalogTrainerState
} from './analogTrainer';
import {
  initialOneShotTrainerState,
  oneShotDiagnosisLabel,
  tickOneShotTrainer,
  type OneShotDiagnosisSelection,
  type OneShotTrainerState
} from './oneShotTrainer';
import { BoolBadge } from './BoolBadge';
import { LadderGraphic, type LadderGlyph } from './LadderGraphic';
import { AnalogTrainerSection } from './AnalogTrainerSection';
import { VfdFieldbusTrainerSection } from './VfdFieldbusTrainerSection';
import { SequenceTrainerSection } from './SequenceTrainerSection';
import { MultiUnitTrainerSection } from './MultiUnitTrainerSection';
import { FaultPracticeSection } from './FaultPracticeSection';

const momentaryMs = 220;

type SequenceStallFaultId = SequenceTrainerSnapshot['stallFaultId'];
type SequenceDiagnosisSelection = NonNullable<SequenceTrainerSnapshot['diagnosis']>['selected'];

type SequenceTrainerState = SequenceTrainerSnapshot;
type MultiUnitTrainerState = MultiUnitTrainerSnapshot;
type MultiUnitFaultId = MultiUnitTrainerSnapshot['faultId'];
type MultiUnitDiagnosisSelection = NonNullable<MultiUnitTrainerSnapshot['diagnosis']>['selected'];
type SimulatorFocusMode = 'guided' | 'practice' | 'assessment' | 'field';
type FocusSectionKey =
  | 'core'
  | 'analog'
  | 'oneshot'
  | 'sequence'
  | 'vfd'
  | 'fieldbus'
  | 'multi'
  | 'faults';

interface MachineTimelineEntry {
  id: string;
  scan: number;
  label: string;
  detail: string;
  kind: 'state' | 'action' | 'fault' | 'alarm';
}

// Fill valve ramp: level rises to HIGH after this duration (ms) while fill valve is open.
// 3 s is fast enough to observe process dynamics without tedious waiting.
const FILL_RAMP_PRESET_MS = 3000;

const initialSequenceTrainerState = (): SequenceTrainerState => ({
  running: false,
  activeStep: 0,
  startedAtScan: null,
  stallFaultId: 'none',
  transitions: {
    levelHigh: false,
    mixTimerDn: false,
    mixTemperatureOk: false,
    tankEmpty: false
  },
  outputs: {
    fillValveCmd: false,
    mixerCmd: false,
    dischargeValveCmd: false
  },
  fillTimer: {
    accMs: 0,
    presetMs: FILL_RAMP_PRESET_MS,
    levelPct: 0
  },
  mixTimer: {
    accMs: 0,
    presetMs: 2000,
    dn: false
  },
  diagnosis: null
});

interface CompoundFaultScenario {
  id: string;
  label: string;
  faults: Fault['id'][];
  goal: string;
  coaching: string;
}

const compoundFaultScenarios: CompoundFaultScenario[] = [
  {
    id: 'timer_plus_interlock_drop',
    label: 'Timer preset wrong + interlock dropping',
    faults: ['timer_preset_wrong', 'interlock_stuck_off'],
    goal: 'Notice the no-start/permit symptom before chasing timer behavior, then verify the timer fault still exists after permit restoration.',
    coaching: 'This trains “full restoration verification” after the first found fault.'
  },
  {
    id: 'timer_freeze_plus_counter_preset',
    label: 'Timer ACC frozen + counter preset too high',
    faults: ['timer_not_accumulating', 'counter_preset_wrong'],
    goal: 'Diagnose one telemetry fault, then continue until downstream sequence behavior is fully restored.',
    coaching: 'Multiple independent faults can coexist. Do not close the job after one fix without end-to-end verification.'
  },
  {
    id: 'motor_coil_failed_plus_counter_reset',
    label: 'Motor coil failed + counter reset broken',
    faults: ['motor_coil_failed', 'counter_reset_broken'],
    goal: 'Separate output-layer no-run behavior from a later reset-path fault.',
    coaching: 'Fixing the no-run symptom may expose a second latent fault during recovery checks.'
  },
  {
    id: 'runaway_plus_timer_preset',
    label: 'Motor runaway + timer preset wrong',
    faults: ['motor_runaway', 'timer_preset_wrong'],
    goal: 'Prioritize the unsafe/output disagreement first, then confirm timing behavior after restoring safe operation.',
    coaching: 'Safety and output disagreement takes priority over timing optimization issues.'
  }
];

const sequenceDiagnosisLabel: Record<SequenceDiagnosisSelection, string> = {
  'step20-transition': 'Step 20 transition blocked (MixTemperatureOK / MixTimerDN path)',
  'step30-transition': 'Step 30 transition blocked (TankEmpty path)',
  unknown: 'Insufficient evidence / unknown'
};

const initialMultiUnitTrainerState = (): MultiUnitTrainerState => ({
  tick: 0,
  sharedAirPermit: true,
  sharedNetworkReady: true,
  sharedPermit: true,
  unitA: {
    runCmd: true,
    localPermit: true,
    running: true
  },
  unitB: {
    runCmd: true,
    localPermit: true,
    running: true
  },
  unitC: {
    runCmd: true,
    localPermit: true,
    running: true
  },
  faultId: 'none',
  diagnosis: null
});

const deriveMultiUnitTrainerState = (
  faultId: MultiUnitFaultId,
  previous?: MultiUnitTrainerState
): MultiUnitTrainerState => {
  const base = previous ?? initialMultiUnitTrainerState();
  const next: MultiUnitTrainerState = {
    ...base,
    tick: base.tick,
    sharedAirPermit: true,
    sharedNetworkReady: true,
    sharedPermit: true,
    unitA: { ...base.unitA, runCmd: true, localPermit: true, running: true },
    unitB: { ...base.unitB, runCmd: true, localPermit: true, running: true },
    unitC: { ...base.unitC, runCmd: true, localPermit: true, running: true },
    faultId,
    diagnosis: null
  };

  if (faultId === 'shared_air_loss') {
    next.sharedAirPermit = false;
  } else if (faultId === 'shared_network_loss') {
    next.sharedNetworkReady = false;
  } else if (faultId === 'unitA_local_permit_loss') {
    next.unitA.localPermit = false;
  } else if (faultId === 'unitB_local_permit_loss') {
    next.unitB.localPermit = false;
  } else if (faultId === 'unitC_local_permit_loss') {
    next.unitC.localPermit = false;
  } else if (faultId === 'unitB_local_permit_intermittent') {
    next.unitB.localPermit = true;
  }

  next.sharedPermit = next.sharedAirPermit && next.sharedNetworkReady;
  next.unitA.running = next.sharedPermit && next.unitA.localPermit && next.unitA.runCmd;
  next.unitB.running = next.sharedPermit && next.unitB.localPermit && next.unitB.runCmd;
  next.unitC.running = next.sharedPermit && next.unitC.localPermit && next.unitC.runCmd;
  return next;
};

const multiUnitDiagnosisLabel: Record<MultiUnitDiagnosisSelection, string> = {
  shared_air: 'Shared air / utility permit fault',
  shared_network: 'Shared network/device-ready fault',
  unitA: 'Local Unit A fault',
  unitB: 'Local Unit B fault',
  unitC: 'Local Unit C fault',
  unknown: 'Unknown'
};


const tickMultiUnitTrainer = (prev: MultiUnitTrainerState): MultiUnitTrainerState => {
  const next = { ...prev, tick: prev.tick + 1, unitA: { ...prev.unitA }, unitB: { ...prev.unitB }, unitC: { ...prev.unitC } };
  if (next.faultId === 'unitB_local_permit_intermittent') {
    // Flap local permit every ~0.8 s at 100 ms scan for realistic nuisance/intermittent behavior.
    next.unitB.localPermit = Math.floor(next.tick / 8) % 2 === 0;
  }
  next.sharedPermit = next.sharedAirPermit && next.sharedNetworkReady;
  next.unitA.running = next.sharedPermit && next.unitA.localPermit && next.unitA.runCmd;
  next.unitB.running = next.sharedPermit && next.unitB.localPermit && next.unitB.runCmd;
  next.unitC.running = next.sharedPermit && next.unitC.localPermit && next.unitC.runCmd;
  return next;
};

const sequenceTrainerTick = (prev: SequenceTrainerState, deltaMs: number): SequenceTrainerState => {
  if (!prev.running) return prev;

  let next = {
    ...prev,
    transitions: { ...prev.transitions },
    outputs: { ...prev.outputs },
    fillTimer: { ...prev.fillTimer },
    mixTimer: { ...prev.mixTimer }
  };

  // Reset outputs then assert by active step.
  next.outputs.fillValveCmd = false;
  next.outputs.mixerCmd = false;
  next.outputs.dischargeValveCmd = false;

  if (next.activeStep === 10) {
    next.outputs.fillValveCmd = true;
    // Process dynamics: level ramps up while fill valve is open.
    // LevelHigh only becomes true when the fill ramp timer expires.
    // This prevents the step from completing instantly and forces observation
    // of the fill valve ON → level rising → LevelHigh transition.
    next.fillTimer.accMs = Math.min(next.fillTimer.presetMs, next.fillTimer.accMs + deltaMs);
    next.fillTimer.levelPct = Math.round((next.fillTimer.accMs / next.fillTimer.presetMs) * 100);
    next.transitions.levelHigh = next.fillTimer.accMs >= next.fillTimer.presetMs;
    if (next.transitions.levelHigh) {
      next.activeStep = 20;
    }
  } else {
    // Drain level when not filling (simplified — discharge step drains it)
    if (next.activeStep === 30) {
      next.fillTimer.accMs = Math.max(0, next.fillTimer.accMs - deltaMs * 0.5);
    }
    next.fillTimer.levelPct = Math.round((next.fillTimer.accMs / next.fillTimer.presetMs) * 100);
  }

  if (next.activeStep === 20) {
    next.outputs.mixerCmd = true;
    next.mixTimer.accMs = Math.min(next.mixTimer.presetMs, next.mixTimer.accMs + deltaMs);
    next.mixTimer.dn = next.mixTimer.accMs >= next.mixTimer.presetMs;
    next.transitions.mixTimerDn = next.mixTimer.dn;
    next.transitions.mixTemperatureOk = next.stallFaultId !== 'mix_temp_stuck_low';
    if (next.transitions.mixTimerDn && next.transitions.mixTemperatureOk) {
      next.activeStep = 30;
    }
  } else {
    next.mixTimer.accMs = 0;
    next.mixTimer.dn = false;
    next.transitions.mixTimerDn = false;
  }

  if (next.activeStep !== 30) {
    next.transitions.tankEmpty = false;
  }

  if (next.activeStep === 30) {
    next.outputs.dischargeValveCmd = true;
    next.transitions.tankEmpty = next.stallFaultId !== 'tank_empty_switch_failed';
    if (next.transitions.tankEmpty) {
      next.activeStep = 0;
      next.running = false;
      next.outputs.dischargeValveCmd = false;
      next.fillTimer.accMs = 0;
      next.fillTimer.levelPct = 0;
    }
  }

  return next;
};

// BoolBadge and LadderGraphic are now imported from ./BoolBadge and ./LadderGraphic

const RungRow = ({
  label,
  active,
  children,
  onInspect,
  glyphs
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
  onInspect?: () => void;
  glyphs?: LadderGlyph[];
}) => (
  <div
    className={`rounded border border-theme-border bg-theme-base p-3 ${onInspect ? 'cursor-pointer' : ''}`}
    onClick={onInspect}
    role={onInspect ? 'button' : undefined}
    tabIndex={onInspect ? 0 : undefined}
    onKeyDown={
      onInspect
        ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onInspect();
            }
          }
        : undefined
    }
    >
      <p className="mb-2 text-xs font-semibold text-amber-300">{label}</p>
      {glyphs ? <LadderGraphic active={active} glyphs={glyphs} /> : null}
      <div
      className={`rounded border p-2 transition-colors ${
        active ? 'border-amber-400 bg-amber-500/10' : 'border-theme-border bg-theme-panel'
      }`}
    >
      <div className="mb-1 flex items-center justify-between text-xs text-theme-muted">
        <span>|—</span>
        <span>—( )|</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  </div>
);

const MachineTimelineStrip = ({
  entries
}: {
  entries: MachineTimelineEntry[];
}) => {
  if (entries.length === 0) {
    return (
      <div className="rounded border border-theme-border bg-theme-base p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
          Machine State Timeline
        </p>
        <p className="mt-1 text-xs text-theme-muted">
          Commands, permits, outputs, and trainer status changes will appear here as you interact.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-theme-border bg-theme-base p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
          Machine State Timeline
        </p>
        <span className="text-[11px] text-theme-muted">Recent {entries.length}</span>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {[...entries].reverse().map((entry) => (
          <div
            key={entry.id}
            className={`min-w-[220px] rounded border p-2 ${
              entry.kind === 'fault'
                ? 'border-amber-500/30 bg-amber-500/10'
                : entry.kind === 'alarm'
                  ? 'border-rose-500/30 bg-rose-500/10'
                  : 'border-theme-border bg-theme-panel/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-theme-text">{entry.label}</p>
              <span className="text-[10px] text-theme-muted">#{entry.scan}</span>
            </div>
            <p className="mt-1 text-[11px] text-theme-secondary">{entry.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const jumpButtonClasses =
  'rounded border border-theme-border px-2 py-1 text-[11px] text-theme-text hover:border-amber-400 hover:text-amber-200';

const SimulatorDocsPanel = ({
  stageId,
  inputs,
  engineState,
  lastScan,
  activeFaultId,
  analogTrainer,
  vfdTrainer,
  fieldbusTrainer
}: {
  stageId: number;
  inputs: typeof defaultInputs;
  engineState: typeof initialEngineState;
  lastScan: ScanResult;
  activeFaultId: FaultId | null;
  analogTrainer: AnalogTrainerState;
  vfdTrainer: VfdTrainerState;
  fieldbusTrainer: FieldbusTrainerState;
}) => {
  const [selectedSchematicPath, setSelectedSchematicPath] = useState<
    'digital-input' | 'digital-output' | 'analog-loop' | 'vfd-handshake' | 'fieldbus-remote'
  >('digital-input');
  const [selectedIoTag, setSelectedIoTag] = useState<string>('I_Start');
  const motorCommandRequested = lastScan.rungs.sealIn;
  const motorAuxFeedbackTag =
    activeFaultId === 'motor_feedback_stuck_off'
      ? false
      : activeFaultId === 'motor_feedback_stuck_on'
        ? true
        : engineState.motor;
  const motorAuxFeedbackV = motorAuxFeedbackTag ? 24 : 0;
  const outputVsFeedbackMismatch = engineState.motor !== motorAuxFeedbackTag;
  const commandVsFeedbackMismatch = motorCommandRequested !== motorAuxFeedbackTag;
  const digitalRows = [
    { tag: 'I_Start', addr: 'DI0', terminal: 'TB1-01/02', device: 'Start PB (NO)', value: inputs.I_Start ? 'TRUE' : 'FALSE', path: 'digital-input' as const },
    { tag: 'I_Stop', addr: 'DI1', terminal: 'TB1-03/04', device: 'Stop PB (NC wired, logic inverted in rung)', value: inputs.I_Stop ? 'TRUE' : 'FALSE', path: 'digital-input' as const },
    { tag: 'I_Interlock', addr: 'DI2', terminal: 'TB1-05/06', device: 'Guard / Interlock loop', value: inputs.I_Interlock ? 'TRUE' : 'FALSE', path: 'digital-input' as const },
    { tag: 'I_Pulse', addr: 'DI3', terminal: 'TB1-07/08', device: 'Pulse sensor', value: inputs.I_Pulse ? 'TRUE' : 'FALSE', path: 'digital-input' as const },
    { tag: 'I_Reset', addr: 'DI4', terminal: 'TB1-09/10', device: 'Reset PB', value: inputs.I_Reset ? 'TRUE' : 'FALSE', path: 'digital-input' as const },
    { tag: 'I_AckAlarm', addr: 'DI5', terminal: 'TB1-11/12', device: 'Alarm Ack PB', value: inputs.I_AckAlarm ? 'TRUE' : 'FALSE', path: 'digital-input' as const },
    { tag: 'I_MotorFb', addr: 'DI6', terminal: 'TB1-13/14', device: 'Motor aux feedback contact (simulated)', value: motorAuxFeedbackTag ? 'TRUE' : 'FALSE', path: 'digital-input' as const },
    { tag: 'Q_Motor', addr: 'DO0', terminal: 'TB2-01/02', device: 'Motor contactor coil', value: engineState.motor ? 'ON' : 'OFF', path: 'digital-output' as const },
    { tag: 'Q_Lamp', addr: 'DO1', terminal: 'TB2-03/04', device: 'Pilot lamp', value: engineState.lamp ? 'ON' : 'OFF', path: 'digital-output' as const },
    { tag: 'Q_Valve', addr: 'DO2', terminal: 'TB2-05/06', device: 'Valve solenoid', value: engineState.valve ? 'ON' : 'OFF', path: 'digital-output' as const }
  ];
  const selectedIoRow = digitalRows.find((row) => row.tag === selectedIoTag) ?? digitalRows[0];

  return (
    <div id="sim-docs" className="scroll-mt-24 space-y-3 rounded border border-theme-border bg-theme-base p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
          Diagnostics Documents (MVP)
        </p>
        <span className="text-[11px] text-theme-muted">
          Simplified IO map + terminal strip linked to current simulator state
        </span>
      </div>

      <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
        <p className="text-xs font-semibold text-theme-secondary">IO Map / Channel List</p>
        <p className="mt-1 text-[11px] text-theme-muted">
          Use this to trace device {'->'} terminal {'->'} module channel {'->'} tag before editing logic.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-[11px]">
            <thead className="text-theme-muted">
              <tr>
                <th className="px-2 py-1">Tag</th>
                <th className="px-2 py-1">Addr</th>
                <th className="px-2 py-1">Terminal</th>
                <th className="px-2 py-1">Device</th>
                <th className="px-2 py-1">Live</th>
              </tr>
            </thead>
            <tbody>
              {digitalRows.map((row) => (
                <tr
                  key={row.tag}
                  className={`border-t border-theme-border-subtle ${
                    selectedIoTag === row.tag ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIoTag(row.tag);
                        setSelectedSchematicPath(row.path);
                      }}
                      className={`rounded px-1.5 py-0.5 font-mono ${
                        selectedIoTag === row.tag
                          ? 'border border-amber-400/40 bg-amber-500/10 text-amber-200'
                          : 'text-theme-text hover:bg-theme-surface'
                      }`}
                    >
                      {row.tag}
                    </button>
                  </td>
                  <td className="px-2 py-1 font-mono text-theme-secondary">{row.addr}</td>
                  <td className="px-2 py-1 font-mono text-theme-secondary">{row.terminal}</td>
                  <td className="px-2 py-1 text-theme-secondary">{row.device}</td>
                  <td className="px-2 py-1">
                    <span
                      className={`font-mono ${
                        row.value === 'TRUE' || row.value === 'ON' ? 'text-amber-300' : 'text-theme-muted'
                      }`}
                    >
                      {row.value}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
          <p className="text-xs font-semibold text-theme-secondary">Terminal Strip / Common Groups (Simplified)</p>
          <div className="mt-2 space-y-1 text-[11px] text-theme-secondary">
            <p><span className="font-mono text-theme-secondary">TB1</span>: Digital inputs (24 VDC field signals) with shared input common return.</p>
            <p><span className="font-mono text-theme-secondary">TB2</span>: Digital outputs to loads (contactor / lamp / valve coil power path not fully modeled).</p>
            <p>Input troubleshooting path: <span className="text-amber-300">Device {'->'} Terminal {'->'} DI channel LED {'->'} Tag state {'->'} Ladder contact truth</span></p>
            <p>Output troubleshooting path: <span className="text-amber-300">controller command/tag {'->'} DO channel {'->'} terminal voltage {'->'} device coil/actuator feedback</span></p>
          </div>
        </div>

        <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
          <p className="text-xs font-semibold text-theme-secondary">Stage-Specific Reference Snapshot</p>
          <div className="mt-2 space-y-1 text-[11px] text-theme-secondary">
            {stageId === 1 ? (
              <>
                <p>AI0 (simulated): 4-20 mA loop {'->'} raw counts {'->'} scaled engineering units.</p>
                <p className="font-mono text-theme-secondary">
                  Loop={analogTrainer.loopCurrentmA.toFixed(2)}mA Raw={analogTrainer.rawCounts} Scaled={analogTrainer.scaledEU.toFixed(1)} Expected={analogTrainer.expectedEU.toFixed(1)}
                </p>
              </>
            ) : null}
            {stageId === 4 ? (
              <>
                <p>Drive interface: RunCmd / Ready / Running / Fault / Local status bits.</p>
                <p className="font-mono text-theme-secondary">
                  VFD Ready={String(vfdTrainer.statusReady)} Fault={String(vfdTrainer.statusFault)} Local={String(vfdTrainer.localMode)}
                </p>
                <p>Remote IO / PROFINET: device availability, name/config match, bus/channel diagnostics.</p>
                <p className="font-mono text-theme-secondary">
                  BusFault={String(fieldbusTrainer.moduleBusFault)} ChannelFault={String(fieldbusTrainer.moduleChannelFault)} Cyclic={String(fieldbusTrainer.cyclicDataExchange)}
                </p>
              </>
            ) : null}
            {stageId !== 1 && stageId !== 4 ? (
              <p>Core digital control model shown. Use IO map + ladder truth + field checks to separate electrical vs logic faults.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-theme-secondary">Wiring Schematic View (MVP)</p>
            <p className="mt-1 text-[11px] text-theme-muted">
              Simplified signal-path view for tracing device {'->'} terminal {'->'} module {'->'} tag {'->'} logic/output.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ['digital-input', 'Digital Input'],
              ['digital-output', 'Digital Output'],
              ['analog-loop', 'Analog Loop'],
              ['vfd-handshake', 'VFD'],
              ['fieldbus-remote', 'Fieldbus']
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedSchematicPath(id)}
                className={`rounded border px-2 py-1 text-[11px] ${
                  selectedSchematicPath === id
                    ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                    : 'border-theme-border text-theme-secondary hover:border-theme-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded border border-theme-border bg-theme-base p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-theme-muted">Selected IO row:</span>
            <span className="rounded border border-theme-border bg-theme-panel px-2 py-1 text-[11px] font-mono text-amber-200">
              {selectedIoRow.tag}
            </span>
            <span className="text-[11px] text-theme-muted">
              {selectedIoRow.terminal} / {selectedIoRow.addr}
            </span>
          </div>
          {selectedSchematicPath === 'digital-input' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-theme-secondary">
                Example path: digital input device to controller input and rung contact truth.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded border px-2 py-1 ${selectedIoRow.tag.startsWith('I_') ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' : 'border-theme-border text-theme-text'}`}>
                  {selectedIoRow.tag.startsWith('I_') ? selectedIoRow.device : 'Start PB (NO)'}
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span className={`rounded border px-2 py-1 ${selectedIoRow.tag.startsWith('I_') ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' : 'border-theme-border text-theme-secondary'}`}>
                  {selectedIoRow.tag.startsWith('I_') ? selectedIoRow.terminal : 'TB1-01/02'}
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span
                  className={`rounded border px-2 py-1 ${
                    selectedIoRow.tag.startsWith('I_') && selectedIoRow.value === 'TRUE'
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-theme-border text-theme-secondary'
                  }`}
                >
                  {selectedIoRow.tag.startsWith('I_') ? selectedIoRow.addr : 'DI0'} LED{' '}
                  {selectedIoRow.tag.startsWith('I_') && selectedIoRow.value === 'TRUE' ? 'ON' : 'OFF'}
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span
                  className={`rounded border px-2 py-1 ${
                    selectedIoRow.tag.startsWith('I_') && selectedIoRow.value === 'TRUE'
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-theme-border text-theme-secondary'
                  }`}
                >
                  Tag {selectedIoRow.tag.startsWith('I_') ? selectedIoRow.tag : 'I_Start'}{' '}
                  {selectedIoRow.tag.startsWith('I_') ? selectedIoRow.value : 'FALSE'}
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span className="rounded border border-theme-border px-2 py-1 text-theme-secondary">
                  Ladder Contact Truth (selected tag path)
                </span>
              </div>
              <p className="text-[11px] text-theme-muted">
                Check order: device state, terminal continuity/voltage, DI channel LED, tag state, then ladder contact truth.
              </p>
              {selectedIoRow.tag === 'I_MotorFb' ? (
                <div className="rounded border border-theme-border bg-theme-panel/60 p-2 text-[11px]">
                  <p className="text-theme-secondary">
                    Simulated aux feedback voltage: <span className="font-mono text-amber-300">{motorAuxFeedbackV.toFixed(1)} V</span> | Tag I_MotorFb={motorAuxFeedbackTag ? 'TRUE' : 'FALSE'}
                  </p>
                  <p className={`mt-1 ${commandVsFeedbackMismatch ? 'text-rose-300' : 'text-theme-muted'}`}>
                    {commandVsFeedbackMismatch
                      ? 'Command-vs-feedback mismatch present. Diagnose output path vs feedback contact/wiring before changing logic.'
                      : 'Feedback matches commanded motor state in the simplified model.'}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedSchematicPath === 'digital-output' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-theme-secondary">
                Example path: controller output command to channel, terminal, and device (plus simulated feedback check).
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded border px-2 py-1 ${
                    selectedIoRow.tag === 'Q_Motor' ? 'border-amber-400 bg-amber-500/10 text-amber-200' : 'border-theme-border text-theme-secondary'
                  }`}
                >
                  Logic Coil {selectedIoRow.tag.startsWith('Q_') ? selectedIoRow.tag : 'Q_Motor'}{' '}
                  {selectedIoRow.tag.startsWith('Q_') ? selectedIoRow.value : 'OFF'}
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span
                  className={`rounded border px-2 py-1 ${
                    selectedIoRow.tag.startsWith('Q_') && selectedIoRow.value === 'ON'
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-theme-border text-theme-secondary'
                  }`}
                >
                  {selectedIoRow.tag.startsWith('Q_') ? selectedIoRow.addr : 'DO0'} Channel{' '}
                  {selectedIoRow.tag.startsWith('Q_') ? selectedIoRow.value : 'OFF'}
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span className={`rounded border px-2 py-1 ${selectedIoRow.tag.startsWith('Q_') ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' : 'border-theme-border text-theme-secondary'}`}>
                  {selectedIoRow.tag.startsWith('Q_') ? selectedIoRow.terminal : 'TB2-01/02'}
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span className="rounded border border-theme-border px-2 py-1 text-theme-secondary">
                  {selectedIoRow.tag === 'Q_Motor'
                    ? 'Contactor Coil (M)'
                    : selectedIoRow.tag === 'Q_Lamp'
                      ? 'Pilot Lamp'
                      : selectedIoRow.tag === 'Q_Valve'
                        ? 'Valve Solenoid'
                        : 'Load'}
                </span>
                <span className="text-theme-muted">{'->'}</span>
                {selectedIoRow.tag === 'Q_Motor' ? (
                  <span
                    className={`rounded border px-2 py-1 ${
                      outputVsFeedbackMismatch
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    }`}
                  >
                    Aux Feedback (sim): {motorAuxFeedbackTag ? 'ON' : 'OFF'}
                  </span>
                ) : (
                  <span className="rounded border border-theme-border px-2 py-1 text-theme-muted">
                    Device feedback (not modeled)
                  </span>
                )}
              </div>
              {selectedIoRow.tag === 'Q_Motor' ? (
                <div className="rounded border border-theme-border bg-theme-panel/60 p-2 text-[11px]">
                  <p className="text-theme-secondary">
                    Command vs feedback: Seal-in command={motorCommandRequested ? 'TRUE' : 'FALSE'} | Output state={engineState.motor ? 'ON' : 'OFF'} | Aux feedback (sim)={motorAuxFeedbackTag ? 'ON' : 'OFF'}
                  </p>
                  <p className={`${commandVsFeedbackMismatch || outputVsFeedbackMismatch ? 'text-rose-300' : 'text-theme-muted'} mt-1`}>
                    {commandVsFeedbackMismatch || outputVsFeedbackMismatch
                      ? `Mismatch detected. This can indicate output-layer faults (${activeFaultId === 'motor_coil_failed' || activeFaultId === 'motor_runaway' ? activeFaultId : 'coil/driver issue'}) or feedback faults (${activeFaultId === 'motor_feedback_stuck_off' || activeFaultId === 'motor_feedback_stuck_on' ? activeFaultId : 'aux contact/wiring/status mapping'}).`
                      : 'No mismatch currently visible in the simplified motor command/feedback path.'}
                  </p>
                </div>
              ) : null}
              <p className="text-[11px] text-theme-muted">
                Real-world note: output ON in logic does not prove coil voltage or device movement.
              </p>
            </div>
          ) : null}

          {selectedSchematicPath === 'analog-loop' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-theme-secondary">
                Example path: transmitter current loop to raw counts and scaled EU.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded border border-theme-border px-2 py-1 text-theme-secondary">
                  Transmitter (4-20 mA)
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span className="rounded border border-theme-border px-2 py-1 text-theme-secondary">
                  TB3-01/02 (+/COM)
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span className="rounded border border-theme-border px-2 py-1 text-amber-200">
                  AI0 Raw {analogTrainer.rawCounts}
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span className="rounded border border-theme-border px-2 py-1 text-amber-200">
                  Scale Block {analogTrainer.scaledEU.toFixed(1)}%
                </span>
                <span className="text-theme-muted">{'->'}</span>
                <span className="rounded border border-theme-border px-2 py-1 text-emerald-300">
                  Display / PV
                </span>
              </div>
              <p className="text-[11px] text-theme-muted">
                Live loop={analogTrainer.loopCurrentmA.toFixed(2)} mA, expected={analogTrainer.expectedEU.toFixed(1)}%.
              </p>
            </div>
          ) : null}

          {selectedSchematicPath === 'vfd-handshake' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-theme-secondary">
                Example path: controller run command and drive status handshake.
              </p>
              <div className="grid gap-2 md:grid-cols-2 text-xs">
                <div className="rounded border border-theme-border p-2">
                  <p className="text-theme-muted">Command Path</p>
                  <p className="mt-1 text-theme-text">
                    controller RunCmd ({vfdTrainer.controlCmdRun ? 'ON' : 'OFF'}) {'->'} DO/Network Cmd {'->'} VFD Run Request
                  </p>
                </div>
                <div className="rounded border border-theme-border p-2">
                  <p className="text-theme-muted">Status Path</p>
                  <p className="mt-1 text-theme-text">
                    VFD Ready={String(vfdTrainer.statusReady)} / Fault={String(vfdTrainer.statusFault)} / Local={String(vfdTrainer.localMode)} / Running={String(vfdTrainer.statusRunning)}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-theme-muted">
                Diagnose no-run by reading drive status first, then command path, then logic.
              </p>
            </div>
          ) : null}

          {selectedSchematicPath === 'fieldbus-remote' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-theme-secondary">
                Example path: controller controller to remote I/O/device over PROFINET/EtherNet/IP-style fieldbus.
              </p>
              <div className="grid gap-2 md:grid-cols-2 text-xs">
                <div className="rounded border border-theme-border p-2">
                  <p className="text-theme-muted">Availability / Comms</p>
                  <p className="mt-1 text-theme-text">
                    Power={String(fieldbusTrainer.devicePower)} {'->'} Link={String(fieldbusTrainer.networkLink)} {'->'} NameMatch={String(fieldbusTrainer.deviceNameMatch)} {'->'} Cyclic={String(fieldbusTrainer.cyclicDataExchange)}
                  </p>
                </div>
                <div className="rounded border border-theme-border p-2">
                  <p className="text-theme-muted">Diagnostics Result</p>
                  <p className="mt-1 text-theme-text">
                    BusFault={String(fieldbusTrainer.moduleBusFault)} | ChannelFault={String(fieldbusTrainer.moduleChannelFault)} | InputsValid={String(fieldbusTrainer.remoteInputsValid)}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-theme-muted">
                Missing device/data faults can look like logic faults if diagnostics are skipped.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// Install dev-mode profiler on module load (no-op in production builds).
installSimProfiler();

const onRenderSimulator = getProfilerOnRender('SimulatorPanel');
const onRenderMissions = getProfilerOnRender('SimulatorMissionPanel');
const onRenderAnalog = getProfilerOnRender('AnalogTrainerSection');
const onRenderProcess = getProfilerOnRender('ProcessSystemView');
const onRenderFieldChecks = getProfilerOnRender('FieldChecksPanel');
const onRenderVfdFieldbus = getProfilerOnRender('VfdFieldbusTrainerSection');
const onRenderSequence = getProfilerOnRender('SequenceTrainerSection');
const onRenderMultiUnit = getProfilerOnRender('MultiUnitTrainerSection');
const onRenderFaults = getProfilerOnRender('FaultPracticeSection');

export const SimulatorPanel = ({ stageId }: { stageId: number }) => {
  const { state, addFaultAttempt, markSimulatorMissionComplete } = useProgress();
  const [searchParams, setSearchParams] = useSearchParams();
  const missions = useMemo(() => getSimulatorMissionsForStage(stageId), [stageId]);
  const availableFaults = useMemo(() => faultsForStage(stageId), [stageId]);
  const [inputs, setInputs] = useState(defaultInputs);
  const [engineState, setEngineState] = useState(initialEngineState);
  const [lastScan, setLastScan] = useState(() => scanTick(initialEngineState, defaultInputs, 0));
  const [activeFault, setActiveFault] = useState<Fault | null>(null);
  const [selectedFaultId, setSelectedFaultId] = useState<string>('');
  const [selectedCompoundScenarioId, setSelectedCompoundScenarioId] = useState<string>(
    compoundFaultScenarios[0]?.id ?? ''
  );
  const [activeCompoundScenarioId, setActiveCompoundScenarioId] = useState<string | null>(null);
  const [sequenceTrainer, setSequenceTrainer] = useState<SequenceTrainerState>(() =>
    initialSequenceTrainerState()
  );
  const [oneShotTrainer, setOneShotTrainer] = useState<OneShotTrainerState>(() =>
    initialOneShotTrainerState()
  );
  const [selectedOneShotDiagnosis, setSelectedOneShotDiagnosis] =
    useState<OneShotDiagnosisSelection>('needs_one_shot');
  const [oneShotPulseActive, setOneShotPulseActive] = useState(false);
  const [selectedSequenceFaultId, setSelectedSequenceFaultId] = useState<SequenceStallFaultId>(
    'mix_temp_stuck_low'
  );
  const [selectedSequenceDiagnosis, setSelectedSequenceDiagnosis] =
    useState<SequenceDiagnosisSelection>('step20-transition');
  const [analogTrainer, setAnalogTrainer] = useState<AnalogTrainerState>(() =>
    buildAnalogTrainerState(50, 'none')
  );
  const [selectedAnalogFaultId, setSelectedAnalogFaultId] = useState<AnalogFaultId>('open_loop');
  const [selectedAnalogDiagnosis, setSelectedAnalogDiagnosis] =
    useState<AnalogDiagnosisSelection>('open_loop');
  const [vfdTrainer, setVfdTrainer] = useState<VfdTrainerState>(() => initialVfdTrainerState());
  const [selectedVfdFaultId, setSelectedVfdFaultId] = useState<VfdFaultId>('local_mode');
  const [selectedVfdDiagnosis, setSelectedVfdDiagnosis] = useState<VfdDiagnosisSelection>('local_mode');
  const [fieldbusTrainer, setFieldbusTrainer] = useState<FieldbusTrainerState>(() =>
    initialFieldbusTrainerState()
  );
  const [selectedFieldbusFaultId, setSelectedFieldbusFaultId] = useState<FieldbusFaultId>('name_mismatch');
  const [selectedFieldbusDiagnosis, setSelectedFieldbusDiagnosis] =
    useState<FieldbusDiagnosisSelection>('profinet_config_fault');
  const [multiUnitTrainer, setMultiUnitTrainer] = useState<MultiUnitTrainerState>(() =>
    initialMultiUnitTrainerState()
  );
  const [selectedMultiUnitFaultId, setSelectedMultiUnitFaultId] =
    useState<MultiUnitFaultId>('shared_air_loss');
  const [selectedMultiUnitDiagnosis, setSelectedMultiUnitDiagnosis] =
    useState<MultiUnitDiagnosisSelection>('shared_air');
  const [intDemoValue, setIntDemoValue] = useState<number>(32760);
  const [realTolerance, setRealTolerance] = useState<number>(0.001);
  const [processTankLevelPct, setProcessTankLevelPct] = useState<number>(35);
  const [expanded, setExpanded] = useState(false);
  const [missionStatuses, setMissionStatuses] = useState<Record<string, MissionStatus>>({});
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<SimulatorFocusMode>('guided');
  const [machineTimeline, setMachineTimeline] = useState<MachineTimelineEntry[]>([]);
  const missionQueryParam = searchParams.get('mission');
  const faultQueryParam = searchParams.get('fault');
  const focusQueryParam = searchParams.get('focus');
  const timelinePrevRef = useRef<{
    core: string;
    sequence?: string;
    oneShot?: string;
    analog?: string;
    vfd?: string;
    fieldbus?: string;
    multi?: string;
    activeFaultId?: string | null;
    compoundScenarioId?: string | null;
  } | null>(null);
  const scrollToSimAnchor = (anchorId: string) => {
    const node = window.document.getElementById(anchorId);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (availableFaults.length === 0) {
      setSelectedFaultId('');
      return;
    }
    setSelectedFaultId((prev) =>
      availableFaults.some((fault) => fault.id === prev) ? prev : availableFaults[0].id
    );
  }, [availableFaults]);

  useEffect(() => {
    setMissionStatuses(
      Object.fromEntries(
        missions
          .filter((mission) => state.simulatorMissionsCompleted[mission.id])
          .map((mission) => [mission.id, { completed: true }])
      )
    );
    const requestedMission = missionQueryParam && missions.some((mission) => mission.id === missionQueryParam)
      ? missionQueryParam
      : null;
    setSelectedMissionId(requestedMission ?? missions[0]?.id ?? null);
  }, [missions, missionQueryParam, state.simulatorMissionsCompleted]);

  useEffect(() => {
    if (!focusQueryParam) return;
    if (
      focusQueryParam === 'guided' ||
      focusQueryParam === 'practice' ||
      focusQueryParam === 'assessment' ||
      focusQueryParam === 'field'
    ) {
      setFocusMode(focusQueryParam);
    }
  }, [focusQueryParam]);

  useEffect(() => {
    if (!selectedMissionId) return;
    if (searchParams.get('mission') === selectedMissionId) return;
    const next = new URLSearchParams(searchParams);
    next.set('mission', selectedMissionId);
    setSearchParams(next, { replace: true });
  }, [selectedMissionId, searchParams, setSearchParams]);

  useEffect(() => {
    if (searchParams.get('focus') === focusMode) return;
    const next = new URLSearchParams(searchParams);
    next.set('focus', focusMode);
    setSearchParams(next, { replace: true });
  }, [focusMode, searchParams, setSearchParams]);

  useEffect(() => {
    if (!faultQueryParam) return;
    const requestedFault = availableFaults.find((fault) => fault.id === faultQueryParam);
    if (!requestedFault) return;
    if (activeFault?.id === requestedFault.id) return;
    setSelectedFaultId(requestedFault.id);
    setActiveFault(requestedFault);
    resetAll(requestedFault);
    deferAutoCapture('define-symptom');
  }, [availableFaults, faultQueryParam]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const compoundFaults = activeCompoundScenarioId
        ? compoundFaultScenarios.find((scenario) => scenario.id === activeCompoundScenarioId)?.faults ?? []
        : undefined;
      const engineFaultSelection = compoundFaults && compoundFaults.length > 0 ? compoundFaults : activeFault?.id;
      setEngineState((prev) => {
        const result = scanTick(prev, inputs, 100, engineFaultSelection);
        setLastScan(result);
        setProcessTankLevelPct((tankPrev) => {
          const fillRate = result.state.motor ? 1.4 : 0;
          const drainRate = result.state.valve ? 2.2 : 0.3;
          const next = tankPrev + fillRate - drainRate;
          return Math.max(0, Math.min(100, next));
        });
        return result.state;
      });
      setSequenceTrainer((prev) => sequenceTrainerTick(prev, 100));
      setMultiUnitTrainer((prev) => tickMultiUnitTrainer(prev));
      setOneShotTrainer((prev) => tickOneShotTrainer(prev, oneShotPulseActive));
    }, 100);

    return () => window.clearInterval(timer);
  }, [inputs, activeFault, activeCompoundScenarioId, oneShotPulseActive]);

  const pulse = (key: keyof typeof inputs) => {
    setInputs((prev) => ({ ...prev, [key]: true }));
    window.setTimeout(() => {
      setInputs((prev) => ({ ...prev, [key]: false }));
    }, momentaryMs);
  };

  const toggleInterlock = () => {
    setInputs((prev) => ({ ...prev, I_Interlock: !prev.I_Interlock }));
  };

  const resetAll = (faultOverride?: Fault | null) => {
    const faultId = faultOverride === undefined ? activeFault?.id : faultOverride?.id;
    const activeCompoundFaults = activeCompoundScenarioId
      ? compoundFaultScenarios.find((scenario) => scenario.id === activeCompoundScenarioId)?.faults
      : undefined;
    const engineFaultSelection =
      activeCompoundFaults && activeCompoundFaults.length > 0
        ? activeCompoundFaults
        : faultId;
    setInputs(defaultInputs);
    setEngineState(initialEngineState);
    setLastScan(scanTick(initialEngineState, defaultInputs, 0, engineFaultSelection));
    setProcessTankLevelPct(35);
    setMachineTimeline((prev) => [
      ...prev.slice(-39),
      {
        id: `action-reset-${Date.now()}`,
        scan: initialEngineState.scanCount,
        kind: 'action',
        label: 'Reset model',
        detail: engineFaultSelection ? 'Model reset with active fault selection.' : 'Model reset to healthy baseline.'
      }
    ]);
  };

  const resetOneShotTrainer = (faultMode: OneShotTrainerState['faultMode'] = 'sealed_bit_instead_of_osr') => {
    setOneShotTrainer({ ...initialOneShotTrainerState(), faultMode });
    setOneShotPulseActive(false);
  };

  const pulseOneShotPart = () => {
    setOneShotPulseActive(true);
    setOneShotTrainer((prev) => ({ ...prev, simulatedPartCount: prev.simulatedPartCount + 1 }));
    window.setTimeout(() => setOneShotPulseActive(false), 160);
  };

  const resetSequenceTrainer = (faultId?: SequenceStallFaultId) => {
    setSequenceTrainer((prev) => {
      const next = initialSequenceTrainerState();
      next.stallFaultId = faultId ?? prev.stallFaultId;
      return next;
    });
  };

  const startSequenceTrainer = (faultId: SequenceStallFaultId) => {
    setSequenceTrainer({
      ...initialSequenceTrainerState(),
      running: true,
      activeStep: 10,
      startedAtScan: engineState.scanCount,
      stallFaultId: faultId
    });
  };

  const updateAnalogTrainer = (signalPercent: number, faultId: AnalogFaultId) => {
    setAnalogTrainer((prev) => buildAnalogTrainerState(signalPercent, faultId, prev.diagnosis));
  };

  const injectAnalogFault = (faultId: AnalogFaultId) => {
    setAnalogTrainer((prev) =>
      buildAnalogTrainerState(prev.signalPercent, faultId, null)
    );
    setMachineTimeline((prev) => [
      ...prev.slice(-39),
      {
        id: `analog-fault-${faultId}-${Date.now()}`,
        scan: engineState.scanCount,
        kind: 'fault',
        label: 'Analog trainer fault changed',
        detail: `Analog fault mode set to ${faultId}.`
      }
    ]);
  };

  const submitAnalogDiagnosis = () => {
    const expected: AnalogDiagnosisSelection =
      analogTrainer.faultId === 'open_loop'
        ? 'open_loop'
        : analogTrainer.faultId === 'short_circuit'
          ? 'short_circuit'
          : analogTrainer.faultId === 'wrong_zero_offset' || analogTrainer.faultId === 'wrong_span'
            ? 'scaling_fault'
            : 'healthy';
    const correct = selectedAnalogDiagnosis === expected;
    setAnalogTrainer((prev) => ({
      ...prev,
      diagnosis: {
        selected: selectedAnalogDiagnosis,
        correct
      }
    }));
    appendMissionTimelineEntry('analog-loop-fault-diagnosis', {
      kind: 'diagnosis',
      label: correct ? 'Analog diagnosis submitted: correct' : 'Analog diagnosis submitted: incorrect',
      detail: `Selected "${analogDiagnosisLabel[selectedAnalogDiagnosis]}"; faultMode=${analogTrainer.faultId}; loop=${analogTrainer.loopCurrentmA.toFixed(2)} mA raw=${analogTrainer.rawCounts} scaled=${analogTrainer.scaledEU}.`,
      scan: engineState.scanCount
    });
    if (selectedMissionId === 'analog-loop-fault-diagnosis') {
      window.setTimeout(() => checkSelectedMissionState('analog-loop-fault-diagnosis'), 0);
    }
  };

  const resetVfdTrainer = () => setVfdTrainer(initialVfdTrainerState());

  const resetFieldbusTrainer = () => setFieldbusTrainer(initialFieldbusTrainerState());

  const applyFieldbusFault = (faultId: FieldbusFaultId) => {
    setFieldbusTrainer((prev) =>
      deriveFieldbusTrainerState(
        {
          ...prev,
          diagnosis: null
        },
        { faultId }
      )
    );
    setMachineTimeline((prev) => [
      ...prev.slice(-39),
      {
        id: `fieldbus-fault-${faultId}-${Date.now()}`,
        scan: engineState.scanCount,
        kind: 'fault',
        label: 'Fieldbus trainer fault changed',
        detail: `Fieldbus fault mode set to ${faultId}.`
      }
    ]);
  };

  const applyVfdFault = (faultId: VfdFaultId) => {
    setVfdTrainer((prev) =>
      deriveVfdTrainerState(
        {
          ...prev,
          diagnosis: null
        },
        { faultId }
      )
    );
    setMachineTimeline((prev) => [
      ...prev.slice(-39),
      {
        id: `vfd-fault-${faultId}-${Date.now()}`,
        scan: engineState.scanCount,
        kind: 'fault',
        label: 'VFD trainer fault changed',
        detail: `VFD fault mode set to ${faultId}.`
      }
    ]);
  };

  const setVfdCommandRun = (run: boolean) => {
    setVfdTrainer((prev) => deriveVfdTrainerState(prev, { controlCmdRun: run }));
    setMachineTimeline((prev) => [
      ...prev.slice(-39),
      {
        id: `vfd-run-cmd-${run}-${Date.now()}`,
        scan: engineState.scanCount,
        kind: 'action',
        label: 'VFD controller command',
        detail: `Run command set ${run ? 'ON' : 'OFF'}.`
      }
    ]);
  };

  const pulseVfdReset = () => {
    setVfdTrainer((prev) => deriveVfdTrainerState(prev, { controlCmdResetPulse: true }));
    setMachineTimeline((prev) => [
      ...prev.slice(-39),
      {
        id: `vfd-reset-${Date.now()}`,
        scan: engineState.scanCount,
        kind: 'action',
        label: 'VFD reset pulse',
        detail: 'Drive reset pulse issued from controller command.'
      }
    ]);
  };

  const setVfdSpeedRef = (speedRefHz: number) => {
    setVfdTrainer((prev) => deriveVfdTrainerState(prev, { speedRefHz }));
  };

  const submitVfdDiagnosis = () => {
    const expected: VfdDiagnosisSelection =
      vfdTrainer.faultId === 'local_mode'
        ? 'local_mode'
        : vfdTrainer.faultId === 'dc_bus_fault'
          ? 'drive_fault'
          : vfdTrainer.faultId === 'not_ready'
            ? 'ready_missing'
            : !vfdTrainer.controlCmdRun
              ? 'logic_fault'
              : 'unknown';
    const correct = selectedVfdDiagnosis === expected;
    setVfdTrainer((prev) => ({
      ...prev,
      diagnosis: {
        selected: selectedVfdDiagnosis,
        correct
      }
    }));
    appendMissionTimelineEntry('vfd-handshake-diagnosis', {
      kind: 'diagnosis',
      label: correct ? 'VFD diagnosis submitted: correct' : 'VFD diagnosis submitted: incorrect',
      detail: `Selected "${vfdDiagnosisLabel[selectedVfdDiagnosis]}"; faultMode=${vfdTrainer.faultId}; RunCmd=${vfdTrainer.controlCmdRun}; Ready=${vfdTrainer.statusReady}; Fault=${vfdTrainer.statusFault}; Local=${vfdTrainer.localMode}.`,
      scan: engineState.scanCount
    });
    if (selectedMissionId === 'vfd-handshake-diagnosis') {
      window.setTimeout(() => checkSelectedMissionState('vfd-handshake-diagnosis'), 0);
    }
  };

  const submitFieldbusDiagnosis = () => {
    const expected: FieldbusDiagnosisSelection =
      fieldbusTrainer.faultId === 'name_mismatch'
        ? 'profinet_config_fault'
        : fieldbusTrainer.faultId === 'module_channel_fault'
          ? 'channel_fault'
          : fieldbusTrainer.faultId === 'device_power_loss' || fieldbusTrainer.faultId === 'network_link_down'
            ? 'power_link_fault'
            : 'logic_fault';
    const correct = selectedFieldbusDiagnosis === expected;
    setFieldbusTrainer((prev) => ({
      ...prev,
      diagnosis: {
        selected: selectedFieldbusDiagnosis,
        correct
      }
    }));
    appendMissionTimelineEntry('fieldbus-device-missing-diagnosis', {
      kind: 'diagnosis',
      label: correct ? 'Fieldbus diagnosis submitted: correct' : 'Fieldbus diagnosis submitted: incorrect',
      detail: `Selected "${fieldbusDiagnosisLabel[selectedFieldbusDiagnosis]}"; faultMode=${fieldbusTrainer.faultId}; power=${fieldbusTrainer.devicePower}; link=${fieldbusTrainer.networkLink}; nameMatch=${fieldbusTrainer.deviceNameMatch}; busFault=${fieldbusTrainer.moduleBusFault}; channelFault=${fieldbusTrainer.moduleChannelFault}.`,
      scan: engineState.scanCount
    });
    if (selectedMissionId === 'fieldbus-device-missing-diagnosis') {
      window.setTimeout(() => checkSelectedMissionState('fieldbus-device-missing-diagnosis'), 0);
    }
  };

  const injectMultiUnitFault = (faultId: MultiUnitFaultId) => {
    setMultiUnitTrainer((prev) => deriveMultiUnitTrainerState(faultId, prev));
    setMachineTimeline((prev) => [
      ...prev.slice(-39),
      {
        id: `multi-fault-${faultId}-${Date.now()}`,
        scan: engineState.scanCount,
        kind: 'fault',
        label: 'Multi-unit fault changed',
        detail: `Multi-unit trainer fault mode set to ${faultId}.`
      }
    ]);
  };

  const resetMultiUnitTrainer = () => {
    setMultiUnitTrainer(initialMultiUnitTrainerState());
  };

  const submitMultiUnitDiagnosis = () => {
    const expected: MultiUnitDiagnosisSelection =
      multiUnitTrainer.faultId === 'shared_air_loss'
        ? 'shared_air'
        : multiUnitTrainer.faultId === 'shared_network_loss'
          ? 'shared_network'
        : multiUnitTrainer.faultId === 'unitA_local_permit_loss'
          ? 'unitA'
          : multiUnitTrainer.faultId === 'unitB_local_permit_loss'
            ? 'unitB'
            : multiUnitTrainer.faultId === 'unitB_local_permit_intermittent'
              ? 'unitB'
              : multiUnitTrainer.faultId === 'unitC_local_permit_loss'
                ? 'unitC'
            : 'unknown';
    const correct = selectedMultiUnitDiagnosis === expected;
    setMultiUnitTrainer((prev) => ({
      ...prev,
      diagnosis: {
        selected: selectedMultiUnitDiagnosis,
        correct
      }
    }));
    appendMissionTimelineEntry('multi-unit-shared-permit-diagnosis', {
      kind: 'diagnosis',
      label: correct ? 'Multi-unit diagnosis submitted: correct' : 'Multi-unit diagnosis submitted: incorrect',
      detail: `Selected "${multiUnitDiagnosisLabel[selectedMultiUnitDiagnosis]}"; faultMode=${multiUnitTrainer.faultId}; sharedAir=${multiUnitTrainer.sharedAirPermit}; sharedNet=${multiUnitTrainer.sharedNetworkReady}; unitA=${multiUnitTrainer.unitA.running}; unitB=${multiUnitTrainer.unitB.running}; unitC=${multiUnitTrainer.unitC.running}.`,
      scan: engineState.scanCount
    });
    if (selectedMissionId === 'multi-unit-shared-permit-diagnosis') {
      window.setTimeout(() => checkSelectedMissionState('multi-unit-shared-permit-diagnosis'), 0);
    }
  };

  const submitOneShotDiagnosis = () => {
    const expected: OneShotDiagnosisSelection =
      oneShotTrainer.faultMode === 'sealed_bit_instead_of_osr' ? 'needs_one_shot' : 'unknown';
    const correct = selectedOneShotDiagnosis === expected;
    setOneShotTrainer((prev) => ({
      ...prev,
      diagnosis: {
        selected: selectedOneShotDiagnosis,
        correct
      }
    }));
    appendMissionTimelineEntry('one-shot-counter-diagnosis', {
      kind: 'diagnosis',
      label: correct ? 'One-shot diagnosis submitted: correct' : 'One-shot diagnosis submitted: incorrect',
      detail: `Selected "${oneShotDiagnosisLabel[selectedOneShotDiagnosis]}"; faultMode=${oneShotTrainer.faultMode}; parts=${oneShotTrainer.simulatedPartCount}; CU=${oneShotTrainer.cuSignal}; ACC=${oneShotTrainer.counterAcc}.`,
      scan: engineState.scanCount
    });
    if (selectedMissionId === 'one-shot-counter-diagnosis') {
      window.setTimeout(() => checkSelectedMissionState('one-shot-counter-diagnosis'), 0);
    }
  };

  const activateCompoundFaultScenario = (scenarioId: string) => {
    setActiveFault(null);
    setActiveCompoundScenarioId(scenarioId);
    window.setTimeout(() => {
      resetAll();
      deferAutoCapture('define-symptom');
    }, 0);
  };

  const clearCompoundFaultScenario = () => {
    setActiveCompoundScenarioId(null);
    resetAll();
  };

  const formattedTimer = useMemo(
    () =>
      `${(engineState.timer.accMs / 1000).toFixed(1)} s / ${(
        engineState.timer.presetMs / 1000
      ).toFixed(1)} s`,
    [engineState.timer.accMs, engineState.timer.presetMs]
  );

  // Lazy snapshot — only allocate when a user-driven event actually needs it,
  // instead of recreating on every 100 ms tick.
  const getMissionSnapshot = (): SimulatorSnapshot => ({
    stageId,
    inputs,
    engineState,
    lastScan,
    activeFaultId: activeFault?.id ?? null,
    sequenceTrainer,
    analogTrainer,
    vfdTrainer,
    fieldbusTrainer,
    multiUnitTrainer,
    oneShotTrainer
  });

  const selectedMission = useMemo(
    () => missions.find((mission) => mission.id === selectedMissionId) ?? null,
    [missions, selectedMissionId]
  );

  const appendMachineTimelineEntry = (entry: Omit<MachineTimelineEntry, 'id'>) => {
    setMachineTimeline((prev) => [
      ...prev.slice(-39),
      {
        ...entry,
        id: `${entry.kind}-${entry.label}-${entry.scan}-${Date.now()}`
      }
    ]);
  };

  useEffect(() => {
    const current = {
      core: [
        `permit:${engineState.runPermit}`,
        `motor:${engineState.motor}`,
        `lamp:${engineState.lamp}`,
        `valve:${engineState.valve}`,
        `alarm:${engineState.alarm}`,
        `tdn:${engineState.timer.dn}`,
        `cdn:${engineState.counter.dn}`
      ].join('|'),
      sequence: stageId === 3 ? `step:${sequenceTrainer.activeStep}|run:${sequenceTrainer.running}` : undefined,
      oneShot: stageId === 2 ? `cu:${oneShotTrainer.cuSignal}|acc:${oneShotTrainer.counterAcc}` : undefined,
      analog: stageId === 1 ? `fault:${analogTrainer.faultId}` : undefined,
      vfd:
        stageId === 4
          ? `run:${vfdTrainer.statusRunning}|ready:${vfdTrainer.statusReady}|fault:${vfdTrainer.statusFault}|local:${vfdTrainer.localMode}`
          : undefined,
      fieldbus:
        stageId === 4
          ? `remote:${fieldbusTrainer.remoteInputsValid}|bus:${fieldbusTrainer.moduleBusFault}|chan:${fieldbusTrainer.moduleChannelFault}|cyclic:${fieldbusTrainer.cyclicDataExchange}`
          : undefined,
      multi:
        stageId === 6
          ? `shared:${multiUnitTrainer.sharedPermit}|A:${multiUnitTrainer.unitA.running}|B:${multiUnitTrainer.unitB.running}|C:${multiUnitTrainer.unitC.running}`
          : undefined,
      activeFaultId: activeFault?.id ?? null,
      compoundScenarioId: activeCompoundScenarioId
    };

    const prev = timelinePrevRef.current;
    if (prev) {
      if (prev.core !== current.core) {
        appendMachineTimelineEntry({
          scan: engineState.scanCount,
          kind: engineState.alarm ? 'alarm' : 'state',
          label: 'Core state change',
          detail: `Permit=${engineState.runPermit ? 'ON' : 'OFF'} | Motor=${engineState.motor ? 'ON' : 'OFF'} | Lamp=${engineState.lamp ? 'ON' : 'OFF'} | Valve=${engineState.valve ? 'ON' : 'OFF'}${stageId >= 3 ? ` | Alarm=${engineState.alarm ? 'ON' : 'OFF'}` : ''}`
        });
      }
      if (prev.activeFaultId !== current.activeFaultId) {
        appendMachineTimelineEntry({
          scan: engineState.scanCount,
          kind: 'fault',
          label: 'Main fault selection changed',
          detail: current.activeFaultId ? `Active hidden fault: ${current.activeFaultId}` : 'Main fault cleared.'
        });
      }
      if (prev.compoundScenarioId !== current.compoundScenarioId) {
        appendMachineTimelineEntry({
          scan: engineState.scanCount,
          kind: 'fault',
          label: 'Compound scenario mode',
          detail: current.compoundScenarioId
            ? `Compound scenario active: ${current.compoundScenarioId}`
            : 'Compound scenario cleared.'
        });
      }
      if (stageId === 3 && prev.sequence !== current.sequence) {
        appendMachineTimelineEntry({
          scan: engineState.scanCount,
          kind: 'state',
          label: 'Sequence step/status changed',
          detail: `Step=${sequenceTrainer.activeStep} | Running=${sequenceTrainer.running ? 'TRUE' : 'FALSE'}`
        });
      }
      if (stageId === 4 && prev.vfd !== current.vfd) {
        appendMachineTimelineEntry({
          scan: engineState.scanCount,
          kind: 'state',
          label: 'VFD status changed',
          detail: `Ready=${vfdTrainer.statusReady} | Running=${vfdTrainer.statusRunning} | Fault=${vfdTrainer.statusFault} | Local=${vfdTrainer.localMode}`
        });
      }
      if (stageId === 4 && prev.fieldbus !== current.fieldbus) {
        appendMachineTimelineEntry({
          scan: engineState.scanCount,
          kind: 'state',
          label: 'Fieldbus status changed',
          detail: `RemoteInputsValid=${fieldbusTrainer.remoteInputsValid} | BusFault=${fieldbusTrainer.moduleBusFault} | ChannelFault=${fieldbusTrainer.moduleChannelFault}`
        });
      }
      if (stageId === 6 && prev.multi !== current.multi) {
        appendMachineTimelineEntry({
          scan: engineState.scanCount,
          kind: 'state',
          label: 'Multi-unit running pattern changed',
          detail: `SharedPermit=${multiUnitTrainer.sharedPermit} | A=${multiUnitTrainer.unitA.running} | B=${multiUnitTrainer.unitB.running} | C=${multiUnitTrainer.unitC.running}`
        });
      }
    }
    timelinePrevRef.current = current;
  }, [
    activeCompoundScenarioId,
    activeFault,
    analogTrainer.faultId,
    engineState.alarm,
    engineState.counter.dn,
    engineState.lamp,
    engineState.motor,
    engineState.runPermit,
    engineState.scanCount,
    engineState.timer.dn,
    engineState.valve,
    fieldbusTrainer.cyclicDataExchange,
    fieldbusTrainer.moduleBusFault,
    fieldbusTrainer.moduleChannelFault,
    fieldbusTrainer.remoteInputsValid,
    multiUnitTrainer.sharedPermit,
    multiUnitTrainer.unitA.running,
    multiUnitTrainer.unitB.running,
    multiUnitTrainer.unitC.running,
    oneShotTrainer.counterAcc,
    oneShotTrainer.cuSignal,
    sequenceTrainer.activeStep,
    sequenceTrainer.running,
    stageId,
    vfdTrainer.localMode,
    vfdTrainer.statusFault,
    vfdTrainer.statusReady,
    vfdTrainer.statusRunning
  ]);

  const updateMissionResult = (missionId: string, passed: boolean, message: string) => {
    if (passed) {
      markSimulatorMissionComplete(missionId);
    }
    setMissionStatuses((prev) => {
      const current = prev[missionId] ?? { completed: false };
      return {
        ...prev,
        [missionId]: {
          ...current,
          completed: current.completed || passed,
          completedWorkflowStepIds: current.completedWorkflowStepIds ?? [],
          workflowEvidenceByStepId: current.workflowEvidenceByStepId ?? {},
          lastResult: { passed, message }
        }
      };
    });
  };

  const appendMissionTimelineEntry = (
    missionId: string,
    entry: Omit<NonNullable<MissionStatus['timeline']>[number], 'id'>
  ) => {
    setMissionStatuses((prev) => {
      const current = prev[missionId] ?? { completed: false };
      const timeline = current.timeline ?? [];
      return {
        ...prev,
        [missionId]: {
          ...current,
          timeline: [
            ...timeline,
            {
              ...entry,
              id: `${entry.kind}-${entry.label}-${entry.scan}-${timeline.length + 1}`
            }
          ]
        }
      };
    });
  };

  const setMissionProcessScore = (missionId: string, score: number, max: number, summary: string) => {
    setMissionStatuses((prev) => {
      const current = prev[missionId] ?? { completed: false };
      return {
        ...prev,
        [missionId]: {
          ...current,
          processScore: { score, max, summary }
        }
      };
    });
  };

  const autoCaptureWorkflowEvidenceIfNext = (stepId: string) => {
    const missionId = selectedMissionId;
    if (!missionId) return;
    const mission = missions.find((item) => item.id === missionId);
    if (!mission?.workflowSteps?.length) return;

    const completed = missionStatuses[missionId]?.completedWorkflowStepIds ?? [];
    const nextStep = mission.workflowSteps.find((step) => !completed.includes(step.id));
    if (!nextStep || nextStep.id !== stepId) return;

    captureWorkflowStepEvidence(missionId, stepId);
  };

  const deferAutoCapture = (stepId: string) => {
    window.setTimeout(() => autoCaptureWorkflowEvidenceIfNext(stepId), 0);
  };

  const captureWorkflowStepEvidence = (missionId: string, stepId: string) => {
    const mission = missions.find((item) => item.id === missionId);
    const workflowSteps = mission?.workflowSteps;
    if (!workflowSteps?.length) return;
    const snapshot = getMissionSnapshot();
    const current = missionStatuses[missionId] ?? { completed: false, completedWorkflowStepIds: [] };
    const completed = current.completedWorkflowStepIds ?? [];
    if (completed.includes(stepId)) return;

    const expectedNext = workflowSteps.find((step) => !completed.includes(step.id));
    if (!expectedNext || expectedNext.id !== stepId) {
      appendMissionTimelineEntry(missionId, {
        kind: 'system',
        label: 'Workflow order warning',
        detail: expectedNext
          ? `Attempted "${stepId}" out of order. Next required step is "${expectedNext.id}".`
          : 'Workflow already complete.',
        scan: snapshot.engineState.scanCount
      });
      setMissionStatuses((prev) => {
        const prevCurrent = prev[missionId] ?? { completed: false };
        return {
          ...prev,
          [missionId]: {
            ...prevCurrent,
            completedWorkflowStepIds: prevCurrent.completedWorkflowStepIds ?? [],
            workflowEvidenceByStepId: prevCurrent.workflowEvidenceByStepId ?? {},
            lastResult: {
              passed: false,
              message: expectedNext
                ? `Complete troubleshooting steps in order. Next required step: ${expectedNext.label}.`
                : 'Workflow already complete. Submit your diagnosis.'
            }
          }
        };
      });
      return;
    }

    const evidence = mission
      ? captureMissionWorkflowEvidence(mission, stepId, snapshot)
      : { stepId, summary: 'Evidence captured.' };

    setMissionStatuses((prev) => {
      const prevCurrent = prev[missionId] ?? { completed: false };
      const prevCompleted = prevCurrent.completedWorkflowStepIds ?? [];
      if (prevCompleted.includes(stepId)) return prev;
      const nextCompleted = [...prevCompleted, stepId];
      return {
        ...prev,
        [missionId]: {
          ...prevCurrent,
          completedWorkflowStepIds: nextCompleted,
          workflowEvidenceByStepId: {
            ...(prevCurrent.workflowEvidenceByStepId ?? {}),
            [stepId]: evidence.summary
          },
          lastResult: {
            passed: false,
            message:
              workflowSteps.every((step) => nextCompleted.includes(step.id))
                ? 'Workflow complete. Submit diagnosis to complete the mission.'
                : `Evidence captured for step: ${expectedNext.label}`
          }
        }
      };
    });

    appendMissionTimelineEntry(missionId, {
      kind: 'evidence',
      label: `Evidence captured: ${stepId}`,
      detail: evidence.summary,
      scan: snapshot.engineState.scanCount
    });
  };

  const resetWorkflowSteps = (missionId: string) => {
    setMissionStatuses((prev) => {
      const current = prev[missionId];
      if (!current) return prev;
      return {
        ...prev,
        [missionId]: {
          ...current,
          completedWorkflowStepIds: [],
          workflowEvidenceByStepId: {},
          timeline: [],
          processScore: undefined
        }
      };
    });
  };

  const checkSelectedMissionState = (missionId: string) => {
    const mission = missions.find((item) => item.id === missionId);
    if (!mission) return;
    const snapshot = getMissionSnapshot();
    let result = checkMissionState(mission, snapshot);
    if (!result) return;

    if (mission.workflowSteps?.length && result.passed) {
      const completedWorkflowStepIds = missionStatuses[mission.id]?.completedWorkflowStepIds ?? [];
      const workflowComplete = mission.workflowSteps.every((step) =>
        completedWorkflowStepIds.includes(step.id)
      );
      if (!workflowComplete) {
        const nextStep = mission.workflowSteps.find(
          (step) => !completedWorkflowStepIds.includes(step.id)
        );
        result = {
          passed: false,
          message: nextStep
            ? `Mission state is correct, but guided workflow is incomplete. Next required step: ${nextStep.label}.`
            : 'Mission state is correct, but guided workflow is incomplete.'
        };
      }
    }

    if (mission.id === 'sequence-stall-diagnosis' && mission.workflowSteps?.length && snapshot.sequenceTrainer) {
      const completedWorkflowStepIds = missionStatuses[mission.id]?.completedWorkflowStepIds ?? [];
      const capturedCount = completedWorkflowStepIds.length;
      const diagnosisCorrect = Boolean(snapshot.sequenceTrainer.diagnosis?.correct);
      const score =
        (diagnosisCorrect ? 50 : 0) +
        Math.round((capturedCount / mission.workflowSteps.length) * 50);
      setMissionProcessScore(
        mission.id,
        Math.min(score, 100),
        100,
        diagnosisCorrect
          ? 'Sequence stall diagnosis is correct. Complete evidence steps consistently to build reliable sequence troubleshooting habits.'
          : 'Review the active step and its transition conditions. Sequence troubleshooting should start with where the sequence is waiting.'
      );
    }

    if (mission.id === 'analog-loop-fault-diagnosis' && mission.workflowSteps?.length && snapshot.analogTrainer) {
      const completedWorkflowStepIds = missionStatuses[mission.id]?.completedWorkflowStepIds ?? [];
      const diagnosisCorrect = Boolean(snapshot.analogTrainer.diagnosis?.correct);
      const score = (diagnosisCorrect ? 50 : 0) + Math.round((completedWorkflowStepIds.length / mission.workflowSteps.length) * 50);
      setMissionProcessScore(
        mission.id,
        Math.min(score, 100),
        100,
        diagnosisCorrect
          ? 'Analog diagnosis is correct. Repeat on different loop faults to build pattern recognition.'
          : 'Use loop current and raw counts first to separate loop wiring faults from scaling faults.'
      );
    }

    if (mission.id === 'one-shot-counter-diagnosis' && mission.workflowSteps?.length && snapshot.oneShotTrainer) {
      const completedWorkflowStepIds = missionStatuses[mission.id]?.completedWorkflowStepIds ?? [];
      const diagnosisCorrect = Boolean(snapshot.oneShotTrainer.diagnosis?.correct);
      const score = (diagnosisCorrect ? 50 : 0) + Math.round((completedWorkflowStepIds.length / mission.workflowSteps.length) * 50);
      setMissionProcessScore(
        mission.id,
        Math.min(score, 100),
        100,
        diagnosisCorrect
          ? 'Correct one-shot diagnosis. You identified an edge-generation fault, not a sensor/counter hardware fault.'
          : 'Check whether sensor events are occurring but the CU path stays high. That pattern points to missing OSR/OSF logic.'
      );
    }

    if (mission.id === 'vfd-handshake-diagnosis' && mission.workflowSteps?.length && snapshot.vfdTrainer) {
      const completedWorkflowStepIds = missionStatuses[mission.id]?.completedWorkflowStepIds ?? [];
      const diagnosisCorrect = Boolean(snapshot.vfdTrainer.diagnosis?.correct);
      const score = (diagnosisCorrect ? 50 : 0) + Math.round((completedWorkflowStepIds.length / mission.workflowSteps.length) * 50);
      setMissionProcessScore(
        mission.id,
        Math.min(score, 100),
        100,
        diagnosisCorrect
          ? 'VFD handshake diagnosis is correct. This is the right field habit: read ready/fault/local before changing logic.'
          : 'Start with command vs ready/fault/local status. Most drive no-run faults are visible there.'
      );
    }

    if (mission.id === 'fieldbus-device-missing-diagnosis' && mission.workflowSteps?.length && snapshot.fieldbusTrainer) {
      const completedWorkflowStepIds = missionStatuses[mission.id]?.completedWorkflowStepIds ?? [];
      const diagnosisCorrect = Boolean(snapshot.fieldbusTrainer.diagnosis?.correct);
      const score = (diagnosisCorrect ? 50 : 0) + Math.round((completedWorkflowStepIds.length / mission.workflowSteps.length) * 50);
      setMissionProcessScore(
        mission.id,
        Math.min(score, 100),
        100,
        diagnosisCorrect
          ? 'Correct fieldbus diagnosis. Diagnostics-first workflow prevented unnecessary logic edits.'
          : 'Use diagnostics buffer + module/device status to separate power/link/name faults from channel faults and logic issues.'
      );
    }

    if (
      mission.id === 'multi-unit-shared-permit-diagnosis' &&
      mission.workflowSteps?.length &&
      snapshot.multiUnitTrainer
    ) {
      const completedWorkflowStepIds = missionStatuses[mission.id]?.completedWorkflowStepIds ?? [];
      const diagnosisCorrect = Boolean(snapshot.multiUnitTrainer.diagnosis?.correct);
      const score = (diagnosisCorrect ? 50 : 0) + Math.round((completedWorkflowStepIds.length / mission.workflowSteps.length) * 50);
      setMissionProcessScore(
        mission.id,
        Math.min(score, 100),
        100,
        diagnosisCorrect
          ? 'Correctly classified shared vs local fault. This is the key habit for clustered stoppage diagnosis.'
          : 'Check affected-unit pattern first, then shared permit state, then local unit permits.'
      );
    }

    if (mission.id === 'alarm-on-interlock-drop' && mission.workflowSteps?.length) {
      const completedWorkflowStepIds = missionStatuses[mission.id]?.completedWorkflowStepIds ?? [];
      const allStepsDone = mission.workflowSteps.every((step) =>
        completedWorkflowStepIds.includes(step.id)
      );
      const score = allStepsDone ? 100 : Math.round((completedWorkflowStepIds.length / mission.workflowSteps.length) * 100);
      setMissionProcessScore(
        mission.id,
        Math.min(score, 100),
        100,
        result.passed
          ? 'Full alarm cycle (latch → condition-clear → ack/reset) verified. This is how alarms should always be validated.'
          : 'Complete all three alarm phases: create fault, clear condition, then acknowledge. Each phase must be evidenced.'
      );
    }

    updateMissionResult(missionId, result.passed, result.message);
  };

  const applyMissionEvent = (event: SimulatorMissionEvent) => {
    const snapshot = getMissionSnapshot();
    missions.forEach((mission) => {
      let result = checkMissionEvent(mission, event, snapshot);
      if (!result) return;

      if (event.type === 'faultDiagnosisSubmitted' && mission.workflowSteps?.length) {
        const workflowSteps = mission.workflowSteps;
        const completedWorkflowStepIds = missionStatuses[mission.id]?.completedWorkflowStepIds ?? [];
        const workflowComplete = workflowSteps.every((step) =>
          completedWorkflowStepIds.includes(step.id)
        );
        const workflowEvidenceByStepId = missionStatuses[mission.id]?.workflowEvidenceByStepId ?? {};
        const capturedCount = workflowSteps.filter((step) => workflowEvidenceByStepId[step.id]).length;
        const baseScore =
          (event.correct ? 40 : 0) +
          Math.round((completedWorkflowStepIds.length / workflowSteps.length) * 40) +
          Math.round((capturedCount / workflowSteps.length) * 20);

        const scoreSummary = event.correct
          ? workflowComplete
            ? 'Correct diagnosis with completed workflow evidence. This matches a field-usable troubleshooting method.'
            : 'Correct diagnosis, but process evidence is incomplete. Repeat and capture the full diagnostic path.'
          : workflowComplete
            ? 'Workflow was followed, but root cause selection was wrong. Review fault domain clues and telemetry.'
            : 'Diagnosis was submitted before the evidence workflow was complete. Avoid guessing under pressure.';

        setMissionProcessScore(mission.id, Math.min(baseScore, 100), 100, scoreSummary);

        appendMissionTimelineEntry(mission.id, {
          kind: 'diagnosis',
          label: event.correct ? 'Diagnosis submitted: correct' : 'Diagnosis submitted: incorrect',
          detail: `Fault selected: ${event.faultId}. Workflow steps complete: ${completedWorkflowStepIds.length}/${workflowSteps.length}. Evidence captured: ${capturedCount}/${workflowSteps.length}.`,
          scan: snapshot.engineState.scanCount
        });

        if (!workflowComplete && result.passed) {
          const nextStep = workflowSteps.find(
            (step) => !completedWorkflowStepIds.includes(step.id)
          );
          result = {
            passed: false,
            message: nextStep
              ? `Diagnosis may be correct, but the guided workflow is incomplete. Next required step: ${nextStep.label}.`
              : 'Diagnosis submitted before completing the guided workflow.'
          };
        }
      }

      updateMissionResult(mission.id, result.passed, result.message);
    });
  };

  const submitSequenceDiagnosis = () => {
    const expected: SequenceDiagnosisSelection =
      sequenceTrainer.stallFaultId === 'tank_empty_switch_failed'
        ? 'step30-transition'
        : 'step20-transition';
    const correct = selectedSequenceDiagnosis === expected;
    setSequenceTrainer((prev) => ({
      ...prev,
      diagnosis: {
        selected: selectedSequenceDiagnosis,
        correct
      }
    }));

    appendMissionTimelineEntry('sequence-stall-diagnosis', {
      kind: 'diagnosis',
      label: correct ? 'Sequence diagnosis submitted: correct' : 'Sequence diagnosis submitted: incorrect',
      detail: `Selected "${sequenceDiagnosisLabel[selectedSequenceDiagnosis]}". Active step=${sequenceTrainer.activeStep}. Fault mode=${sequenceTrainer.stallFaultId}.`,
      scan: engineState.scanCount
    });

    if (selectedMissionId === 'sequence-stall-diagnosis') {
      window.setTimeout(() => checkSelectedMissionState('sequence-stall-diagnosis'), 0);
    }
  };

  const updateMissionEvidenceNotes = (
    missionId: string,
    patch: NonNullable<MissionStatus['evidenceNotes']>
  ) => {
    setMissionStatuses((prev) => {
      const current = prev[missionId] ?? { completed: false };
      return {
        ...prev,
        [missionId]: {
          ...current,
          evidenceNotes: patch
        }
      };
    });
  };

  const focusTargetSection: FocusSectionKey | null = useMemo(() => {
    const id = selectedMission?.id;
    if (!id) return null;
    if (id.includes('analog')) return 'analog';
    if (id.includes('one-shot') || id.includes('osr')) return 'oneshot';
    if (id.includes('sequence')) return 'sequence';
    if (id.includes('vfd')) return 'vfd';
    if (id.includes('fieldbus')) return 'fieldbus';
    if (id.includes('multi-unit')) return 'multi';
    if (id.includes('fault')) return 'faults';
    return 'core';
  }, [selectedMission]);

  const showSection = (section: FocusSectionKey): boolean => {
    if (focusMode === 'practice') return true;
    if (focusMode === 'field') {
      return section !== 'faults' || stageId >= 5;
    }
    if (focusMode === 'assessment') {
      // Keep the active trainer, mission panel, and minimal supporting telemetry visible.
      if (section === 'core') return stageId >= 2 && (focusTargetSection === 'core' || focusTargetSection === 'faults');
      return focusTargetSection ? section === focusTargetSection : false;
    }
    // Guided mode: progressively reveal only the mission-relevant trainer + core for early ladder missions.
    if (!focusTargetSection) return section === 'core';
    if (focusTargetSection === 'faults') return section === 'core' || section === 'faults';
    return section === focusTargetSection;
  };

  const focusModeHint =
    focusMode === 'guided'
      ? 'Shows only the simulator areas needed for the current mission to reduce overload.'
      : focusMode === 'assessment'
        ? 'Hides hints and nonessential sections for a stricter troubleshooting run.'
        : focusMode === 'field'
          ? 'Groups information by symptom, fault domain clues, evidence, and actions.'
          : 'Shows all tools and trainers for free practice.';

  const selectedMissionStatus = selectedMissionId ? missionStatuses[selectedMissionId] : undefined;
  const selectedMissionNextStep =
    selectedMission?.workflowSteps?.find(
      (step) => !(selectedMissionStatus?.completedWorkflowStepIds ?? []).includes(step.id)
    ) ?? null;

  const fieldModeSymptom = (() => {
    if (selectedMissionStatus?.evidenceNotes?.symptom?.trim()) return selectedMissionStatus.evidenceNotes.symptom.trim();
    if (stageId === 1) {
      return `Analog signal trainer active. Displayed=${analogTrainer.scaledEU.toFixed(1)}%, expected=${analogTrainer.expectedEU.toFixed(1)}%, loop=${analogTrainer.loopCurrentmA.toFixed(2)} mA.`;
    }
    if (stageId === 3 && sequenceTrainer.running) {
      return `Sequence running at Step ${sequenceTrainer.activeStep}. Check which transition is blocking progress.`;
    }
    if (stageId === 4 && focusTargetSection === 'fieldbus') {
      return `Remote device diagnostics issue: InputsValid=${fieldbusTrainer.remoteInputsValid ? 'TRUE' : 'FALSE'}, BusFault=${fieldbusTrainer.moduleBusFault ? 'TRUE' : 'FALSE'}.`;
    }
    if (stageId === 4 && focusTargetSection === 'vfd') {
      return `Drive handshake state: RunCmd=${vfdTrainer.controlCmdRun ? 'ON' : 'OFF'}, Ready=${vfdTrainer.statusReady ? 'ON' : 'OFF'}, Running=${vfdTrainer.statusRunning ? 'ON' : 'OFF'}, Fault=${vfdTrainer.statusFault ? 'ON' : 'OFF'}.`;
    }
    if (stageId === 6) {
      return `Clustered stoppage pattern: SharedPermit=${multiUnitTrainer.sharedPermit ? 'TRUE' : 'FALSE'}, A=${multiUnitTrainer.unitA.running ? 'RUN' : 'STOP'}, B=${multiUnitTrainer.unitB.running ? 'RUN' : 'STOP'}, C=${multiUnitTrainer.unitC.running ? 'RUN' : 'STOP'}.`;
    }
    if (activeFault) {
      return `Hidden fault practice active. Command/permit/output behavior may disagree due to ${activeFault.label} (not shown to learner during diagnosis).`;
    }
    return 'Observe the machine state, define the symptom clearly, then classify the likely fault domain before changing anything.';
  })();

  const likelyFaultDomains = (() => {
    if (selectedMissionStatus?.evidenceNotes?.likelyDomain?.trim()) {
      return [selectedMissionStatus.evidenceNotes.likelyDomain.trim()];
    }
    if (stageId === 1) return ['Analog loop wiring/power', 'Scaling/configuration', 'Instrumentation signal path'];
    if (focusTargetSection === 'vfd') return ['Drive status/local-remote', 'Drive fault/ready state', 'Logic command path'];
    if (focusTargetSection === 'fieldbus') return ['Power/link/device availability', 'PROFINET config/name mismatch', 'Remote module channel fault'];
    if (focusTargetSection === 'multi') return ['Shared utility/permit', 'Shared comms/device-ready', 'Local unit permit/device fault'];
    if (focusTargetSection === 'sequence') return ['Transition condition false', 'Sequence timing/timeout', 'Step-bit/state logic'];
    if (focusTargetSection === 'oneshot') return ['Edge-generation logic (OSR/OSF)', 'Sensor signal path', 'Counter instruction path'];
    if (stageId >= 2) return ['Electrical / input path', 'Logic / interlock path', 'Output / device feedback'];
    return ['Signal path', 'Configuration', 'Device state'];
  })();

  const evidenceSnapshotLines = (() => {
    const notes = selectedMissionStatus?.evidenceNotes;
    const lines: string[] = [];
    if (notes?.firstCheck?.trim()) lines.push(`First check: ${notes.firstCheck.trim()}`);
    if (notes?.confirmingEvidence?.trim()) lines.push(`Confirming evidence: ${notes.confirmingEvidence.trim()}`);
    if (selectedMissionStatus?.lastResult?.message) lines.push(`Mission status: ${selectedMissionStatus.lastResult.message}`);
    if (focusTargetSection === 'fieldbus') {
      lines.push(
        `Diag flags: BusFault=${fieldbusTrainer.moduleBusFault ? 'TRUE' : 'FALSE'}, ChannelFault=${fieldbusTrainer.moduleChannelFault ? 'TRUE' : 'FALSE'}, CyclicData=${fieldbusTrainer.cyclicDataExchange ? 'TRUE' : 'FALSE'}`
      );
    } else if (focusTargetSection === 'vfd') {
      lines.push(
        `Drive status: Ready=${vfdTrainer.statusReady ? 'TRUE' : 'FALSE'}, Fault=${vfdTrainer.statusFault ? 'TRUE' : 'FALSE'}, Local=${vfdTrainer.localMode ? 'TRUE' : 'FALSE'}, AtSpeed=${vfdTrainer.statusAtSpeed ? 'TRUE' : 'FALSE'}`
      );
    } else if (focusTargetSection === 'analog') {
      lines.push(
        `Loop=${analogTrainer.loopCurrentmA.toFixed(2)} mA, Raw=${analogTrainer.rawCounts}, Scaled=${analogTrainer.scaledEU.toFixed(1)}, Expected=${analogTrainer.expectedEU.toFixed(1)}`
      );
    } else if (focusTargetSection === 'sequence') {
      lines.push(
        `ActiveStep=${sequenceTrainer.activeStep}, LevelHigh=${sequenceTrainer.transitions.levelHigh}, MixTempOK=${sequenceTrainer.transitions.mixTemperatureOk}, MixTimerDN=${sequenceTrainer.transitions.mixTimerDn}, TankEmpty=${sequenceTrainer.transitions.tankEmpty}`
      );
    } else if (focusTargetSection === 'multi') {
      lines.push(
        `SharedPermit=${multiUnitTrainer.sharedPermit ? 'TRUE' : 'FALSE'} | A=${multiUnitTrainer.unitA.running ? 'RUN' : 'STOP'} B=${multiUnitTrainer.unitB.running ? 'RUN' : 'STOP'} C=${multiUnitTrainer.unitC.running ? 'RUN' : 'STOP'}`
      );
    } else {
      lines.push(
        `Permit=${engineState.runPermit ? 'TRUE' : 'FALSE'}, Motor=${engineState.motor ? 'ON' : 'OFF'}, Lamp=${engineState.lamp ? 'ON' : 'OFF'}, Valve=${engineState.valve ? 'ON' : 'OFF'}`
      );
    }
    return lines.slice(0, 4);
  })();

  const actionGuidanceLines = (() => {
    const lines: string[] = [];
    if (selectedMission) lines.push(`Mission: ${selectedMission.title}`);
    if (selectedMissionNextStep) lines.push(`Next workflow step: ${selectedMissionNextStep.label}`);
    else if (selectedMission?.workflowSteps?.length) lines.push('Workflow complete. Submit diagnosis or verify full restoration.');
    if (selectedMissionStatus?.processScore) {
      lines.push(
        `Process score: ${selectedMissionStatus.processScore.score}/${selectedMissionStatus.processScore.max} (${selectedMissionStatus.processScore.summary})`
      );
    }
    if (!selectedMission) lines.push('Select a simulator mission, define the symptom, and start with the least invasive check.');
    return lines.slice(0, 4);
  })();

  const fieldModeAnchors = {
    symptom:
      focusTargetSection === 'analog'
        ? 'sim-analog'
        : focusTargetSection === 'sequence'
          ? 'sim-sequence'
          : focusTargetSection === 'vfd'
            ? 'sim-vfd'
            : focusTargetSection === 'fieldbus'
              ? 'sim-fieldbus'
              : focusTargetSection === 'multi'
                ? 'sim-multi'
                : focusTargetSection === 'oneshot'
                  ? 'sim-oneshot'
                  : focusTargetSection === 'faults'
                    ? 'sim-faults'
                    : 'sim-core',
    domains:
      focusTargetSection === 'fieldbus'
        ? 'sim-fieldbus'
        : focusTargetSection === 'vfd'
          ? 'sim-vfd'
          : focusTargetSection === 'multi'
            ? 'sim-multi'
            : 'sim-fieldchecks',
    evidence:
      focusTargetSection === 'fieldbus'
        ? 'sim-fieldbus'
        : focusTargetSection === 'vfd'
          ? 'sim-vfd'
          : focusTargetSection === 'analog'
            ? 'sim-analog'
            : focusTargetSection === 'sequence'
              ? 'sim-sequence'
              : 'sim-timeline',
    actions: 'sim-missions',
    docs: 'sim-docs'
  } as const;

  // ── Stable handler callbacks for memoized children ──────────────────
  const handleResetMissionProgress = useCallback(() => setMissionStatuses({}), []);

  const handleAnalogSignalChange = useCallback(
    (percent: number) => updateAnalogTrainer(percent, analogTrainer.faultId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analogTrainer.faultId]
  );

  const handleVfdCommandRunToggle = useCallback(
    () => setVfdCommandRun(!vfdTrainer.controlCmdRun),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vfdTrainer.controlCmdRun]
  );

  const handleInjectRandomFault = useCallback(() => {
    setActiveCompoundScenarioId(null);
    const next = randomFault(availableFaults);
    setActiveFault(next);
    resetAll(next);
    deferAutoCapture('define-symptom');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableFaults]);

  const handleInjectSelectedFault = useCallback(() => {
    setActiveCompoundScenarioId(null);
    const chosen = availableFaults.find((fault) => fault.id === selectedFaultId);
    if (!chosen) return;
    setActiveFault(chosen);
    resetAll(chosen);
    deferAutoCapture('define-symptom');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableFaults, selectedFaultId]);

  const handleClearFault = useCallback(() => {
    setActiveCompoundScenarioId(null);
    setActiveFault(null);
    resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFaultDiagnosisSubmit = useCallback(
    (faultId: string, correct: boolean) => {
      addFaultAttempt(stageId, faultId, correct);
      applyMissionEvent({ type: 'faultDiagnosisSubmitted', faultId, correct });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stageId]
  );

  return (
    <Profiler id="SimulatorPanel" onRender={onRenderSimulator}>
    <Card title="Ladder Logic Simulator" className="space-y-4">
      {/* Mobile expand toggle */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <p className="text-xs text-theme-secondary">Tap to view simulator</p>
        <button
          type="button"
          className="rounded border border-theme-border px-2 py-1 text-xs text-theme-text"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div className={`${expanded ? 'block' : 'hidden'} space-y-4 sm:block`}>
        <div id="sim-missions" className="scroll-mt-24">
          <Profiler id="MissionPanel" onRender={onRenderMissions}>
          <SimulatorMissionPanel
            missions={missions}
            statuses={missionStatuses}
            selectedMissionId={selectedMissionId}
            onSelectMission={setSelectedMissionId}
            onCheckMission={checkSelectedMissionState}
            onResetMissionProgress={handleResetMissionProgress}
            onCaptureWorkflowStepEvidence={captureWorkflowStepEvidence}
            onResetWorkflowSteps={resetWorkflowSteps}
            onUpdateEvidenceNotes={updateMissionEvidenceNotes}
            presentationMode={focusMode}
          />
          </Profiler>
        </div>

        <div className="rounded border border-theme-border bg-theme-base p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-theme-secondary">
                Simulator Focus Mode
              </p>
              <p className="mt-1 text-xs text-theme-muted">{focusModeHint}</p>
              {selectedMission ? (
                <p className="mt-1 text-xs text-theme-secondary">
                  Current mission focus target:{' '}
                  <span className="text-amber-300">
                    {focusTargetSection === 'faults'
                      ? 'Fault diagnosis practice'
                      : focusTargetSection ?? 'General ladder core'}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ['guided', 'Beginner Guided'],
                ['practice', 'Practice'],
                ['assessment', 'Assessment'],
                ['field', 'Field Mode']
              ] as Array<[SimulatorFocusMode, string]>).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFocusMode(mode)}
                  className={`rounded border px-3 py-2 text-xs font-semibold transition-colors ${
                    focusMode === mode
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-theme-border text-theme-secondary hover:border-theme-border'
                  }`}
                  aria-pressed={focusMode === mode}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {focusMode === 'field' ? (
          <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                Field Mode Coach View
              </p>
              <span className="text-[11px] text-theme-secondary">
                Symptom {'->'} Domains {'->'} Evidence {'->'} Actions
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded border border-theme-border bg-theme-base/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-secondary">Symptom</p>
                  <button
                    type="button"
                    onClick={() => scrollToSimAnchor(fieldModeAnchors.symptom)}
                    className={jumpButtonClasses}
                  >
                    Open Source Panel
                  </button>
                </div>
                <p className="mt-2 text-xs text-theme-text">{fieldModeSymptom}</p>
              </div>
              <div className="rounded border border-theme-border bg-theme-base/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-secondary">
                    Likely Fault Domains
                  </p>
                  <button
                    type="button"
                    onClick={() => scrollToSimAnchor(fieldModeAnchors.domains)}
                    className={jumpButtonClasses}
                  >
                    Jump to Checks
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {likelyFaultDomains.map((domain) => (
                    <span
                      key={domain}
                      className="rounded border border-theme-border bg-theme-panel px-2 py-1 text-xs text-theme-text"
                    >
                      {domain}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded border border-theme-border bg-theme-base/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-secondary">
                    Evidence / Telemetry
                  </p>
                  <button
                    type="button"
                    onClick={() => scrollToSimAnchor(fieldModeAnchors.evidence)}
                    className={jumpButtonClasses}
                  >
                    View Evidence
                  </button>
                </div>
                <div className="mt-2 space-y-1">
                  {evidenceSnapshotLines.map((line, index) => (
                    <p key={`${index}-${line}`} className="text-xs text-theme-secondary">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded border border-theme-border bg-theme-base/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-secondary">
                    Actions / Workflow
                  </p>
                  <button
                    type="button"
                    onClick={() => scrollToSimAnchor(fieldModeAnchors.actions)}
                    className={jumpButtonClasses}
                  >
                    Open Mission Panel
                  </button>
                </div>
                <div className="mt-2 space-y-1">
                  {actionGuidanceLines.map((line, index) => (
                    <p key={`${index}-${line}`} className="text-xs text-theme-secondary">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded border border-theme-border bg-theme-base/80 p-3 lg:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-secondary">
                    Docs / Maps
                  </p>
                  <button
                    type="button"
                    onClick={() => scrollToSimAnchor(fieldModeAnchors.docs)}
                    className={jumpButtonClasses}
                  >
                    Open IO Map / Terminals
                  </button>
                </div>
                <p className="mt-2 text-xs text-theme-secondary">
                  Use the docs layer to trace the simulator like a real machine: device {'->'} terminal {'->'} channel {'->'} tag {'->'} ladder truth.
                </p>
                <p className="mt-1 text-xs text-theme-muted">
                  MVP docs include a simplified IO map, terminal strip/common notes, and stage-specific live reference snapshots.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div id="sim-timeline" className="scroll-mt-24">
          <MachineTimelineStrip entries={machineTimeline} />
        </div>

        <SimulatorDocsPanel
          stageId={stageId}
          inputs={inputs}
          engineState={engineState}
          lastScan={lastScan}
          activeFaultId={activeFault?.id ?? null}
          analogTrainer={analogTrainer}
          vfdTrainer={vfdTrainer}
          fieldbusTrainer={fieldbusTrainer}
        />

        {stageId === 1 && showSection('analog') ? (
          <Profiler id="AnalogTrainer" onRender={onRenderAnalog}>
          <AnalogTrainerSection
            analogTrainer={analogTrainer}
            selectedAnalogFaultId={selectedAnalogFaultId}
            selectedAnalogDiagnosis={selectedAnalogDiagnosis}
            onSignalChange={handleAnalogSignalChange}
            onFaultIdChange={setSelectedAnalogFaultId}
            onDiagnosisChange={setSelectedAnalogDiagnosis}
            onInjectFault={injectAnalogFault}
            onSubmitDiagnosis={submitAnalogDiagnosis}
            onAutoCapture={deferAutoCapture}
          />
          </Profiler>
        ) : null}

        {stageId >= 2 && showSection('core') ? (
          <div id="sim-core" className="scroll-mt-24 space-y-4">

        {/* ── Input Controls ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
            Input Controls
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                pulse('I_Start');
                deferAutoCapture('check-permits');
              }}
              className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Pulse Start
            </button>
            <button
              type="button"
              onClick={() => {
                pulse('I_Stop');
                deferAutoCapture('check-permits');
              }}
              className="rounded bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600"
            >
              Pulse Stop
            </button>
            <button
              type="button"
              onClick={() => {
                pulse('I_Pulse');
                deferAutoCapture('inspect-telemetry');
              }}
              className="rounded bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600"
            >
              Pulse Count
            </button>
            <button
              type="button"
              onClick={() => {
                pulse('I_Reset');
                deferAutoCapture('inspect-telemetry');
              }}
              className="rounded bg-theme-raised px-3 py-2 text-xs font-semibold text-theme-text hover:bg-theme-raised"
            >
              Pulse Reset
            </button>
            <button
              type="button"
              onClick={() => {
                pulse('I_AckAlarm');
                deferAutoCapture('inspect-telemetry');
              }}
              className="rounded bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600"
            >
              Ack Alarm
            </button>
            {/* Interlock toggle — stays on/off (not momentary) */}
            <button
              type="button"
              onClick={() => {
                toggleInterlock();
                deferAutoCapture('check-permits');
              }}
              className={`rounded border px-3 py-2 text-xs font-semibold text-white transition-colors ${
                inputs.I_Interlock
                  ? 'border-emerald-600 bg-emerald-800 hover:bg-emerald-700'
                  : 'border-rose-600 bg-rose-900 hover:bg-rose-800'
              }`}
            >
              Interlock: {inputs.I_Interlock ? 'CLOSED ✓' : 'OPEN ✗'}
            </button>
            <button
              type="button"
              onClick={() => resetAll()}
              className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
            >
              Reset Model
            </button>
          </div>
        </div>

        {/* ── Scan counter ───────────────────────────────────────────────── */}
        <p className="text-right text-xs text-theme-muted">
          Scan #{engineState.scanCount.toLocaleString()} — 100 ms cycle
        </p>

        {/* ── Rung Display ───────────────────────────────────────────────── */}
        <div className="grid gap-3 md:grid-cols-2">

          {/* Rung 1: Interlock Permit Gate */}
          <RungRow
            label="Rung 1 — Permit Gate: I_Interlock → RunPermit"
            active={lastScan.rungs.permitGate}
            onInspect={() => autoCaptureWorkflowEvidenceIfNext('check-permits')}
            glyphs={[
              { kind: 'contact', label: 'I_Interlock', active: lastScan.contacts.interlock, style: 'no' },
              { kind: 'coil', label: 'RunPermit', active: engineState.runPermit }
            ]}
          >
            <BoolBadge label="Interlock" active={lastScan.contacts.interlock} />
            <span className="text-amber-400">→</span>
            <BoolBadge label="RunPermit" active={engineState.runPermit} />
            <span className="text-xs text-theme-muted w-full mt-1">
              RunPermit gates the motor rung — interlock open drops permit immediately.
            </span>
          </RungRow>

          {/* Rung 2: Start/Stop Seal-In (gated by RunPermit) */}
          <RungRow
            label="Rung 2 — Seal-In: (Start OR Motor) AND NOT Stop AND Permit → Motor"
            active={lastScan.rungs.sealIn}
            onInspect={() => autoCaptureWorkflowEvidenceIfNext('read-rung-truth')}
            glyphs={[
              { kind: 'contact', label: 'Start', active: lastScan.contacts.start, style: 'no' },
              { kind: 'op', label: 'OR', active: true },
              { kind: 'contact', label: 'Motor', active: lastScan.contacts.motorSeal, style: 'no' },
              { kind: 'contact', label: 'Stop', active: lastScan.contacts.stopNC, style: 'nc' },
              { kind: 'contact', label: 'Permit', active: engineState.runPermit, style: 'no' },
              { kind: 'coil', label: 'Motor', active: engineState.motor }
            ]}
          >
            <BoolBadge label="Start" active={lastScan.contacts.start} />
            <span className="text-amber-400">OR</span>
            <BoolBadge label="Motor Seal" active={lastScan.contacts.motorSeal} />
            <span className="text-amber-400">AND</span>
            <BoolBadge label="Stop NC" active={lastScan.contacts.stopNC} />
            <span className="text-amber-400">AND</span>
            <BoolBadge label="RunPermit" active={engineState.runPermit} />
            <span className="text-amber-400">→</span>
            <BoolBadge label="Motor" active={engineState.motor} />
          </RungRow>

          {/* Rung 3: TON Timer */}
          <RungRow
            label="Rung 3 — Timer: Motor → TON T1 (3 s); T1.DN → Lamp"
            active={lastScan.rungs.timerEnable}
            onInspect={() => autoCaptureWorkflowEvidenceIfNext('inspect-telemetry')}
            glyphs={[
              { kind: 'contact', label: 'Motor', active: engineState.motor, style: 'no' },
              { kind: 'op', label: 'TON T1', active: engineState.timer.en },
              { kind: 'contact', label: 'T1.DN', active: engineState.timer.dn, style: 'no' },
              { kind: 'coil', label: 'Lamp', active: engineState.lamp }
            ]}
          >
            <BoolBadge label="Motor" active={engineState.motor} />
            <span className="text-amber-400">→</span>
            <BoolBadge label="T1.EN" active={engineState.timer.en} />
            <BoolBadge label="T1.DN" active={engineState.timer.dn} />
            <span className="text-amber-400">→</span>
            <BoolBadge label="Lamp" active={engineState.lamp} />
            <span className="text-xs text-theme-secondary w-full mt-1">
              T1 ACC / PRE: {formattedTimer}
            </span>
          </RungRow>

          {/* Rung 4: CTU Counter */}
          <RungRow
            label="Rung 4 — Counter: Pulse ↑ → CTU C1 (PV 5); C1.DN → Valve"
            active={lastScan.rungs.counter}
            onInspect={() => autoCaptureWorkflowEvidenceIfNext('inspect-telemetry')}
            glyphs={[
              { kind: 'contact', label: 'Pulse', active: lastScan.contacts.pulse, style: 'no' },
              { kind: 'op', label: 'CTU C1', active: lastScan.rungs.counter },
              { kind: 'contact', label: 'C1.DN', active: engineState.counter.dn, style: 'no' },
              { kind: 'coil', label: 'Valve', active: engineState.valve }
            ]}
          >
            <BoolBadge label="Pulse" active={lastScan.contacts.pulse} />
            <span className="text-amber-400">↑ edge</span>
            <BoolBadge label="Rising Edge" active={lastScan.rungs.counter} />
            <span className="text-amber-400">→</span>
            <BoolBadge label="C1.DN" active={engineState.counter.dn} />
            <span className="text-amber-400">→</span>
            <BoolBadge label="Valve" active={engineState.valve} />
            <span className="text-xs text-theme-secondary w-full mt-1">
              C1 ACC / PV: {engineState.counter.acc} / {engineState.counter.preset}
            </span>
          </RungRow>

          {/* Rung 5: Alarm Latch — visible from Stage 3 onward */}
          {stageId >= 3 && (
            <div className="md:col-span-2">
              <RungRow
                label="Rung 5 — Alarm Latch: (Runaway OR Interlock Violation) SET Alarm; (Ack + Cond Clear) RESET Alarm"
                active={lastScan.rungs.alarmDetect || engineState.alarm}
                onInspect={() => autoCaptureWorkflowEvidenceIfNext('read-rung-truth')}
                glyphs={[
                  { kind: 'contact', label: 'AlarmCond', active: lastScan.contacts.alarmCondition, style: 'no' },
                  { kind: 'op', label: 'SET/RESET', active: engineState.alarm || lastScan.contacts.alarmCondition },
                  { kind: 'coil', label: 'Alarm', active: engineState.alarm }
                ]}
              >
                <BoolBadge label="AlarmCond" active={lastScan.contacts.alarmCondition} />
                <span className="text-amber-400">SET / RESET →</span>
                <BoolBadge label="Alarm Latched" active={engineState.alarm} />
                <span className="text-xs text-theme-muted w-full mt-1">
                  Alarm sets when motor output disagrees with seal-in command (runaway) or motor was
                  running when interlock opened. Press Ack Alarm after condition clears to reset.
                </span>
              </RungRow>
            </div>
          )}
        </div>

        {/* ── Output Summary ─────────────────────────────────────────────── */}
        <div className="rounded border border-theme-border bg-theme-base p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-theme-muted">
            Output States
          </p>
          <div className="flex flex-wrap gap-2">
            <BoolBadge label="Motor" active={engineState.motor} />
            <BoolBadge label="Lamp" active={engineState.lamp} />
            <BoolBadge label="Valve" active={engineState.valve} />
            {stageId >= 3 && <BoolBadge label="Alarm" active={engineState.alarm} />}
          </div>
        </div>

        <Profiler id="ProcessView" onRender={onRenderProcess}>
        <ProcessSystemView
          motorOn={engineState.motor}
          inletValveOpen={engineState.motor}
          outletValveOpen={engineState.valve}
          tankLevelPct={processTankLevelPct}
          alarmOn={stageId >= 3 ? engineState.alarm : undefined}
        />
        </Profiler>

        {/* ── Field Checks Panel (Stage 2+) ────────────────────────────────── */}
        {stageId >= 2 ? (
          <div id="sim-fieldchecks" className="scroll-mt-24">
            <Profiler id="FieldChecks" onRender={onRenderFieldChecks}>
            <FieldChecksPanel
              inputs={inputs}
              engineState={engineState}
              lastScan={lastScan}
              activeFaultId={activeFault?.id ?? null}
            />
            </Profiler>
          </div>
        ) : null}

        {stageId === 2 ? (
          <div id="sim-oneshot" className="scroll-mt-24 space-y-3 rounded border border-theme-border bg-theme-base p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
              One-Shot / Edge Counter Trainer
            </p>
            <p className="text-xs text-theme-secondary">
              Diagnose a counter that stops counting because a latched bit is driving the CU path instead of an OSR/OSF one-shot pulse.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
                <p className="text-xs font-semibold text-theme-secondary">Signals and Count</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <BoolBadge label="Sensor Pulse" active={oneShotTrainer.partSensorPulse} />
                  <BoolBadge label="Latched PartSeen" active={oneShotTrainer.latchedPartSeen} />
                  <BoolBadge label="CTU.CU" active={oneShotTrainer.cuSignal} />
                </div>
                <p className="mt-2 text-xs text-theme-secondary">
                  Simulated parts: {oneShotTrainer.simulatedPartCount} | Counter ACC/PV: {oneShotTrainer.counterAcc}/{oneShotTrainer.counterPreset}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      pulseOneShotPart();
                      deferAutoCapture('osr-define-symptom');
                    }}
                    className="rounded bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600"
                  >
                    Simulate Part Pulse
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetOneShotTrainer(oneShotTrainer.faultMode);
                      deferAutoCapture('osr-check-cu-path');
                    }}
                    className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
                  >
                    Reset One-Shot Trainer
                  </button>
                </div>
              </div>

              <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
                <p className="text-xs font-semibold text-theme-secondary">CU Path (Ladder-Style)</p>
                <LadderGraphic
                  active={oneShotTrainer.faultMode === 'sealed_bit_instead_of_osr'}
                  glyphs={[
                    { kind: 'contact', label: 'PartSensor', active: oneShotTrainer.partSensorPulse, style: 'no' },
                    { kind: 'op', label: 'Seal PartSeen (fault)', active: oneShotTrainer.latchedPartSeen },
                    { kind: 'contact', label: 'PartSeen', active: oneShotTrainer.latchedPartSeen, style: 'no' },
                    { kind: 'op', label: 'CTU.CU', active: oneShotTrainer.cuSignal }
                  ]}
                />
                <LadderGraphic
                  active={oneShotTrainer.faultMode === 'none'}
                  glyphs={[
                    { kind: 'contact', label: 'PartSensor', active: oneShotTrainer.partSensorPulse, style: 'no' },
                    { kind: 'op', label: 'OSR', active: oneShotTrainer.cuSignal },
                    { kind: 'op', label: 'CTU.CU', active: oneShotTrainer.cuSignal }
                  ]}
                />
                <div className="mt-2">
                  <select
                    className="w-full rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
                    value={oneShotTrainer.faultMode}
                    onChange={(event) => resetOneShotTrainer(event.target.value as OneShotTrainerState['faultMode'])}
                    aria-label="One-shot trainer mode"
                  >
                    <option value="sealed_bit_instead_of_osr">Faulted: latched PartSeen drives CTU (missing one-shot)</option>
                    <option value="none">Healthy: OSR pulse drives CTU</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
              <p className="text-xs font-semibold text-theme-secondary">One-Shot Fault Diagnosis</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
                  value={selectedOneShotDiagnosis}
                  onChange={(event) => setSelectedOneShotDiagnosis(event.target.value as OneShotDiagnosisSelection)}
                  aria-label="One-shot diagnosis"
                >
                  <option value="needs_one_shot">{oneShotDiagnosisLabel.needs_one_shot}</option>
                  <option value="sensor_failed">{oneShotDiagnosisLabel.sensor_failed}</option>
                  <option value="counter_bad">{oneShotDiagnosisLabel.counter_bad}</option>
                  <option value="unknown">{oneShotDiagnosisLabel.unknown}</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    deferAutoCapture('osr-differentiate-root-cause');
                    submitOneShotDiagnosis();
                  }}
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
                >
                  Submit One-Shot Diagnosis
                </button>
                {oneShotTrainer.diagnosis ? (
                  <span
                    className={`rounded px-2 py-2 text-xs ${
                      oneShotTrainer.diagnosis.correct
                        ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border border-rose-500/40 bg-rose-500/10 text-rose-300'
                    }`}
                  >
                    {oneShotTrainer.diagnosis.correct ? 'Correct diagnosis' : 'Incorrect diagnosis'}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
          </div>
        ) : null}

        {stageId === 4 && (showSection('vfd') || showSection('fieldbus')) ? (
          <Profiler id="VfdFieldbus" onRender={onRenderVfdFieldbus}>
          <VfdFieldbusTrainerSection
            vfdTrainer={vfdTrainer}
            selectedVfdFaultId={selectedVfdFaultId}
            selectedVfdDiagnosis={selectedVfdDiagnosis}
            onVfdCommandRunToggle={handleVfdCommandRunToggle}
            onVfdPulseReset={pulseVfdReset}
            onVfdSpeedRefChange={setVfdSpeedRef}
            onVfdFaultIdChange={setSelectedVfdFaultId}
            onVfdDiagnosisChange={setSelectedVfdDiagnosis}
            onInjectVfdFault={applyVfdFault}
            onResetVfdTrainer={resetVfdTrainer}
            onSubmitVfdDiagnosis={submitVfdDiagnosis}
            fieldbusTrainer={fieldbusTrainer}
            selectedFieldbusFaultId={selectedFieldbusFaultId}
            selectedFieldbusDiagnosis={selectedFieldbusDiagnosis}
            onFieldbusFaultIdChange={setSelectedFieldbusFaultId}
            onFieldbusDiagnosisChange={setSelectedFieldbusDiagnosis}
            onInjectFieldbusFault={applyFieldbusFault}
            onResetFieldbusTrainer={resetFieldbusTrainer}
            onSubmitFieldbusDiagnosis={submitFieldbusDiagnosis}
            intDemoValue={intDemoValue}
            setIntDemoValue={setIntDemoValue}
            realTolerance={realTolerance}
            setRealTolerance={setRealTolerance}
            showSection={showSection}
            focusMode={focusMode}
            onAutoCapture={deferAutoCapture}
          />
          </Profiler>
        ) : null}

        {/* ── Sequence Trainer (Stage 3) ─────────────────────────────────── */}
        {stageId === 3 && showSection('sequence') ? (
          <Profiler id="SequenceTrainer" onRender={onRenderSequence}>
          <SequenceTrainerSection
            sequenceTrainer={sequenceTrainer}
            selectedSequenceFaultId={selectedSequenceFaultId}
            selectedSequenceDiagnosis={selectedSequenceDiagnosis}
            onSequenceFaultIdChange={setSelectedSequenceFaultId}
            onSequenceDiagnosisChange={setSelectedSequenceDiagnosis}
            onStartSequence={startSequenceTrainer}
            onResetSequenceTrainer={resetSequenceTrainer}
            onSubmitSequenceDiagnosis={submitSequenceDiagnosis}
            onAutoCapture={deferAutoCapture}
          />
          </Profiler>
        ) : null}

        {stageId === 6 && showSection('multi') ? (
          <Profiler id="MultiUnitTrainer" onRender={onRenderMultiUnit}>
          <MultiUnitTrainerSection
            multiUnitTrainer={multiUnitTrainer}
            selectedMultiUnitFaultId={selectedMultiUnitFaultId}
            selectedMultiUnitDiagnosis={selectedMultiUnitDiagnosis}
            onMultiUnitFaultIdChange={setSelectedMultiUnitFaultId}
            onMultiUnitDiagnosisChange={setSelectedMultiUnitDiagnosis}
            onInjectMultiUnitFault={injectMultiUnitFault}
            onResetMultiUnitTrainer={resetMultiUnitTrainer}
            onSubmitMultiUnitDiagnosis={submitMultiUnitDiagnosis}
            onAutoCapture={deferAutoCapture}
          />
          </Profiler>
        ) : null}

        {/* ── Fault Injection (Stage 5+) ─────────────────────────────────── */}
        {(stageId >= 5 || Boolean(activeFault) || Boolean(faultQueryParam)) && showSection('faults') ? (
          <Profiler id="FaultPractice" onRender={onRenderFaults}>
          <FaultPracticeSection
            activeFault={activeFault}
            availableFaults={availableFaults}
            selectedFaultId={selectedFaultId}
            selectedCompoundScenarioId={selectedCompoundScenarioId}
            activeCompoundScenarioId={activeCompoundScenarioId}
            stageId={stageId}
            onSelectedFaultIdChange={setSelectedFaultId}
            onSelectedCompoundScenarioIdChange={setSelectedCompoundScenarioId}
            onActivateCompoundScenario={activateCompoundFaultScenario}
            onClearCompoundScenario={clearCompoundFaultScenario}
            onInjectRandomFault={handleInjectRandomFault}
            onInjectSelectedFault={handleInjectSelectedFault}
            onClearFault={handleClearFault}
            onFaultDiagnosisSubmit={handleFaultDiagnosisSubmit}
          />
          </Profiler>
        ) : null}
      </div>
    </Card>
    </Profiler>
  );
};
