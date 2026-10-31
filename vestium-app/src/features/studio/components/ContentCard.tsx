// ─── ContentCard — unified card for the Studio library grid ──────────────────

import { Link } from 'react-router-dom';
import { ContentStatusChip, type ContentStatus } from '../../../components/ContentStatusChip';

export type ContentType = 'module' | 'sop' | 'rams';

const TYPE_LABEL: Record<ContentType, { label: string; classes: string }> = {
  module: { label: 'Module', classes: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
  sop: { label: 'SOP', classes: 'text-sky-300 border-sky-500/40 bg-sky-500/10' },
  rams: { label: 'RAMS', classes: 'text-teal-300 border-teal-500/40 bg-teal-500/10' },
};

interface Action {
  label: string;
  to?: string;
  onClick?: () => void;
  variant?: 'default' | 'danger';
}

interface Props {
  type: ContentType;
  title: string;
  status: ContentStatus;
  regulatorySchema?: string;
  createdAt: string;
  detailPath: string;
  actions: Action[];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ContentCard({ type, title, status, regulatorySchema, createdAt, detailPath, actions }: Props) {
  const typeConfig = TYPE_LABEL[type];

  return (
    <div className="flex flex-col rounded-xl border border-theme-border bg-theme-panel px-5 py-4 transition-colors hover:border-theme-border-subtle">
      {/* Header: type badge + status */}
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${typeConfig.classes}`}>
          {typeConfig.label}
        </span>
        <ContentStatusChip status={status} />
      </div>

      {/* Title */}
      <Link to={detailPath} className="mt-3 block">
        <h3 className="text-sm font-semibold text-theme-text line-clamp-2 hover:text-amber-300 transition-colors">
          {title}
        </h3>
      </Link>

      {/* Schema + date */}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-theme-muted">
        {regulatorySchema && <span>{regulatorySchema}</span>}
        {regulatorySchema && <span>·</span>}
        <span>{relativeTime(createdAt)}</span>
      </div>

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2 pt-4">
        {actions.map((action) =>
          action.to ? (
            <Link
              key={action.label}
              to={action.to}
              className={
                action.variant === 'danger'
                  ? 'text-xs text-red-400 hover:text-red-300 transition-colors'
                  : 'text-xs text-theme-secondary hover:text-theme-text transition-colors'
              }
            >
              {action.label}
            </Link>
          ) : (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={
                action.variant === 'danger'
                  ? 'text-xs text-red-400 hover:text-red-300 transition-colors'
                  : 'text-xs text-theme-secondary hover:text-theme-text transition-colors'
              }
            >
              {action.label}
            </button>
          )
        )}
      </div>
    </div>
  );
}
