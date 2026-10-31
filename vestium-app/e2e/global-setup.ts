import { clerkSetup } from '@clerk/testing/playwright';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  /* ── Ensure output dirs exist ──────────────────────────────────── */
  mkdirSync(resolve(__dirname, '.auth'), { recursive: true });
  mkdirSync(resolve(__dirname, 'screenshots'), { recursive: true });

  /* ── Pre-flight: dev servers running? ──────────────────────────── */
  const checks = [
    { name: 'Frontend', url: 'http://127.0.0.1:5173' },
    { name: 'API', url: 'http://localhost:3001/health' },
  ];

  for (const { name, url } of checks) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch {
      throw new Error(
        `${name} dev server not running at ${url}.\n` +
          'Start both servers first:\n' +
          '  pnpm dev --host 127.0.0.1          (frontend)\n' +
          '  pnpm --filter @complianceforge/api run dev:clean  (API)',
      );
    }
  }

  /* ── Clerk testing token ───────────────────────────────────────── */
  await clerkSetup();
}
