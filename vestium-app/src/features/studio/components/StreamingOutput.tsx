import { useEffect, useRef } from 'react';

interface Props {
  text: string;
  label?: string;
  minHeight?: string;
}

export function StreamingOutput({ text, label, minHeight = '200px' }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as chunks arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [text]);

  return (
    <div className="overflow-hidden rounded border border-theme-border bg-theme-base">
      {label && (
        <div className="border-b border-theme-border-subtle px-3 py-1.5">
          <span className="text-xs font-medium text-theme-muted">{label}</span>
        </div>
      )}
      <pre
        className="overflow-y-auto p-3 font-mono text-xs text-theme-secondary leading-relaxed whitespace-pre-wrap break-words"
        style={{ minHeight, maxHeight: '400px' }}
      >
        {text || <span className="text-slate-700 italic">Waiting for output...</span>}
        <div ref={bottomRef} />
      </pre>
    </div>
  );
}
