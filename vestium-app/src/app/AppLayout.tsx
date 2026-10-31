import { Link, Outlet, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { Header } from '../components/Header';
import { useTheme } from '../lib/training-core/ThemeContext';
import { useServerProgressSync } from '../features/progress/useServerProgressSync';
import { cx } from '../utils/classNames';

export const AppLayout = () => {
  const { currentTheme, currentThemeId, setCurrentThemeId } = useTheme();
  const params = useParams();
  const labels = currentTheme.labels ?? {};
  const hasSiemensTrack = Boolean(currentTheme.flags?.hasSiemensTrack);
  const routeThemeId = params.themeId;

  // Sync learner progress to server for dynamic modules (UUID-format themeIds)
  const isDynamicModule = currentThemeId && /^[0-9a-f-]{36}$/.test(currentThemeId);
  useServerProgressSync(isDynamicModule ? currentThemeId : undefined);

  useEffect(() => {
    if (!routeThemeId) return;
    if (routeThemeId !== currentThemeId) {
      setCurrentThemeId(routeThemeId);
    }
  }, [routeThemeId, currentThemeId, setCurrentThemeId]);

  return (
    <div className={cx('min-h-screen bg-transparent text-theme-text', currentTheme.className, currentTheme.colors?.pageClassName)}>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-theme-border-subtle bg-theme-base/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-theme-secondary">
          <p>Developed by Rich Brotherton c2026</p>
          <div className="flex items-center gap-3">
            {hasSiemensTrack ? (
              <Link to="/siemens-track" className="text-theme-secondary hover:text-[var(--accent-controller-text)]">
                {labels.siemensTrackTitle ?? 'Siemens Track'}
              </Link>
            ) : null}
            <Link to="/sources" className="text-theme-secondary hover:text-[var(--accent-controller-text)]">
              {labels.sourcesTitle ?? 'Credits & Sources'}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
