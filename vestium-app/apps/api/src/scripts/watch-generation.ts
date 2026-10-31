import { sql } from '../db/client.js';
import type { GenerationJob, StepResult } from '../pipeline/types.js';

interface JobRow {
  module_id: string;
  title: string | null;
  status: 'running' | 'complete' | 'failed';
  error: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  job_state: unknown;
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function getIntArg(flag: string, fallback: number): number {
  const raw = getArg(flag);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseJobState(raw: unknown): GenerationJob | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as GenerationJob;
    } catch {
      return null;
    }
  }
  return raw as GenerationJob;
}

function summarizeSteps(job: GenerationJob | null): {
  done: number;
  running: number;
  pending: number;
  error: number;
  total: number;
  failedSteps: Array<{ stepKey: string; error: string }>;
  activeSteps: string[];
} {
  if (!job?.steps) {
    return {
      done: 0, running: 0, pending: 0, error: 0, total: 0, failedSteps: [], activeSteps: [],
    };
  }

  const stepEntries = Object.entries(job.steps) as Array<[string, StepResult]>;
  const failedSteps: Array<{ stepKey: string; error: string }> = [];
  const activeSteps: string[] = [];
  let done = 0;
  let running = 0;
  let pending = 0;
  let error = 0;

  for (const [stepKey, step] of stepEntries) {
    if (step.status === 'done') done += 1;
    if (step.status === 'running' || step.status === 'streaming') {
      running += 1;
      activeSteps.push(stepKey);
    }
    if (step.status === 'pending') pending += 1;
    if (step.status === 'error') {
      error += 1;
      failedSteps.push({ stepKey, error: step.rawOutput || 'Unknown step error' });
    }
  }

  return {
    done,
    running,
    pending,
    error,
    total: stepEntries.length,
    failedSteps,
    activeSteps,
  };
}

async function fetchLatestJob(moduleId?: string): Promise<JobRow | null> {
  if (moduleId) {
    const rows = await sql`
      SELECT gj.module_id, m.title, gj.status, gj.error, gj.started_at, gj.updated_at, gj.completed_at, gj.job_state
      FROM generation_jobs gj
      LEFT JOIN modules m ON m.id = gj.module_id
      WHERE gj.module_id = ${moduleId}
      LIMIT 1
    ` as JobRow[];
    return rows[0] ?? null;
  }

  const rows = await sql`
    SELECT gj.module_id, m.title, gj.status, gj.error, gj.started_at, gj.updated_at, gj.completed_at, gj.job_state
    FROM generation_jobs gj
    LEFT JOIN modules m ON m.id = gj.module_id
    ORDER BY (gj.status = 'running') DESC, gj.updated_at DESC
    LIMIT 1
  ` as JobRow[];
  return rows[0] ?? null;
}

function printSnapshot(row: JobRow): void {
  const job = parseJobState(row.job_state);
  const s = summarizeSteps(job);
  const tokens = job?.actualTokensUsed ?? 0;
  const moduleLabel = row.title ? `${row.title} (${row.module_id})` : row.module_id;
  const active = s.activeSteps.length > 0 ? s.activeSteps.join(', ') : '-';

  console.log(`[watch] module=${moduleLabel}`);
  console.log(
    `[watch] status=${row.status} done=${s.done}/${s.total} running=${s.running} pending=${s.pending} error=${s.error} tokens=${tokens}`
  );
  console.log(`[watch] active=${active}`);
  if (row.error) console.log(`[watch] job_error=${row.error}`);
  for (const failed of s.failedSteps) {
    console.log(`[watch] step_error ${failed.stepKey}: ${failed.error}`);
  }
  console.log(`[watch] updated_at=${row.updated_at}`);
  console.log('');
}

async function main(): Promise<void> {
  const moduleId = getArg('--module');
  const intervalMs = getIntArg('--interval-ms', 3000);
  const once = process.argv.includes('--once');
  const stopWhenTerminal = !process.argv.includes('--no-exit-on-terminal');
  const failOnFailed = process.argv.includes('--fail-on-failed');

  let lastFingerprint = '';

  while (true) {
    const row = await fetchLatestJob(moduleId);
    if (!row) {
      console.log('[watch] no generation jobs found');
      if (once) return;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }

    const job = parseJobState(row.job_state);
    const s = summarizeSteps(job);
    const fingerprint = JSON.stringify({
      module: row.module_id,
      status: row.status,
      updatedAt: row.updated_at,
      jobError: row.error,
      done: s.done,
      running: s.running,
      pending: s.pending,
      error: s.error,
      active: s.activeSteps,
      failed: s.failedSteps,
      tokens: job?.actualTokensUsed ?? 0,
    });

    if (fingerprint !== lastFingerprint) {
      printSnapshot(row);
      lastFingerprint = fingerprint;
    }

    const terminal = row.status === 'complete' || row.status === 'failed';
    if (once || (terminal && stopWhenTerminal)) {
      if (row.status === 'failed' && failOnFailed) {
        process.exit(1);
      }
      process.exit(0);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
