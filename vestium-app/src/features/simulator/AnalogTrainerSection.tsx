import { memo } from 'react';
import {
  analogDiagnosisLabel,
  type AnalogDiagnosisSelection,
  type AnalogFaultId,
  type AnalogTrainerState
} from './analogTrainer';

export interface AnalogTrainerSectionProps {
  analogTrainer: AnalogTrainerState;
  selectedAnalogFaultId: AnalogFaultId;
  selectedAnalogDiagnosis: AnalogDiagnosisSelection;
  onSignalChange: (percent: number) => void;
  onFaultIdChange: (faultId: AnalogFaultId) => void;
  onDiagnosisChange: (diagnosis: AnalogDiagnosisSelection) => void;
  onInjectFault: (faultId: AnalogFaultId) => void;
  onSubmitDiagnosis: () => void;
  onAutoCapture: (key: string) => void;
}

export const AnalogTrainerSection = memo(function AnalogTrainerSection({
  analogTrainer,
  selectedAnalogFaultId,
  selectedAnalogDiagnosis,
  onSignalChange,
  onFaultIdChange,
  onDiagnosisChange,
  onInjectFault,
  onSubmitDiagnosis,
  onAutoCapture
}: AnalogTrainerSectionProps) {
  return (
  <div id="sim-analog" className="scroll-mt-24 space-y-3 rounded border border-theme-border bg-theme-base p-3">
    <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
      Analog Signal Trainer (4-20 mA)
    </p>
    <p className="text-xs text-theme-secondary">
      Practice reading loop current, raw counts, and scaled engineering units. Inject a fault, classify it, and use evidence instead of guessing.
    </p>

    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="analog-signal" className="text-xs font-semibold text-theme-secondary">
            Simulated Process Signal (%)
          </label>
          <span className="text-xs text-amber-300">{analogTrainer.signalPercent.toFixed(0)}%</span>
        </div>
        <input
          id="analog-signal"
          type="range"
          min={0}
          max={100}
          step={1}
          value={analogTrainer.signalPercent}
          onChange={(event) => {
            onSignalChange(Number(event.target.value));
            onAutoCapture('analog-define-symptom');
          }}
          className="mt-2 w-full"
        />
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-theme-border bg-theme-base p-2">
            <p className="text-theme-muted">Loop Current</p>
            <p className="font-mono text-amber-300">{analogTrainer.loopCurrentmA.toFixed(2)} mA</p>
          </div>
          <button
            type="button"
            onClick={() => onAutoCapture('analog-check-loop')}
            className="rounded border border-theme-border bg-theme-base p-2 text-left hover:border-theme-border"
          >
            <p className="text-theme-muted">Raw Counts</p>
            <p className="font-mono text-theme-text">{analogTrainer.rawCounts}</p>
          </button>
          <button
            type="button"
            onClick={() => onAutoCapture('analog-check-scaling')}
            className="rounded border border-theme-border bg-theme-base p-2 text-left hover:border-theme-border"
          >
            <p className="text-theme-muted">Scaled EU (displayed)</p>
            <p className="font-mono text-theme-text">{analogTrainer.scaledEU.toFixed(1)} %</p>
          </button>
          <div className="rounded border border-theme-border bg-theme-base p-2">
            <p className="text-theme-muted">Expected EU (true process)</p>
            <p className="font-mono text-emerald-300">{analogTrainer.expectedEU.toFixed(1)} %</p>
          </div>
        </div>
      </div>

      <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
        <p className="text-xs font-semibold text-theme-secondary">Inject / Diagnose Fault</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            value={selectedAnalogFaultId}
            onChange={(event) => onFaultIdChange(event.target.value as AnalogFaultId)}
            className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
            aria-label="Choose analog fault"
          >
            <option value="open_loop">Open loop (0 mA)</option>
            <option value="short_circuit">Short/overrange (max counts)</option>
            <option value="wrong_zero_offset">Wrong zero offset (scaling)</option>
            <option value="wrong_span">Wrong span (scaling)</option>
            <option value="none">Healthy signal</option>
          </select>
          <button
            type="button"
            onClick={() => {
              onInjectFault(selectedAnalogFaultId);
              onAutoCapture('analog-define-symptom');
            }}
            className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            Inject Analog Fault
          </button>
          <button
            type="button"
            onClick={() => onInjectFault('none')}
            className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
          >
            Clear Analog Fault
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={selectedAnalogDiagnosis}
            onChange={(event) =>
              onDiagnosisChange(event.target.value as AnalogDiagnosisSelection)
            }
            className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
            aria-label="Analog fault diagnosis"
          >
            <option value="open_loop">{analogDiagnosisLabel.open_loop}</option>
            <option value="short_circuit">{analogDiagnosisLabel.short_circuit}</option>
            <option value="scaling_fault">{analogDiagnosisLabel.scaling_fault}</option>
            <option value="healthy">{analogDiagnosisLabel.healthy}</option>
            <option value="unknown">{analogDiagnosisLabel.unknown}</option>
          </select>
          <button
            type="button"
            onClick={onSubmitDiagnosis}
            className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            Submit Analog Diagnosis
          </button>
        </div>
        {analogTrainer.diagnosis ? (
          <p
            className={`mt-2 text-xs ${
              analogTrainer.diagnosis.correct ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {analogTrainer.diagnosis.correct ? 'Correct analog diagnosis.' : 'Incorrect analog diagnosis.'}
          </p>
        ) : null}
      </div>
    </div>
  </div>
  );
});
