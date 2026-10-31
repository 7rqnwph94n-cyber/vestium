import { memo } from 'react';
import { BoolBadge } from './BoolBadge';
import {
  vfdDiagnosisLabel,
  type VfdDiagnosisSelection,
  type VfdFaultId,
  type VfdTrainerState
} from './vfdTrainer';
import {
  fieldbusDiagnosisLabel,
  type FieldbusDiagnosisSelection,
  type FieldbusFaultId,
  type FieldbusTrainerState
} from './fieldbusTrainer';

type FocusSectionKey =
  | 'core'
  | 'analog'
  | 'oneshot'
  | 'sequence'
  | 'vfd'
  | 'fieldbus'
  | 'multi'
  | 'faults';

const wrapInt16 = (value: number): number => {
  const normalized = ((((Math.trunc(value) + 32768) % 65536) + 65536) % 65536) - 32768;
  return normalized;
};

export interface VfdFieldbusTrainerSectionProps {
  vfdTrainer: VfdTrainerState;
  selectedVfdFaultId: VfdFaultId;
  selectedVfdDiagnosis: VfdDiagnosisSelection;
  onVfdCommandRunToggle: () => void;
  onVfdPulseReset: () => void;
  onVfdSpeedRefChange: (hz: number) => void;
  onVfdFaultIdChange: (faultId: VfdFaultId) => void;
  onVfdDiagnosisChange: (diagnosis: VfdDiagnosisSelection) => void;
  onInjectVfdFault: (faultId: VfdFaultId) => void;
  onResetVfdTrainer: () => void;
  onSubmitVfdDiagnosis: () => void;

  fieldbusTrainer: FieldbusTrainerState;
  selectedFieldbusFaultId: FieldbusFaultId;
  selectedFieldbusDiagnosis: FieldbusDiagnosisSelection;
  onFieldbusFaultIdChange: (faultId: FieldbusFaultId) => void;
  onFieldbusDiagnosisChange: (diagnosis: FieldbusDiagnosisSelection) => void;
  onInjectFieldbusFault: (faultId: FieldbusFaultId) => void;
  onResetFieldbusTrainer: () => void;
  onSubmitFieldbusDiagnosis: () => void;

  intDemoValue: number;
  setIntDemoValue: React.Dispatch<React.SetStateAction<number>>;
  realTolerance: number;
  setRealTolerance: React.Dispatch<React.SetStateAction<number>>;

  showSection: (section: FocusSectionKey) => boolean;
  focusMode: string;
  onAutoCapture: (key: string) => void;
}

