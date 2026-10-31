import { memo } from 'react';
import type { Fault } from '../../types/simulator';
import { FaultDiagnosis } from '../faults/FaultDiagnosis';

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
    coaching: 'This trains "full restoration verification" after the first found fault.'
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

export interface FaultPracticeSectionProps {
  activeFault: Fault | null;
  availableFaults: Fault[];
  selectedFaultId: string;
  selectedCompoundScenarioId: string;
  activeCompoundScenarioId: string | null;
  stageId: number;
  onSelectedFaultIdChange: (faultId: string) => void;
  onSelectedCompoundScenarioIdChange: (scenarioId: string) => void;
  onActivateCompoundScenario: (scenarioId: string) => void;
  onClearCompoundScenario: () => void;
  onInjectRandomFault: () => void;
  onInjectSelectedFault: () => void;
  onClearFault: () => void;
  onFaultDiagnosisSubmit: (faultId: string, correct: boolean) => void;
}

export const FaultPracticeSection = memo(function FaultPracticeSection({
  activeFault,
  availableFaults,
  selectedFaultId,
  selectedCompoundScenarioId,
  activeCompoundScenarioId,
  stageId: _stageId,
  onSelectedFaultIdChange,
  onSelectedCompoundScenarioIdChange,
  onActivateCompoundScenario,
  onClearCompoundScenario,
  onInjectRandomFault,
  onInjectSelectedFault,
  onClearFault,
  onFaultDiagnosisSubmit
}: FaultPracticeSectionProps) { return (
  <div id="sim-faults" className="scroll-mt-24 space-y-3 rounded border border-theme-border bg-theme-base p-3">
    <p className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
      Fault Diagnosis Practice
    </p>
    <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
      <p className="text-xs font-semibold text-theme-secondary">Compound Fault Scenarios (MI4)</p>
      <p className="mt-1 text-xs text-theme-secondary">
        Practice verifying complete restoration when more than one fault exists. Fixing the first visible fault may not return the machine to normal.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
          value={selectedCompoundScenarioId}
          onChange={(event) => onSelectedCompoundScenarioIdChange(event.target.value)}
          aria-label="Choose compound fault scenario"
        >
          {compoundFaultScenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
          onClick={() => onActivateCompoundScenario(selectedCompoundScenarioId)}
        >
          Start Compound Scenario
        </button>
        <button
          type="button"
          className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
          onClick={onClearCompoundScenario}
        >
          Clear Compound Scenario
        </button>
        <span className={`text-xs ${activeCompoundScenarioId ? 'text-amber-300' : 'text-theme-muted'}`}>
          Compound mode: {activeCompoundScenarioId ? 'ACTIVE' : 'Off'}
        </span>
      </div>
      {activeCompoundScenarioId ? (
        <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
          {(() => {
            const scenario = compoundFaultScenarios.find((s) => s.id === activeCompoundScenarioId);
            if (!scenario) return null;
            return (
              <>
                <p className="font-semibold text-amber-200">{scenario.goal}</p>
                <p className="mt-1 text-theme-secondary">
                  Active faults: <span className="font-mono">{scenario.faults.join(' + ')}</span>
                </p>
                <p className="mt-1 text-theme-secondary">{scenario.coaching}</p>
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
        onClick={onInjectRandomFault}
        disabled={availableFaults.length === 0}
      >
        Inject Fault (Hidden)
      </button>
      <select
        className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
        value={selectedFaultId}
        onChange={(event) => onSelectedFaultIdChange(event.target.value)}
        aria-label="Choose fault for drill practice"
      >
        {availableFaults.map((fault) => (
          <option key={fault.id} value={fault.id}>
            {fault.label} ({fault.difficulty})
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
        onClick={onInjectSelectedFault}
        disabled={!selectedFaultId}
      >
        Inject Selected Fault
      </button>
      <button
        type="button"
        className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
        onClick={onClearFault}
      >
        Clear Fault
      </button>
      <span
        className={`text-xs font-semibold ${activeFault ? 'text-amber-400' : 'text-theme-muted'}`}
      >
        Fault mode: {activeFault ? 'ACTIVE — diagnose using rung telemetry, field checks, and docs' : 'None'}
      </span>
      <span className="text-xs text-theme-muted">
        Tiers available in this stage: {availableFaults.length > 0 ? availableFaults.map((fault) => fault.difficulty).filter((v, i, arr) => arr.indexOf(v) === i).join(', ') : 'none'}
      </span>
    </div>
    <FaultDiagnosis
      activeFault={activeFault}
      availableFaults={availableFaults}
      onSubmit={onFaultDiagnosisSubmit}
    />
  </div>
  ); });
