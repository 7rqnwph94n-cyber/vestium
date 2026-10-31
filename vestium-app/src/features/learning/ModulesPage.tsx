import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Card } from '../../components/Card';
import { modulesRegistry } from '../../lib/training-core/registry';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { deleteModule, getOrgMe, isBackendMode, listModules } from '../../lib/api/client';
import { cx } from '../../utils/classNames';
import type { ModuleRecord, OrgRecord } from '@complianceforge/types';
import { SopListSection } from './SopListSection';
import { isGenerationFailed } from '../../lib/mappers';

export function filterVisibleOrgModules(apiModules: ModuleRecord[]): ModuleRecord[] {
  return apiModules.filter((m) => {
    const isFailed = isGenerationFailed(m.generationMetadata);
    if (m.status === 'in_review') return false; // review queue stays in Reviewer Portal only
    if (m.status === 'draft') return isFailed;  // only show failed drafts for retry/delete
    return true;                                // deployed / stale
  });
}

export const ModulesPage = () => {
  const navigate = useNavigate();
  const { setCurrentThemeId } = useTheme();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const modules = useMemo(() => Object.values(modulesRegistry), []);
  const [apiOrg, setApiOrg] = useState<OrgRecord | null>(null);
  const [apiModules, setApiModules] = useState<ModuleRecord[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const visibleOrgModules = useMemo(() => filterVisibleOrgModules(apiModules), [apiModules]);

  useEffect(() => {
    if (!isBackendMode()) return;
    if (!isLoaded) return;
    if (!isSignedIn) {
      setApiOrg(null);
      setApiModules([]);
      setApiError('Sign in to load your organisation and saved modules.');
      return;
    }

    let cancelled = false;

    const loadApiData = async () => {
      setApiLoading(true);
      setApiError(null);
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) {
            setApiError('Session expired. Please sign in again.');
            setApiLoading(false);
          }
          return;
        }

        const orgRes = await getOrgMe(token);
        if (!orgRes.ok) {
          if (!cancelled) {
            setApiOrg(null);
            setApiModules([]);
            setApiError(orgRes.error);
            setApiLoading(false);
          }
          return;
        }

        const modulesRes = await listModules(token);
        if (!modulesRes.ok) {
          if (!cancelled) {
            setApiOrg(orgRes.data);
            setApiModules([]);
            setApiError(modulesRes.error);
            setApiLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setApiOrg(orgRes.data);
          setApiModules(modulesRes.data);
          setApiLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setApiOrg(null);
          setApiModules([]);
          setApiError(error instanceof Error ? error.message : 'Failed to load modules');
          setApiLoading(false);
        }
      }
    };

    void loadApiData();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const handleDeleteDraft = async (moduleId: string) => {
    if (confirmDeleteId !== moduleId) {
      setConfirmDeleteId(moduleId);
      setDeleteError(null);
      return;
    }
    setConfirmDeleteId(null);
    setDeletingId(moduleId);
    setDeleteError(null);
    try {
      const token = await getToken();
      if (!token) {
        setDeleteError('Session expired. Please sign in again.');
        return;
      }
      const res = await deleteModule(token, moduleId);
      if (res.ok) {
        setApiModules((prev) => prev.filter((m) => m.id !== moduleId));
      } else {
        setDeleteError(res.error ?? 'Delete failed');
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete request failed');
    } finally {
      setDeletingId(null);
    }
  };

  const estimateModuleTime = (theme: (typeof modules)[number]): string => {
    if (theme.estimatedCompletionHours) {
      return `approximately ${theme.estimatedCompletionHours.min}-${theme.estimatedCompletionHours.max} hours`;
    }
    const lessons = theme.curriculum.flatMap((stage) => stage.lessons);
    const lessonMinutes = lessons.reduce((sum, lesson) => sum + (lesson.readingMinutes ?? 20), 0);
    const stageTestMinutes = theme.curriculum.length * 15;
    const missionMinutes = (theme.missions?.length ?? 0) * 12;
    const totalHours = (lessonMinutes + stageTestMinutes + missionMinutes) / 60;
    const min = Math.max(1, Math.round(totalHours * 0.85));
    const max = Math.max(min + 1, Math.round(totalHours * 1.15));
    return `approximately ${min}-${max} hours`;
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Reminder</p>
        <p className="mt-1 text-sm text-theme-text">
          Learning content is for demonstration and training purposes only. Verify important details before real-world use.
        </p>
      </section>

      <SopListSection />

      {isBackendMode() ? (
        <section className="space-y-3 rounded-xl border border-theme-border bg-theme-panel/60 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-theme-text">Organisation Modules</h2>
              {!apiError && apiOrg ? (
                <p className="text-xs text-theme-secondary mt-0.5">
                  {apiOrg.name}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {apiLoading ? <span className="text-xs text-theme-secondary">Loading…</span> : null}
              {!apiLoading && visibleOrgModules.length > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate('/director')}
                  className="rounded border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-secondary hover:border-theme-border hover:text-theme-text transition-colors"
                >
                  Director's View →
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => navigate('/studio')}
                className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
              >
                + New module
              </button>
            </div>
          </div>

          {apiError ? (
            <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{apiError}</div>
          ) : null}

          {deleteError ? (
            <p className="text-sm text-red-400">Delete failed: {deleteError}</p>
          ) : null}

          {!apiError && !apiLoading && visibleOrgModules.length === 0 ? (
            <p className="text-xs text-theme-muted">
              No modules yet.{' '}
              <button
                type="button"
                onClick={() => navigate('/studio')}
                className="text-violet-400 hover:text-violet-300 underline"
              >
                Generate your first module →
              </button>
            </p>
          ) : null}

          {!apiError && visibleOrgModules.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleOrgModules.map((mod) => {
                const isFailed = isGenerationFailed(mod.generationMetadata);
                const statusStyle: Record<string, string> = {
                  draft:     'border-theme-border text-theme-secondary',
                  in_review: 'border-amber-500/60 text-amber-300',
                  deployed:  'border-emerald-500/60 text-emerald-300',
                  stale:     'border-red-500/60 text-red-300',
                };
                const statusLabel: Record<string, string> = {
                  draft:     'Draft',
                  in_review: 'In Review',
                  deployed:  'Deployed',
                  stale:     'Stale',
                };
                return (
                  <div
                    key={mod.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-theme-border bg-theme-surface/50 px-4 py-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cx(
                            'rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                            isFailed
                              ? 'border-red-500/60 text-red-300'
                              : (statusStyle[mod.status] ?? 'border-theme-border text-theme-secondary')
                          )}
                        >
                          {isFailed ? 'Generation Failed' : (statusLabel[mod.status] ?? mod.status)}
                        </span>
                        <span className="text-[11px] text-theme-muted">
                          {new Date(mod.createdAt).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-theme-text leading-snug">{mod.title}</p>
                      <p className="text-xs text-theme-muted">{mod.regulatoryClassification.primarySchemaTitle}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isFailed ? (
                        <>
                          <button
                            type="button"
                            onClick={() => navigate('/studio')}
                            className="rounded border border-violet-500/60 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 transition-colors"
                          >
                            Retry in Studio
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === mod.id}
                            onClick={() => void handleDeleteDraft(mod.id)}
                            className={confirmDeleteId === mod.id
                              ? 'rounded border border-red-500/60 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 transition-colors'
                              : 'rounded border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-secondary hover:border-red-500/60 hover:text-red-300 transition-colors'}
                          >
                            {deletingId === mod.id ? '…' : confirmDeleteId === mod.id ? 'Confirm?' : 'Delete'}
                          </button>
                        </>
                      ) : (
                        <>
                          {mod.status === 'in_review' ? (
                            <button
                              type="button"
                              onClick={() => navigate('/reviewer')}
                              className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
                            >
                              Review
                            </button>
                          ) : null}
                          {mod.status === 'deployed' ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/learn/${mod.id}`)}
                              className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
                            >
                              Start learning
                            </button>
                          ) : null}
                          {mod.status === 'stale' ? (
                            <button
                              type="button"
                              onClick={() => navigate('/studio')}
                              className="rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition-colors"
                            >
                              Regenerate
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-theme-text">Available Modules</h1>
          <span className="text-xs text-theme-secondary">{modules.length} modules</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((theme) => {
            const accentText = theme.colors?.accentTextClassName ?? 'text-amber-300';
            const accentBorder = theme.colors?.accentBorderClassName ?? 'border-amber-500/40';
            const accentBg = theme.colors?.accentBgClassName ?? 'bg-amber-500/10';

            return (
              <Card key={theme.id} className="flex h-full flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div
                        className={cx(
                          'inline-flex rounded border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider',
                          accentBorder,
                          accentBg,
                          accentText
                        )}
                      >
                        {theme.icon ?? theme.id}
                      </div>
                      <h2 className="mt-3 text-xl font-semibold text-theme-text">{theme.title}</h2>
                    </div>
                    <span className="rounded border border-theme-border px-2 py-1 text-[11px] text-theme-secondary">
                      {theme.curriculum.length} stages
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-theme-secondary">{theme.shortDescription ?? theme.description}</p>
                  <p className="mt-2 text-xs text-theme-secondary">{estimateModuleTime(theme)}</p>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-xs text-theme-muted">
                    {theme.flags?.hasAdaptiveReview ? 'Adaptive review enabled' : 'Adaptive review optional'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentThemeId(theme.id);
                      navigate(`/${theme.id}/dashboard`);
                    }}
                    className="rounded bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300"
                  >
                    Start
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
};
