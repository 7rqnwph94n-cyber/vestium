import type { ZodTypeAny } from 'zod';
import type { AIClient } from '../api/aiClient';
import type {
  GenerationJob,
  StepResult,
  BlueprintOutput,
  StageLessonsOutput,
  StageTestOutput,
  MissionsOutput,
  SourceAttributionOutput,
  AdvancedArtifactsOutput
} from './types';
import { stageIndexFromKey } from './types';
import { streamText, parseJsonOutput, callStructuredJson } from '../api/streamText';
import {
  buildRegulatoryContextBlock,
  buildRegulatoryContextCompact,
  buildFactCheckSeverityConfig
} from '../../regulatory/promptInjector';

// ─── Regulatory context helpers ───────────────────────────────────────────────
// These are no-ops when job.regulatoryClassification is absent (generic mode).

function getRegulatoryContextFull(job: GenerationJob): string | undefined {
  if (!job.regulatoryClassification) return undefined;
  return buildRegulatoryContextBlock(job.regulatoryClassification);
}

function getRegulatoryContextCompact(job: GenerationJob): string | undefined {
  if (!job.regulatoryClassification) return undefined;
  return buildRegulatoryContextCompact(job.regulatoryClassification);
}

function getRegulatoryFactCheckConfig(job: GenerationJob): string | undefined {
  if (!job.regulatoryClassification) return undefined;
  return buildFactCheckSeverityConfig(job.regulatoryClassification);
}
import {
  buildBlueprintPrompt,
  buildStageLessonsPrompt,
  buildStageTestPrompt,
  buildMissionsPrompt,
  buildPlacementAssessmentPrompt,
  buildLessonMissionMapPrompt,
  buildSourceDiscoveryPrompt,
  buildSourceAttributionPrompt,
  buildFactCheckPrompt,
  buildSimulatorDesignPrompt,
  buildFaultAndReferencePrompt,
  buildBuilderAndCapstonePrompt,
  buildThemeShellPrompt,
  buildFixPrompt,
  buildCritiquePrompt,
  buildPreflightPrompt
} from './prompts';
import type {
  ValidationError,
  PreflightResult,
  SimulatorDesignOutput,
  FaultAndReferenceOutput,
  BuilderAndCapstoneOutput
} from './types';
import type { TrainingMission, TrainingQuestion, TrainingStage } from '../../../lib/training-core/types';
import {
  blueprintOutputSchema,
  critiqueVerdictSchema,
  factCheckOutputSchema,
  lessonMissionMapOutputSchema,
  missionsOutputSchema,
  placementAssessmentOutputSchema,
  preflightOutputSchema,
  simulatorDesignOutputSchema,
  faultAndReferenceOutputSchema,
  builderAndCapstoneOutputSchema,
  sourceDiscoveryOutputSchema,
  sourceAttributionOutputSchema,
  stageLessonsOutputSchema,
  stageTestOutputSchema,
  themeShellOutputSchema
} from './schemas';
import { createAIClient } from '../api/clientFactory';
import { resolveLessonImages } from './imageResolver';

// Max tokens per step — sized with headroom to avoid mid-JSON truncation.
// Blueprint: ~350 tokens/stage × 6 stages + structure = 2500+, set to 4000
// StageLesson: 3 paragraphs × ~100 tokens × 5 lessons + quiz/examples = ~8000, set to 16000
// StageTest: ~150 tokens/question × 8 questions + structure = 1200+, set to 2500
// Missions: ~800 tokens/mission × 8 missions + structure = 6400+, set to 10000
// PlacementAssessment: ~200 tokens/question × 15 questions + structure = 3000+, set to 5000
// LessonMissionMap: ~100 tokens/entry × 20 entries + structure = 2000+, set to 5000
// ThemeShell: small flat object, 1000 is conservative
const MAX_TOKENS: Record<string, number> = {
  blueprint: 4000,
  stageLesson: 16000,
  stageTest: 2500,
  missions: 10000,
  placementAssessment: 5000,
  lessonMissionMap: 5000,
  sourceDiscovery: 2200,
  sourceAttribution: 4000,
  factCheck: 4500,
  // advancedArtifacts split: ~3000 each for simulatorDesign and faultAndReference, ~2500 for builderAndCapstone
  simulatorDesign: 3000,
  faultAndReference: 3500,
  builderAndCapstone: 3000,
  critique: 2500,
  repair: 4000,
  themeShell: 1000
};

interface RunnerContext {
  client: AIClient;
  job: GenerationJob;
  onChunk: (chunk: string) => void;
  signal: AbortSignal;
}

interface CritiqueVerdict {
  qualityScore: number;
  requiresRevision: boolean;
  issues: Array<{ rule: string; message: string; severity?: 'error' | 'warning' }>;
  repairPriorities?: string[];
}

const APPLICATION_HINTS = [
  'given',
  'scenario',
  'customer',
  'fault',
  'fails',
  'best first',
  'next step',
  'you should',
  'what should',
  'first action',
  'most appropriate',
  'most likely',
  'based on'
];

function isApplicationQuestion(question: TrainingQuestion): boolean {
  if (question.intent === 'application') return true;
  const text = `${question.prompt} ${question.explanation}`.toLowerCase();
  return APPLICATION_HINTS.some((hint) => text.includes(hint));
}

