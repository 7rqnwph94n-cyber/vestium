import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { registerDynamicModule } from '../../lib/training-core/registry';
import { buildRuntimeThemeConfig } from '../studio/generator/runtimeAssembler';
import { getLearnerModule, isBackendMode } from '../../lib/api/client';
import type { AssembledModule } from '../studio/generator/types';

export const LearnerEntryPage = () => {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { setCurrentThemeId } = useTheme();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleId) {
      setError('No module ID provided');
      return;
    }

    if (!isBackendMode()) {
      setError('Backend mode is not configured. Set VITE_API_URL to enable learner delivery.');
      return;
    }

    let cancelled = false;

    const load = async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setError('Sign in to access this module');
        return;
      }

      const res = await getLearnerModule(token, moduleId);
      if (!res.ok) {
        if (!cancelled) setError((res as { ok: false; error: string }).error);
        return;
      }
      if (cancelled) return;

      const assembled = (res as { ok: true; data: unknown }).data as AssembledModule;
      const themeConfig = buildRuntimeThemeConfig(moduleId, assembled);
      registerDynamicModule(themeConfig);
      setCurrentThemeId(moduleId);
      navigate(`/${moduleId}/dashboard`, { replace: true });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [moduleId, getToken, navigate, setCurrentThemeId]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-theme-base p-8">
        <div className="max-w-sm rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-5">
          <p className="text-sm font-semibold text-amber-200">Unable to load module</p>
          <p className="mt-1 text-sm text-theme-secondary">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-theme-base">
      <p className="text-sm text-theme-secondary">Loading module…</p>
    </div>
  );
};
