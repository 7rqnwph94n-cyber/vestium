// ─── ContentStatusChip — single source of truth for content status styling ───

import { cx } from '../utils/classNames';

export type ContentStatus = 'draft' | 'in_review' | 'deployed' | 'stale' | 'failed' | 'generating';

const STATUS_CONFIG: Record<ContentStatus, { label: string; classes: string }> = {
  draft: {
    label: 'Draft',
    classes: 'border-theme-border text-theme-secondary',
  },
  generating: {
    label: 'Generating…',
    classes: 'border-violet-500/60 text-violet-300',
  },
  failed: {
    label: 'Failed',
    classes: 'border-red-500/60 text-red-300',
  },
  in_review: {
    label: 'In Review',
    classes: 'border-amber-500/60 text-amber-300',
  },
  deployed: {
    label: 'Deployed',
    classes: 'border-emerald-500/60 text-emerald-300',
  },
  stale: {
    label: 'Stale',
    classes: 'border-red-500/60 text-red-300',
  },
};

interface Props {
  status: ContentStatus;
  className?: string;
}

export function ContentStatusChip({ status, className }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
        config.classes,
        className
      )}
    >
      {status === 'generating' && (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
      )}
      {config.label}
    </span>
  );
}

/** Derive a ContentStatus from a module/SOP/RAMS record */
export function deriveContentStatus(
  dbStatus: string,
  metadata?: { failed: boolean } | null
): ContentStatus {
  if (dbStatus === 'draft') {
    if (metadata?.failed) return 'failed';
    return 'draft';
  }
  if (dbStatus === 'in_review') return 'in_review';
  if (dbStatus === 'deployed') return 'deployed';
  if (dbStatus === 'stale') return 'stale';
  return 'draft';
}
