import type {
  Reporter,
  FullResult,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── Types ───────────────────────────────────────────────────────── */

interface StepData {
  id: string;
  title: string;
  url: string;
  task: string;
  durationMs: number;
  consoleErrors: string[];
  networkErrors: string[];
  status: string;
  notes: string[];
  testStatus: string;
}

interface PersonaReport {
  name: string;
  steps: StepData[];
  summary: {
    totalSteps: number;
    passed: number;
    failed: number;
    warned: number;
    avgDurationMs: number;
    topIssues: StepData[];
  };
}

/* ── Reporter ────────────────────────────────────────────────────── */

class UXReporter implements Reporter {
  private personas = new Map<string, StepData[]>();

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name ?? 'unknown';
    if (project === 'setup') return;

    // Collect ALL step-metrics attachments (one per test.step())
    const stepAttachments = result.attachments.filter((a) => a.name === 'step-metrics');
    if (!stepAttachments.length) return;

    if (!this.personas.has(project)) this.personas.set(project, []);
    for (const att of stepAttachments) {
      if (!att.body) continue;
      const metrics: StepData = {
        ...JSON.parse(att.body.toString()),
        testStatus: result.status,
      };
      this.personas.get(project)!.push(metrics);
    }
  }

  async onEnd(result: FullResult) {
    const personas: PersonaReport[] = [];

    for (const [name, steps] of this.personas) {
      const passed = steps.filter((s) => s.testStatus === 'passed').length;
      const failed = steps.filter((s) => s.testStatus === 'failed').length;
      const warned = steps.filter((s) => s.status === 'warn').length;
      const avg = steps.reduce((s, x) => s + x.durationMs, 0) / (steps.length || 1);
      const topIssues = steps
        .filter(
          (s) =>
            s.testStatus === 'failed' ||
            s.consoleErrors.length > 0 ||
            s.networkErrors.length > 0,
        )
        .sort((a, b) => b.consoleErrors.length + b.networkErrors.length - a.consoleErrors.length - a.networkErrors.length);

      personas.push({
        name,
        steps,
        summary: {
          totalSteps: steps.length,
          passed,
          failed,
          warned,
          avgDurationMs: Math.round(avg),
          topIssues,
        },
      });
    }

    const output = {
      runDate: new Date().toISOString(),
      frontendUrl: 'http://127.0.0.1:5173',
      apiUrl: 'http://localhost:3001',
      overallStatus: result.status,
      personas,
    };

    const dir = resolve(__dirname);
    writeFileSync(resolve(dir, 'ux-report.json'), JSON.stringify(output, null, 2));
    writeFileSync(resolve(dir, 'ux-report.md'), buildMarkdown(output));
    console.log('\n📊 UX Report → e2e/ux-report.json + e2e/ux-report.md\n');
  }
}

/* ── Markdown builder ────────────────────────────────────────────── */

function buildMarkdown(data: {
  runDate: string;
  overallStatus: string;
  personas: PersonaReport[];
}): string {
  const lines: string[] = [
    '# UX Walkthrough Report',
    '',
    `**Date:** ${data.runDate}`,
    `**Overall:** ${data.overallStatus}`,
    '',
    '## Cross-Persona Summary',
    '',
    '| Persona | Steps | Passed | Failed | Warned | Avg Duration |',
    '|---------|-------|--------|--------|--------|-------------|',
  ];

  for (const p of data.personas) {
    const s = p.summary;
    lines.push(
      `| ${p.name} | ${s.totalSteps} | ${s.passed} | ${s.failed} | ${s.warned} | ${s.avgDurationMs}ms |`,
    );
  }

  for (const p of data.personas) {
    lines.push('', `## ${p.name}`, '');
    lines.push('| # | Step | Status | Duration | Issues |');
    lines.push('|---|------|--------|----------|--------|');
    p.steps.forEach((s, i) => {
      const issues =
        [...s.consoleErrors, ...s.networkErrors, ...s.notes].join('; ') || '-';
      lines.push(
        `| ${i + 1} | ${s.title} | ${s.testStatus} | ${s.durationMs}ms | ${issues} |`,
      );
    });
  }

  const allIssues = data.personas.flatMap((p) => p.summary.topIssues);
  if (allIssues.length > 0) {
    lines.push('', '## Top Issues', '');
    for (const s of allIssues) {
      const detail = [...s.consoleErrors, ...s.networkErrors, ...s.notes].join(', ');
      lines.push(`- **${s.title}** (${s.testStatus}): ${detail}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export default UXReporter;
