import { memo } from 'react';
import type { MultiUnitTrainerSnapshot } from './missions';

type MultiUnitFaultId = MultiUnitTrainerSnapshot['faultId'];
type MultiUnitDiagnosisSelection = NonNullable<MultiUnitTrainerSnapshot['diagnosis']>['selected'];
type MultiUnitTrainerState = MultiUnitTrainerSnapshot;

const multiUnitDiagnosisLabel: Record<MultiUnitDiagnosisSelection, string> = {
  shared_air: 'Shared air / utility permit fault',
  shared_network: 'Shared network/device-ready fault',
  unitA: 'Local Unit A fault',
  unitB: 'Local Unit B fault',
  unitC: 'Local Unit C fault',
  unknown: 'Unknown'
};

export interface MultiUnitTrainerSectionProps {
  multiUnitTrainer: MultiUnitTrainerState;
  selectedMultiUnitFaultId: MultiUnitFaultId;
  selectedMultiUnitDiagnosis: MultiUnitDiagnosisSelection;
  onMultiUnitFaultIdChange: (faultId: MultiUnitFaultId) => void;
  onMultiUnitDiagnosisChange: (diagnosis: MultiUnitDiagnosisSelection) => void;
  onInjectMultiUnitFault: (faultId: MultiUnitFaultId) => void;
  onResetMultiUnitTrainer: () => void;
  onSubmitMultiUnitDiagnosis: () => void;
  onAutoCapture: (key: string) => void;
}

