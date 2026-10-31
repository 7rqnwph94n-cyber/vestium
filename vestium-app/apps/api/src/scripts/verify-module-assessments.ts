import { sql } from '../db/client.js';
import type { TrainingLesson, TrainingStage } from '../lib/training-core/types.js';

type StoredJobState = {
  steps?: Record<string, { parsedJson?: unknown }>;
};

type StageLessonsOutput = { stage: Omit<TrainingStage, 'test'> };

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasVisualAssessmentLink(lesson: TrainingLesson): boolean {
  const keys = lesson.diagrams
    .flatMap((d) => [d.id, d.title])
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.toLowerCase());

  const text = [
    lesson.youTry?.prompt ?? '',
    ...(lesson.quiz ?? []).flatMap((q) => [q.prompt ?? '', q.explanation ?? '']),
  ].join(' ').toLowerCase();

  return keys.some((k) => text.includes(k));
}

async function main(): Promise<void> {
  const moduleId = getArg('--module');
  if (!moduleId) {
    console.error('Usage: pnpm --filter @complianceforge/api run verify:module -- --module <uuid>');
    process.exit(2);
  }

  const rows = await sql`
    SELECT job_state
    FROM generation_jobs
    WHERE module_id = ${moduleId}
    LIMIT 1
  ` as Array<{ job_state: StoredJobState }>;

  if (!rows[0]?.job_state?.steps) {
    console.error(`No generation job_state found for module ${moduleId}`);
    process.exit(2);
  }

  const steps = rows[0].job_state.steps;
  const stageKeys = Object.keys(steps).filter((k) => /^stage_\d+$/.test(k)).sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));

  let verbalPass = true;
  let visualPass = true;

  for (const stageKey of stageKeys) {
    const stageIndex = Number(stageKey.split('_')[1]);
    const parsed = steps[stageKey]?.parsedJson as StageLessonsOutput | undefined;
    const lessons = parsed?.stage?.lessons ?? [];
    const lessonChecks = lessons.map((lesson) => {
      const verbals = lesson.quiz?.filter((q) => q.type === 'verbal') ?? [];
      const verbal = verbals[0];
      const ok =
        verbals.length === 1 &&
        typeof verbal?.timerSeconds === 'number' &&
        Array.isArray(verbal?.expectedKeywords) &&
        verbal.expectedKeywords.length >= 3 &&
        typeof verbal?.minKeywordHits === 'number';
      return { lessonId: lesson.id, ok, verbalCount: verbals.length, keywordCount: verbal?.expectedKeywords?.length ?? 0 };
    });
    const verbalOk = lessonChecks.every((x) => x.ok);
    if (!verbalOk) verbalPass = false;

    const detail = lessonChecks
      .map((x) => `${x.lessonId}:${x.verbalCount}v/${x.keywordCount}k`)
      .join(', ');
    console.log(`Stage ${stageIndex} verbal check: ${verbalOk ? 'PASS' : 'FAIL'} (${detail})`);

    for (const lesson of lessons) {
      const visualOk = hasVisualAssessmentLink(lesson);
      if (!visualOk) visualPass = false;
      console.log(`Stage ${stageIndex} lesson ${lesson.id} visual-link check: ${visualOk ? 'PASS' : 'FAIL'}`);
    }
  }

  console.log('---');
  console.log(`VERBAL: ${verbalPass ? 'PASS' : 'FAIL'}`);
  console.log(`VISUAL_LINKS: ${visualPass ? 'PASS' : 'FAIL'}`);

  process.exit(verbalPass && visualPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
