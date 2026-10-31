// ─── Minimal JSON diff utility ────────────────────────────────────────────────
// Recursively compares two JSON-serialisable values and returns a list of
// differences. Output capped at MAX_ENTRIES to prevent abuse on large modules.

export interface DiffEntry {
  path: string;
  op: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

const MAX_ENTRIES = 500;

export function jsonDiff(a: unknown, b: unknown): DiffEntry[] {
  const entries: DiffEntry[] = [];
  walk(a, b, '', entries);
  return entries;
}

function walk(a: unknown, b: unknown, path: string, out: DiffEntry[]): void {
  if (out.length >= MAX_ENTRIES) return;

  if (a === b) return;

  // Both null/undefined — equal
  if (a == null && b == null) return;

  // One side null
  if (a == null) { out.push({ path: path || '$', op: 'added', newValue: summarise(b) }); return; }
  if (b == null) { out.push({ path: path || '$', op: 'removed', oldValue: summarise(a) }); return; }

  // Different types
  if (typeof a !== typeof b) {
    out.push({ path: path || '$', op: 'changed', oldValue: summarise(a), newValue: summarise(b) });
    return;
  }

  // Primitives
  if (typeof a !== 'object') {
    if (a !== b) out.push({ path: path || '$', op: 'changed', oldValue: a, newValue: b });
    return;
  }

  // Arrays — positional diff
  if (Array.isArray(a) && Array.isArray(b)) {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen && out.length < MAX_ENTRIES; i++) {
      const childPath = path ? `${path}[${i}]` : `[${i}]`;
      if (i >= a.length) { out.push({ path: childPath, op: 'added', newValue: summarise(b[i]) }); continue; }
      if (i >= b.length) { out.push({ path: childPath, op: 'removed', oldValue: summarise(a[i]) }); continue; }
      walk(a[i], b[i], childPath, out);
    }
    return;
  }

  // Objects
  if (!Array.isArray(a) && !Array.isArray(b)) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of allKeys) {
      if (out.length >= MAX_ENTRIES) break;
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in aObj)) { out.push({ path: childPath, op: 'added', newValue: summarise(bObj[key]) }); continue; }
      if (!(key in bObj)) { out.push({ path: childPath, op: 'removed', oldValue: summarise(aObj[key]) }); continue; }
      walk(aObj[key], bObj[key], childPath, out);
    }
    return;
  }

  // Mismatched (array vs object)
  out.push({ path: path || '$', op: 'changed', oldValue: summarise(a), newValue: summarise(b) });
}

/** Summarise large values to keep diff output manageable. */
function summarise(v: unknown): unknown {
  if (v == null || typeof v !== 'object') return v;
  const json = JSON.stringify(v);
  if (json.length > 200) return `[${typeof v} ${json.length} chars]`;
  return v;
}
