// ─── CORS origin resolver ────────────────────────────────────────────────────
// Shared by the Fastify onRequest hook (index.ts) and SSE route (generation.ts).
// Both must use identical origin-validation logic — keeping it here prevents drift.

export const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => Boolean(s) && s !== '*')
);

/**
 * Returns the validated Access-Control-Allow-Origin value for a given request origin.
 * - Exact matches pass through.
 * - In dev (CORS_ORIGIN not set) any localhost/127.0.0.1 port is allowed.
 * - In production (CORS_ORIGIN set) non-matching origins get empty string (browser blocks).
 */
export function resolveCorsOrigin(reqOrigin: string): string {
  if (allowedOrigins.has(reqOrigin)) return reqOrigin;
  if (
    !process.env.CORS_ORIGIN &&
    (reqOrigin.startsWith('http://localhost:') || reqOrigin.startsWith('http://127.0.0.1:'))
  ) {
    return reqOrigin;
  }
  // In production: reject unknown origins by returning empty string.
  // In dev: fall back to default for convenience.
  return process.env.CORS_ORIGIN ? '' : 'http://localhost:5173';
}
