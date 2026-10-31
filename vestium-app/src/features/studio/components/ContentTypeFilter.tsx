// ─── ContentTypeFilter — filter bar for Studio library ───────────────────────

import { cx } from '../../../utils/classNames';
import type { ContentType } from './ContentCard';
import type { ContentStatus } from '../../../components/ContentStatusChip';

const TYPE_OPTIONS: Array<{ value: ContentType | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'module', label: 'Modules' },
  { value: 'sop', label: 'SOPs' },
  { value: 'rams', label: 'RAMS' },
];

const STATUS_OPTIONS: Array<{ value: ContentStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'generating', label: 'Generating' },
  { value: 'failed', label: 'Failed' },
  { value: 'in_review', label: 'In Review' },
  { value: 'deployed', label: 'Deployed' },
  { value: 'stale', label: 'Stale' },
];

interface Props {
  typeFilter: ContentType | 'all';
  onTypeChange: (type: ContentType | 'all') => void;
  statusFilter: ContentStatus | 'all';
  onStatusChange: (status: ContentStatus | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ContentTypeFilter({
  typeFilter,
  onTypeChange,
  statusFilter,
  onStatusChange,
  searchQuery,
  onSearchChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Content type pills */}
      <div className="flex items-center gap-1 rounded-lg border border-theme-border bg-theme-panel p-1">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onTypeChange(opt.value)}
            className={cx(
              'rounded px-3 py-1.5 text-xs font-semibold transition-colors',
              typeFilter === opt.value
                ? 'bg-theme-raised text-theme-text'
                : 'text-theme-secondary hover:text-theme-text'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Status dropdown */}
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as ContentStatus | 'all')}
        className="rounded-lg border border-theme-border bg-theme-panel px-3 py-2 text-xs text-theme-text focus:border-amber-500 focus:outline-none"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by title…"
        className="rounded-lg border border-theme-border bg-theme-panel px-3 py-2 text-xs text-theme-text placeholder-slate-600 focus:border-amber-500 focus:outline-none"
      />
    </div>
  );
}
