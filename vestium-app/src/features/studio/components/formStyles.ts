/**
 * Shared CSS class strings and utilities for Studio intake form panels.
 * Extracted from DomainSetupPanel and WorkplaceIntakePanel to eliminate duplication.
 */

export function inputClass(accentColor: 'violet' | 'amber' = 'violet') {
  return `w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text placeholder-slate-600 shadow-theme focus:border-${accentColor}-500 focus:outline-none`;
}

export const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400';

export const sectionHeadingClass = 'text-xs font-semibold uppercase tracking-widest text-slate-500';

/**
 * Derive a module ID from free-text input.
 * Lowercases, strips non-alphanumeric, takes the first two words.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('');
}

/**
 * Validates a derived module ID.
 * Returns an error message or null if valid.
 */
export function validateModuleId(id: string, reservedIds: string[] = []): string | null {
  if (!id) return null;
  if (id.length < 3) return 'ID must be at least 3 characters.';
  if (!/^[a-z][a-z0-9]*$/.test(id)) return 'ID must start with a letter and contain only lowercase letters/digits.';
  if (reservedIds.includes(id)) return 'This ID is reserved.';
  return null;
}