function quickRepairSignals(
  sectionType: 'stageLessons' | 'stageTest' | 'missions',
  generatedJson: unknown
): Array<{ rule: string; message: string }> {
  const issues: Array<{ rule: string; message: string }> = [];

  if (sectionType === 'stageLessons') {
    const stage = (generatedJson as StageLessonsOutput | null)?.stage;
    const lessons = stage?.lessons ?? [];
    for (const lesson of lessons) {
      if (!lesson.situationHook || lesson.situationHook.trim().length < 40) {
        issues.push({
          rule: 'LESSON_SITUATION_HOOK_WEAK',
          message: `Lesson "${lesson.id}" needs a concrete situation hook (2-3 practical sentences).`
        });
      }
      if (!Array.isArray(lesson.concept) || lesson.concept.length < 3) {
        issues.push({
          rule: 'LESSON_CONCEPT_DEPTH_LOW',
          message: `Lesson "${lesson.id}" concept depth is too shallow (<3 concept blocks).`
        });
      }
      if (!Array.isArray(lesson.quiz) || lesson.quiz.length < 4) {
        issues.push({
          rule: 'LESSON_QUIZ_DEPTH_LOW',
          message: `Lesson "${lesson.id}" quiz has fewer than 4 questions.`
        });
      } else {
        const appRatio = lesson.quiz.filter(isApplicationQuestion).length / lesson.quiz.length;
        if (appRatio < 0.3 || appRatio > 0.7) {
          issues.push({
            rule: 'LESSON_QUIZ_APPLICATION_RATIO_IMBALANCED',
            message: `Lesson "${lesson.id}" application ratio ${Math.round(appRatio * 100)}% is outside 30-70%.`
          });
        }
      }
    }
  }

  if (sectionType === 'stageTest') {
    const test = (generatedJson as StageTestOutput | null)?.test ?? [];
    if (test.length > 0) {
      const appRatio = test.filter(isApplicationQuestion).length / test.length;
      if (appRatio < 0.3 || appRatio > 0.7) {
        issues.push({
          rule: 'STAGE_TEST_APPLICATION_RATIO_IMBALANCED',
          message: `Stage test application ratio ${Math.round(appRatio * 100)}% is outside 30-70%.`
        });
      }
      const duplicatePrompt = new Set<string>();
      for (const q of test) {
        const key = q.prompt.trim().toLowerCase();
        if (duplicatePrompt.has(key)) {
          issues.push({
            rule: 'STAGE_TEST_DUPLICATE_PROMPTS',
            message: 'Stage test has duplicate or near-duplicate prompts.'
          });
          break;
        }
        duplicatePrompt.add(key);
      }
    }
  }

  if (sectionType === 'missions') {
    const missions = (generatedJson as MissionsOutput | null)?.missions ?? [];
    for (const mission of missions as TrainingMission[]) {
      const branches = mission.branches ?? [];
      if (branches.length < 3) {
        issues.push({
          rule: 'MISSION_BRANCH_DEPTH_LOW',
          message: `Mission "${mission.id}" needs at least 3 branches for meaningful decision space.`
        });
        continue;
      }
      const has100 = branches.some((branch) => branch.score === 100);
      const has0 = branches.some((branch) => branch.score === 0);
      const hasMid = branches.some((branch) => branch.score > 25 && branch.score < 85);
      if (!has100 || !has0 || !hasMid) {
        issues.push({
          rule: 'MISSION_SCORE_DISTRIBUTION_WEAK',
          message: `Mission "${mission.id}" should include clearly wrong (0), ideal (100), and intermediate outcomes.`
        });
      }
    }
  }

  return issues;
}

function validateBlueprintIntegrity(
  blueprint: BlueprintOutput['blueprint'],
  expectedStageCount: number,
  expectedLessonsPerStage: number
): void {
  if (!Array.isArray(blueprint) || blueprint.length !== expectedStageCount) {
    throw new Error(
      `Blueprint integrity failed: expected ${expectedStageCount} stage(s), got ${Array.isArray(blueprint) ? blueprint.length : 0}`
    );
  }
  const expectedIds = Array.from({ length: expectedStageCount }, (_, idx) => idx + 1);
  const ids = blueprint.map((stage) => stage.id);
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
    throw new Error(`Blueprint integrity failed: stage IDs must be sequential [${expectedIds.join(', ')}], got [${ids.join(', ')}]`);
  }
  for (const stage of blueprint) {
    if (!Array.isArray(stage.lessonTitles) || stage.lessonTitles.length < expectedLessonsPerStage) {
      throw new Error(
        `Blueprint integrity failed: stage ${stage.id} has ${Array.isArray(stage.lessonTitles) ? stage.lessonTitles.length : 0} lesson title(s); expected at least ${expectedLessonsPerStage}`
      );
    }
    if (!Number.isInteger(stage.testQuestionCount) || stage.testQuestionCount <= 0) {
      throw new Error(`Blueprint integrity failed: stage ${stage.id} has invalid testQuestionCount "${stage.testQuestionCount}"`);
    }
  }
}

function assembleCurriculumForContext(job: GenerationJob): TrainingStage[] {
  const curriculum: TrainingStage[] = [];
  for (let i = 1; i <= job.stageCount; i++) {
    const stageOutput = job.steps[`stage_${i}`]?.parsedJson as StageLessonsOutput | null;
    const testOutput = job.steps[`test_${i}`]?.parsedJson as StageTestOutput | null;
    if (!stageOutput?.stage || !testOutput?.test) {
      throw new Error(`Stage ${i} and test ${i} must be completed before this step`);
    }
    curriculum.push({
      ...stageOutput.stage,
      test: testOutput.test
    });
  }
  return curriculum;
}

async function runCritiqueAndRepair(
  ctx: RunnerContext,
  sectionType: 'stageLessons' | 'stageTest' | 'missions',
  sectionId: string,
  generatedJson: unknown,
  targetSchema: ZodTypeAny
): Promise<{
  finalJson: unknown;
  critiqueRaw?: string;
  repairedRaw?: string;
  extraTokensUsed: number;
}> {
  const { client, job, signal } = ctx;
  const quickIssues = quickRepairSignals(sectionType, generatedJson);
  if (quickIssues.length === 0) {
    return {
      finalJson: generatedJson,
      critiqueRaw: undefined,
      repairedRaw: undefined,
      extraTokensUsed: 0
    };
  }

  const critiquePrompt = buildCritiquePrompt(sectionType, sectionId, job.domainPrompt, generatedJson);
  // Critique is a cheap backstop — Haiku is sufficient for structural quality checks.
  // Self-review rubric in generation prompts handles most issues before this point.
  const critiqueResult = await callStructuredJson({
    client,
    system: critiquePrompt.system,
    user: critiquePrompt.user,
    maxTokens: MAX_TOKENS.critique,
    model: 'claude-haiku-4-5-20251001',
    signal,
    toolName: 'return_critique_verdict',
    schemaLabel: 'critique verdict',
    schema: critiqueVerdictSchema
  });
  const verdict = critiqueResult.parsed as CritiqueVerdict;
  let finalJson = generatedJson;
  let repairedRaw: string | undefined;
  let extraTokensUsed = critiqueResult.inputTokens + critiqueResult.outputTokens;

  if (verdict?.requiresRevision && Array.isArray(verdict.issues) && verdict.issues.length > 0) {
    const repairPrompt = buildFixPrompt(
      sectionType,
      sectionId,
      generatedJson,
      verdict.issues.map((issue) => ({
        rule: issue.rule,
        message: issue.message
      }))
    );
    const repairResult = await callStructuredJson({
      client,
      system: repairPrompt.system,
      user: repairPrompt.user,
      maxTokens: MAX_TOKENS.repair,
      signal,
      toolName: `return_repaired_${sectionType}`,
      schemaLabel: `${sectionType} repaired JSON`,
      schema: targetSchema
    });
    finalJson = repairResult.parsed;
    repairedRaw = repairResult.rawOutput;
    extraTokensUsed += repairResult.inputTokens + repairResult.outputTokens;
  }

  return {
    finalJson,
    critiqueRaw: critiqueResult.rawOutput,
    repairedRaw,
    extraTokensUsed
  };
}

