// ─── Evidence Dashboard ──────────────────────────────────────────────────────
// Org-level analytics: overview stats, completion, reviewer activity, findings.

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001';

interface Overview {
  modulesTotal: number;
  modulesDeployed: number;
  modulesDraft: number;
  modulesInReview: number;
  modulesStale: number;
  sopsTotal: number;
  ramsTotal: number;
  attestationsThisMonth: number;
  certsIssued: number;
  unresolvedRedFindings: number;
}

interface CompletionRow {
  moduleId: string;
  title: string;
  learnersStarted: number;
  learnersCompleted: number;
  avgScore: number | null;
  passRate: number | null;
}

interface ReviewerRow {
  name: string;
  userId: string;
  modulesReviewed: number;
  avgReviewDays: number | null;
  lastActivity: string | null;
}

interface FindingsSummary {
  total: number;
  bySeverity: Record<string, number>;
  undisposed: Record<string, number>;
  dispositionRate: number;
}

async function fetchJson<T>(path: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.ok) return json.data as T;
    return null;
  } catch {
    return null;
  }
}

export function EvidenceDashboardPage() {
  const { getToken } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [completion, setCompletion] = useState<CompletionRow[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerRow[]>([]);
  const [findings, setFindings] = useState<FindingsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const token = await getToken();
      if (!token || cancelled) return;

      const [ov, co, rv, fi] = await Promise.all([
        fetchJson<Overview>('/api/dashboard/overview', token),
        fetchJson<CompletionRow[]>('/api/dashboard/completion', token),
        fetchJson<ReviewerRow[]>('/api/dashboard/reviewer-activity', token),
        fetchJson<FindingsSummary>('/api/dashboard/findings-summary', token),
      ]);

      if (!cancelled) {
        setOverview(ov);
        setCompletion(co ?? []);
        setReviewers(rv ?? []);
        setFindings(fi);
        setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [getToken]);

  if (loading) return <div className="rounded border border-theme-border bg-theme-panel/60 p-4 text-sm text-theme-secondary">Loading…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-bold text-theme-text">Evidence Dashboard</h1>

      {/* Overview cards */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Modules" value={overview.modulesTotal} />
          <StatCard label="Deployed" value={overview.modulesDeployed} />
          <StatCard label="In Review" value={overview.modulesInReview} />
          <StatCard label="Draft" value={overview.modulesDraft} />
          <StatCard label="SOPs" value={overview.sopsTotal} />
          <StatCard label="RAMS" value={overview.ramsTotal} />
          <StatCard label="Attestations (month)" value={overview.attestationsThisMonth} />
          <StatCard label="Certs Issued" value={overview.certsIssued} />
          {overview.unresolvedRedFindings > 0 && (
            <div className="col-span-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 sm:col-span-4">
              <p className="text-xs font-semibold text-red-400">
                {overview.unresolvedRedFindings} unresolved regulatory finding{overview.unresolvedRedFindings !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Findings summary */}
      {findings && findings.total > 0 && (
        <div className="rounded-xl border border-theme-border bg-theme-panel px-5 py-4">
          <h2 className="text-sm font-semibold text-theme-text mb-3">Findings Summary</h2>
          <div className="flex gap-6 text-xs text-theme-secondary">
            <span>Total: {findings.total}</span>
            <span>Resolution rate: {findings.dispositionRate}%</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(findings.bySeverity).map(([sev, count]) => (
              <span key={sev} className={`rounded px-2 py-1 text-xs font-medium ${severityColor(sev)}`}>
                {sev}: {count}{findings.undisposed[sev] ? ` (${findings.undisposed[sev]} open)` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Completion table */}
      {completion.length > 0 && (
        <div className="rounded-xl border border-theme-border bg-theme-panel px-5 py-4">
          <h2 className="text-sm font-semibold text-theme-text mb-3">Module Completion</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-theme-secondary">
              <thead>
                <tr className="border-b border-theme-border">
                  <th className="text-left py-2 pr-3 font-medium">Module</th>
                  <th className="text-right py-2 px-2 font-medium">Started</th>
                  <th className="text-right py-2 px-2 font-medium">Completed</th>
                  <th className="text-right py-2 px-2 font-medium">Avg Score</th>
                  <th className="text-right py-2 pl-2 font-medium">Pass Rate</th>
                </tr>
              </thead>
              <tbody>
                {completion.map((row) => (
                  <tr key={row.moduleId} className="border-b border-theme-border/50">
                    <td className="py-2 pr-3 text-theme-text">{row.title}</td>
                    <td className="text-right py-2 px-2">{row.learnersStarted}</td>
                    <td className="text-right py-2 px-2">{row.learnersCompleted}</td>
                    <td className="text-right py-2 px-2">{row.avgScore != null ? `${row.avgScore}%` : '-'}</td>
                    <td className="text-right py-2 pl-2">{row.passRate != null ? `${row.passRate}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reviewer activity */}
      {reviewers.length > 0 && (
        <div className="rounded-xl border border-theme-border bg-theme-panel px-5 py-4">
          <h2 className="text-sm font-semibold text-theme-text mb-3">Reviewer Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-theme-secondary">
              <thead>
                <tr className="border-b border-theme-border">
                  <th className="text-left py-2 pr-3 font-medium">Reviewer</th>
                  <th className="text-right py-2 px-2 font-medium">Modules Reviewed</th>
                  <th className="text-right py-2 px-2 font-medium">Avg Review Days</th>
                  <th className="text-right py-2 pl-2 font-medium">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {reviewers.map((row) => (
                  <tr key={row.userId} className="border-b border-theme-border/50">
                    <td className="py-2 pr-3 text-theme-text">{row.name}</td>
                    <td className="text-right py-2 px-2">{row.modulesReviewed}</td>
                    <td className="text-right py-2 px-2">{row.avgReviewDays ?? '-'}</td>
                    <td className="text-right py-2 pl-2">{row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-theme-border bg-theme-panel px-4 py-3">
      <p className="text-xs text-theme-secondary">{label}</p>
      <p className="mt-1 text-lg font-bold text-theme-text">{value}</p>
    </div>
  );
}

function severityColor(sev: string): string {
  switch (sev) {
    case 'regulatory': return 'bg-red-500/20 text-red-400 border border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
    case 'medium': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    case 'low': return 'bg-sky-500/20 text-sky-400 border border-sky-500/30';
    default: return 'bg-theme-surface text-theme-secondary border border-theme-border';
  }
}
