import { memo } from 'react';
import { LadderGraphic } from './LadderGraphic';
import type { SequenceTrainerSnapshot } from './missions';

type SequenceStallFaultId = SequenceTrainerSnapshot['stallFaultId'];
type SequenceDiagnosisSelection = NonNullable<SequenceTrainerSnapshot['diagnosis']>['selected'];
type SequenceTrainerState = SequenceTrainerSnapshot;

const sequenceDiagnosisLabel: Record<SequenceDiagnosisSelection, string> = {
  'step20-transition': 'Step 20 transition blocked (MixTemperatureOK / MixTimerDN path)',
  'step30-transition': 'Step 30 transition blocked (TankEmpty path)',
  unknown: 'Insufficient evidence / unknown'
};

export interface SequenceTrainerSectionProps {
  sequenceTrainer: SequenceTrainerState;
  selectedSequenceFaultId: SequenceStallFaultId;
  selectedSequenceDiagnosis: SequenceDiagnosisSelection;
  onSequenceFaultIdChange: (faultId: SequenceStallFaultId) => void;
  onSequenceDiagnosisChange: (diagnosis: SequenceDiagnosisSelection) => void;
  onStartSequence: (faultId: SequenceStallFaultId) => void;
  onResetSequenceTrainer: () => void;
  onSubmitSequenceDiagnosis: () => void;
  onAutoCapture: (key: string) => void;
}

