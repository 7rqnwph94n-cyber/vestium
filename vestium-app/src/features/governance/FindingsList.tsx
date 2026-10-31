// ─── Governed Findings List ──────────────────────────────────────────────────
// Reusable findings list component for any governed content type.
// Used by GovernedReviewPage and future content-type-specific review pages.

import { useState } from 'react';
import type { GovernedFinding, FindingDisposition } from '@complianceforge/types';

const SEV_STYLES: Record<string, string> = {
  regulatory: 'border-red-500/60 bg-red-500/10 text-red-300',
  high:       'border-orange-500/60 bg-orange-500/10 text-orange-300',
  medium:     'border-amber-500/60 bg-amber-500/10 text-amber-300',
  low:        'border-theme-border bg-theme-surface text-theme-secondary',
};

const CAT_LABELS: Record<string, string> = {
  A: 'Category A — Regulatory',
  B: 'Category B — Advisory',
};

interface FindingsListProps {
  findings: GovernedFinding[];
  onDispose: (findingId: string, disposition: FindingDisposition, rationale: string) => Promise<void>;
  onGateOpen?: (findingId: string) => Promise<void>;
  disabled?: boolean;
}

export const FindingsList = ({ findings, onDispose, onGateOpen, disabled }: FindingsListProps) => {
  const [disposingId, setDisposingId] = useState<string | null>(null);
  const [dispForm, setDispForm] = useState<{ disposition: FindingDisposition; rationale: string }>({
    disposition: 'accepted', rationale: '',
  });
  const [dispError, setDispError] = useState<string | null>(null);

  const undisposedCount = findings.filter((f) => !f.disposition).length;

  const handleDispose = async (findingId: string) => {
    setDispError(null);
    try {
      await onDispose(findingId, dispForm.disposition, dispForm.rationale);
      setDisposingId(null);
      setDispForm({ disposition: 'accepted', rationale: '' });
    } catch (err) {
      setDispError(err instanceof Error ? err.message : 'Resolution failed');
    }
  };

  if (findings.length === 0) {
    return <p className="text-theme-muted text-sm italic">No findings yet. Import from automated checks or add manually.</p>;
  }

  return (
    <div className="space-y-3">
      {undisposedCount > 0 && (
        <p className="text-amber-400 text-sm font-medium">
          {undisposedCount} finding{undisposedCount > 1 ? 's' : ''} pending review
        </p>
      )}

      {findings.map((f) => (
        <div
          key={f.id}
          className={`rounded-lg border p-3 ${SEV_STYLES[f.severity] ?? SEV_STYLES.low}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">{f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}</span>
                <span className="text-xs opacity-70">{CAT_LABELS[f.category]}</span>
                {f.regulatoryRef && (
                  <span className="text-xs bg-theme-raised px-1.5 py-0.5 rounded">{f.regulatoryRef}</span>
                )}
              </div>
              <p className="text-sm">{f.description}</p>
              <p className="text-xs opacity-60 mt-1">{f.location}</p>
              {f.sourceAttribution && (
                <p className="text-xs opacity-50 mt-0.5 italic">{f.sourceAttribution}</p>
              )}
            </div>
            <div className="flex-shrink-0">
              {f.disposition ? (
                <span className="text-xs bg-green-900/40 text-green-400 border border-green-700/30 px-2 py-1 rounded">
                  {f.disposition}
                </span>
              ) : (
                <button
                  onClick={() => {
                    if (f.category === 'A' && onGateOpen) onGateOpen(f.id);
                    setDisposingId(f.id);
                    setDispForm({ disposition: 'accepted', rationale: '' });
                    setDispError(null);
                  }}
                  disabled={disabled}
                  className="text-xs bg-amber-700/40 hover:bg-amber-700/60 text-amber-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>

          {f.disposition && f.dispositionRationale && (
            <div className="mt-2 pt-2 border-t border-current/20">
              <p className="text-xs opacity-70">Rationale: {f.dispositionRationale}</p>
            </div>
          )}

          {disposingId === f.id && !f.disposition && (
            <div className="mt-3 pt-3 border-t border-current/20 space-y-2">
              <select
                value={dispForm.disposition}
                onChange={(e) => setDispForm({ ...dispForm, disposition: e.target.value as FindingDisposition })}
                className="w-full bg-theme-surface border border-theme-border rounded px-2 py-1 text-sm"
              >
                <option value="accepted">Accepted</option>
                <option value="amended">Amended</option>
                <option value="escalated">Escalated</option>
              </select>
              <textarea
                value={dispForm.rationale}
                onChange={(e) => setDispForm({ ...dispForm, rationale: e.target.value })}
                placeholder={f.category === 'A' ? 'Rationale required (10+ chars for Cat A)...' : 'Rationale (5+ chars)...'}
                className="w-full bg-theme-surface border border-theme-border rounded px-2 py-1 text-sm min-h-[60px]"
              />
              {dispError && <p className="text-red-400 text-xs">{dispError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => handleDispose(f.id)}
                  disabled={disabled}
                  className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
                >
                  Submit Resolution
                </button>
                <button
                  onClick={() => setDisposingId(null)}
                  className="text-xs bg-theme-raised hover:bg-theme-raised text-theme-secondary px-3 py-1 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
