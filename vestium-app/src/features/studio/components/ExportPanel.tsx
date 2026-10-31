import { useState } from 'react';
import type { ExportResult } from '../generator/types';

interface Props {
  result: ExportResult;
  moduleId: string;
  onPreview: () => void;
  onReset: () => void;
}

type DeployState = 'idle' | 'deploying' | 'done' | 'error';

export function ExportPanel({ result, moduleId, onPreview, onReset }: Props) {
  const [copiedFile, setCopiedFile] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>('idle');
  const [deployError, setDeployError] = useState<string | null>(null);

  const copyToClipboard = async (text: string, setFlag: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setFlag(true);
      setTimeout(() => setFlag(false), 2000);
    } catch {
      // Fallback: select + copy via execCommand
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setFlag(true);
      setTimeout(() => setFlag(false), 2000);
    }
  };

  const downloadFile = () => {
    const blob = new Blob([result.themeFile], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeploy = async () => {
    setDeployState('deploying');
    setDeployError(null);
    try {
      const res = await fetch('/api/studio/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
          themeFile: result.themeFile,
          fileName: result.fileName
        })
      });
      const rawBody = await res.text();
      let data: { success?: boolean; error?: string } | null = null;
      if (rawBody.trim()) {
        try {
          data = JSON.parse(rawBody) as { success?: boolean; error?: string };
        } catch {
          data = null;
        }
      }
      if (!res.ok) {
        const fallback = rawBody.trim()
          ? rawBody.trim().slice(0, 300)
          : 'Empty response body';
        throw new Error(
          data?.error ??
          `HTTP ${res.status} ${res.statusText || ''}`.trim() + ` — ${fallback}`
        );
      }
      if (!data?.success) {
        const fallback = rawBody.trim()
          ? rawBody.trim().slice(0, 300)
          : 'Empty response body';
        throw new Error(`Deploy endpoint returned unexpected payload: ${fallback}`);
      }
      // Clean up preview + persisted job — module is now permanently in the codebase
      try { localStorage.removeItem(`studio-preview-${moduleId}`); } catch { /* ignore */ }
      try { localStorage.removeItem('studio-generator-state'); } catch { /* ignore */ }
      setDeployState('done');
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : String(err));
      setDeployState('error');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-10 px-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs font-bold text-emerald-400">
            Export Ready
          </span>
        </div>
        <h2 className="text-lg font-bold text-theme-text">{result.fileName}</h2>
        <p className="mt-1 text-sm text-theme-secondary">
          Test the module in the full training UI, or deploy it directly to the codebase.
        </p>
      </div>

      {/* Primary actions */}
      <div className="flex flex-col gap-3 rounded border border-theme-border bg-theme-surface/50 p-4 sm:flex-row">
        <button
          onClick={onPreview}
          className="flex-1 rounded border border-violet-500/50 bg-violet-600/20 px-4 py-3 text-sm font-semibold text-violet-300 hover:bg-violet-600/30 transition-colors"
        >
          Test in New Tab ↗
          <span className="mt-0.5 block text-xs font-normal text-violet-400/70">
            Preview dashboard, lessons &amp; quizzes
          </span>
        </button>

        {deployState === 'done' ? (
          <div className="flex-1 rounded border border-emerald-600/50 bg-emerald-900/20 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-emerald-400">✓ Deployed</p>
            <a
              href={`/${moduleId}/dashboard`}
              className="mt-0.5 block text-xs text-emerald-500 hover:text-emerald-400 underline"
            >
              /{moduleId}/dashboard is live
            </a>
          </div>
        ) : (
          <button
            onClick={handleDeploy}
            disabled={deployState === 'deploying'}
            className="flex-1 rounded border border-theme-border bg-theme-raised/50 px-4 py-3 text-sm font-semibold text-theme-text hover:bg-theme-raised disabled:cursor-wait disabled:opacity-60 transition-colors"
          >
            {deployState === 'deploying' ? 'Deploying…' : 'Deploy to Codebase ↑'}
            <span className="mt-0.5 block text-xs font-normal text-theme-secondary">
              {deployState === 'deploying'
                ? 'Writing files…'
                : 'Writes files + updates registry.ts'}
            </span>
          </button>
        )}
      </div>

      {deployState === 'error' && deployError && (
        <div className="rounded border border-red-800/50 bg-red-900/20 px-4 py-3">
          <p className="text-xs font-semibold text-red-400">Deploy failed</p>
          <p className="mt-1 font-mono text-xs text-red-300 break-all">{deployError}</p>
          <p className="mt-1 text-xs text-theme-muted">
            Make sure the dev server is running with <span className="font-mono">VITE_ENABLE_STUDIO=true</span>.
            You can still download the file and add it manually.
          </p>
        </div>
      )}

      {/* Theme file */}
      <div className="overflow-hidden rounded border border-theme-border">
        <div className="flex items-center justify-between border-b border-theme-border bg-theme-surface px-3 py-2">
          <span className="font-mono text-xs text-theme-secondary">{result.fileName}</span>
          <div className="flex gap-2">
            <button
              onClick={() => copyToClipboard(result.themeFile, setCopiedFile)}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              {copiedFile ? '✓ Copied!' : 'Copy'}
            </button>
            <button
              onClick={downloadFile}
              className="text-xs text-theme-secondary hover:text-theme-text transition-colors"
            >
              Download
            </button>
          </div>
        </div>
        <pre className="max-h-96 overflow-y-auto p-3 font-mono text-xs text-theme-secondary leading-relaxed whitespace-pre-wrap break-words bg-theme-base">
          {result.themeFile}
        </pre>
      </div>

      {/* Registry snippet */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-theme-secondary">
          Manual integration — registry.ts snippet
        </h3>
        <div className="overflow-hidden rounded border border-theme-border">
          <div className="flex items-center justify-between border-b border-theme-border bg-theme-surface px-3 py-2">
            <span className="font-mono text-xs text-theme-secondary">src/lib/training-core/registry.ts</span>
            <button
              onClick={() => copyToClipboard(result.registrySnippet, setCopiedSnippet)}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              {copiedSnippet ? '✓ Copied!' : 'Copy snippet'}
            </button>
          </div>
          <pre className="p-3 font-mono text-xs text-theme-secondary leading-relaxed whitespace-pre-wrap bg-theme-base">
            {result.registrySnippet}
          </pre>
        </div>
      </div>

      {result.companionNotes ? (
        <div className="overflow-hidden rounded border border-theme-border">
          <div className="border-b border-theme-border bg-theme-surface px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">
              Generation Notes
            </span>
          </div>
          <pre className="whitespace-pre-wrap bg-theme-base p-3 font-mono text-xs leading-relaxed text-theme-secondary">
            {result.companionNotes}
          </pre>
        </div>
      ) : null}

      <button
        onClick={onReset}
        className="rounded border border-theme-border px-5 py-2.5 text-sm font-medium text-theme-secondary hover:border-theme-border hover:text-theme-text transition-colors"
      >
        ← Generate Another Module
      </button>
    </div>
  );
}
