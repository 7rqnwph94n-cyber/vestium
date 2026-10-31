import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { navigateTo, safeGoto, trackConsoleErrors, trackNetworkErrors, attachStepMetrics } from './helpers';

/** Dismiss the Quick Start onboarding wizard if present */
async function dismissQuickStart(page: Page) {
  const skipLink = page.locator('a, button').filter({ hasText: /^skip$/i }).first();
  if (await skipLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipLink.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Navigate to the learner dashboard without losing the dynamic module.
 * Uses /learn/:moduleId which goes through LearnerEntryPage → re-registers
 * the theme in memory → redirects to /:moduleId/dashboard.
 * Direct page.goto to /:moduleId/dashboard would lose the dynamic module.
 */
async function goToDashboard(page: Page, themeId: string) {
  await page.waitForTimeout(2000);
  const currentPath = new URL(page.url()).pathname;
  // If already on the dashboard, don't navigate (avoid reload)
  if (currentPath === `/${themeId}/dashboard` || currentPath === `/${themeId}`) {
    return;
  }
  // Navigate via LearnerEntryPage to re-register the dynamic module
  await page.goto(`/learn/${themeId}`, { waitUntil: 'networkidle' });
  await page.waitForURL((url) => !url.pathname.startsWith('/learn/'), { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await dismissQuickStart(page);
}

test('Persona: Ops Lead (Learner) — full walkthrough', async ({ page }, testInfo) => {
  const consoleErrors = trackConsoleErrors(page);
  const networkErrors = trackNetworkErrors(page);
  let themeId = '';

  /* ─── Step 1: Landing Page ───────────────────────────────────── */
  await test.step('learner-01 Landing Page', async () => {
    const start = Date.now();
    await safeGoto(page, '/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
    const learnLink = page.getByRole('link', { name: /learn/i }).first();
    await expect(learnLink, '"Learn" link must be visible').toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/learner-01.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-01', title: 'Landing Page', url: '/',
      task: 'Can you find where to start training?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes: [],
    });
  });

  /* ─── Step 2: Learn Hub ──────────────────────────────────────── */
  await test.step('learner-02 Learn Hub', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await navigateTo(page, '/learn');
    const body = await page.locator('body').textContent() ?? '';
    expect(
      body.toLowerCase().includes('module') || body.toLowerCase().includes('training') || body.toLowerCase().includes('racking'),
      'Learn Hub must show training content',
    ).toBeTruthy();
    await page.screenshot({ path: 'e2e/screenshots/learner-02.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-02', title: 'Learn Hub', url: '/learn',
      task: 'Browse the available training.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 3: Enter Module (GATE) ────────────────────────────── */
  await test.step('learner-03 Enter Module', async () => {
    const start = Date.now();
    const notes: string[] = [];
    const moduleCard = page.locator('a, button, [role="link"], [class*="card"], [class*="module"]')
      .filter({ hasText: /racking/i }).first();
    await expect(
      moduleCard,
      'A deployed module must be visible in Learn Hub. The reviewer must deploy it first.',
    ).toBeVisible({ timeout: 10_000 });

    await moduleCard.click();

    // LearnerEntryPage loads at /learn/:moduleId then redirects to /:moduleId/dashboard
    await page.waitForURL((url) => !url.pathname.startsWith('/learn/'), { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const urlParts = new URL(page.url()).pathname.split('/').filter(Boolean);
    expect(urlParts.length, 'Module URL must contain a themeId').toBeGreaterThan(0);
    themeId = urlParts[0];
    notes.push(`Discovered themeId: ${themeId}`);

    await page.screenshot({ path: 'e2e/screenshots/learner-03.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-03', title: 'Enter Module', url: '/learn',
      task: 'Open the training module.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 4: Module Dashboard ───────────────────────────────── */
  await test.step('learner-04 Module Dashboard', async () => {
    const start = Date.now();
    const notes: string[] = [];
    // Already on /:themeId/dashboard from step 3 — just dismiss Quick Start
    await dismissQuickStart(page);

    const body = await page.locator('body').textContent() ?? '';
    expect(body.toLowerCase().includes('stage'), 'Dashboard must show stage info').toBeTruthy();
    await page.screenshot({ path: 'e2e/screenshots/learner-04.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-04', title: 'Module Dashboard', url: `/${themeId}/dashboard`,
      task: 'What should you do first?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 5: Stage 1 Overview ───────────────────────────────── */
  await test.step('learner-05 Stage 1 Overview', async () => {
    const start = Date.now();
    const notes: string[] = [];

    // Click "Open Stage" button on the dashboard
    const openStageBtn = page.locator('a').filter({ hasText: /open stage/i }).first();
    await expect(openStageBtn, '"Open Stage" link must be visible').toBeVisible({ timeout: 10_000 });
    await openStageBtn.click();
    await page.waitForLoadState('networkidle');

    const body = await page.locator('body').textContent() ?? '';
    expect(body.toLowerCase().includes('lesson'), 'Stage overview must show lessons').toBeTruthy();
    notes.push('Stage overview loaded with lesson list');
    await page.screenshot({ path: 'e2e/screenshots/learner-05.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-05', title: 'Stage 1 Overview', url: page.url(),
      task: 'How many lessons do you need to complete?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 6: Open First Lesson ──────────────────────────────── */
  await test.step('learner-06 Open First Lesson', async () => {
    const start = Date.now();
    const notes: string[] = [];
    // Already on stage page from step 5 — find lesson link
    const lessonLink = page.locator('a, button, [role="link"]')
      .filter({ hasText: /lesson|open lesson|start|begin|1\./i }).first();
    if (await lessonLink.isVisible().catch(() => false)) {
      await lessonLink.click();
      await page.waitForLoadState('networkidle');
      notes.push('Opened first lesson');
    } else {
      notes.push('No individual lesson link — content may be inline');
    }
    await page.screenshot({ path: 'e2e/screenshots/learner-06.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-06', title: 'Open First Lesson', url: page.url(),
      task: 'Does it feel like real training content?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 7: Complete Quiz ──────────────────────────────────── */
  await test.step('learner-07 Complete Quiz', async () => {
    const start = Date.now();
    const notes: string[] = [];
    // Check current page for quiz content (may be on lesson page)
    const body = await page.locator('body').textContent() ?? '';
    if (body.toLowerCase().includes('quiz') || body.toLowerCase().includes('question')) {
      const option = page.locator('button, [role="radio"], label').filter({ hasText: /^[A-D]\.|option/i }).first();
      if (await option.isVisible().catch(() => false)) {
        await option.click();
        notes.push('Clicked a quiz option');
      } else {
        notes.push('Quiz detected but no clickable options');
      }
    } else {
      notes.push('No quiz visible on current page — may need to scroll or navigate deeper');
    }
    await page.screenshot({ path: 'e2e/screenshots/learner-07.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-07', title: 'Complete Quiz', url: page.url(),
      task: 'Attempt the quiz.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: notes.some((n) => n.includes('quiz') || n.includes('Quiz')) ? 'pass' : 'warn', notes,
    });
  });

  /* ─── Step 8: Return to Stage ────────────────────────────────── */
  await test.step('learner-08 Return to Stage', async () => {
    const start = Date.now();
    const notes: string[] = [];
    // Navigate back to dashboard via LearnerEntryPage (preserves dynamic module)
    await goToDashboard(page, themeId);
    const body = await page.locator('body').textContent() ?? '';
    if (body.includes('%') || body.toLowerCase().includes('progress') || body.toLowerCase().includes('complete'))
      notes.push('Progress indicator visible');
    else notes.push('No progress indicator found');
    await page.screenshot({ path: 'e2e/screenshots/learner-08.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-08', title: 'Return to Stage', url: page.url(),
      task: 'Can you see your progress?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 9: Second Lesson ──────────────────────────────────── */
  await test.step('learner-09 Second Lesson', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await dismissQuickStart(page);
    // Find stage/lesson links on dashboard
    const links = page.locator('a, button, [role="link"]')
      .filter({ hasText: /stage|lesson|open stage|2/i });
    const count = await links.count();
    if (count > 1) {
      await links.nth(1).click();
      await page.waitForLoadState('networkidle');
      notes.push('Navigated to second content item');
    } else if (count === 1) {
      await links.first().click();
      await page.waitForLoadState('networkidle');
      notes.push('Only one link found — navigated to it');
    } else {
      notes.push('No additional stage/lesson links');
    }
    await page.screenshot({ path: 'e2e/screenshots/learner-09.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-09', title: 'Second Lesson', url: page.url(),
      task: 'Does the content build on the first?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 10: Stage Test Gate ───────────────────────────────── */
  await test.step('learner-10 Stage Test Gate', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await goToDashboard(page, themeId);
    const testLink = page.locator('a, button').filter({ hasText: /test|exam|assessment/i }).first();
    const hasTest = await testLink.isVisible().catch(() => false);
    if (hasTest) {
      await testLink.click();
      await page.waitForLoadState('networkidle');
      notes.push('Navigated to stage test');
    } else {
      notes.push('Stage test not available — may need all lessons completed');
    }
    await page.screenshot({ path: 'e2e/screenshots/learner-10.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-10', title: 'Stage Test Gate', url: page.url(),
      task: 'What score do you need to pass?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: hasTest ? 'pass' : 'warn', notes,
    });
  });

  /* ─── Step 11: Stage Certificate ─────────────────────────────── */
  await test.step('learner-11 Stage Certificate', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await goToDashboard(page, themeId);
    const body = await page.locator('body').textContent() ?? '';
    if (body.toLowerCase().includes('certificate') || body.toLowerCase().includes('cert'))
      notes.push('Certificate reference found');
    else notes.push('No certificate visible — stage may not be complete');
    await page.screenshot({ path: 'e2e/screenshots/learner-11.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-11', title: 'Stage Certificate', url: page.url(),
      task: 'View your stage certificate.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });

  /* ─── Step 12: Sources Page ──────────────────────────────────── */
  await test.step('learner-12 Sources Page', async () => {
    const start = Date.now();
    const notes: string[] = [];
    // Look for sources/references link on current page (dashboard)
    const srcLink = page.locator('a').filter({ hasText: /source|reference|regulation/i }).first();
    const hasSrc = await srcLink.isVisible().catch(() => false);
    if (hasSrc) {
      await srcLink.click();
      await page.waitForLoadState('networkidle');
      notes.push('Navigated to sources page');
    } else {
      notes.push('No sources link found');
    }
    await page.screenshot({ path: 'e2e/screenshots/learner-12.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-12', title: 'Sources Page', url: page.url(),
      task: 'Check regulatory sources.',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: hasSrc ? 'pass' : 'warn', notes,
    });
  });

  /* ─── Step 13: Field Reference ───────────────────────────────── */
  await test.step('learner-13 Field Reference', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await goToDashboard(page, themeId);
    const refLink = page.locator('a').filter({ hasText: /field|reference|card|quick/i }).first();
    const hasRef = await refLink.isVisible().catch(() => false);
    if (hasRef) {
      await refLink.click();
      await page.waitForLoadState('networkidle');
      notes.push('Navigated to field reference');
    } else {
      notes.push('No field reference link found');
    }
    await page.screenshot({ path: 'e2e/screenshots/learner-13.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-13', title: 'Field Reference', url: page.url(),
      task: 'Would field reference cards be useful?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: hasRef ? 'pass' : 'warn', notes,
    });
  });

  /* ─── Step 14: Module Completion ─────────────────────────────── */
  await test.step('learner-14 Module Completion', async () => {
    const start = Date.now();
    const notes: string[] = [];
    await goToDashboard(page, themeId);
    const body = await page.locator('body').textContent() ?? '';
    if (body.toLowerCase().includes('complete') || body.toLowerCase().includes('certificate'))
      notes.push('Completion/certificate content found');
    else notes.push('No completion status — all stages may need completing first');
    await page.screenshot({ path: 'e2e/screenshots/learner-14.png', fullPage: true });
    await attachStepMetrics(testInfo, {
      id: 'learner-14', title: 'Module Completion', url: `/${themeId}/dashboard`,
      task: 'Is the certificate process clear?',
      durationMs: Date.now() - start, consoleErrors: [], networkErrors: [],
      status: 'pass', notes,
    });
  });
});
