interface CompletionBadgeProps {
  complete: boolean;
  completeLabel?: string;
}

export const CompletionBadge = ({
  complete,
  completeLabel = 'Complete',
}: CompletionBadgeProps) => {
  if (!complete) return null;
  return (
    <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
      {completeLabel}
    </span>
  );
};
