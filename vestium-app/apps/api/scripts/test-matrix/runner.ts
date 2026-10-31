#!/usr/bin/env npx tsx
// ─── Test Matrix Runner ──────────────────────────────────────────────────────
// Executes test cases against the ComplianceForge API.
//
// Usage:
//   npx tsx apps/api/scripts/test-matrix/runner.ts --all
//   npx tsx apps/api/scripts/test-matrix/runner.ts --case TM-01
//   npx tsx apps/api/scripts/test-matrix/runner.ts --case TM-01 --resume  (reuse existing module)
//
// Env vars (all optional when using dev token bypass):
//   TEST_TOKEN      — Clerk session token (overrides dev token)
//   TEST_API_TOKEN  — Static dev token (set in API .env; default: cf-test-matrix-dev-token-2026)
//   API_URL         — API base URL (default: http://127.0.0.1:3001)

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getClassifiedTestCases } from './matrix.js';
import type { TestResult, FindingSummary, StepSummary, CostBreakdown } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RESULTS_DIR = join(__dirname, 'results');

// Token priority: TEST_TOKEN (Clerk session) > TEST_API_TOKEN (dev bypass) > hardcoded dev token
const TOKEN = process.env.TEST_TOKEN
  ?? process.env.TEST_API_TOKEN
  ?? 'cf-test-matrix-dev-token-2026';
const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');

// ─── Cost calculation ───────────────────────────────────────────────────────
// Mirrors the logic in tokenEstimator.ts but self-contained for CLI use.

const GEMINI_STEP_PREFIXES = ['domainSurvey', 'coherencePass', 'factCheckG', 'critique_'];

function isGeminiStep(key: string): boolean {
  return GEMINI_STEP_PREFIXES.some((p) => key.startsWith(p));
}

function computeCost(steps: StepSummary[]): CostBreakdown {
  let anthropicTokens = 0;
  let geminiTokens = 0;
  for (const s of steps) {
    if (isGeminiStep(s.stepKey)) geminiTokens += s.tokensUsed;
    else anthropicTokens += s.tokensUsed;
  }
  // Split combined tokens using measured ratios (65/35 Anthropic, 55/45 Gemini)
  const aIn = anthropicTokens * 0.65;
  const aOut = anthropicTokens * 0.35;
  const gIn = geminiTokens * 0.55;
  const gOut = geminiTokens * 0.45;
  // Anthropic Sonnet 4.6: $3/$15 per MTok. Gemini 2.5 Flash: $0.15/$0.60 per MTok.
  const estimatedUsdCost =
    (aIn * 3 + aOut * 15 + gIn * 0.15 + gOut * 0.60) / 1_000_000;
  return { anthropicTokens, geminiTokens, estimatedUsdCost };
}

function formatUsd(amount: number): string {
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; data?: T; error?: string }> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${TOKEN}`,
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const json = await res.json() as { ok?: boolean; data?: T; error?: string };
  return json as { ok: boolean; data?: T; error?: string };
}

interface SSEEvent {
  event: string;
  stepKey?: string;
  tokensUsed?: number;
  totalTokensUsed?: number;
  error?: string;
}

async function streamSSE(
  moduleId: string,
  body: Record<string, unknown>,
  onEvent: (evt: SSEEvent) => void
): Promise<void> {
  const res = await fetch(`${API_URL}/api/generation/${moduleId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const raw = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Generation start failed: ${raw}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(line.slice(6)) as SSEEvent);
        } catch { /* skip */ }
      }
    }
  }
}

// ─── Resume: load previous result ───────────────────────────────────────────

function loadPreviousResult(caseId: string): TestResult | null {
  const resultPath = join(RESULTS_DIR, `${caseId}.json`);
  if (!existsSync(resultPath)) return null;
  try {
    return JSON.parse(readFileSync(resultPath, 'utf-8')) as TestResult;
  } catch {
    return null;
  }
}

// ─── Run a single test case ──────────────────────────────────────────────────

