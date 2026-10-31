import { glossary } from '../data/glossary';

const pattern = /\[\[(.+?)\]\]/g;

const GlossaryTerm = ({ term }: { term: string }) => {
  const key = term.trim();
  const definition = glossary[key] ?? 'Definition unavailable.';
  return (
    <span className="group relative inline-flex cursor-help border-b border-dashed border-accent text-accentSoft">
      {key}
      <span className="pointer-events-none absolute -top-2 left-1/2 z-10 hidden w-64 -translate-x-1/2 -translate-y-full rounded-md border border-amber-500/40 bg-theme-panel p-2 text-xs text-theme-text shadow-lg group-hover:block">
        {definition}
      </span>
    </span>
  );
};

export const GlossaryText = ({ text }: { text: string }) => {
  const parts: Array<string | { term: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const full = match[0];
    const term = match[1];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push({ term });
    lastIndex = index + full.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return (
    <>
      {parts.map((part, idx) =>
        typeof part === 'string' ? <span key={idx}>{part}</span> : <GlossaryTerm key={idx} term={part.term} />
      )}
    </>
  );
};
