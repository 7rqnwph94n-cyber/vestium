import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const TRACE_ENABLED = (() => {
  const v = (process.env.PIPELINE_TRACE ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
})();

const TRACE_DIR = resolve(process.cwd(), 'tmp', 'generation-traces');
const queues = new Map<string, Promise<void>>();

function nextQueue(moduleId: string, task: () => Promise<void>): void {
  const prev = queues.get(moduleId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(task)
    .catch(() => {});
  queues.set(moduleId, next);
}

export function traceGeneration(
  moduleId: string,
  event: string,
  payload: Record<string, unknown> = {}
): void {
  if (!TRACE_ENABLED || !moduleId) return;

  const entry = {
    ts: new Date().toISOString(),
    moduleId,
    event,
    ...payload,
  };
  const line = `${JSON.stringify(entry)}\n`;
  const filePath = resolve(TRACE_DIR, `${moduleId}.ndjson`);

  nextQueue(moduleId, async () => {
    await mkdir(TRACE_DIR, { recursive: true });
    await appendFile(filePath, line, 'utf8');
  });
}

export function isTraceEnabled(): boolean {
  return TRACE_ENABLED;
}