// ─── Blueprint (Step 0) ───────────────────────────────────────────────────────

export async function runBlueprint(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;
  const prompt = buildBlueprintPrompt(
    job.domainPrompt,
    job.audienceDescription,
    job.stageCount,
    job.lessonsPerStage,
    job.objectives,
    getRegulatoryContextFull(job)
  );

  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.blueprint,
    signal,
    toolName: 'return_blueprint',
    schemaLabel: 'blueprint output',
    schema: blueprintOutputSchema
  });
  validateBlueprintIntegrity(result.parsed.blueprint, job.stageCount, job.lessonsPerStage);

  return {
    stepKey: 'blueprint',
    status: 'done',
    rawOutput: result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

// ─── Stage Lessons (one runner called for each stage) ─────────────────────────

export async function runStageLesson(ctx: RunnerContext, stageIndex: number): Promise<StepResult> {
  const { client, job, signal } = ctx;
  const stepKey = `stage_${stageIndex}`;

  const blueprintOutput = job.steps['blueprint']?.parsedJson as BlueprintOutput | null;
  if (!blueprintOutput?.blueprint) {
    throw new Error('Blueprint must be completed before running stage lessons');
  }

  const bpStage = blueprintOutput.blueprint.find((s) => s.id === stageIndex);
  if (!bpStage) {
    throw new Error(`Blueprint stage ${stageIndex} not found`);
  }

  const prompt = buildStageLessonsPrompt(
    job.domainPrompt,
    job.audienceDescription,
    bpStage,
    job.sourceReferences,
    job.objectives,
    getRegulatoryContextCompact(job)
  );

  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.stageLesson,
    signal,
    toolName: `return_stage_${stageIndex}_lessons`,
    schemaLabel: `stage_${stageIndex} lessons output`,
    schema: stageLessonsOutputSchema
  });
  const critique = await runCritiqueAndRepair(
    ctx,
    'stageLessons',
    stepKey,
    result.parsed,
    stageLessonsOutputSchema
  );
  const resolvedStageLessons = await resolveLessonImages(
    critique.finalJson as StageLessonsOutput,
    {
      domainPrompt: job.domainPrompt,
      sourceReferences: job.sourceReferences
    }
  );

  return {
    stepKey,
    status: 'done',
    rawOutput: critique.repairedRaw ?? result.rawOutput,
    parsedJson: resolvedStageLessons,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens + critique.extraTokensUsed,
    retryCount: 0
  };
}

// ─── Stage Test (one runner called for each stage) ────────────────────────────

export async function runStageTest(ctx: RunnerContext, stageIndex: number): Promise<StepResult> {
  const { client, job, signal } = ctx;
  const stepKey = `test_${stageIndex}`;

  const blueprintOutput = job.steps['blueprint']?.parsedJson as BlueprintOutput | null;
  const stageOutput = job.steps[`stage_${stageIndex}`]?.parsedJson as StageLessonsOutput | null;

  if (!blueprintOutput?.blueprint || !stageOutput?.stage) {
    throw new Error(`Stage ${stageIndex} must be completed before generating its test`);
  }

  const bpStage = blueprintOutput.blueprint.find((s) => s.id === stageIndex);
  if (!bpStage) {
    throw new Error(`Blueprint stage ${stageIndex} not found`);
  }

  // Pass only lesson summaries (title + objective) — not full content — to avoid context bloat
  const lessonSummaries = stageOutput.stage.lessons.map((l) => ({
    title: l.title,
    objective: l.objective
  }));

  // Collect every quiz question prompt from this stage's lessons so the model can avoid
  // duplicating or rephrasing them in the stage-gate exam.
  const existingQuizPrompts = stageOutput.stage.lessons.flatMap(
    (l) => l.quiz?.map((q) => q.prompt) ?? []
  );

  const prompt = buildStageTestPrompt(
    job.domainPrompt,
    bpStage,
    lessonSummaries,
    job.objectives,
    existingQuizPrompts
  );

  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.stageTest,
    signal,
    toolName: `return_stage_${stageIndex}_test`,
    schemaLabel: `stage_${stageIndex} test output`,
    schema: stageTestOutputSchema
  });
  const critique = await runCritiqueAndRepair(
    ctx,
    'stageTest',
    stepKey,
    result.parsed,
    stageTestOutputSchema
  );

  return {
    stepKey,
    status: 'done',
    rawOutput: critique.repairedRaw ?? result.rawOutput,
    parsedJson: critique.finalJson,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens + critique.extraTokensUsed,
    retryCount: 0
  };
}

// ─── Missions ─────────────────────────────────────────────────────────────────