export const VfdFieldbusTrainerSection = memo(function VfdFieldbusTrainerSection({
  vfdTrainer,
  selectedVfdFaultId,
  selectedVfdDiagnosis,
  onVfdCommandRunToggle,
  onVfdPulseReset,
  onVfdSpeedRefChange,
  onVfdFaultIdChange,
  onVfdDiagnosisChange,
  onInjectVfdFault,
  onResetVfdTrainer,
  onSubmitVfdDiagnosis,

  fieldbusTrainer,
  selectedFieldbusFaultId,
  selectedFieldbusDiagnosis,
  onFieldbusFaultIdChange,
  onFieldbusDiagnosisChange,
  onInjectFieldbusFault,
  onResetFieldbusTrainer,
  onSubmitFieldbusDiagnosis,

  intDemoValue,
  setIntDemoValue,
  realTolerance,
  setRealTolerance,

  showSection,
  focusMode,
  onAutoCapture
}: VfdFieldbusTrainerSectionProps) { return (
  <div id="sim-vfd" className="scroll-mt-24 space-y-3 rounded border border-theme-border bg-theme-base p-3">
    <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
      VFD Handshake Trainer
    </p>
    <p className="text-xs text-theme-secondary">
      Command a virtual drive and diagnose no-run behavior using ready, running, at-speed, fault, and local/remote status.
    </p>
    {showSection('vfd') ? (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
        <p className="text-xs font-semibold text-theme-secondary">controller Commands</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              onVfdCommandRunToggle();
              onAutoCapture('vfd-define-symptom');
            }}
            className={`rounded px-3 py-2 text-xs font-semibold text-white ${
              vfdTrainer.controlCmdRun ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-theme-raised hover:bg-theme-raised'
            }`}
          >
            controller Run Cmd: {vfdTrainer.controlCmdRun ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => {
              onVfdPulseReset();
              onAutoCapture('vfd-check-ready-fault');
            }}
            className="rounded bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600"
          >
            Pulse Drive Reset
          </button>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <label htmlFor="vfd-speed-ref" className="text-xs text-theme-secondary">
              Speed Reference
            </label>
            <span className="text-xs text-amber-300">{vfdTrainer.speedRefHz.toFixed(1)} Hz</span>
          </div>
          <input
            id="vfd-speed-ref"
            type="range"
            min={0}
            max={60}
            step={1}
            value={vfdTrainer.speedRefHz}
            onChange={(event) => {
              onVfdSpeedRefChange(Number(event.target.value));
              onAutoCapture('vfd-define-symptom');
            }}
            className="mt-2 w-full"
          />
        </div>
      </div>

      <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
        <p className="text-xs font-semibold text-theme-secondary">Drive Status & Fault Injection</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <BoolBadge label="Ready" active={vfdTrainer.statusReady} />
          <BoolBadge label="Running" active={vfdTrainer.statusRunning} />
          <BoolBadge label="AtSpeed" active={vfdTrainer.statusAtSpeed} />
          <BoolBadge label="Fault" active={vfdTrainer.statusFault} />
          <BoolBadge label="LocalMode" active={vfdTrainer.localMode} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={selectedVfdFaultId}
            onChange={(event) => onVfdFaultIdChange(event.target.value as VfdFaultId)}
            className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
            aria-label="Choose VFD fault"
          >
            <option value="local_mode">LOCAL mode</option>
            <option value="dc_bus_fault">DC bus fault</option>
            <option value="not_ready">Not ready (no fault)</option>
            <option value="none">Healthy drive</option>
          </select>
          <button
            type="button"
            onClick={() => {
              onInjectVfdFault(selectedVfdFaultId);
              onAutoCapture('vfd-check-ready-fault');
            }}
            className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            Inject VFD Fault
          </button>
          <button
            type="button"
            onClick={onResetVfdTrainer}
            className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
          >
            Reset VFD Trainer
          </button>
        </div>
      </div>
    </div>
    ) : null}

    {showSection('vfd') ? (
    <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
      <p className="text-xs font-semibold text-theme-secondary">VFD No-Run Diagnosis</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          value={selectedVfdDiagnosis}
          onChange={(event) => onVfdDiagnosisChange(event.target.value as VfdDiagnosisSelection)}
          className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
          aria-label="VFD diagnosis"
        >
          <option value="local_mode">{vfdDiagnosisLabel.local_mode}</option>
          <option value="drive_fault">{vfdDiagnosisLabel.drive_fault}</option>
          <option value="ready_missing">{vfdDiagnosisLabel.ready_missing}</option>
          <option value="logic_fault">{vfdDiagnosisLabel.logic_fault}</option>
          <option value="unknown">{vfdDiagnosisLabel.unknown}</option>
        </select>
        <button
          type="button"
          onClick={onSubmitVfdDiagnosis}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
        >
          Submit VFD Diagnosis
        </button>
        {vfdTrainer.diagnosis ? (
          <span
            className={`rounded px-2 py-2 text-xs ${
              vfdTrainer.diagnosis.correct
                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {vfdTrainer.diagnosis.correct ? 'Correct diagnosis' : 'Incorrect diagnosis'}
          </span>
        ) : null}
      </div>
    </div>
    ) : null}

    {showSection('fieldbus') ? (
    <div id="sim-fieldbus" className="scroll-mt-24 rounded border border-theme-border bg-theme-panel/60 p-3">
      <p className="text-xs font-semibold text-theme-secondary">Fieldbus / PROFINET Device Diagnostics Trainer</p>
      <p className="mt-1 text-xs text-theme-muted">
        Diagnose missing remote data/ready bits using diagnostics buffer, module status, and device availability checks before touching logic.
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <button
          type="button"
          onClick={() => onAutoCapture('fieldbus-check-diagnostics')}
          className="rounded border border-theme-border bg-theme-base p-3 text-left hover:border-theme-border"
        >
          <p className="text-xs font-semibold text-theme-secondary">Diagnostics Buffer (Simulated)</p>
          <div className="mt-2 space-y-1 text-[11px] font-mono text-theme-secondary">
            {fieldbusTrainer.diagnosticsBuffer.map((line, idx) => (
              <p key={`${idx}-${line}`}>{line}</p>
            ))}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onAutoCapture('fieldbus-check-device-availability')}
          className="rounded border border-theme-border bg-theme-base p-3 text-left hover:border-theme-border"
        >
          <p className="text-xs font-semibold text-theme-secondary">Device / Module Status</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <BoolBadge label="controller RunCmd" active={fieldbusTrainer.controlRunCommand} />
            <BoolBadge label="Remote Inputs Valid" active={fieldbusTrainer.remoteInputsValid} />
            <BoolBadge label="DriveReady Bit" active={fieldbusTrainer.driveReadyBit} />
            <BoolBadge label="Bus Fault" active={fieldbusTrainer.moduleBusFault} />
            <BoolBadge label="Channel Fault" active={fieldbusTrainer.moduleChannelFault} />
            <BoolBadge label="Dev Power" active={fieldbusTrainer.devicePower} />
            <BoolBadge label="Link" active={fieldbusTrainer.networkLink} />
            <BoolBadge label="Name Match" active={fieldbusTrainer.deviceNameMatch} />
            <BoolBadge label="Cyclic Data" active={fieldbusTrainer.cyclicDataExchange} />
          </div>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={selectedFieldbusFaultId}
          onChange={(event) => onFieldbusFaultIdChange(event.target.value as FieldbusFaultId)}
          className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
          aria-label="Choose fieldbus fault"
        >
          <option value="device_power_loss">Device power loss (missing remote station)</option>
          <option value="network_link_down">Network link/device unreachable</option>
          <option value="name_mismatch">PROFINET device name/config mismatch</option>
          <option value="module_channel_fault">Remote module channel fault (comms healthy)</option>
          <option value="none">Healthy</option>
        </select>
        <button
          type="button"
          onClick={() => {
            onInjectFieldbusFault(selectedFieldbusFaultId);
            onAutoCapture('fieldbus-define-symptom');
          }}
          className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
        >
          Inject Fieldbus Fault
        </button>
        <button
          type="button"
          onClick={onResetFieldbusTrainer}
          className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
        >
          Reset Fieldbus Trainer
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={selectedFieldbusDiagnosis}
          onChange={(event) => onFieldbusDiagnosisChange(event.target.value as FieldbusDiagnosisSelection)}
          className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
          aria-label="Fieldbus diagnosis"
        >
          <option value="power_link_fault">{fieldbusDiagnosisLabel.power_link_fault}</option>
          <option value="profinet_config_fault">{fieldbusDiagnosisLabel.profinet_config_fault}</option>
          <option value="channel_fault">{fieldbusDiagnosisLabel.channel_fault}</option>
          <option value="logic_fault">{fieldbusDiagnosisLabel.logic_fault}</option>
          <option value="unknown">{fieldbusDiagnosisLabel.unknown}</option>
        </select>
        <button
          type="button"
          onClick={onSubmitFieldbusDiagnosis}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
        >
          Submit Fieldbus Diagnosis
        </button>
        {fieldbusTrainer.diagnosis ? (
          <span
            className={`rounded px-2 py-2 text-xs ${
              fieldbusTrainer.diagnosis.correct
                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {fieldbusTrainer.diagnosis.correct ? 'Correct diagnosis' : 'Incorrect diagnosis'}
          </span>
        ) : null}
      </div>
    </div>
    ) : null}

    {focusMode !== 'guided' && focusMode !== 'assessment' ? (
    <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
      <p className="text-xs font-semibold text-theme-secondary">Data Type Lab (INT / REAL)</p>
      <p className="mt-1 text-xs text-theme-muted">
        Live demonstration of signed INT overflow wraparound and REAL comparison tolerance behavior.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-theme-border bg-theme-base p-3">
          <p className="text-xs font-semibold text-theme-secondary">INT Overflow Demo (16-bit signed)</p>
          <p className="mt-1 text-xs text-theme-secondary">
            Current INT value: <span className="font-mono text-amber-300">{intDemoValue}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIntDemoValue((prev) => wrapInt16(prev + 1))}
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              +1
            </button>
            <button
              type="button"
              onClick={() => setIntDemoValue((prev) => wrapInt16(prev + 10))}
              className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
            >
              +10
            </button>
            <button
              type="button"
              onClick={() => setIntDemoValue(32760)}
              className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
            >
              Reset Near Max
            </button>
          </div>
          <p className="mt-2 text-xs text-theme-muted">
            Increment past <span className="font-mono">32767</span> to watch wrap to{' '}
            <span className="font-mono">-32768</span>.
          </p>
        </div>

        <div className="rounded border border-theme-border bg-theme-base p-3">
          <p className="text-xs font-semibold text-theme-secondary">REAL Precision / Compare Demo</p>
          <p className="mt-1 text-xs text-theme-secondary">
            `0.1 + 0.2` ={' '}
            <span className="font-mono text-theme-text">{(0.1 + 0.2).toPrecision(17)}</span>
          </p>
          <p className="mt-1 text-xs text-theme-secondary">
            Exact compare to `0.3`: {' '}
            <span className={(0.1 + 0.2 === 0.3) ? 'text-emerald-300' : 'text-rose-300'}>
              {(0.1 + 0.2 === 0.3) ? 'TRUE' : 'FALSE'}
            </span>
          </p>
          <div className="mt-2">
            <div className="flex items-center justify-between">
              <label htmlFor="real-tol" className="text-xs text-theme-secondary">
                Tolerance
              </label>
              <span className="font-mono text-xs text-amber-300">{realTolerance.toFixed(6)}</span>
            </div>
            <input
              id="real-tol"
              type="range"
              min={0}
              max={0.01}
              step={0.0001}
              value={realTolerance}
              onChange={(event) => setRealTolerance(Number(event.target.value))}
              className="mt-2 w-full"
            />
          </div>
          <p className="mt-2 text-xs text-theme-secondary">
            Absolute error: <span className="font-mono">{Math.abs((0.1 + 0.2) - 0.3).toExponential(3)}</span>
          </p>
          <p className="mt-1 text-xs text-theme-secondary">
            Tolerance compare (`ABS(error) {'<='} tol`):{' '}
            <span
              className={
                Math.abs((0.1 + 0.2) - 0.3) <= realTolerance
                  ? 'text-emerald-300'
                  : 'text-rose-300'
              }
            >
              {Math.abs((0.1 + 0.2) - 0.3) <= realTolerance ? 'TRUE' : 'FALSE'}
            </span>
          </p>
        </div>
      </div>
    </div>
    ) : null}
  </div>
  ); });