export const MultiUnitTrainerSection = memo(function MultiUnitTrainerSection({
  multiUnitTrainer,
  selectedMultiUnitFaultId,
  selectedMultiUnitDiagnosis,
  onMultiUnitFaultIdChange,
  onMultiUnitDiagnosisChange,
  onInjectMultiUnitFault,
  onResetMultiUnitTrainer,
  onSubmitMultiUnitDiagnosis,
  onAutoCapture
}: MultiUnitTrainerSectionProps) { return (
  <div id="sim-multi" className="scroll-mt-24 space-y-3 rounded border border-theme-border bg-theme-base p-3">
    <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
      Multi-Unit Dependency Trainer (BU2 Scaffold)
    </p>
    <p className="text-xs text-theme-secondary">
      Three units (A/B/C) share one upstream permit. Inject shared or local faults and classify the stoppage correctly.
    </p>

    <div className="grid gap-3 lg:grid-cols-4">
      <button
        type="button"
        onClick={() => onAutoCapture('multi-check-shared')}
        className="rounded border border-theme-border bg-theme-panel/60 p-3 text-left hover:border-theme-border"
      >
        <p className="text-xs font-semibold text-theme-secondary">Shared Utility / Permit</p>
        <p className="mt-1 text-xs text-theme-secondary">
          AirPermit:{' '}
          <span className={multiUnitTrainer.sharedAirPermit ? 'text-emerald-300' : 'text-rose-300'}>
            {multiUnitTrainer.sharedAirPermit ? 'TRUE' : 'FALSE'}
          </span>
        </p>
        <p className="mt-1 text-xs text-theme-secondary">
          NetworkReady:{' '}
          <span className={multiUnitTrainer.sharedNetworkReady ? 'text-emerald-300' : 'text-rose-300'}>
            {multiUnitTrainer.sharedNetworkReady ? 'TRUE' : 'FALSE'}
          </span>
        </p>
        <p className="mt-1 text-xs text-theme-secondary">
          SharedPermit:{' '}
          <span className={multiUnitTrainer.sharedPermit ? 'text-emerald-300' : 'text-rose-300'}>
            {multiUnitTrainer.sharedPermit ? 'TRUE' : 'FALSE'}
          </span>
        </p>
        <p className="mt-1 text-[11px] text-theme-muted">Tick {multiUnitTrainer.tick}</p>
      </button>

      <button
        type="button"
        onClick={() => onAutoCapture('multi-compare-local')}
        className="rounded border border-theme-border bg-theme-panel/60 p-3 text-left hover:border-theme-border"
      >
        <p className="text-xs font-semibold text-theme-secondary">Unit A</p>
        <p className="mt-1 text-xs text-theme-secondary">
          Cmd={multiUnitTrainer.unitA.runCmd ? 'TRUE' : 'FALSE'} | LocalPermit=
          {multiUnitTrainer.unitA.localPermit ? 'TRUE' : 'FALSE'} | Running=
          {multiUnitTrainer.unitA.running ? 'TRUE' : 'FALSE'}
        </p>
      </button>

      <button
        type="button"
        onClick={() => onAutoCapture('multi-compare-local')}
        className="rounded border border-theme-border bg-theme-panel/60 p-3 text-left hover:border-theme-border"
      >
        <p className="text-xs font-semibold text-theme-secondary">Unit B</p>
        <p className="mt-1 text-xs text-theme-secondary">
          Cmd={multiUnitTrainer.unitB.runCmd ? 'TRUE' : 'FALSE'} | LocalPermit=
          {multiUnitTrainer.unitB.localPermit ? 'TRUE' : 'FALSE'} | Running=
          {multiUnitTrainer.unitB.running ? 'TRUE' : 'FALSE'}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onAutoCapture('multi-compare-local')}
        className="rounded border border-theme-border bg-theme-panel/60 p-3 text-left hover:border-theme-border"
      >
        <p className="text-xs font-semibold text-theme-secondary">Unit C</p>
        <p className="mt-1 text-xs text-theme-secondary">
          Cmd={multiUnitTrainer.unitC.runCmd ? 'TRUE' : 'FALSE'} | LocalPermit=
          {multiUnitTrainer.unitC.localPermit ? 'TRUE' : 'FALSE'} | Running=
          {multiUnitTrainer.unitC.running ? 'TRUE' : 'FALSE'}
        </p>
      </button>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedMultiUnitFaultId}
        onChange={(event) => onMultiUnitFaultIdChange(event.target.value as MultiUnitFaultId)}
        className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
        aria-label="Choose multi-unit fault"
      >
        <option value="shared_air_loss">Shared permit loss (all units affected)</option>
        <option value="shared_network_loss">Shared network/device-ready loss (all units affected)</option>
        <option value="unitA_local_permit_loss">Local Unit A permit loss</option>
        <option value="unitB_local_permit_loss">Local Unit B permit loss</option>
        <option value="unitB_local_permit_intermittent">Unit B intermittent local permit</option>
        <option value="unitC_local_permit_loss">Local Unit C permit loss</option>
        <option value="none">Healthy system</option>
      </select>
      <button
        type="button"
        onClick={() => {
          onInjectMultiUnitFault(selectedMultiUnitFaultId);
          onAutoCapture('multi-define-symptom');
        }}
        className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
      >
        Inject Multi-Unit Fault
      </button>
      <button
        type="button"
        onClick={onResetMultiUnitTrainer}
        className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
      >
        Reset Multi-Unit Trainer
      </button>
    </div>

    <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
      <p className="text-xs font-semibold text-theme-secondary">Clustered Stoppage Diagnosis</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          value={selectedMultiUnitDiagnosis}
          onChange={(event) =>
            onMultiUnitDiagnosisChange(event.target.value as MultiUnitDiagnosisSelection)
          }
          className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
          aria-label="Multi-unit diagnosis"
        >
          <option value="shared_air">{multiUnitDiagnosisLabel.shared_air}</option>
          <option value="shared_network">{multiUnitDiagnosisLabel.shared_network}</option>
          <option value="unitA">{multiUnitDiagnosisLabel.unitA}</option>
          <option value="unitB">{multiUnitDiagnosisLabel.unitB}</option>
          <option value="unitC">{multiUnitDiagnosisLabel.unitC}</option>
          <option value="unknown">{multiUnitDiagnosisLabel.unknown}</option>
        </select>
        <button
          type="button"
          onClick={onSubmitMultiUnitDiagnosis}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
        >
          Submit Multi-Unit Diagnosis
        </button>
        {multiUnitTrainer.diagnosis ? (
          <span
            className={`rounded px-2 py-2 text-xs ${
              multiUnitTrainer.diagnosis.correct
                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {multiUnitTrainer.diagnosis.correct ? 'Correct diagnosis' : 'Incorrect diagnosis'}
          </span>
        ) : null}
      </div>
    </div>
  </div>
  ); });