async function runTestCase(
  tc: ReturnType<typeof getClassifiedTestCases>[0],
  resumeModuleId?: string | null
): Promise<TestResult> {
  const startTime = Date.now();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${tc.id}: ${tc.name}`);
  console.log(`  Purpose: ${tc.purpose}`);
  if (resumeModuleId) console.log(`  Resuming module: ${resumeModuleId}`);
  console.log(`${'═'.repeat(60)}`);

  const result: TestResult = {
    testCaseId: tc.id,
    testCaseName: tc.name,
    purpose: tc.purpose,
    moduleId: resumeModuleId ?? null,
    generationStatus: 'error',
    durationMs: 0,
    totalTokensUsed: 0,
    steps: [],
    findings: { total: 0, bySeverity: {}, byCategory: {}, byDisposition: {}, catACount: 0, regulatoryCount: 0 },
    expectedBehavior: tc.expectedBehavior.map((check) => ({ check, passed: null, notes: '' })),
    timestamp: new Date().toISOString(),
  };

  try {
    let moduleId = resumeModuleId;

    // 1. Create module (skip if resuming)
    if (!moduleId) {
      console.log('  [1/5] Creating module...');
      const createRes = await apiFetch<{ id: string }>('/api/modules', {
        method: 'POST',
        body: JSON.stringify({
          title: tc.title,
          workplaceContext: tc.workplaceContext,
          regulatoryClassification: tc.regulatoryClassification,
        }),
      });
      if (!createRes.ok || !createRes.data?.id) {
        throw new Error(`Module creation failed: ${createRes.error}`);
      }
      moduleId = createRes.data.id;
      console.log(`  [1/5] Module created: ${moduleId}`);
    } else {
      console.log(`  [1/5] Reusing module: ${moduleId}`);
    }
    result.moduleId = moduleId;

    // 2. Start generation (SSE stream) — pipeline resumes from last completed step
    console.log('  [2/5] Starting generation...');
    const steps: StepSummary[] = [];
    let finalStatus: 'complete' | 'failed' = 'failed';
    let genError: string | undefined;
    let totalTokens = 0;

    await streamSSE(moduleId, {
      title: tc.title,
      domainPrompt: [
        `UK Health and Safety compliance training — ${tc.workplaceContext.industryLabel}`,
        `Operations: ${tc.workplaceContext.operations}`,
      ].join('. '),
      audienceDescription: [
        `Industry: ${tc.workplaceContext.industryLabel}`,
        tc.workplaceContext.workforceProfile,
        'Regulatory compliance training — learners include duty holders and all employees',
      ].filter(Boolean).join('. '),
      objectives: tc.regulatoryClassification.applicableSchemas
        .filter((s) => !s.pending)
        .slice(0, 5)
        .map((s) => `Compliance with ${s.shortTitle}`),
      sourceReferences: [],
    }, (evt) => {
      if (evt.event === 'step_complete' || evt.event === 'step_done') {
        const step: StepSummary = {
          stepKey: evt.stepKey ?? 'unknown',
          status: 'done',
          tokensUsed: evt.tokensUsed ?? 0,
        };
        steps.push(step);
        totalTokens = evt.totalTokensUsed ?? totalTokens;
        console.log(`  [2/5]   ✓ ${step.stepKey} (${step.tokensUsed} tokens)`);
      } else if (evt.event === 'step_failed' || evt.event === 'step_error') {
        steps.push({ stepKey: evt.stepKey ?? 'unknown', status: 'error', tokensUsed: 0 });
        console.log(`  [2/5]   ✗ ${evt.stepKey}: ${evt.error}`);
      } else if (evt.event === 'job_complete') {
        finalStatus = 'complete';
        totalTokens = evt.totalTokensUsed ?? totalTokens;
        console.log(`  [2/5] Generation complete (${totalTokens} total tokens)`);
      } else if (evt.event === 'job_failed') {
        finalStatus = 'failed';
        genError = evt.error;
        console.log(`  [2/5] Generation FAILED: ${evt.error}`);
      }
    });

    result.generationStatus = finalStatus;
    result.error = genError;
    result.totalTokensUsed = totalTokens;
    result.steps = steps;

    // 3. Seed findings from generation
    if (finalStatus === 'complete') {
      console.log('  [3/5] Seeding findings...');
      const seedRes = await apiFetch<{ created: number; skipped: number }>(`/api/review/${moduleId}/seed-findings`, {
        method: 'POST',
      });
      if (seedRes.ok && seedRes.data) {
        console.log(`  [3/5] Seeded: ${seedRes.data.created} created, ${seedRes.data.skipped} skipped`);
      }
    } else {
      console.log('  [3/5] Skipped (generation failed)');
    }

    // 4. Collect findings
    console.log('  [4/5] Collecting findings...');
    const findingsRes = await apiFetch<Array<{
      severity: string; category: string; disposition: string | null;
    }>>(`/api/review/${moduleId}/findings`);

    if (findingsRes.ok && findingsRes.data) {
      const findings = findingsRes.data;
      const summary: FindingSummary = {
        total: findings.length,
        bySeverity: {},
        byCategory: {},
        byDisposition: {},
        catACount: 0,
        regulatoryCount: 0,
      };
      for (const f of findings) {
        summary.bySeverity[f.severity] = (summary.bySeverity[f.severity] ?? 0) + 1;
        summary.byCategory[f.category] = (summary.byCategory[f.category] ?? 0) + 1;
        const disp = f.disposition ?? 'undisposed';
        summary.byDisposition[disp] = (summary.byDisposition[disp] ?? 0) + 1;
        if (f.category === 'A') summary.catACount++;
        if (f.severity === 'regulatory') summary.regulatoryCount++;
      }
      result.findings = summary;
      console.log(`  [4/5] Findings: ${summary.total} total | Cat A: ${summary.catACount} | Regulatory: ${summary.regulatoryCount}`);
      console.log(`  [4/5]   Severity: ${Object.entries(summary.bySeverity).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }

    // 5. Collect generation status (for step-level data)
    console.log('  [5/5] Collecting generation status...');
    const statusRes = await apiFetch<{ status: string; job: unknown; startedAt: string; completedAt: string | null }>(
      `/api/generation/${moduleId}/status`
    );
    if (statusRes.ok && statusRes.data) {
      const job = statusRes.data.job as { actualTokensUsed?: number; steps?: Record<string, { tokensUsed?: number }> } | null;
      if (job?.actualTokensUsed) {
        result.totalTokensUsed = job.actualTokensUsed;
      }
    }

  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.error(`  ERROR: ${result.error}`);
  }

  result.durationMs = Date.now() - startTime;
  result.cost = computeCost(result.steps);

  console.log(`\n  Duration: ${(result.durationMs / 1000).toFixed(1)}s | Tokens: ${result.totalTokensUsed} | Cost: ${formatUsd(result.cost.estimatedUsdCost)} | Status: ${result.generationStatus}`);

  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const caseId = args.find((a, i) => args[i - 1] === '--case');
  const runAll = args.includes('--all');
  const resume = args.includes('--resume');

  if (!caseId && !runAll) {
    console.log('Usage:');
    console.log('  npx tsx runner.ts --all');
    console.log('  npx tsx runner.ts --case TM-01');
    console.log('  npx tsx runner.ts --case TM-01 --resume   (reuse module from last run)');
    console.log('\nAvailable cases:');
    const cases = getClassifiedTestCases();
    for (const tc of cases) {
      console.log(`  ${tc.id}: ${tc.name} — ${tc.purpose.slice(0, 60)}...`);
    }
    process.exit(0);
  }

  const allCases = getClassifiedTestCases();
  const casesToRun = caseId
    ? allCases.filter((tc) => tc.id === caseId)
    : allCases;

  if (casesToRun.length === 0) {
    console.error(`Test case ${caseId} not found.`);
    process.exit(1);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });

  console.log(`\nTest Matrix Runner — Utilities/Energy Vertical`);
  console.log(`API: ${API_URL}`);
  console.log(`Cases to run: ${casesToRun.map((tc) => tc.id).join(', ')}${resume ? ' (--resume)' : ''}\n`);

  const results: TestResult[] = [];
  let totalCost = 0;

  for (const tc of casesToRun) {
    // --resume: reuse moduleId from previous result file
    let resumeModuleId: string | null = null;
    if (resume) {
      const prev = loadPreviousResult(tc.id);
      if (prev?.moduleId) {
        resumeModuleId = prev.moduleId;
      } else {
        console.log(`  [resume] No previous result for ${tc.id}, creating new module.`);
      }
    }

    const result = await runTestCase(tc, resumeModuleId);
    results.push(result);
    if (result.cost) totalCost += result.cost.estimatedUsdCost;

    // Write individual result
    const resultPath = join(RESULTS_DIR, `${tc.id}.json`);
    writeFileSync(resultPath, JSON.stringify(result, null, 2));
    console.log(`  Result saved: ${resultPath}`);
  }

  // Print summary table
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(70)}`);
  console.log(`  ${'ID'.padEnd(8)} ${'Name'.padEnd(30)} ${'Status'.padEnd(10)} ${'Findings'.padEnd(10)} ${'Cat A'.padEnd(8)} ${'Tokens'.padEnd(10)} ${'Cost'.padEnd(8)} ${'Time'}`);
  console.log(`  ${'─'.repeat(8)} ${'─'.repeat(30)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(8)} ${'─'.repeat(10)} ${'─'.repeat(8)} ${'─'.repeat(8)}`);
  for (const r of results) {
    const cost = r.cost ? formatUsd(r.cost.estimatedUsdCost) : '?';
    console.log(
      `  ${r.testCaseId.padEnd(8)} ${r.testCaseName.slice(0, 28).padEnd(30)} ${r.generationStatus.padEnd(10)} ${String(r.findings.total).padEnd(10)} ${String(r.findings.catACount).padEnd(8)} ${String(r.totalTokensUsed).padEnd(10)} ${cost.padEnd(8)} ${(r.durationMs / 1000).toFixed(1)}s`
    );
  }

  const passed = results.filter((r) => r.generationStatus === 'complete').length;
  const totalTokens = results.reduce((sum, r) => sum + r.totalTokensUsed, 0);
  console.log(`\n  Pass rate: ${passed}/${results.length} (${((passed / results.length) * 100).toFixed(0)}%)`);
  console.log(`  Total tokens: ${totalTokens.toLocaleString()}`);
  console.log(`  Total estimated cost: ${formatUsd(totalCost)}`);
  console.log(`  Total duration: ${(results.reduce((sum, r) => sum + r.durationMs, 0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
