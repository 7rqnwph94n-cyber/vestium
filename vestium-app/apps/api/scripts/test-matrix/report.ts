#!/usr/bin/env npx tsx
// ─── Test Matrix Reporter ──────────────────────────────────────────────────────
// Reads test results from the results/ directory and outputs aggregate metrics.
//
// Usage:
//   npx tsx apps/api/scripts/test-matrix/report.ts
//
// Optional env vars:
//   DATABASE_URL — if set, pulls reviewer cycle time + rework stats from DB

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { TestResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RESULTS_DIR = join(__dirname, 'results');

// ─── Load results ───────────────────────────────────────────────────────────

function loadResults(): TestResult[] {
  let files: string[];
  try {
    files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json')).sort();
  } catch {
    console.error(`No results directory found at ${RESULTS_DIR}`);
    console.error('Run the test matrix first: npx tsx runner.ts --all');
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No result files found. Run the test matrix first.');
    process.exit(1);
  }

  return files.map((f) => {
    const raw = readFileSync(join(RESULTS_DIR, f), 'utf-8');
    return JSON.parse(raw) as TestResult;
  });
}

// ─── Severity color labels ──────────────────────────────────────────────────

function severityLabel(sev: string): string {
  const labels: Record<string, string> = {
    regulatory: '🔴 regulatory',
    high: '🟠 high',
    medium: '🟡 medium',
    low: '🟢 low',
    info: '⚪ info',
  };
  return labels[sev] ?? sev;
}

// ─── Main report ────────────────────────────────────────────────────────────

function report(results: TestResult[]): void {
  const W = 80;

  console.log(`\n${'═'.repeat(W)}`);
  console.log('  TEST MATRIX REPORT — Utilities/Energy Vertical');
  console.log(`${'═'.repeat(W)}`);
  console.log(`  Results: ${results.length} test case(s)`);
  console.log(`  Generated: ${new Date().toISOString()}\n`);

  // ── 1. Pass rate ────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.generationStatus === 'complete');
  const failed = results.filter((r) => r.generationStatus !== 'complete');
  console.log(`  PASS RATE: ${passed.length}/${results.length} (${((passed.length / results.length) * 100).toFixed(0)}%)`);
  if (failed.length > 0) {
    console.log(`  Failed cases: ${failed.map((r) => r.testCaseId).join(', ')}`);
    for (const r of failed) {
      console.log(`    ${r.testCaseId}: ${r.error ?? 'unknown error'}`);
    }
  }
  console.log();

  // ── 2. Per-case summary table ───────────────────────────────────────────
  console.log(`  ${'ID'.padEnd(8)} ${'Name'.padEnd(28)} ${'Status'.padEnd(10)} ${'Findings'.padEnd(10)} ${'Cat A'.padEnd(7)} ${'Reg'.padEnd(7)} ${'Tokens'.padEnd(10)} ${'Time'}`);
  console.log(`  ${'─'.repeat(8)} ${'─'.repeat(28)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(7)} ${'─'.repeat(7)} ${'─'.repeat(10)} ${'─'.repeat(8)}`);
  for (const r of results) {
    const statusIcon = r.generationStatus === 'complete' ? '✓' : '✗';
    console.log(
      `  ${r.testCaseId.padEnd(8)} ${r.testCaseName.slice(0, 26).padEnd(28)} ${(statusIcon + ' ' + r.generationStatus).padEnd(10)} ${String(r.findings.total).padEnd(10)} ${String(r.findings.catACount).padEnd(7)} ${String(r.findings.regulatoryCount).padEnd(7)} ${String(r.totalTokensUsed).padEnd(10)} ${(r.durationMs / 1000).toFixed(1)}s`
    );
  }
  console.log();

  // ── 3. Aggregate token usage & cost ────────────────────────────────────
  const totalTokens = results.reduce((sum, r) => sum + r.totalTokensUsed, 0);
  const avgTokens = results.length > 0 ? Math.round(totalTokens / results.length) : 0;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
  const avgDuration = results.length > 0 ? totalDuration / results.length : 0;
  const totalCost = results.reduce((sum, r) => sum + (r.cost?.estimatedUsdCost ?? 0), 0);
  const avgCost = results.length > 0 ? totalCost / results.length : 0;

  console.log('  TOKEN USAGE & COST');
  console.log(`    Total tokens:   ${totalTokens.toLocaleString()}`);
  console.log(`    Average tokens: ${avgTokens.toLocaleString()} per module`);
  console.log(`    Total cost:     $${totalCost.toFixed(2)} USD`);
  console.log(`    Average cost:   $${avgCost.toFixed(2)} USD per module`);
  console.log(`    Duration total: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`    Duration avg:   ${(avgDuration / 1000).toFixed(1)}s per module`);
  if (totalCost > 0) {
    const anthropicTotal = results.reduce((sum, r) => sum + (r.cost?.anthropicTokens ?? 0), 0);
    const geminiTotal = results.reduce((sum, r) => sum + (r.cost?.geminiTokens ?? 0), 0);
    console.log(`    Anthropic tokens: ${anthropicTotal.toLocaleString()} (${((anthropicTotal / Math.max(totalTokens, 1)) * 100).toFixed(0)}%)`);
    console.log(`    Gemini tokens:    ${geminiTotal.toLocaleString()} (${((geminiTotal / Math.max(totalTokens, 1)) * 100).toFixed(0)}%)`);
  }
  console.log();

  // ── 4. Aggregate finding severity breakdown ─────────────────────────────
  const aggSeverity: Record<string, number> = {};
  const aggCategory: Record<string, number> = {};
  const aggDisposition: Record<string, number> = {};
  let totalFindings = 0;
  let totalCatA = 0;
  let totalRegulatory = 0;

  for (const r of results) {
    totalFindings += r.findings.total;
    totalCatA += r.findings.catACount;
    totalRegulatory += r.findings.regulatoryCount;
    for (const [k, v] of Object.entries(r.findings.bySeverity)) {
      aggSeverity[k] = (aggSeverity[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(r.findings.byCategory)) {
      aggCategory[k] = (aggCategory[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(r.findings.byDisposition)) {
      aggDisposition[k] = (aggDisposition[k] ?? 0) + v;
    }
  }

  console.log('  FINDINGS SUMMARY');
  console.log(`    Total findings: ${totalFindings}`);
  console.log(`    Cat A findings: ${totalCatA}`);
  console.log(`    Regulatory findings: ${totalRegulatory}`);
  console.log();

  if (Object.keys(aggSeverity).length > 0) {
    console.log('    By severity:');
    for (const [sev, count] of Object.entries(aggSeverity).sort(([, a], [, b]) => b - a)) {
      console.log(`      ${severityLabel(sev).padEnd(20)} ${count}`);
    }
    console.log();
  }

  if (Object.keys(aggCategory).length > 0) {
    console.log('    By category:');
    for (const [cat, count] of Object.entries(aggCategory).sort(([, a], [, b]) => b - a)) {
      console.log(`      ${cat.padEnd(20)} ${count}`);
    }
    console.log();
  }

  if (Object.keys(aggDisposition).length > 0) {
    console.log('    By disposition:');
    for (const [disp, count] of Object.entries(aggDisposition).sort(([, a], [, b]) => b - a)) {
      console.log(`      ${disp.padEnd(20)} ${count}`);
    }
    console.log();
  }

  // ── 5. Step-level analysis ──────────────────────────────────────────────
  const stepStats: Record<string, { count: number; tokens: number; errors: number }> = {};
  for (const r of results) {
    for (const step of r.steps) {
      if (!stepStats[step.stepKey]) {
        stepStats[step.stepKey] = { count: 0, tokens: 0, errors: 0 };
      }
      stepStats[step.stepKey].count++;
      stepStats[step.stepKey].tokens += step.tokensUsed;
      if (step.status === 'error') stepStats[step.stepKey].errors++;
    }
  }

  if (Object.keys(stepStats).length > 0) {
    console.log('  STEP-LEVEL ANALYSIS');
    console.log(`    ${'Step'.padEnd(25)} ${'Runs'.padEnd(6)} ${'Errors'.padEnd(8)} ${'Avg Tokens'}`);
    console.log(`    ${'─'.repeat(25)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(10)}`);
    for (const [key, stats] of Object.entries(stepStats).sort(([a], [b]) => a.localeCompare(b))) {
      const avg = stats.count > 0 ? Math.round(stats.tokens / stats.count) : 0;
      console.log(`    ${key.padEnd(25)} ${String(stats.count).padEnd(6)} ${String(stats.errors).padEnd(8)} ${avg.toLocaleString()}`);
    }
    console.log();
  }

  // ── 6. Expected behavior checklist ──────────────────────────────────────
  console.log('  EXPECTED BEHAVIOR CHECKLIST');
  for (const r of results) {
    console.log(`\n    ${r.testCaseId}: ${r.testCaseName}`);
    for (const check of r.expectedBehavior) {
      const icon = check.passed === true ? '✓' : check.passed === false ? '✗' : '?';
      const notes = check.notes ? ` — ${check.notes}` : '';
      console.log(`      [${icon}] ${check.check}${notes}`);
    }
  }
  console.log();

  // ── 7. DB-backed metrics (if DATABASE_URL is set) ───────────────────────
  if (process.env.DATABASE_URL) {
    console.log('  DB METRICS (from module_generation_metrics)');
    console.log('    → Run with DATABASE_URL to see per-step provider/model/token breakdown');
    console.log('    → Reviewer cycle time and rework loop analysis');
    console.log('    (Not yet implemented — manual review of audit_log table for now)');
    console.log();
  }

  console.log(`${'═'.repeat(W)}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const results = loadResults();
report(results);
