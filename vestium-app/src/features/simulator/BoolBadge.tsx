export const BoolBadge = ({ label, active }: { label: string; active: boolean }) => (
  <div
    className={`rounded border px-2 py-1 text-xs font-mono ${
      active
        ? 'border-amber-400 bg-amber-500/20 text-amber-100'
        : 'border-theme-border bg-theme-panel text-theme-secondary'
    }`}
  >
    {label}:{' '}
    <span className={active ? 'text-amber-300' : 'text-theme-muted'}>
      {active ? 'TRUE' : 'FALSE'}
    </span>
  </div>
);
