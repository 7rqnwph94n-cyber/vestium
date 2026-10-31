export const ProgressBar = ({ value }: { value: number }) => (
  <div className="h-2.5 w-full rounded-full bg-theme-raised">
    <div
      className="h-2.5 rounded-full transition-all"
      style={{
        width: `${Math.max(0, Math.min(100, value))}%`,
        background: 'linear-gradient(to right, var(--progress-from), var(--progress-to))'
      }}
    />
  </div>
);
