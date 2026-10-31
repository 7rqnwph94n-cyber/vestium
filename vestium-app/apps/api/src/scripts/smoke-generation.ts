import { createAIClient } from '../pipeline/clientFactory.js';
import { runStepWithRetry } from '../pipeline/stepRunners.js';
import { makeInitialJob } from '../pipeline/types.js';
import type { GenerationJob, DomainConfig } from '../pipeline/types.js';
import { allStepsDone, anyStepErrored, assembleModule } from '../pipeline/orchestrator.js';

function getStepDeps(stepKey: string, stageCount: number): string[] {
  const stageKeys = Array.from({ length: stageCount }, (_, i) => `stage_${i + 1}`);
  const testKeys = Array.from({ length: stageCount }, (_, i) => `test_${i + 1}`);

  if (stepKey === 'domainSurvey') return [];
  if (stepKey === 'blueprint') return ['domainSurvey'];

  const stageM = stepKey.match(/^stage_(\d+)$/);
  if (stageM) return ['blueprint'];

  const testM = stepKey.match(/^test_(\d+)$/);
  if (testM) return [`stage_${testM[1]}`];

  if (stepKey === 'missions') return stageKeys;
  if (['placementAssessment', 'lessonMissionMap'].includes(stepKey)) return ['missions', ...testKeys];
  if (['sourceAttribution', 'simulatorDesign', 'themeShell'].includes(stepKey)) return ['missions'];
  if (stepKey === 'coherencePass') return ['sourceAttribution', 'placementAssessment', 'lessonMissionMap'];
  if (stepKey === 'factCheckA') return ['sourceAttribution', 'placementAssessment', 'coherencePass'];
  if (stepKey === 'factCheckG') return ['sourceAttribution', 'placementAssessment', 'coherencePass'];
  if (stepKey === 'factCheckMerge') return ['factCheckA', 'factCheckG'];
  if (stepKey === 'factCheck') return ['sourceAttribution', 'placementAssessment'];
  if (stepKey === 'faultAndReference') return ['simulatorDesign'];
  if (stepKey === 'builderAndCapstone') return ['simulatorDesign'];
  if (stepKey === 'repairArtifacts') return ['factCheckMerge', 'missions'];
  return [];
}

function readySteps(job: GenerationJob): string[] {
  return job.stepSequence.filter((stepKey) =>
    job.steps[stepKey]?.status === 'pending'
    && getStepDeps(stepKey, job.stageCount).every((d) => job.steps[d]?.status === 'done')
  );
}

function getArgInt(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const raw = process.argv[idx + 1];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function toMs(start: number): string {
  return `${Date.now() - start}ms`;
}

async function runOneSmoke(runIndex: number): Promise<void> {
  const stageCount = getArgInt('--stages', 2);
  const lessonsPerStage = getArgInt('--lessons', 2);
  const missionCount = getArgInt('--missions', 2);
  const waveConcurrency = getArgInt('--concurrency', 2);
  const startedAt = Date.now();

  const config: DomainConfig = {
    moduleId: `smoke-${runIndex}`,
    domainPrompt: 'Mock safety training smoke run',
    audienceDescription: 'Internal QA harness',
    objectives: ['Verify pipeline reliability', 'Verify deterministic outputs'],
    stageCount,
    lessonsPerStage,
    missionCount,
    fastMode: true,
    sourceReferences: [],
  };

  const job = makeInitialJob(config);
  const signal = new AbortController().signal;

  while (!allStepsDone(job) && !anyStepErrored(job)) {
    const wave = readySteps(job);
    if (wave.length === 0) throw new Error('Dependency deadlock: no ready steps');

    const queue = [...wave];
    const workerCount = Math.min(waveConcurrency, queue.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const stepKey = queue.shift();
        if (!stepKey) return;
        job.steps[stepKey].status = 'running';
        const stepStart = Date.now();
        try {
          const client = createAIClient('mock');
          const result = await runStepWithRetry(stepKey, client, job, signal);
          job.steps[stepKey] = result;
          process.stdout.write(`run=${runIndex} step=${stepKey} status=done dur=${toMs(stepStart)}\n`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          job.steps[stepKey].status = 'error';
          job.steps[stepKey].rawOutput = msg;
          process.stdout.write(`run=${runIndex} step=${stepKey} status=error dur=${toMs(stepStart)} err="${msg}"\n`);
          throw err;
        }
      }
    });

    const settled = await Promise.allSettled(workers);
    const rejected = settled.find((s) => s.status === 'rejected');
    if (rejected) throw (rejected as PromiseRejectedResult).reason;
  }

  if (anyStepErrored(job)) {
    const failed = job.stepSequence
      .filter((k) => job.steps[k]?.status === 'error')
      .map((k) => `${k}: ${job.steps[k]?.rawOutput ?? 'unknown error'}`)
      .join(' | ');
    throw new Error(`Smoke pipeline failed: ${failed}`);
  }

  const assembled = assembleModule(job);
  process.stdout.write(
    `run=${runIndex} result=ok stages=${assembled.curriculum.length} missions=${assembled.missions.length} totalTokens=${Object.values(job.steps).reduce((n, s) => n + (s?.tokensUsed ?? 0), 0)} dur=${toMs(startedAt)}\n`
  );
}

async function main(): Promise<void> {
  // Force mock provider globally so any explicit createAIClient('gemini'/'anthropic')
  // inside step runners still returns deterministic fixtures.
  process.env.PIPELINE_FORCE_MOCK = 'true';

  const runs = getArgInt('--runs', 1);
  for (let i = 1; i <= runs; i++) {
    await runOneSmoke(i);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});

