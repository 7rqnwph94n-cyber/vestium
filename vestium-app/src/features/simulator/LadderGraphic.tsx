export type LadderGlyph =
  | { kind: 'contact'; label: string; active: boolean; style?: 'no' | 'nc' }
  | { kind: 'coil'; label: string; active: boolean }
  | { kind: 'op'; label: string; active?: boolean };

export const LadderGraphic = ({ active, glyphs }: { active: boolean; glyphs: LadderGlyph[] }) => (
  <div className="mb-3 rounded border border-theme-border bg-theme-base p-2">
    <div className="mb-1 flex items-center justify-between text-[10px] text-theme-muted">
      <span>|</span>
      <span>|</span>
    </div>
    <div className="flex flex-wrap items-center gap-1">
      <span className={`text-xs ${active ? 'text-emerald-300' : 'text-theme-muted'}`}>─</span>
      {glyphs.map((glyph, idx) => (
        <div key={`${glyph.kind}-${glyph.label}-${idx}`} className="flex items-center gap-1">
          {glyph.kind === 'contact' ? (
            <div
              className={`relative rounded border px-2 py-1 text-[10px] font-mono ${
                glyph.active
                  ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                  : 'border-theme-border bg-theme-panel text-theme-secondary'
              }`}
            >
              <span className="pr-4">{glyph.label}</span>
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px]">
                {glyph.style === 'nc' ? ']/[' : '[ ]'}
              </span>
            </div>
          ) : glyph.kind === 'coil' ? (
            <div
              className={`rounded-full border px-2 py-1 text-[10px] font-mono ${
                glyph.active
                  ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                  : 'border-theme-border bg-theme-panel text-theme-secondary'
              }`}
            >
              ({glyph.label})
            </div>
          ) : (
            <div
              className={`px-1 text-[10px] font-semibold ${
                glyph.active ?? active ? 'text-amber-300' : 'text-theme-muted'
              }`}
            >
              {glyph.label}
            </div>
          )}
          {idx < glyphs.length - 1 ? (
            <span className={`text-xs ${active ? 'text-emerald-300' : 'text-theme-muted'}`}>─</span>
          ) : null}
        </div>
      ))}
      <span className={`text-xs ${active ? 'text-emerald-300' : 'text-theme-muted'}`}>─</span>
    </div>
  </div>
);
