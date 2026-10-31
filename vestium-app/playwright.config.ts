import { defineConfig, devices } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── Load .env.e2e if present (zero deps) ─────────────────────────── */
const envPath = resolve(__dirname, '.env.e2e');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 15_000 },

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'retain-on-failure',
  },

  reporter: [['list'], ['./e2e/ux-reporter.ts']],

  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    {
      name: 'reviewer',
      testMatch: 'reviewer.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/reviewer.json' },
    },
    {
      name: 'admin',
      testMatch: 'admin.spec.ts',
      dependencies: ['reviewer'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' },
    },
    {
      name: 'learner',
      testMatch: 'learner.spec.ts',
      dependencies: ['reviewer'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/learner.json' },
    },
  ],
});
