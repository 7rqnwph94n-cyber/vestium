import { useEffect, useMemo, useState } from 'react';
import { Fault } from '../../types/simulator';
import { faults } from './faults';

export const FaultDiagnosis = ({
  activeFault,
  availableFaults = faults,
  onSubmit
}: {
  activeFault: Fault | null;
  availableFaults?: Fault[];
  onSubmit: (faultId: string, correct: boolean) => void;
}) => {
  const [choice, setChoice] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const selectedFault = useMemo(() => availableFaults.find((f) => f.id === choice), [availableFaults, choice]);
  const correct = activeFault ? choice === activeFault.id : false;

  useEffect(() => {
    setChoice('');
    setSubmitted(false);
  }, [activeFault?.id]);

  const submit = () => {
    if (!activeFault || !choice) return;
    setSubmitted(true);
    onSubmit(choice, correct);
  };

  if (!activeFault) {
    return <p className="text-xs text-theme-secondary">Inject a hidden fault to begin diagnosis practice.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-theme-text">
        A hidden fault is active. Use rung truth and tag telemetry, then select the most likely root cause.
      </p>
      <div className="grid gap-2">
        {availableFaults.map((fault) => (
          <label key={fault.id} className="flex items-center gap-2 rounded border border-theme-border p-2 text-xs text-theme-secondary">
            <input
              type="radio"
              name="fault"
              checked={choice === fault.id}
              onChange={() => {
                setChoice(fault.id);
                setSubmitted(false);
              }}
            />
            {fault.label}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!choice}
      >
        Submit Diagnosis
      </button>
      {submitted ? (
        <div className={`rounded border p-3 text-xs ${correct ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'}`}>
          <p>{correct ? 'Correct diagnosis.' : 'Incorrect diagnosis.'}</p>
          <p className="mt-1 text-theme-secondary">Selected: {selectedFault?.label}</p>
          <p className="mt-1 text-theme-secondary">Actual: {activeFault.label}</p>
          <p className="mt-1 text-theme-secondary">{activeFault.explanation}</p>
        </div>
      ) : null}
    </div>
  );
};
