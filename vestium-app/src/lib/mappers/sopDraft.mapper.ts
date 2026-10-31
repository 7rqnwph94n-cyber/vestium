// ─── SOP Draft Extractor ─────────────────────────────────────────────────────
// Extracts the SOP document from generationMetadata (Record<string, unknown>).
// Replaces the untyped `meta['sopDraftBuild']` cast in SopViewerPage.

export function extractSopDraft<T>(meta: Record<string, unknown> | null | undefined): T | null {
  if (!meta) return null;
  const draft = meta.sopDraftBuild;
  if (!draft || typeof draft !== 'object') return null;
  return draft as T;
}
