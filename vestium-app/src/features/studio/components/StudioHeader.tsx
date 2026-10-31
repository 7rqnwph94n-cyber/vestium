import { Link, useNavigate } from 'react-router-dom';
import { UIThemePicker } from '../../../components/UIThemePicker';

export function StudioHeader() {
  const navigate = useNavigate();

  const handleResetRun = () => {
    const confirmed = window.confirm('Reset current Studio run and clear saved progress?');
    if (!confirmed) return;
    try {
      localStorage.removeItem('studio-generator-state');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('studio-preview-')) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore
    }
    try {
      const req = indexedDB.deleteDatabase('studio-generator-state-db');
      req.onsuccess = () => window.location.reload();
      req.onerror = () => window.location.reload();
      req.onblocked = () => window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <header className="flex items-center justify-between border-b border-theme-border-subtle bg-theme-base/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <img
          src="/curricusmith-logo.png"
          alt="CurricuSmith"
          className="h-14 w-auto drop-shadow-[0_0_34px_rgba(56,189,248,0.38)] sm:h-16"
        />
        <span className="translate-y-[5px] text-sm font-semibold text-theme-text sm:text-base">Curriculum Studio</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
              return;
            }
            navigate('/');
          }}
          className="rounded border border-theme-border px-2 py-1 text-xs font-semibold text-theme-text hover:border-theme-border"
        >
          Back
        </button>
        <Link
          to="/"
          className="rounded border border-theme-border px-2 py-1 text-xs font-semibold text-theme-text hover:border-theme-border"
        >
          Home
        </Link>
        <button
          onClick={handleResetRun}
          className="rounded border border-red-900/50 bg-red-950/30 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-900/40"
        >
          Reset Run
        </button>
        <UIThemePicker />
      </div>
    </header>
  );
}
