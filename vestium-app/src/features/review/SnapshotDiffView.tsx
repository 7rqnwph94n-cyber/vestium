import type { SnapshotDiffEntry } from '@complianceforge/types';

const OP_STYLE: Record<SnapshotDiffEntry['op'], { prefix: string; color: string }> = {
  added:   { prefix: '+', color: 'text-emerald-400' },
  changed: { prefix: '~', color: 'text-amber-400' },
  removed: { prefix: '-', color: 'text-red-400' },
};

function formatValue(v: unknown): string {
  if (v == null) return '(empty)';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

function fullValue(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function SnapshotDiffView(props: {
  fromVersion: number;
  toVersion: number;
  entries: SnapshotDiffEntry[];
}) {
  const { fromVersion, toVersion, entries } = props;

  if (entries.length === 0) {
    return <p className="text-xs text-theme-secondary">No differences found.</p>;
  }

  const count = entries.length;
  const capped = count >= 500;

  return (
    <div className="rounded border border-theme-border bg-theme-surface p-3">
      <p className="text-xs font-semibold text-theme-text mb-2">
        <span className="font-mono">v{fromVersion} → v{toVersion}</span>
        {' — '}
        {count} change{count !== 1 ? 's' : ''}
        {capped && <span className="text-theme-muted"> (capped at 500)</span>}
      </p>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {entries.map((entry, i) => {
          const style = OP_STYLE[entry.op];
          return (
            <div key={`${entry.path}-${i}`} className="text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className={`font-mono font-bold ${style.color}`}>{style.prefix}</span>
                <span className="font-mono text-theme-text">{entry.path}</span>
              </div>
              <div className="pl-4 text-[11px] text-theme-secondary">
                {entry.op === 'added' && (
                  <span title={fullValue(entry.newValue)}>{formatValue(entry.newValue)}</span>
                )}
                {entry.op === 'removed' && (
                  <span title={fullValue(entry.oldValue)}>{formatValue(entry.oldValue)}</span>
                )}
                {entry.op === 'changed' && (
                  <span>
                    <span title={fullValue(entry.oldValue)}>{formatValue(entry.oldValue)}</span>
                    <span className="text-theme-muted"> → </span>
                    <span title={fullValue(entry.newValue)}>{formatValue(entry.newValue)}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
