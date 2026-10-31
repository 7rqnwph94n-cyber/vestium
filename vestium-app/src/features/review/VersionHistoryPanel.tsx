import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { ModuleSnapshotSummary, SnapshotDiffEntry } from '@complianceforge/types';
import { listModuleVersions, getSnapshotDiff } from '../../lib/api/client';
import { Card } from '../../components/Card';
import { SnapshotDiffView } from './SnapshotDiffView';

const TRIGGER_LABELS: Record<ModuleSnapshotSummary['triggerEvent'], string> = {
  generation_complete: 'Generation',
  attestation: 'Attestation',
  redeployment: 'Redeployment',
};

export function VersionHistoryPanel(props: {
  moduleId: string;
  attestationSnapshotVersion?: number;
}) {
  const { moduleId, attestationSnapshotVersion } = props;
  const { getToken } = useAuth();

  const [expanded, setExpanded] = useState(false);
  const [versions, setVersions] = useState<ModuleSnapshotSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [diffPair, setDiffPair] = useState<{ from: number; to: number } | null>(null);
  const [diffEntries, setDiffEntries] = useState<SnapshotDiffEntry[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const clearDiff = () => { setDiffPair(null); setDiffEntries(null); setDiffError(null); };

  const onToggle = async () => {
    if (expanded) {
      setExpanded(false);
      clearDiff();
      return;
    }
    setExpanded(true);
    setLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { setError('No session token.'); setLoading(false); return; }
    const res = await listModuleVersions(token, moduleId);
    if (!res.ok) { setError(res.error); } else { setVersions(res.data); }
    setLoading(false);
  };

  const onDiff = async (from: number, to: number) => {
    if (diffPair && diffPair.from === from && diffPair.to === to) {
      clearDiff();
      return;
    }
    setDiffPair({ from, to });
    setDiffEntries(null);
    setDiffLoading(true);
    setDiffError(null);
    const token = await getToken();
    if (!token) { setDiffError('No session token.'); setDiffLoading(false); return; }
    const res = await getSnapshotDiff(token, moduleId, from, to);
    if (!res.ok) { setDiffError(res.error); } else { setDiffEntries(res.data); }
    setDiffLoading(false);
  };

  return (
    <Card className="space-y-2">
      <button
        type="button"
        onClick={() => void onToggle()}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold text-theme-text">Version History</h2>
        <span className="text-theme-muted text-xs">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-xs text-theme-secondary">Loading versions...</p>
          ) : error ? (
            <p className="text-xs text-red-300">{error}</p>
          ) : versions && versions.length === 0 ? (
            <p className="text-xs text-theme-secondary">No snapshots recorded yet.</p>
          ) : versions ? (
            <div className="space-y-1.5">
              {versions.map((v) => {
                const isAttested = attestationSnapshotVersion === v.version;
                return (
                  <div
                    key={v.id}
                    className={`rounded border px-3 py-2 text-xs ${
                      isAttested
                        ? 'border-sky-500/40 bg-sky-500/10'
                        : 'border-theme-border bg-theme-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-theme-text">v{v.version}</span>
                      <span className="text-theme-secondary">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded bg-theme-raised px-1.5 py-0.5 text-[10px] text-theme-secondary">
                        {TRIGGER_LABELS[v.triggerEvent] ?? v.triggerEvent}
                      </span>
                      {isAttested && (
                        <span className="rounded bg-sky-900/50 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                          ATTESTED
                        </span>
                      )}
                    </div>
                    <p
                      className="mt-1 font-mono text-[10px] text-theme-muted truncate"
                      title={v.contentHash}
                    >
                      {v.contentHash.slice(0, 16)}...
                    </p>
                    {v.version > 1 && (
                      <button
                        type="button"
                        onClick={() => void onDiff(v.version - 1, v.version)}
                        className={`mt-1.5 w-full rounded border px-2 py-1 text-[10px] font-medium ${
                          diffPair?.from === v.version - 1 && diffPair?.to === v.version
                            ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                            : 'border-theme-border text-theme-secondary hover:text-theme-text hover:border-theme-muted'
                        }`}
                      >
                        {diffPair?.from === v.version - 1 && diffPair?.to === v.version
                          ? diffLoading ? 'Loading diff\u2026' : `Hide diff v${v.version - 1} \u2192 v${v.version}`
                          : `Diff from v${v.version - 1}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {diffPair && (
            <div className="mt-2">
              {diffLoading ? (
                <p className="text-xs text-theme-secondary">Loading diff...</p>
              ) : diffError ? (
                <p className="text-xs text-red-300">{diffError}</p>
              ) : diffEntries ? (
                <SnapshotDiffView
                  fromVersion={diffPair.from}
                  toVersion={diffPair.to}
                  entries={diffEntries}
                />
              ) : null}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