export const SequenceTrainerSection = memo(function SequenceTrainerSection({
  sequenceTrainer,
  selectedSequenceFaultId,
  selectedSequenceDiagnosis,
  onSequenceFaultIdChange,
  onSequenceDiagnosisChange,
  onStartSequence,
  onResetSequenceTrainer,
  onSubmitSequenceDiagnosis,
  onAutoCapture
}: SequenceTrainerSectionProps) { return (
  <div id="sim-sequence" className="scroll-mt-24 space-y-3 rounded border border-theme-border bg-theme-base p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
        Sequence Trainer (Step Bits)
      </p>
      <span className="text-xs text-theme-secondary">
        Active Step:{' '}
        <span className="font-semibold text-amber-300">
          {sequenceTrainer.activeStep === 0 ? 'IDLE / COMPLETE' : `Step ${sequenceTrainer.activeStep}`}
        </span>
      </span>
    </div>

    <p className="text-xs text-theme-secondary">
      Run a 3-step batch sequence (Fill → Mix → Discharge). Diagnose which transition condition is blocking progress when the hidden stall fault is active.
    </p>

    <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
      <p className="text-xs font-semibold text-theme-secondary">Sequence Ladder View (Simplified)</p>
      <p className="mt-1 text-[11px] text-theme-muted">
        Step bits and transition rungs shown as ladder-style elements to mirror real program structure.
      </p>
      <div className="mt-2 grid gap-2">
        <LadderGraphic
          active={sequenceTrainer.activeStep === 10}
          glyphs={[
            { kind: 'contact', label: 'Step10', active: sequenceTrainer.activeStep === 10, style: 'no' },
            { kind: 'coil', label: 'FillValveCmd', active: sequenceTrainer.outputs.fillValveCmd }
          ]}
        />
        <LadderGraphic
          active={sequenceTrainer.activeStep === 10 && sequenceTrainer.transitions.levelHigh}
          glyphs={[
            { kind: 'contact', label: 'Step10', active: sequenceTrainer.activeStep === 10, style: 'no' },
            { kind: 'contact', label: 'LevelHigh', active: sequenceTrainer.transitions.levelHigh, style: 'no' },
            { kind: 'op', label: 'RST Step10 / SET Step20', active: sequenceTrainer.transitions.levelHigh }
          ]}
        />
        <LadderGraphic
          active={sequenceTrainer.activeStep === 20}
          glyphs={[
            { kind: 'contact', label: 'Step20', active: sequenceTrainer.activeStep === 20, style: 'no' },
            { kind: 'coil', label: 'MixerCmd', active: sequenceTrainer.outputs.mixerCmd }
          ]}
        />
        <LadderGraphic
          active={sequenceTrainer.activeStep === 20 && sequenceTrainer.transitions.mixTimerDn && sequenceTrainer.transitions.mixTemperatureOk}
          glyphs={[
            { kind: 'contact', label: 'Step20', active: sequenceTrainer.activeStep === 20, style: 'no' },
            { kind: 'contact', label: 'MixTimerDN', active: sequenceTrainer.transitions.mixTimerDn, style: 'no' },
            { kind: 'contact', label: 'MixTempOK', active: sequenceTrainer.transitions.mixTemperatureOk, style: 'no' },
            { kind: 'op', label: 'RST Step20 / SET Step30', active: true }
          ]}
        />
        <LadderGraphic
          active={sequenceTrainer.activeStep === 30}
          glyphs={[
            { kind: 'contact', label: 'Step30', active: sequenceTrainer.activeStep === 30, style: 'no' },
            { kind: 'coil', label: 'DischargeValveCmd', active: sequenceTrainer.outputs.dischargeValveCmd }
          ]}
        />
      </div>
    </div>

    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
        <p className="text-xs font-semibold text-theme-secondary">Step / Output Status</p>
        <div className="mt-2 grid gap-2">
          {[
            {
              step: 10,
              label: 'Step 10 Fill',
              active: sequenceTrainer.activeStep === 10,
              output: `FillValveCmd=${sequenceTrainer.outputs.fillValveCmd ? 'ON' : 'OFF'} | TankLevel=${sequenceTrainer.fillTimer.levelPct}%`
            },
            {
              step: 20,
              label: 'Step 20 Mix',
              active: sequenceTrainer.activeStep === 20,
              output: `MixerCmd=${sequenceTrainer.outputs.mixerCmd ? 'ON' : 'OFF'}`
            },
            {
              step: 30,
              label: 'Step 30 Discharge',
              active: sequenceTrainer.activeStep === 30,
              output: `DischargeValveCmd=${sequenceTrainer.outputs.dischargeValveCmd ? 'ON' : 'OFF'}`
            }
          ].map((row) => (
            <button
              key={row.step}
              type="button"
              onClick={() => onAutoCapture('seq-identify-active-step')}
              className={`rounded border p-2 text-left ${
                row.active
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : 'border-theme-border bg-theme-base'
              }`}
            >
              <p className="text-xs font-semibold text-theme-text">{row.label}</p>
              <p className="mt-1 text-[11px] text-theme-secondary">{row.output}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
        <p className="text-xs font-semibold text-theme-secondary">Transition Conditions</p>
        <div className="mt-2 space-y-2">
          <button
            type="button"
            onClick={() => onAutoCapture('seq-check-transition')}
            className="w-full rounded border border-theme-border bg-theme-base p-2 text-left hover:border-theme-border"
          >
            <p className="text-[11px] font-semibold text-theme-text">
              Step 10 → 20: <span className="font-mono">LevelHigh</span>
            </p>
            <p className="mt-1 text-[11px] text-theme-secondary">
              {sequenceTrainer.transitions.levelHigh ? 'TRUE' : 'FALSE'}
              {sequenceTrainer.activeStep === 10 && !sequenceTrainer.transitions.levelHigh ? (
                <span className="ml-2 text-amber-400">
                  Filling… {sequenceTrainer.fillTimer.levelPct}%
                </span>
              ) : null}
            </p>
            {sequenceTrainer.activeStep === 10 ? (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-theme-surface">
                <div
                  className="h-full rounded bg-sky-500 transition-all"
                  style={{ width: `${sequenceTrainer.fillTimer.levelPct}%` }}
                />
              </div>
            ) : null}
            <p className="mt-1 text-[10px] text-theme-muted">
              Fill ramp: {(sequenceTrainer.fillTimer.accMs / 1000).toFixed(1)} s / {(sequenceTrainer.fillTimer.presetMs / 1000).toFixed(0)} s
            </p>
          </button>
          <button
            type="button"
            onClick={() => onAutoCapture('seq-check-transition')}
            className="w-full rounded border border-theme-border bg-theme-base p-2 text-left hover:border-theme-border"
          >
            <p className="text-[11px] font-semibold text-theme-text">
              Step 20 → 30: `MixTemperatureOK AND MixTimerDN`
            </p>
            <p className="mt-1 text-[11px] text-theme-secondary">
              MixTemperatureOK={sequenceTrainer.transitions.mixTemperatureOk ? 'TRUE' : 'FALSE'} | MixTimerDN=
              {sequenceTrainer.transitions.mixTimerDn ? 'TRUE' : 'FALSE'} | ACC/PRE=
              {sequenceTrainer.mixTimer.accMs}/{sequenceTrainer.mixTimer.presetMs} ms
            </p>
          </button>
          <button
            type="button"
            onClick={() => onAutoCapture('seq-check-transition')}
            className="w-full rounded border border-theme-border bg-theme-base p-2 text-left hover:border-theme-border"
          >
            <p className="text-[11px] font-semibold text-theme-text">
              Step 30 → Complete: `TankEmpty`
            </p>
            <p className="mt-1 text-[11px] text-theme-secondary">
              {sequenceTrainer.transitions.tankEmpty ? 'TRUE' : 'FALSE'}
            </p>
          </button>
        </div>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
        value={selectedSequenceFaultId}
        onChange={(event) => onSequenceFaultIdChange(event.target.value as SequenceStallFaultId)}
        aria-label="Choose sequence stall fault"
      >
        <option value="mix_temp_stuck_low">Stall in Step 20 (MixTemperatureOK false)</option>
        <option value="tank_empty_switch_failed">Stall in Step 30 (TankEmpty false)</option>
      </select>
      <button
        type="button"
        className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
        onClick={() => {
          onStartSequence(selectedSequenceFaultId);
          onAutoCapture('seq-define-symptom');
        }}
      >
        Start Sequence (Faulted)
      </button>
      <button
        type="button"
        className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
        onClick={onResetSequenceTrainer}
      >
        Reset Sequence Trainer
      </button>
      <button
        type="button"
        className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
        onClick={() => {
          onStartSequence('none');
          onAutoCapture('seq-define-symptom');
        }}
      >
        Run Healthy Sequence
      </button>
    </div>

    <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
      <p className="text-xs font-semibold text-theme-secondary">Sequence Stall Diagnosis</p>
      <p className="mt-1 text-xs text-theme-muted">
        Identify the blocked transition for the active step. Use active step + transition bits, not guessing.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
          value={selectedSequenceDiagnosis}
          onChange={(event) =>
            onSequenceDiagnosisChange(event.target.value as SequenceDiagnosisSelection)
          }
          aria-label="Sequence diagnosis"
        >
          <option value="step20-transition">
            {sequenceDiagnosisLabel['step20-transition']}
          </option>
          <option value="step30-transition">
            {sequenceDiagnosisLabel['step30-transition']}
          </option>
          <option value="unknown">{sequenceDiagnosisLabel.unknown}</option>
        </select>
        <button
          type="button"
          onClick={onSubmitSequenceDiagnosis}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
        >
          Submit Sequence Diagnosis
        </button>
        {sequenceTrainer.diagnosis ? (
          <span
            className={`rounded px-2 py-2 text-xs ${
              sequenceTrainer.diagnosis.correct
                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {sequenceTrainer.diagnosis.correct ? 'Correct diagnosis' : 'Incorrect diagnosis'}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-theme-secondary">
        Fault mode: {sequenceTrainer.stallFaultId === 'none' ? 'Healthy sequence' : 'Hidden stall active'}
      </p>
    </div>
  </div>
  ); });
