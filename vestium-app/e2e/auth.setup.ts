import { test as setup } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';

function emailFor(persona: string): string {
  const specific = process.env[`E2E_${persona.toUpperCase()}_EMAIL`];
  if (specific) return specific;
  const fallback = process.env.E2E_USER_EMAIL;
  if (fallback) return fallback;
  throw new Error(
    `No email configured for ${persona}.\n` +
      `Set E2E_${persona.toUpperCase()}_EMAIL or E2E_USER_EMAIL in .env.e2e`,
  );
}

/* Space out Clerk sign-ins to avoid 429 rate limits (free-tier ~100 req/10min) */
const AUTH_DELAY_MS = 5_000;

setup('authenticate as reviewer', async ({ page }) => {
  await page.goto('/');
  await clerk.signIn({ page, emailAddress: emailFor('reviewer') });
  await page.context().storageState({ path: 'e2e/.auth/reviewer.json' });
  await page.waitForTimeout(AUTH_DELAY_MS);
});

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/');
  await clerk.signIn({ page, emailAddress: emailFor('admin') });
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
  await page.waitForTimeout(AUTH_DELAY_MS);
});

setup('authenticate as learner', async ({ page }) => {
  await page.goto('/');
  await clerk.signIn({ page, emailAddress: emailFor('learner') });
  await page.context().storageState({ path: 'e2e/.auth/learner.json' });
  await page.waitForTimeout(AUTH_DELAY_MS);
});
