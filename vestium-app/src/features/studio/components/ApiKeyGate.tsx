import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { UseApiKeyReturn } from '../hooks/useApiKey';
import { UIThemePicker } from '../../../components/UIThemePicker';

interface Props {
  apiKey: UseApiKeyReturn;
  onReady: () => void;
}

export function ApiKeyGate({ apiKey, onReady }: Props) {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [showKey, setShowKey] = useState(false);

  const handleTestAndSave = async () => {
    const ok = await apiKey.testAndSave(inputValue);
    if (ok) onReady();
  };

  return (
    <div className="flex min-h-screen flex-col bg-theme-base text-theme-text">
      <header className="flex items-center justify-between border-b border-theme-border-subtle bg-theme-base/95 px-6 py-3 backdrop-blur">
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
          <span className="rounded bg-violet-600 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-white">
            Dev Tool
          </span>
          <span className="font-mono text-sm font-semibold text-theme-text">Curriculum Studio</span>
        </div>
        <UIThemePicker />
      </header>
      <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-lg border border-theme-border bg-theme-panel p-8 shadow-xl">
        <div className="mb-6">
          <span className="mb-3 block rounded bg-violet-600 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-white w-fit">
            Developer Tool
          </span>
          <h1 className="text-xl font-bold text-theme-text">Curriculum Studio</h1>
          <p className="mt-1 text-sm text-theme-secondary">
            Generates complete training modules using Claude AI.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-theme-secondary">
              Anthropic API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestAndSave()}
                placeholder="sk-ant-..."
                className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 pr-16 font-mono text-sm text-theme-text placeholder-slate-600 focus:border-violet-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-theme-muted hover:text-theme-secondary"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-theme-muted">
              Uses localStorage key first, then <span className="font-mono">VITE_ANTHROPIC_API_KEY</span> from .env.local. Sent only to api.anthropic.com.
            </p>
          </div>

          {apiKey.testError && (
            <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-400">
              {apiKey.testError}
            </div>
          )}

          <button
            onClick={handleTestAndSave}
            disabled={inputValue.length < 10 || apiKey.isTesting}
            className="w-full rounded bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            {apiKey.isTesting ? 'Testing connection...' : 'Test & Save Key'}
          </button>
        </div>

        <div className="mt-6 border-t border-theme-border-subtle pt-4">
          <p className="text-xs text-theme-muted">
            Don't have a key?{' '}
            <span className="text-theme-muted">Visit console.anthropic.com → API Keys</span>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
