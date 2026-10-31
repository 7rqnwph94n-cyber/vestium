import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

interface TraceRow {
  ts: string;
  moduleId: string;
  event: string;
  stepKey?: string;
  provider?: string;
  durationMs?: number;
  tokensUsed?: number;
  totalTokensUsed?: number;
  retryCount?: number;
  error?: string;
  wave?: string[];
  waveSize?: number;
  failedSteps?: string[];
  sseEvent?: string;
}

const TRACE_DIR = resolve(process.cwd(), 'tmp', 'generation-traces');

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function findLatestTraceFile(): Promise<string | null> {
  let files: string[];
  try {
    files = (await readdir(TRACE_DIR)).filter((f) => f.endsWith('.ndjson'));
  } catch {
    return null;
  }
  if (files.length === 0) return null;

  const withTimes = await Promise.all(
    files.map(async (file) => {
      const p = resolve(TRACE_DIR, file);
      const s = await stat(p);
      return { file: p, mtime: s.mtimeMs };
    })
  );
  withTimes.sort((a, b) => b.mtime - a.mtime);
  return withTimes[0]?.file ?? null;
}

async function resolveTraceFile(): Promise<string | null> {
  const moduleId = getArg('--module');
  if (moduleId) return resolve(TRACE_DIR, `${moduleId}.ndjson`);
  return findLatestTraceFile();
}

function parseRows(raw: string): TraceRow[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as TraceRow;
      } catch {
        return null;
      }
    })
    .filter((row): row is TraceRow => row !== null);
}

function printSummary(rows: TraceRow[]): void {
  if (rows.length === 0) {
    console.log('[trace] no events');
    return;
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  console.log(`[trace] module=${first.moduleId}`);
  console.log(`[trace] events=${rows.length} start=${first.ts} end=${last.ts}`);

  const terminal = [...rows].reverse().find((r) => r.event === 'job_complete' || r.event === 'job_failed');
  if (terminal) {
    console.log(`[trace] terminal=${terminal.event}${terminal.error ? ` error="${terminal.error}"` : ''}`);
  }

  const steps = rows.filter((r) => r.event === 'step_done' || r.event === 'step_failed');
  for (const row of steps) {
    const kind = row.event === 'step_done' ? 'OK' : 'FAIL';
    const suffix = row.event === 'step_done'
      ? `provider=${row.provider ?? '-'} dur=${row.durationMs ?? 0}ms tokens=${row.tokensUsed ?? 0} retries=${row.retryCount ?? 0}`
      : `provider=${row.provider ?? '-'} dur=${row.durationMs ?? 0}ms error="${row.error ?? 'unknown'}"`;
    console.log(`[trace] ${kind} ${row.stepKey ?? '-'} ${suffix}`);
  }
}

async function main(): Promise<void> {
  const file = await resolveTraceFile();
  if (!file) {
    console.log('[trace] no trace files found in tmp/generation-traces');
    return;
  }
  const raw = await readFile(file, 'utf8');
  const rows = parseRows(raw);
  printSummary(rows);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});

