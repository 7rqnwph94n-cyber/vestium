import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';

export { expect };

/* ── Types ───────────────────────────────────────────────────────── */

export interface StepMetrics {
  id: string;
  title: string;
  url: string;
  task: string;
  durationMs: number;
  consoleErrors: string[];
  networkErrors: string[];
  status: 'pass' | 'fail' | 'warn';
  notes: string[];
}

/* ── Clerk noise filter ──────────────────────────────────────────── */

const CLERK_NOISE_PATTERNS = [
  'NotSameOrigin',
  'ERR_BLOCKED_BY_RESPONSE',
  /clerk.*429/i,
  /429.*clerk/i,
  '429 (Too Many Requests)',
  'status of 429',
];

function isClerkNoise(text: string): boolean {
  return CLERK_NOISE_PATTERNS.some((p) =>
    typeof p === 'string' ? text.includes(p) : p.test(text),
  );
}

/* ── Console & network error tracking ────────────────────────────── */

export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (isClerkNoise(text)) return;
      errors.push(text);
    }
  });
  return errors;
}

export function trackNetworkErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('response', (res) => {
    if (res.status() >= 500) {
      const url = res.url();
      if (url.includes('clerk')) return;
      errors.push(`${res.status()} ${url}`);
    }
  });
  return errors;
}

/* ── Pace control — avoid Clerk 429 rate limits ──────────────────── */

const STEP_DELAY_MS = 2_000;
const RATE_LIMIT_WAIT_MS = 15_000;
const MAX_RATE_LIMIT_RETRIES = 10;

/* ── Wait for page to be free of rate limit errors ───────────────── */

async function waitForRateLimitClear(page: Page): Promise<void> {
  const body = await page.locator('body').textContent().catch(() => '');
  if (!(body ?? '').includes('Too Many Requests')) return;

  // IMPORTANT: Don't reload frequently during rate limits — each reload triggers
  // Clerk re-init (~3-5 API calls) which EXTENDS the rate limit window.
  // Strategy: wait in 30s increments, only reload every 3rd attempt.
  for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
    const elapsed = (attempt + 1) * RATE_LIMIT_WAIT_MS / 1000;
    console.log(`[e2e] Rate limit detected — waiting ${RATE_LIMIT_WAIT_MS / 1000}s (attempt ${attempt + 1}, ${elapsed}s total)...`);
    await page.waitForTimeout(RATE_LIMIT_WAIT_MS);

    // Only reload every 3rd attempt to avoid extending the rate limit
    if ((attempt + 1) % 3 === 0) {
      await page.reload({ waitUntil: 'networkidle' });
      const refreshed = await page.locator('body').textContent().catch(() => '');
      if (!(refreshed ?? '').includes('Too Many Requests')) return;
    }
  }
  // Final reload after all waits
  await page.reload({ waitUntil: 'networkidle' });
}

/* ── Navigate within the same page (SPA router) ─────────────────── */

export async function navigateTo(page: Page, url: string) {
  await page.waitForTimeout(STEP_DELAY_MS);

  const currentUrl = new URL(page.url());
  const targetPath = url.startsWith('http') ? new URL(url).pathname : url;

  if (currentUrl.pathname === targetPath) {
    // Already on the right page — just reload to get fresh state
    await page.reload({ waitUntil: 'networkidle' });
  } else {
    // Navigate to new URL
    await page.goto(url, { waitUntil: 'networkidle' });
  }

  await waitForRateLimitClear(page);
}

/* ── Full page.goto with rate limit recovery ─────────────────────── */

export async function safeGoto(page: Page, url: string) {
  await page.waitForTimeout(STEP_DELAY_MS);
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitForRateLimitClear(page);
}

/* ── Attach step metrics for UX reporter ─────────────────────────── */

export async function attachStepMetrics(testInfo: TestInfo, metrics: StepMetrics) {
  await testInfo.attach('step-metrics', {
    body: JSON.stringify(metrics),
    contentType: 'application/json',
  });
}

/* ── Run a full step: navigate → assert → screenshot → metrics ──── */

export async function runStep(
  page: Page,
  testInfo: TestInfo,
  opts: {
    id: string;
    title: string;
    url: string;
    task: string;
    /** CSS selector that must be visible for the page to count as loaded */
    waitFor?: string;
    /** Extra soft checks — return notes for anything unexpected */
    check?: (page: Page) => Promise<string[]>;
  },
) {
  const start = Date.now();
  const consoleErrors = trackConsoleErrors(page);
  const networkErrors = trackNetworkErrors(page);

  await navigateTo(page, opts.url);

  if (opts.waitFor) {
    await expect(page.locator(opts.waitFor).first()).toBeVisible({ timeout: 15_000 });
  }

  const notes = opts.check ? await opts.check(page) : [];

  await page.screenshot({
    path: `e2e/screenshots/${opts.id}.png`,
    fullPage: true,
  });

  const durationMs = Date.now() - start;
  const hasIssues = consoleErrors.length > 0 || networkErrors.length > 0 || notes.length > 0;

  await attachStepMetrics(testInfo, {
    id: opts.id,
    title: opts.title,
    url: opts.url,
    task: opts.task,
    durationMs,
    consoleErrors,
    networkErrors,
    status: consoleErrors.length > 0 || networkErrors.length > 0 ? 'warn' : hasIssues ? 'warn' : 'pass',
    notes,
  });
}
