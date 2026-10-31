import { useMemo, useState } from 'react';
import { LessonDiagram } from '../lib/training-core/types';
import { cx } from '../utils/classNames';

const nodeClass = 'rounded border border-theme-border bg-theme-surface px-3 py-2 text-center text-xs text-theme-text';

function inferApiOrigin(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // fall through to runtime host inference
    }
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return 'http://localhost:3001';
}

export const DiagramRenderer = ({ diagram }: { diagram: LessonDiagram }) => {
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const primaryImageUrl = useMemo(() => {
    if (!diagram.imageUrl) return undefined;
    return diagram.imageUrl;
  }, [diagram.imageUrl]);

  const fallbackImageUrls = useMemo(() => {
    if (!diagram.imageUrl) return undefined;
    let pathname = '';
    try {
      pathname = new URL(diagram.imageUrl).pathname;
    } catch {
      return undefined;
    }
    if (!pathname.startsWith('/assets/')) return undefined;

    const candidates: string[] = [];
    const apiOrigin = inferApiOrigin();
    if (apiOrigin) candidates.push(apiOrigin);
    if (typeof window !== 'undefined') {
      candidates.push(window.location.origin);
      candidates.push(`${window.location.protocol}//${window.location.hostname}:3001`);
    }

    const uniqueCandidates = [...new Set(candidates)];
    const urls = uniqueCandidates
      .map((origin) => `${origin}${pathname}`)
      .filter((u) => u !== diagram.imageUrl);
    return urls.length > 0 ? urls : undefined;
  }, [diagram.imageUrl]);

  const effectiveImageUrl =
    fallbackIndex > 0 && fallbackImageUrls
      ? fallbackImageUrls[fallbackIndex - 1]
      : primaryImageUrl;

  if (diagram.kind === 'image') {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-amber-300">{diagram.title}</p>
        <div className="overflow-hidden rounded border border-theme-border bg-theme-base">
          {effectiveImageUrl ? (
            <img
              src={effectiveImageUrl}
              alt={diagram.alt ?? diagram.title}
              className="max-h-[26rem] w-full bg-white object-contain"
              loading="lazy"
              onError={() => {
                if (fallbackImageUrls && fallbackIndex < fallbackImageUrls.length) {
                  setFallbackIndex((idx) => idx + 1);
                  return;
                }
                setFailed(true);
              }}
            />
          ) : null}
          {failed ? (
            <p className="border-t border-theme-border-subtle p-3 text-xs text-amber-300">
              Image failed to load: {diagram.imageUrl}
            </p>
          ) : null}
          <div className="space-y-1 border-t border-theme-border-subtle p-3">
            {diagram.caption ? <p className="text-xs text-theme-secondary">{diagram.caption}</p> : null}
            {diagram.attribution ? (
              <p className="text-[11px] text-theme-secondary">
                Source:{' '}
                <a className="text-amber-300 hover:text-amber-200" href={diagram.attribution.sourceUrl} target="_blank" rel="noreferrer">
                  {diagram.attribution.sourceName}
                </a>
                {diagram.attribution.creator ? ` (${diagram.attribution.creator})` : ''} | License:{' '}
                {diagram.attribution.licenseUrl ? (
                  <a className="text-amber-300 hover:text-amber-200" href={diagram.attribution.licenseUrl} target="_blank" rel="noreferrer">
                    {diagram.attribution.licenseName}
                  </a>
                ) : (
                  diagram.attribution.licenseName
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (diagram.kind === 'timeline') {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-amber-300">{diagram.title}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {diagram.nodes.map((node, idx) => (
            <div key={node.id} className={cx(nodeClass, 'relative')}>
              {idx !== 0 ? <span className="absolute -left-2 top-1/2 hidden -translate-y-1/2 text-amber-400 sm:block">→</span> : null}
              {node.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (diagram.kind === 'rung') {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-amber-300">{diagram.title}</p>
        <div className="rounded border border-theme-border bg-theme-base p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-theme-muted">
            <span>|</span>
            <span>|</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {diagram.nodes.map((node, idx) => (
              <div key={node.id} className="flex items-center gap-2">
                <div className={nodeClass}>{node.label}</div>
                {idx < diagram.nodes.length - 1 ? <span className="text-amber-400">─</span> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-amber-300">{diagram.title}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {diagram.nodes.map((node, idx) => (
          <div key={node.id} className={cx(nodeClass, 'relative')}>
            {idx < diagram.nodes.length - 1 ? <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-amber-400 sm:block">→</span> : null}
            {node.label}
          </div>
        ))}
      </div>
    </div>
  );
};
