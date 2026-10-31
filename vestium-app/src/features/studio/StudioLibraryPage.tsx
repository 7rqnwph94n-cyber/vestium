// ─── StudioLibraryPage — unified content library for Studio ──────────────────

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { isBackendMode, listModules, listSops, listRams, deleteModule, deleteSop, deleteRams } from '../../lib/api/client';
import type { ModuleRecord, SopRecord, RamsRecord } from '@complianceforge/types';
import { ContentCard, type ContentType } from './components/ContentCard';
import { ContentTypeFilter } from './components/ContentTypeFilter';
import { deriveContentStatus, type ContentStatus } from '../../components/ContentStatusChip';
import { isGenerationFailed } from '../../lib/mappers';
import { EmptyState } from '../../components/EmptyState';

// ─── Unified content item ────────────────────────────────────────────────────

interface LibraryItem {
  id: string;
  type: ContentType;
  title: string;
  status: ContentStatus;
  regulatorySchema: string;
  createdAt: string;
  updatedAt: string;
}

function moduleToItem(m: ModuleRecord): LibraryItem {
  return {
    id: m.id,
    type: 'module',
    title: m.title,
    status: deriveContentStatus(m.status, { failed: isGenerationFailed(m.generationMetadata) }),
    regulatorySchema: m.regulatoryClassification?.primarySchemaTitle ?? '',
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function sopToItem(s: SopRecord): LibraryItem {
  return {
    id: s.id,
    type: 'sop',
    title: s.title,
    status: deriveContentStatus(s.status, { failed: isGenerationFailed(s.generationMetadata) }),
    regulatorySchema: s.regulatoryClassification?.primarySchemaTitle ?? '',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function ramsToItem(r: RamsRecord): LibraryItem {
  return {
    id: r.id,
    type: 'rams',
    title: r.title,
    status: deriveContentStatus(r.status, { failed: isGenerationFailed(r.generationMetadata) }),
    regulatorySchema: r.regulatoryClassification?.primarySchemaTitle ?? '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ─── Detail + review paths ───────────────────────────────────────────────────

function detailPath(item: LibraryItem): string {
  return `/studio/${item.type}/${item.id}`;
}

function reviewPath(item: LibraryItem): string | undefined {
  if (item.status !== 'in_review') return undefined;
  if (item.type === 'module') return `/audit/reviewer`;
  if (item.type === 'sop') return `/audit/sops/${item.id}/review`;
  if (item.type === 'rams') return `/audit/rams/${item.id}/review`;
  return undefined;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StudioLibraryPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<ContentType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New-menu dropdown
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  // ─── Load all content ────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    if (!isBackendMode() || !isLoaded || !isSignedIn) return;
    setLoading(true);
    setError(null);

    const token = await getToken();
    if (!token) return;

    const [modRes, sopRes, ramsRes] = await Promise.all([
      listModules(token),
      listSops(token),
      listRams(token),
    ]);

    const all: LibraryItem[] = [];
    if (modRes.ok) all.push(...modRes.data.map(moduleToItem));
    if (sopRes.ok) all.push(...sopRes.data.map(sopToItem));
    if (ramsRes.ok) all.push(...ramsRes.data.map(ramsToItem));

    if (!modRes.ok && !sopRes.ok && !ramsRes.ok) {
      setError('Failed to load content. Check your connection.');
    }

    // Newest first
    all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setItems(all);
    setLoading(false);
  }, [isLoaded, isSignedIn, getToken]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  // ─── Filter + search ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = items;
    if (typeFilter !== 'all') result = result.filter((i) => i.type === typeFilter);
    if (statusFilter !== 'all') result = result.filter((i) => i.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q));
    }
    return result;
  }, [items, typeFilter, statusFilter, searchQuery]);

  // ─── Review queue count ──────────────────────────────────────────────────

  const reviewCount = useMemo(
    () => items.filter((i) => i.status === 'in_review').length,
    [items]
  );

  // ─── Delete handler ──────────────────────────────────────────────────────

  const handleDelete = useCallback(async (item: LibraryItem) => {
    const token = await getToken();
    if (!token) return;

    if (item.type === 'module') await deleteModule(token, item.id);
    else if (item.type === 'sop') await deleteSop(token, item.id);
    else if (item.type === 'rams') await deleteRams(token, item.id);

    setItems((prev) => prev.filter((i) => !(i.id === item.id && i.type === item.type)));
  }, [getToken]);

  // ─── Card actions ────────────────────────────────────────────────────────

  function actionsFor(item: LibraryItem) {
    const actions: Array<{ label: string; to?: string; onClick?: () => void; variant?: 'default' | 'danger' }> = [];

    if (item.status === 'generating') {
      actions.push({ label: 'Generating…' });
    } else if (item.status === 'failed') {
      actions.push({ label: 'Retry', to: `/studio/new/${item.type}` });
      actions.push({ label: 'Delete', onClick: () => void handleDelete(item), variant: 'danger' });
    } else if (item.status === 'in_review') {
      const rp = reviewPath(item);
      if (rp) actions.push({ label: 'Open Review', to: rp });
    } else if (item.status === 'deployed') {
      actions.push({ label: 'View', to: detailPath(item) });
    } else if (item.status === 'stale') {
      actions.push({ label: 'Regenerate', to: `/studio/new/${item.type}` });
    } else {
      actions.push({ label: 'View', to: detailPath(item) });
    }

    if (item.status !== 'generating' && item.status !== 'failed') {
      actions.push({ label: 'Delete', onClick: () => void handleDelete(item), variant: 'danger' });
    }

    return actions;
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-theme-text">Studio</h1>
          <p className="mt-1 text-sm text-theme-secondary">
            Your organisation's compliance content
          </p>
        </div>

        {/* + New dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNewMenuOpen((v) => !v)}
            className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20"
          >
            + New
          </button>
          {newMenuOpen && (
            <>
              {/* Backdrop to close menu */}
              <div className="fixed inset-0 z-10" onClick={() => setNewMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-theme-border bg-theme-panel py-1 shadow-theme">
                <Link
                  to="/studio/new/module"
                  onClick={() => setNewMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-theme-text hover:bg-theme-surface transition-colors"
                >
                  Training Module
                </Link>
                <Link
                  to="/studio/new/sop"
                  onClick={() => setNewMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-theme-text hover:bg-theme-surface transition-colors"
                >
                  SOP / SSOW
                </Link>
                <Link
                  to="/studio/new/rams"
                  onClick={() => setNewMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-theme-text hover:bg-theme-surface transition-colors"
                >
                  RAMS
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Review queue banner */}
      {reviewCount > 0 && (
        <Link
          to="/audit/reviewer"
          className="block rounded-xl border border-amber-500/30 bg-amber-900/10 px-4 py-3 text-sm text-amber-200 transition-colors hover:bg-amber-900/20"
        >
          {reviewCount} item{reviewCount !== 1 ? 's' : ''} awaiting review
          <span className="ml-2 text-xs text-amber-400">Open Reviewer Portal &rarr;</span>
        </Link>
      )}

      {/* Filters */}
      <ContentTypeFilter
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-900/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-center text-sm text-theme-muted">Loading content…</div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !error && (
        <EmptyState
          title="No content yet"
          description="Create your first compliance module, SOP, or RAMS to get started."
          actions={[
            { label: 'Create Training Module', to: '/studio/new/module', primary: true },
            { label: 'Create SOP', to: '/studio/new/sop' },
            { label: 'Create RAMS', to: '/studio/new/rams' },
          ]}
        />
      )}

      {/* No filter results */}
      {!loading && items.length > 0 && filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-theme-muted">
          No content matches your filters.
        </div>
      )}

      {/* Content grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <ContentCard
              key={`${item.type}-${item.id}`}
              type={item.type}
              title={item.title}
              status={item.status}
              regulatorySchema={item.regulatorySchema}
              createdAt={item.createdAt}
              detailPath={detailPath(item)}
              actions={actionsFor(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