export async function runMissions(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;

  const blueprintOutput = job.steps['blueprint']?.parsedJson as BlueprintOutput | null;
  if (!blueprintOutput?.blueprint) {
    throw new Error('Blueprint must be completed before generating missions');
  }

  const stageTitles = blueprintOutput.blueprint.map((s) => s.title);

  // Extract lesson summaries from all completed stage results so missions align with
  // specific lesson skills rather than being generated blind from stage titles alone.
  // This eliminates the root cause of LESSON_MISSION_MAP_SEMANTIC_MISMATCH errors.
  const lessonSummaries = Array.from({ length: job.stageCount }, (_, i) => {
    const stageOutput = job.steps[`stage_${i + 1}`]?.parsedJson as StageLessonsOutput | null;
    return {
      stageId: i + 1,
      stageTitle: stageOutput?.stage?.title ?? stageTitles[i] ?? `Stage ${i + 1}`,
      lessons:
        stageOutput?.stage?.lessons?.map((l) => ({
          id: l.id,
          title: l.title,
          objective: l.objective
        })) ?? []
    };
  });

  const prompt = buildMissionsPrompt(
    job.domainPrompt,
    job.audienceDescription,
    stageTitles,
    job.missionCount,
    job.objectives,
    lessonSummaries
  );

  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.missions,
    signal,
    toolName: 'return_missions',
    schemaLabel: 'missions output',
    schema: missionsOutputSchema
  });
  const critique = await runCritiqueAndRepair(
    ctx,
    'missions',
    'missions',
    result.parsed,
    missionsOutputSchema
  );

  return {
    stepKey: 'missions',
    status: 'done',
    rawOutput: critique.repairedRaw ?? result.rawOutput,
    parsedJson: critique.finalJson,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens + critique.extraTokensUsed,
    retryCount: 0
  };
}

// ─── Placement Assessment ────────────────────────────────────────────────────

