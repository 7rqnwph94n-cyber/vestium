// ─── Learn Hub Page ───────────────────────────────────────────────────────────
// Learner portal: assigned modules, in-progress modules, completed modules.
// Wraps existing ModulesPage content under the /learn route.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Card } from '../../components/Card';
import { modulesRegistry } from '../../lib/training-core/registry';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { isBackendMode, listModules } from '../../lib/api/client';
import type { ModuleRecord } from '@complianceforge/types';

const STATUS_STYLE: Record<string, string> = {
  deployed: 'text-emerald-300 border-emerald-500/60',
  stale: 'text-red-300 border-red-500/60',
};

const STATUS_LABEL: Record<string, string> = {
  deployed: 'Available',
  stale: 'Update Required',
};

export const LearnHubPage = () => {
  const navigate = useNavigate();
  const { setCurrentThemeId } = useTheme();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const localModules = useMemo(() => Object.values(modulesRegistry), []);
  const [apiModules, setApiModules] = useState<ModuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isBackendMode() || !isLoaded || !isSignedIn) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const token = await getToken();
      if (!token || cancelled) return;

      const res = await listModules(token);
      if (!cancelled) {
        if (res.ok) {
          // Show only deployed modules to learners
          setApiModules(res.data.filter((m) => m.status === 'deployed'));
        } else {
          setError(res.error);
        }
        setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken]);

  const handleModuleClick = (moduleId: string) => {
    setCurrentThemeId(moduleId);
    navigate(`/learn/${moduleId}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-theme-text">Learn</h1>
        <p className="text-sm text-theme-secondary mt-1">Your assigned training modules</p>
      </div>

      {loading && <div className="rounded border border-theme-border bg-theme-panel/60 p-4 text-sm text-theme-secondary">Loading…</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>}

      {/* Backend modules (deployed) */}
      {apiModules.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apiModules.map((m) => (
            <Card key={m.id} className="cursor-pointer hover:border-theme-border transition-colors">
              <button
                type="button"
                onClick={() => handleModuleClick(m.id)}
                className="w-full text-left space-y-1"
              >
                <h3 className="text-sm font-semibold text-theme-text">{m.title}</h3>
                <p className="text-xs text-theme-muted">{m.regulatoryClassification?.primarySchemaTitle ?? 'General compliance'}</p>
                <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[m.status] ?? STATUS_STYLE.deployed}`}>
                  {STATUS_LABEL[m.status] ?? m.status}
                </span>
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Local/demo modules (non-backend mode) */}
      {!isBackendMode() && localModules.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {localModules.map((m) => (
            <Card key={m.id} className="cursor-pointer hover:border-theme-border transition-colors">
              <button
                type="button"
                onClick={() => { setCurrentThemeId(m.id); navigate(`/${m.id}/dashboard`); }}
                className="w-full text-left space-y-1"
              >
                <h3 className="text-sm font-semibold text-theme-text">{m.title}</h3>
                {m.description && <p className="text-xs text-theme-secondary">{m.description}</p>}
              </button>
            </Card>
          ))}
        </div>
      )}

      {!loading && apiModules.length === 0 && localModules.length === 0 && !error && (
        <Card>
          <p className="text-sm text-theme-muted italic">No modules assigned yet. Check back once your organisation deploys training content.</p>
        </Card>
      )}
    </div>
  );
};
