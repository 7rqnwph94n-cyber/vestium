interface DiagnosisResultBadgeProps {
  correct: boolean;
  correctLabel?: string;
  incorrectLabel?: string;
}

export const DiagnosisResultBadge = ({
  correct,
  correctLabel = 'Correct diagnosis',
  incorrectLabel = 'Incorrect diagnosis',
}: DiagnosisResultBadgeProps) => (
  <span
    className={`rounded px-2 py-2 text-xs ${
      correct
        ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
        : 'border border-rose-500/40 bg-rose-500/10 text-rose-300'
    }`}
  >
    {correct ? correctLabel : incorrectLabel}
  </span>
);