export async function runPlacementAssessment(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;

  const curriculum = assembleCurriculumForContext(job);
  const stageTitles = curriculum.map((s) => s.title);

  const prompt = buildPlacementAssessmentPrompt(
    job.domainPrompt,
    job.audienceDescription,
    stageTitles,
    curriculum,
    job.objectives
  );

  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.placementAssessment,
    signal,
    toolName: 'return_placement_assessment',
    schemaLabel: 'placement assessment output',
    schema: placementAssessmentOutputSchema
  });

  return {
    stepKey: 'placementAssessment',
    status: 'done',
    rawOutput: result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

// ─── Lesson Mission Map ──────────────────────────────────────────────────────

export async function runLessonMissionMap(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;

  const curriculum = assembleCurriculumForContext(job);
  const missionsResult = job.steps['missions']?.parsedJson as MissionsOutput | null;
  const missions = missionsResult?.missions ?? [];
  if (!Array.isArray(missions) || missions.length === 0) {
    throw new Error('Missions must be completed before generating lesson mission map');
  }

  const prompt = buildLessonMissionMapPrompt(job.domainPrompt, curriculum, missions, job.objectives);

  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.lessonMissionMap,
    signal,
    toolName: 'return_lesson_mission_map',
    schemaLabel: 'lesson mission map output',
    schema: lessonMissionMapOutputSchema
  });

  return {
    stepKey: 'lessonMissionMap',
    status: 'done',
    rawOutput: result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

// ─── Source Attribution ──────────────────────────────────────────────────────

export async function runSourceAttribution(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;

  const curriculum = assembleCurriculumForContext(job);
  const missionsResult = job.steps['missions']?.parsedJson as MissionsOutput | null;
  const missions = missionsResult?.missions ?? [];
  if (!Array.isArray(missions) || missions.length === 0) {
    throw new Error('Missions must be completed before generating source attribution');
  }

  // discoverSourceReferences is a private sub-call (not a pipeline step) that uses
  // buildSourceDiscoveryPrompt to expand the user-provided URL list before attribution.
  const discoveredReferences = await discoverSourceReferences(ctx, curriculum, missions);
  const effectiveSourceReferences = Array.from(
    new Set([...job.sourceReferences, ...discoveredReferences])
  );

  const prompt = buildSourceAttributionPrompt(
    job.domainPrompt,
    effectiveSourceReferences,
    curriculum,
    missions,
    job.objectives
  );

  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.sourceAttribution,
    signal,
    toolName: 'return_source_attribution',
    schemaLabel: 'source attribution output',
    schema: sourceAttributionOutputSchema
  });

  return {
    stepKey: 'sourceAttribution',
    status: 'done',
    rawOutput: result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

// ─── Fact-check ──────────────────────────────────────────────────────────────

export async function runFactCheck(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;

  const curriculum = assembleCurriculumForContext(job);
  const missionsResult = job.steps['missions']?.parsedJson as MissionsOutput | null;
  const missions = missionsResult?.missions ?? [];
  if (!Array.isArray(missions) || missions.length === 0) {
    throw new Error('Missions must be completed before running fact-check');
  }

  const sourceAttr = job.steps['sourceAttribution']?.parsedJson as SourceAttributionOutput | null;
  const sourceCatalog = sourceAttr?.sourceCatalog ?? [];
  const citationMap = sourceAttr?.citationMap ?? { lessonCitations: {}, missionCitations: {} };

  const placementRaw = job.steps['placementAssessment']?.parsedJson as
    | { placementAssessment?: { questions?: unknown[] } }
    | null;
  const placementQuestionCount = Array.isArray(placementRaw?.placementAssessment?.questions)
    ? placementRaw!.placementAssessment!.questions!.length
    : 0;

  const prompt = buildFactCheckPrompt({
    domainPrompt: job.domainPrompt,
    objectives: job.objectives,
    sourceCatalog,
    citationMap,
    curriculum,
    missions,
    placementQuestionCount,
    regulatoryFactCheckConfig: getRegulatoryFactCheckConfig(job)
  });

  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.factCheck,
    signal,
    toolName: 'return_fact_check',
    schemaLabel: 'fact-check output',
    schema: factCheckOutputSchema
  });

  return {
    stepKey: 'factCheck',
    status: 'done',
    rawOutput: result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

// ─── Advanced Artifacts ──────────────────────────────────────────────────────

function buildFallbackAdvancedArtifacts(input: {
  domainPrompt: string;
  audienceDescription: string;
  stageCount: number;
  stageTitles: string[];
  missionIds: string[];
}): AdvancedArtifactsOutput {
  const missionIds = input.missionIds.length > 0 ? input.missionIds : ['m1'];
  const requiredMissionIds = missionIds.slice(0, Math.min(2, missionIds.length));
  const bonusMissionIds = missionIds.slice(requiredMissionIds.length);

  const scenarios = Array.from({ length: 20 }, (_, idx) => {
    const i = idx + 1;
    const difficulty: 'beginner' | 'intermediate' | 'advanced' =
      i <= 8 ? 'beginner' : i <= 15 ? 'intermediate' : 'advanced';
    const min = difficulty === 'beginner' ? 50 : difficulty === 'intermediate' ? 60 : 70;
    const max = difficulty === 'beginner' ? 75 : difficulty === 'intermediate' ? 88 : 100;
    return {
      id: `fs-${String(i).padStart(2, '0')}`,
      symptomDescription: `Observed fault pattern ${i}: inconsistent performance and safety risk under load in ${input.domainPrompt}.`,
      injectedIssues: [
        'Incorrect adjustment baseline',
        'Component wear interacting with setup error'
      ],
      compound: i % 3 === 0,
      difficulty,
      expectedReasoningPath: [
        'Isolate the affected subsystem from rider symptom timing',
        'Inspect highest-probability mechanical causes in sequence',
        'Apply one controlled correction and verify outcome under load'
      ],
      successCriteria: [
        'Root cause identified with evidence',
        'Corrective action resolves symptom without introducing new fault'
      ],
      scoreRange: { min, max }
    };
  });

  return {
    advancedArtifacts: {
      simulatorDesign: {
        concept: `Interactive workshop simulator for ${input.domainPrompt} focused on evidence-first diagnosis and safe correction for ${input.audienceDescription}. Progression aligns to stages: ${input.stageTitles.join(' | ')}.`,
        learnerControls: [
          'Run system check',
          'Apply adjustment',
          'Swap component state',
          'Execute verification cycle'
        ],
        stateVariables: [
          { name: 'componentHealth', description: 'Wear/degradation level across critical parts.' },
          { name: 'adjustmentOffset', description: 'Current deviation from target setup.' },
          { name: 'loadCondition', description: 'Static vs dynamic load during verification.' },
          { name: 'safetyStatus', description: 'Ride-ready safety gate pass/fail state.' }
        ],
        visibleOutcomes: [
          'Symptom intensity trend',
          'Safety status indicator',
          'Performance consistency score'
        ],
        subsystems: [
          { id: 'sub-1', title: 'Diagnosis Console', purpose: 'Observe symptoms and isolate likely subsystem.' },
          { id: 'sub-2', title: 'Adjustment Bench', purpose: 'Apply controlled changes and compare outcomes.' },
          { id: 'sub-3', title: 'Verification Loop', purpose: 'Validate fix under realistic load conditions.' }
        ],
        tickModel: {
          model: 'discrete-step simulation with deterministic state transitions',
          stepMs: 500,
          updateSequence: ['Read controls', 'Apply fault/adjustment state changes', 'Recompute outcomes']
        },
        faultInjectionModel: {
          injectableFaultTypes: [
            'wear-and-tolerance drift',
            'misalignment',
            'tension/setup error',
            'post-repair omission'
          ],
          examples: [
            'Component wear masked by temporary adjustment',
            'Safety-critical fastener not fully secured after service'
          ]
        },
        trainerPanels: [
          {
            id: 'tp-1',
            title: 'Foundation Coaching',
            stageMin: 1,
            stageMax: Math.max(1, input.stageCount),
            focus: 'System isolation and basic correction sequencing'
          },
          {
            id: 'tp-2',
            title: 'Performance Diagnostics',
            stageMin: 1,
            stageMax: Math.max(1, input.stageCount),
            focus: 'Compound-fault differentiation under time pressure'
          }
        ]
      },
      faultScenarioCampaign: { scenarios },
      fieldReferenceCards: [
        {
          id: 'fr-1',
          title: 'Rapid Symptom Intake',
          purpose: 'Convert rider complaint into testable diagnostic hypotheses.',
          checklist: [
            'Capture when symptom appears/disappears',
            'Link symptom to likely subsystem',
            'Define first verification check before touching tools'
          ],
          preventsMistake: 'Random adjustments without fault isolation'
        },
        {
          id: 'fr-2',
          title: 'Safety-Critical Sweep',
          purpose: 'Confirm release safety before ride/testing.',
          checklist: [
            'Check control feel and response',
            'Verify retention/fastening points',
            'Run short dynamic verification'
          ],
          preventsMistake: 'Declaring ready state from stand-only checks'
        },
        {
          id: 'fr-3',
          title: 'Adjustment Reset Method',
          purpose: 'Recover from over-adjusted systems quickly and safely.',
          checklist: [
            'Return fine-adjuster to neutral range',
            'Reset coarse anchor point',
            'Re-apply fine tuning with re-test after each change'
          ],
          preventsMistake: 'Running out of adjustment range'
        },
        {
          id: 'fr-4',
          title: 'Root-Cause Verification',
          purpose: 'Prevent repeat failure after first fix.',
          checklist: [
            'Inspect for original trigger evidence',
            'Confirm no secondary fault remains',
            'Document what was corrected and why'
          ],
          preventsMistake: 'Treating symptom only'
        },
        {
          id: 'fr-5',
          title: 'Field Service Handoff',
          purpose: 'Standardize final briefing and next checks.',
          checklist: [
            'State corrected issue and verification performed',
            'Highlight watch-outs for next ride/session',
            'Assign follow-up inspection interval'
          ],
          preventsMistake: 'Unclear handoff causing repeat mistakes'
        }
      ],
      builderExercises: [
        {
          id: 'be-1',
          title: 'Diagnostic Sequence Builder',
          templateType: 'ordered-workflow',
          paletteItems: ['Symptom intake', 'Subsystem isolation', 'Targeted inspection', 'Verification'],
          requiredSlots: ['Step 1', 'Step 2', 'Step 3'],
          validationLogic: 'Accept only evidence-first order with verification last.',
          testCases: [
            { id: 'tc-1', input: 'Intake -> isolate -> inspect -> verify', expected: 'pass' },
            { id: 'tc-2', input: 'Inspect all -> adjust all -> test', expected: 'fail' }
          ]
        },
        {
          id: 'be-2',
          title: 'Fault-to-Fix Matcher',
          templateType: 'mapping-grid',
          paletteItems: ['Observed symptom', 'Likely root cause', 'First action', 'Confirming test'],
          requiredSlots: ['Row A', 'Row B'],
          validationLogic: 'Mapped action must match root cause class and include confirmation step.',
          testCases: [
            { id: 'tc-1', input: 'Symptom matched to unrelated action', expected: 'fail' },
            { id: 'tc-2', input: 'Symptom mapped with root-cause evidence and confirm', expected: 'pass' }
          ]
        },
        {
          id: 'be-3',
          title: 'Safety Release Checklist Builder',
          templateType: 'checklist-assembler',
          paletteItems: ['Control check', 'Retention check', 'Load test', 'Record outcome'],
          requiredSlots: ['Mandatory checks', 'Verification checks'],
          validationLogic: 'Checklist must include both static and dynamic verification.',
          testCases: [
            { id: 'tc-1', input: 'Static checks only', expected: 'fail' },
            { id: 'tc-2', input: 'Static + dynamic + record', expected: 'pass' }
          ]
        },
        {
          id: 'be-4',
          title: 'Compound Fault Resolver',
          templateType: 'decision-branch',
          paletteItems: ['Primary fault', 'Secondary fault', 'Order of correction', 'Retest gate'],
          requiredSlots: ['Branch 1', 'Branch 2'],
          validationLogic: 'Primary safety fault must be corrected before performance-only faults.',
          testCases: [
            { id: 'tc-1', input: 'Performance first, safety later', expected: 'fail' },
            { id: 'tc-2', input: 'Safety first, then performance, then retest', expected: 'pass' }
          ]
        }
      ],
      capstoneChallenge: {
        title: `${input.domainPrompt} Ride/Release Readiness Capstone`,
        requiredMissionIds,
        optionalBonusMissionIds: bonusMissionIds,
        scoringRubric: [
          { criterion: 'Diagnosis quality', weight: 35, description: 'Correctly isolates and evidences root cause.' },
          { criterion: 'Correction quality', weight: 35, description: 'Applies safe, controlled, and effective correction.' },
          { criterion: 'Verification discipline', weight: 30, description: 'Performs dynamic verification before release.' }
        ],
        guidanceBands: [
          { band: 'Not Ready', minScore: 0, maxScore: 59, guidance: 'Rebuild diagnostic sequence and safety checks.' },
          { band: 'Developing', minScore: 60, maxScore: 79, guidance: 'Improve consistency in evidence and verification.' },
          { band: 'Ready', minScore: 80, maxScore: 100, guidance: 'Demonstrates reliable, safe field-standard process.' }
        ],
        reportFields: [
          'Primary symptom',
          'Identified root cause',
          'Correction applied',
          'Verification method',
          'Residual risk notes'
        ]
      },
      progressionScoringRules: {
        missionScoring: 'Use weighted branch outcomes emphasizing safety-first decisions.',
        faultCampaignScoring: 'Score by root-cause accuracy, correction sequence, and verification completeness.',
        stageProgression: `Advance when learner sustains >=80 across missions and campaign scenarios for ${input.domainPrompt}.`,
        capstonePassThreshold: 80
      },
      implementationNotes: {
        dataModelNotes: [
          'Persist scenario state snapshots for replayable diagnosis.',
          'Store selected actions with timestamps for coaching analytics.'
        ],
        renderingHints: [
          'Show subsystem state and safety status in one fixed panel.',
          'Visually separate symptom observation from corrective actions.'
        ],
        idConventions: [
          'Scenarios: fs-01..fs-20',
          'Field cards: fr-1..fr-5',
          'Builder exercises: be-1..be-4'
        ]
      }
    }
  };
}

// ─── Simulator Design (sub-step 1/3 of advanced artifacts) ──────────────────

export async function runSimulatorDesign(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;
  const curriculum = assembleCurriculumForContext(job);
  const missionsResult = job.steps['missions']?.parsedJson as MissionsOutput | null;
  const missions = missionsResult?.missions ?? [];

  const prompt = buildSimulatorDesignPrompt({
    domainPrompt: job.domainPrompt,
    audienceDescription: job.audienceDescription,
    objectives: job.objectives,
    stageTitles: curriculum.map((s) => s.title),
    lessonsPerStage: curriculum.map((stage) => ({
      stageId: stage.id,
      stageTitle: stage.title,
      lessons: stage.lessons.map((l) => ({ id: l.id, title: l.title, objective: l.objective }))
    }))
  });

  try {
    const result = await callStructuredJson({
      client,
      system: prompt.system,
      user: prompt.user,
      maxTokens: MAX_TOKENS.simulatorDesign,
      signal,
      toolName: 'return_simulator_design',
      schemaLabel: 'simulator design output',
      schema: simulatorDesignOutputSchema
    });

    return {
      stepKey: 'simulatorDesign',
      status: 'done',
      rawOutput: result.rawOutput,
      parsedJson: result.parsed as SimulatorDesignOutput,
      validationErrors: [],
      tokensUsed: result.inputTokens + result.outputTokens,
      retryCount: 0
    };
  } catch (error) {
    const fallback = buildFallbackAdvancedArtifacts({
      domainPrompt: job.domainPrompt,
      audienceDescription: job.audienceDescription,
      stageCount: job.stageCount,
      stageTitles: curriculum.map((s) => s.title),
      missionIds: missions.map((m) => m.id)
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    const warning: ValidationError = {
      severity: 'warning',
      path: 'advancedArtifacts.simulatorDesign',
      rule: 'SIMULATOR_DESIGN_MODEL_OUTPUT_INVALID',
      message: `Simulator design model output was invalid; using fallback. ${errorMessage.slice(0, 240)}`
    };
    const output: SimulatorDesignOutput = { simulatorDesign: fallback.advancedArtifacts.simulatorDesign };
    return {
      stepKey: 'simulatorDesign',
      status: 'done',
      rawOutput: JSON.stringify(output, null, 2),
      parsedJson: output,
      validationErrors: [warning],
      tokensUsed: 0,
      retryCount: 0
    };
  }
}

// ─── Fault Scenarios & Reference Cards (sub-step 2/3 of advanced artifacts) ──

export async function runFaultAndReference(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;
  const curriculum = assembleCurriculumForContext(job);
  const missionsResult = job.steps['missions']?.parsedJson as MissionsOutput | null;
  const missions = missionsResult?.missions ?? [];

  // Forward the simulator concept so fault scenarios target the right injection model
  const simulatorResult = job.steps['simulatorDesign']?.parsedJson as SimulatorDesignOutput | null;
  const simulatorConcept = simulatorResult?.simulatorDesign?.concept;

  const prompt = buildFaultAndReferencePrompt({
    domainPrompt: job.domainPrompt,
    audienceDescription: job.audienceDescription,
    stageTitles: curriculum.map((s) => s.title),
    lessonsPerStage: curriculum.map((stage) => ({
      stageId: stage.id,
      stageTitle: stage.title,
      lessons: stage.lessons.map((l) => ({ id: l.id, title: l.title, objective: l.objective }))
    })),
    simulatorConcept
  });

  try {
    const result = await callStructuredJson({
      client,
      system: prompt.system,
      user: prompt.user,
      maxTokens: MAX_TOKENS.faultAndReference,
      signal,
      toolName: 'return_fault_and_reference',
      schemaLabel: 'fault and reference output',
      schema: faultAndReferenceOutputSchema
    });

    return {
      stepKey: 'faultAndReference',
      status: 'done',
      rawOutput: result.rawOutput,
      parsedJson: result.parsed as FaultAndReferenceOutput,
      validationErrors: [],
      tokensUsed: result.inputTokens + result.outputTokens,
      retryCount: 0
    };
  } catch (error) {
    const fallback = buildFallbackAdvancedArtifacts({
      domainPrompt: job.domainPrompt,
      audienceDescription: job.audienceDescription,
      stageCount: job.stageCount,
      stageTitles: curriculum.map((s) => s.title),
      missionIds: missions.map((m) => m.id)
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    const warning: ValidationError = {
      severity: 'warning',
      path: 'advancedArtifacts.faultScenarioCampaign',
      rule: 'FAULT_AND_REFERENCE_MODEL_OUTPUT_INVALID',
      message: `Fault scenario/reference model output was invalid; using fallback. ${errorMessage.slice(0, 240)}`
    };
    const output: FaultAndReferenceOutput = {
      faultScenarioCampaign: fallback.advancedArtifacts.faultScenarioCampaign,
      fieldReferenceCards: fallback.advancedArtifacts.fieldReferenceCards
    };
    return {
      stepKey: 'faultAndReference',
      status: 'done',
      rawOutput: JSON.stringify(output, null, 2),
      parsedJson: output,
      validationErrors: [warning],
      tokensUsed: 0,
      retryCount: 0
    };
  }
}

// ─── Builder Exercises & Capstone (sub-step 3/3 of advanced artifacts) ────────

export async function runBuilderAndCapstone(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;
  const curriculum = assembleCurriculumForContext(job);
  const missionsResult = job.steps['missions']?.parsedJson as MissionsOutput | null;
  const missions = missionsResult?.missions ?? [];

  const prompt = buildBuilderAndCapstonePrompt({
    domainPrompt: job.domainPrompt,
    audienceDescription: job.audienceDescription,
    objectives: job.objectives,
    stageTitles: curriculum.map((s) => s.title),
    missionIds: missions.map((m) => m.id)
  });

  try {
    const result = await callStructuredJson({
      client,
      system: prompt.system,
      user: prompt.user,
      maxTokens: MAX_TOKENS.builderAndCapstone,
      signal,
      toolName: 'return_builder_and_capstone',
      schemaLabel: 'builder and capstone output',
      schema: builderAndCapstoneOutputSchema
    });

    return {
      stepKey: 'builderAndCapstone',
      status: 'done',
      rawOutput: result.rawOutput,
      parsedJson: result.parsed as BuilderAndCapstoneOutput,
      validationErrors: [],
      tokensUsed: result.inputTokens + result.outputTokens,
      retryCount: 0
    };
  } catch (error) {
    const fallback = buildFallbackAdvancedArtifacts({
      domainPrompt: job.domainPrompt,
      audienceDescription: job.audienceDescription,
      stageCount: job.stageCount,
      stageTitles: curriculum.map((s) => s.title),
      missionIds: missions.map((m) => m.id)
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    const warning: ValidationError = {
      severity: 'warning',
      path: 'advancedArtifacts.builderExercises',
      rule: 'BUILDER_AND_CAPSTONE_MODEL_OUTPUT_INVALID',
      message: `Builder/capstone model output was invalid; using fallback. ${errorMessage.slice(0, 240)}`
    };
    const output: BuilderAndCapstoneOutput = {
      builderExercises: fallback.advancedArtifacts.builderExercises,
      capstoneChallenge: fallback.advancedArtifacts.capstoneChallenge,
      progressionScoringRules: fallback.advancedArtifacts.progressionScoringRules,
      implementationNotes: fallback.advancedArtifacts.implementationNotes
    };
    return {
      stepKey: 'builderAndCapstone',
      status: 'done',
      rawOutput: JSON.stringify(output, null, 2),
      parsedJson: output,
      validationErrors: [warning],
      tokensUsed: 0,
      retryCount: 0
    };
  }
}

// ─── Theme Shell ──────────────────────────────────────────────────────────────

export async function runThemeShell(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;

  const prompt = buildThemeShellPrompt(
    job.domainPrompt,
    job.moduleId,
    job.audienceDescription,
    job.stageCount
  );

  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.themeShell,
    signal,
    toolName: 'return_theme_shell',
    schemaLabel: 'theme shell output',
    schema: themeShellOutputSchema
  });

  return {
    stepKey: 'themeShell',
    status: 'done',
    rawOutput: result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

// ─── Fix/Retry (called when validation errors are found) ──────────────────────

function getSchemaForFix(sectionType: string, sectionId: string): ZodTypeAny | null {
  if (sectionType === 'blueprint' || sectionId === 'blueprint') return blueprintOutputSchema;
  if (sectionType === 'stageLessons' || /^stage_\d+$/.test(sectionId)) return stageLessonsOutputSchema;
  if (sectionType === 'stageTest' || /^test_\d+$/.test(sectionId)) return stageTestOutputSchema;
  if (sectionType === 'missions' || sectionId === 'missions') return missionsOutputSchema;
  if (sectionType === 'placementAssessment' || sectionId === 'placementAssessment') {
    return placementAssessmentOutputSchema;
  }
  if (sectionType === 'lessonMissionMap' || sectionId === 'lessonMissionMap') {
    return lessonMissionMapOutputSchema;
  }
  if (sectionType === 'sourceAttribution' || sectionId === 'sourceAttribution') {
    return sourceAttributionOutputSchema;
  }
  if (sectionType === 'factCheck' || sectionId === 'factCheck') return factCheckOutputSchema;
  if (sectionType === 'simulatorDesign' || sectionId === 'simulatorDesign') return simulatorDesignOutputSchema;
  if (sectionType === 'faultAndReference' || sectionId === 'faultAndReference') return faultAndReferenceOutputSchema;
  if (sectionType === 'builderAndCapstone' || sectionId === 'builderAndCapstone') return builderAndCapstoneOutputSchema;
  if (sectionType === 'themeShell' || sectionId === 'themeShell') return themeShellOutputSchema;
  return null;
}

export async function runFix(
  ctx: RunnerContext,
  sectionType: string,
  sectionId: string,
  offendingJson: unknown,
  errors: ValidationError[]
): Promise<StepResult> {
  const { client, job: _job, onChunk, signal } = ctx;

  const simpleErrors = errors.map((e) => ({ rule: e.rule, message: e.message }));
  const prompt = buildFixPrompt(sectionType, sectionId, offendingJson, simpleErrors);

  const schema = getSchemaForFix(sectionType, sectionId);

  if (schema) {
    const structured = await callStructuredJson({
      client,
      system: prompt.system,
      user: prompt.user,
      maxTokens: MAX_TOKENS.repair,
      signal,
      toolName: `return_fixed_${sectionType}_${sectionId}`.replace(/[^a-zA-Z0-9_]/g, '_'),
      schemaLabel: `fixed ${sectionType}:${sectionId} output`,
      schema
    });
    return {
      stepKey: `fix_${sectionId}`,
      status: 'done',
      rawOutput: structured.rawOutput,
      parsedJson: structured.parsed,
      validationErrors: [],
      tokensUsed: structured.inputTokens + structured.outputTokens,
      retryCount: 0
    };
  }

  const result = await streamText({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.repair,
    signal,
    onChunk
  });

  return {
    stepKey: `fix_${sectionId}`,
    status: 'done',
    rawOutput: result.fullText,
    parsedJson: parseJsonOutput(result.fullText),
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

async function discoverSourceReferences(
  ctx: RunnerContext,
  curriculum: TrainingStage[],
  missions: MissionsOutput['missions']
): Promise<string[]> {
  const { client, job, signal } = ctx;
  const prompt = buildSourceDiscoveryPrompt({
    domainPrompt: job.domainPrompt,
    audienceDescription: job.audienceDescription,
    objectives: job.objectives,
    providedSourceReferences: job.sourceReferences,
    curriculum,
    missions
  });

  try {
    const result = await callStructuredJson({
      client,
      system: prompt.system,
      user: prompt.user,
      maxTokens: MAX_TOKENS.sourceDiscovery,
      signal,
      toolName: 'return_source_discovery',
      schemaLabel: 'source discovery output',
      schema: sourceDiscoveryOutputSchema
    });

    return (result.parsed.discoveredSources ?? [])
      .map((item) => item.url)
      .filter((url): url is string => /^https?:\/\//.test(url));
  } catch {
    // Non-blocking: fallback to user-provided references only.
    return [];
  }
}

// ─── Preflight — validates domain config clarity before a costly generation run ─

export async function runPreflight(
  domainPrompt: string,
  audienceDescription: string,
  objectives: string[],
  apiKey: string
): Promise<PreflightResult> {
  const client = createAIClient(apiKey);
  const prompt = buildPreflightPrompt(domainPrompt, audienceDescription, objectives);
  const result = await callStructuredJson({
    client,
    system: prompt.system,
    user: prompt.user,
    maxTokens: 300,
    model: 'claude-haiku-4-5-20251001',
    toolName: 'return_preflight',
    schemaLabel: 'preflight result',
    schema: preflightOutputSchema
  });
  return result.parsed;
}

// ─── Dispatch — runs the correct runner for a given stepKey ──────────────────

export async function runStep(
  stepKey: string,
  client: AIClient,
  job: GenerationJob,
  onChunk: (chunk: string) => void,
  signal: AbortSignal
): Promise<StepResult> {
  const ctx: RunnerContext = { client, job, onChunk, signal };

  if (stepKey === 'blueprint') return runBlueprint(ctx);
  if (stepKey === 'missions') return runMissions(ctx);
  if (stepKey === 'placementAssessment') return runPlacementAssessment(ctx);
  if (stepKey === 'lessonMissionMap') return runLessonMissionMap(ctx);
  if (stepKey === 'sourceAttribution') return runSourceAttribution(ctx);
  if (stepKey === 'factCheck') return runFactCheck(ctx);
  if (stepKey === 'simulatorDesign') return runSimulatorDesign(ctx);
  if (stepKey === 'faultAndReference') return runFaultAndReference(ctx);
  if (stepKey === 'builderAndCapstone') return runBuilderAndCapstone(ctx);
  if (stepKey === 'themeShell') return runThemeShell(ctx);

  const stageIdx = stageIndexFromKey(stepKey);
  if (stepKey.startsWith('stage_') && stageIdx > 0) return runStageLesson(ctx, stageIdx);
  if (stepKey.startsWith('test_') && stageIdx > 0) return runStageTest(ctx, stageIdx);

  throw new Error(`Unknown step key: ${stepKey}`);
}

// ─── Retry wrapper for parallel execution ─────────────────────────────────────
// Wraps runStep with timeout + transient-error retry logic.
// Used by StudioPage to run stage/test batches in parallel without going
// through the single-stream useStreamedStep hook.

const PARALLEL_STEP_TIMEOUT_MS = 3 * 60 * 1000;

function isTransientStepError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('connection error') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('temporar') ||
    msg.includes('econn') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('429')
  );
}

export async function runStepWithRetry(
  stepKey: string,
  client: AIClient,
  job: GenerationJob,
  signal: AbortSignal,
  onChunk?: (chunk: string) => void
): Promise<StepResult> {
  let lastErr: unknown;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutController = new AbortController();
    const onParentAbort = () => timeoutController.abort();
    signal.addEventListener('abort', onParentAbort);
    const timeoutId = setTimeout(() => timeoutController.abort(), PARALLEL_STEP_TIMEOUT_MS);
    try {
      const result = await runStep(
        stepKey, client, job, onChunk ?? (() => {}), timeoutController.signal
      );
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onParentAbort);
      return result;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onParentAbort);
      lastErr = err;
      if (signal.aborted) throw err;
      const timedOut = timeoutController.signal.aborted && !signal.aborted;
      const shouldRetry = (timedOut || isTransientStepError(err)) && attempt < maxAttempts;
      if (!shouldRetry) break;
      await new Promise<void>((resolve) => setTimeout(resolve, attempt === 1 ? 1200 : 2500));
    }
  }
  throw lastErr;
}
