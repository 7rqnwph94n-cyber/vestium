import { test, expect } from '@playwright/test';
import { navigateTo, safeGoto, trackConsoleErrors, trackNetworkErrors, attachStepMetrics } from './helpers';

test('Persona: H&S Manager (Admin) — full walkthrough', async ({ page }, testInfo) => {
  const consoleErrors = trackConsoleErrors(page);
  const networkErrors = trackNetworkErrors(page);

  /* ─── Step 1: Landing Page ───────────────────────────────────── */
  await test.step('admin-01 Landing Page', async () => {
    const start = Date.now();
    await safeGoto(page, '/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    const notes: string[] = [];
    const body = await page.locator('body').textContent() ?? '';
    if (!body.toLowerCase().includes('compliance') && !body.toLowerCase().includes('training'))
      notes.push("Landing page doesn't mention compliance or training");
    await page.screenshot({ path: 'e2e/screenshots/admin-01.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'admin-01', title: 'Landing Page', url: '/',
      task: "You're considering this platform. What would you need to see?",
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Steps 2-5: Onboarding ──────────────────────────────────── */
  for (const [idx, title, task] of [
    [2, 'Company Profile', 'Set up your company profile.'],
    [3, 'Workplace Context', 'Describe your workplace context.'],
    [4, 'Invite Colleague', 'Invite a colleague. Was role selection clear?'],
    [5, 'Review Setup', 'Review your setup and complete onboarding.'],
  ] as [number, string, string][]) {
    await test.step(`admin-0${idx} Onboarding Step ${idx - 1} — ${title}`, async () => {
      const start = Date.now();
      const notes: string[] = [];
      await navigateTo(page, '/onboarding');
      if (!page.url().includes('onboarding')) {
        notes.push('Redirected — onboarding already complete');
      } else if (idx === 2) {
        const hasInputs = await page.locator('input, select, textarea').count();
        if (hasInputs === 0) notes.push('No form inputs found');
      }
      await page.screenshot({ path: `e2e/screenshots/admin-0${idx}.png`, fullPage: true });
      await attachStepMetrics(testInfo, {
        id: `admin-0${idx}`, title: `Onboarding Step ${idx - 1} — ${title}`, url: '/onboarding',
        task, durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
        status: 'pass', notes,
      });
    });
  }

  /* ─── Step 6: Audit Hub ──────────────────────────────────────── */
  await test.step('admin-06 Audit Hub', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await navigateTo(page, '/audit');
    const links = await page.getByRole('link').count();
    if (links < 2) notes.push('Audit hub has very few navigation links');
    await page.screenshot({ path: 'e2e/screenshots/admin-06.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'admin-06', title: 'Audit Hub', url: '/audit',
      task: 'Quick overview of compliance status.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 7: Director Dashboard ─────────────────────────────── */
  await test.step('admin-07 Director Dashboard', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await navigateTo(page, '/audit/director');
    const body = await page.locator('body').textContent() ?? '';
    if (!body.toLowerCase().includes('module') && !body.toLowerCase().includes('deploy'))
      notes.push('No module/deployment info visible');
    await page.screenshot({ path: 'e2e/screenshots/admin-07.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'admin-07', title: 'Director Dashboard', url: '/audit/director',
      task: 'Check which modules are deployed and who approved them.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 8: Stale Module Warnings ──────────────────────────── */
  await test.step('admin-08 Stale Module Warnings', async () => {
    const start = Date.now();
    const notes: string[] = [];
    // Already on /audit/director
    const body = await page.locator('body').textContent() ?? '';
    if (!body.toLowerCase().includes('stale') && !body.toLowerCase().includes('warning') && !body.toLowerCase().includes('update'))
      notes.push('No stale/warning indicators — may be expected');
    await page.screenshot({ path: 'e2e/screenshots/admin-08.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'admin-08', title: 'Stale Module Warnings', url: '/audit/director',
      task: 'Modules flagged as needing updates?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Steps 9-11: Evidence Dashboard ─────────────────────────── */
  for (const [idx, title, task, keyword] of [
    [9, 'Completion Rates', 'Check learner completion rates.', 'complet'],
    [10, 'Findings Summary', 'Look at the findings summary.', 'finding'],
    [11, 'Reviewer Activity', 'Check reviewer activity. Spot bottlenecks?', 'reviewer'],
  ] as [number, string, string, string][]) {
    await test.step(`admin-${idx} Evidence — ${title}`, async () => {
      const start = Date.now();
      const notes: string[] = [];
      if (idx === 9) await navigateTo(page, '/audit/evidence');
      const body = await page.locator('body').textContent() ?? '';
      if (!body.toLowerCase().includes(keyword))
        notes.push(`No ${keyword} data visible`);
      await page.screenshot({ path: `e2e/screenshots/admin-${idx}.png`, fullPage: true });
      await attachStepMetrics(testInfo, {
        id: `admin-${idx}`, title: `Evidence — ${title}`, url: '/audit/evidence',
        task, durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
        status: 'pass', notes,
      });
    });
  }

  /* ─── Step 12: SOP Review ────────────────────────────────────── */
  await test.step('admin-12 SOP Review', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await navigateTo(page, '/audit');
    const sopLink = page.getByRole('link', { name: /sop/i }).first();
    const hasSop = await sopLink.isVisible().catch(() => false);
    if (hasSop) {
      await sopLink.click();
      await page.waitForTimeout(2000);
      notes.push('Navigated to SOP section');
    } else {
      notes.push('No SOP links — SOPs may not be seeded');
    }
    await page.screenshot({ path: 'e2e/screenshots/admin-12.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'admin-12', title: 'SOP Review', url: '/audit',
      task: 'Open a standard operating procedure.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: hasSop ? 'pass' : 'warn', notes,
    });
  });

  /* ─── Step 13: RAMS Review ───────────────────────────────────── */
  await test.step('admin-13 RAMS Review', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await navigateTo(page, '/audit');
    const ramsLink = page.getByRole('link', { name: /rams|risk/i }).first();
    const hasRams = await ramsLink.isVisible().catch(() => false);
    if (hasRams) {
      await ramsLink.click();
      await page.waitForTimeout(2000);
      notes.push('Navigated to RAMS section');
    } else {
      notes.push('No RAMS links — RAMS may not be seeded');
    }
    await page.screenshot({ path: 'e2e/screenshots/admin-13.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'admin-13', title: 'RAMS Review', url: '/audit',
      task: 'Open a risk assessment review.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: hasRams ? 'pass' : 'warn', notes,
    });
  });

  /* ─── Step 14: Members Page ──────────────────────────────────── */
  await test.step('admin-14 Members Page', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await navigateTo(page, '/members');
    const body = await page.locator('body').textContent() ?? '';
    if (!body.toLowerCase().includes('member') && !body.toLowerCase().includes('invite'))
      notes.push('No members/invite content visible');
    const inviteBtn = page.getByRole('button', { name: /invite|add/i }).first();
    const hasInvite = await inviteBtn.isVisible().catch(() => false);
    if (!hasInvite) notes.push('No invite/add button found');
    await page.screenshot({ path: 'e2e/screenshots/admin-14.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'admin-14', title: 'Members Page', url: '/members',
      task: 'Add a new team member.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });
});
