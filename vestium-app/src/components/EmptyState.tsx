// ─── EmptyState — reusable empty state pattern ──────────────────────────────

import { Link } from 'react-router-dom';

interface Action {
  label: string;
  to: string;
  primary?: boolean;
}

interface Props {
  title: string;
  description: string;
  actions?: Action[];
}

export function EmptyState({ title, description, actions }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-theme-border bg-theme-panel px-8 py-16 text-center">
      <h3 className="text-base font-semibold text-theme-text">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-theme-secondary">{description}</p>
      {actions && actions.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {actions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className={
                a.primary
                  ? 'rounded-lg border border-amber-300 bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-200'
                  : 'rounded-lg border border-theme-border bg-theme-panel px-5 py-2.5 text-sm font-semibold text-theme-text transition-colors hover:border-theme-border-subtle'
              }
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
