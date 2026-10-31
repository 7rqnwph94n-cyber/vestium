import type { ZodTypeAny } from 'zod';
import type { AIClient } from './aiClient.js';
import type {
  GenerationJob,
  StepResult,
  BlueprintOutput,
  StageLessonsOutput,
  StageTestOutput,
  MissionsOutput,
  SourceAttributionOutput,
  AdvancedArtifactsOutput
} from './types.js';
import { stageIndexFromKey } from './types.js';
import { streamText, parseJsonOutput, callStructuredJson } from './streamText.js';
import {
  buildRegulatoryContextBlock,
  buildRegulatoryContextCompact,
  buildFactCheckSeverityConfig
} from '../regulatory/promptInjector.js';

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

// ─── Org context helper ────────────────────────────────────────────────────────
// Appends org context block (prior module intelligence) to a system prompt.
function getOrgContextBlock(job: GenerationJob): string {
  return buildOrgContextBlock(job.orgDistilledContext);
}
import { retrieveStatutoryContext } from './ragRetrieval.js';
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
  buildDomainSurveyPrompt,
  buildCoherencePassPrompt,
  buildThemeShellPrompt,
  buildFixPrompt,
  buildCritiquePrompt,
  buildPreflightPrompt,
  buildOrgContextBlock
} from './prompts.js';
import type {
  ValidationError,
  PreflightResult,
  SimulatorDesignOutput,
  FaultAndReferenceOutput,
  BuilderAndCapstoneOutput,
  DomainSurveyOutput,
  CoherencePassOutput,
  FactCheckOutput,
  FactCheckItem,
} from './types.js';
import type { TrainingMission, TrainingQuestion, TrainingStage } from '../lib/training-core/types.js';
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
  themeShellOutputSchema,
  repairClaimSchema,
  attributeClaimSchema,
  domainSurveyOutputSchema,
  coherencePassOutputSchema,
} from './schemas.js';
import { createAIClient } from './clientFactory.js';
import { resolveLessonImages } from './imageResolver.js';

// Max tokens per step — sized with headroom to avoid mid-JSON truncation.
// Blueprint: ~350 tokens/stage × 6 stages + structure = 2500+, set to 4000
// StageLesson: 3 paragraphs × ~100 tokens × 5 lessons + quiz/examples = ~8000, set to 16000
// StageTest: ~150 tokens/question × 8 questions + structure = 1200+, set to 2500
// Missions: ~800 tokens/mission × 8 missions + structure = 6400+, set to 10000
// PlacementAssessment: ~200 tokens/question × 15 questions + structure = 3000+, set to 5000
// LessonMissionMap: ~100 tokens/entry × 20 entries + structure = 2000+, set to 5000
// ThemeShell: small flat object, 1000 is conservative
const MAX_TOKENS: Record<string, number> = {
  domainSurvey: 4096,       // Phase 0: grounded intelligence brief (2000 was too small for multi-schema domains with search grounding)
  blueprint: 8000,          // Phase 1: sized for complex regulatory domains (8+ schemas × lesson details)
  stageLesson: 12000,       // Tightened from 16000 — empirical output 8-10k; 12k is safe headroom
  stageTest: 4096,
  missions: 10000,
  placementAssessment: 3000, // Tightened from 5000 — empirical output ~1.2k; 3k is ample
  lessonMissionMap: 5000,
  sourceDiscovery: 2200,
  sourceAttribution: 2500,  // Tightened from 4000 — citation IDs are lightweight JSON
  coherencePass: 12000,     // Phase 3: bumped from 6000 — truncated on 2-stage multi-schema modules
  factCheck: 8000,          // Tightened from 10000 — empirical output ~5k; 8k safe for both A/G
  factCheckMerge: 1000,     // Phase 4 merge: pure computation (no API call)
  simulatorDesign: 3000,
  faultAndReference: 3500,
  builderAndCapstone: 3000,
  critique: 2500,
  repair: 4000,
  themeShell: 1000,
  repairArtifacts: 1000
};

// ─── Cross-model critique client ──────────────────────────────────────────────
// Returns the critique client: Gemini if PIPELINE_PROVIDER_CRITIQUE=gemini,
// otherwise falls back to the job's main generation client (same model).
// Cross-model critique (Anthropic generates → Gemini critiques) eliminates the
// same-family bias problem and catches errors the generator missed.

function getCritiqueClient(fallbackClient: AIClient): AIClient {
  const critiqueProvider = process.env.PIPELINE_PROVIDER_CRITIQUE?.trim().toLowerCase();
  if (critiqueProvider === 'gemini') {
    return createAIClient('gemini');
  }
  return fallbackClient;
}

interface RunnerContext {
  client: AIClient;
  job: GenerationJob;
  onChunk: (chunk: string) => void;
  signal: AbortSignal;
  model?: string;  // Per-step model override (e.g. Haiku for lightweight steps)
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
  if (question.type === 'verbal') return false; // verbal questions are evidence artifacts, not scored items
  if (question.intent === 'application') return true;
  const text = `${question.prompt} ${question.explanation}`.toLowerCase();
  return APPLICATION_HINTS.some((hint) => text.includes(hint));
}

function deriveKeywordCandidates(...texts: Array<string | undefined>): string[] {
  const stop = new Set([
    'under', 'with', 'from', 'into', 'that', 'this', 'must', 'should', 'their',
    'there', 'where', 'which', 'what', 'when', 'have', 'been', 'will', 'your',
    'about', 'before', 'after', 'using', 'work', 'works', 'worker', 'workers',
    'duty', 'legal', 'regulation', 'regulations', 'question', 'describe', 'explain'
  ]);
  const words = texts
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w));
  return [...new Set(words)].slice(0, 8);
}

function normalizeLessonVerbalQuestions(stage: StageLessonsOutput): StageLessonsOutput {
  const lessons = stage.stage.lessons ?? [];
  if (lessons.length === 0) return stage;

  const normalizedLessons = lessons.map((lesson) => {
    const verbalFromLesson = lesson.quiz.find((q) => q.type === 'verbal') ?? null;
    const fallbackPrompt =
      `Verbal question: explain how you would apply ${lesson.title} controls in your role.`;
    const fallbackExplanation =
      'Learner response should demonstrate practical understanding of the lesson objective and relevant control duties.';
    const seededKeywords = deriveKeywordCandidates(
      verbalFromLesson?.prompt,
      verbalFromLesson?.regulatoryRef,
      lesson.objective,
      lesson.concept?.[0]
    );

    const canonicalVerbal: TrainingQuestion = {
      id: 'v1',
      type: 'verbal',
      prompt: verbalFromLesson?.prompt?.trim() || fallbackPrompt,
      explanation: verbalFromLesson?.explanation?.trim() || fallbackExplanation,
      regulatoryRef: verbalFromLesson?.regulatoryRef,
      timerSeconds: 60,
      triggerScrollPct: 0.55,
      expectedKeywords:
        (verbalFromLesson?.expectedKeywords?.filter((k) => k.trim().length > 1).slice(0, 8) ?? [])
          .concat(seededKeywords)
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .slice(0, 8),
      minKeywordHits: verbalFromLesson?.minKeywordHits ?? 3,
    };

    if (!canonicalVerbal.expectedKeywords || canonicalVerbal.expectedKeywords.length < 3) {
      canonicalVerbal.expectedKeywords = ['control', 'risk', 'procedure'];
    }
    canonicalVerbal.minKeywordHits = Math.min(
      Math.max(canonicalVerbal.minKeywordHits ?? 3, 2),
      canonicalVerbal.expectedKeywords.length
    );

    const nonVerbal = lesson.quiz.filter((q) => q.type !== 'verbal');
    return { ...lesson, quiz: [...nonVerbal, canonicalVerbal] };
  });

  return {
    ...stage,
    stage: {
      ...stage.stage,
      lessons: normalizedLessons,
    },
  };
}

function normalizeStageTestQuestions(stageTest: StageTestOutput): StageTestOutput {
  return {
    ...stageTest,
    test: (stageTest.test ?? []).filter((q) => q.type !== 'verbal'),
  };
}

function quickRepairSignals(
  sectionType: 'stageLessons' | 'stageTest' | 'missions',
  generatedJson: unknown,
  isRegulatory = false
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
      const scoredQuestions = lesson.quiz.filter(q => q.type !== 'verbal');
      if (!Array.isArray(lesson.quiz) || scoredQuestions.length < 4) {
        issues.push({
          rule: 'LESSON_QUIZ_DEPTH_LOW',
          message: `Lesson "${lesson.id}" quiz has fewer than 4 MCQ/TF questions.`
        });
      } else {
        const appRatio = scoredQuestions.filter(isApplicationQuestion).length / scoredQuestions.length;
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
      if (isRegulatory) {
        const missing = test.filter((q) => !q.regulatoryRef || q.regulatoryRef.trim().length === 0);
        if (missing.length > 0) {
          issues.push({
            rule: 'STAGE_TEST_REGULATORY_REF_MISSING',
            message: `${missing.length} stage test question(s) missing "regulatoryRef". Add the specific regulation cited by each question (e.g. "MHSWR 1999 Reg 3(1)").`
          });
        }
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
    if (!Array.isArray(stage.lessons) || stage.lessons.length < expectedLessonsPerStage) {
      throw new Error(
        `Blueprint integrity failed: stage ${stage.id} has ${Array.isArray(stage.lessons) ? stage.lessons.length : 0} lesson(s); expected at least ${expectedLessonsPerStage}`
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
  targetSchema: ZodTypeAny,
  lessonTemplates?: Array<{ id: string; template: import('./types.js').LessonTemplate }>
): Promise<{
  finalJson: unknown;
  critiqueRaw?: string;
  repairedRaw?: string;
  extraTokensUsed: number;
}> {
  const { client, job, signal } = ctx;
  const isRegulatory = !!job.regulatoryClassification;
  const quickIssues = quickRepairSignals(sectionType, generatedJson, isRegulatory);
  if (quickIssues.length === 0) {
    return {
      finalJson: generatedJson,
      critiqueRaw: undefined,
      repairedRaw: undefined,
      extraTokensUsed: 0
    };
  }

  // Cross-model critique: if PIPELINE_PROVIDER_CRITIQUE=gemini, Gemini reviews
  // Anthropic-generated content, eliminating same-family bias.
  const critiqueClient = getCritiqueClient(client);
  const critiquePrompt = buildCritiquePrompt(sectionType, sectionId, job.domainPrompt, generatedJson, lessonTemplates);
  const critiqueResult = await callStructuredJson({
    client: critiqueClient,
    system: critiquePrompt.system,
    user: critiquePrompt.user,
    maxTokens: MAX_TOKENS.critique,
    // Only specify haiku when falling back to same-model critique; Gemini picks its own model
    model: critiqueClient.providerId === 'anthropic' ? 'claude-haiku-4-5-20251001' : undefined,
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

// ─── Phase 0: Domain Survey (Gemini, before blueprint) ────────────────────────

export async function runDomainSurvey(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;
  const isRegulatory = !!job.regulatoryClassification;
  const schemaIds = isRegulatory
    ? job.regulatoryClassification!.applicableSchemas.map((s) => s.schema.id)
    : [];

  const prompt = buildDomainSurveyPrompt(
    job.domainPrompt,
    job.audienceDescription,
    isRegulatory,
    schemaIds
  );
  const orgCtx = getOrgContextBlock(job);

  // RAG: prepend relevant statutory passages so Gemini can cite real wording
  const statutoryBlock = isRegulatory
    ? await retrieveStatutoryContext(job.domainPrompt, schemaIds, 4)
    : '';

  const userPrompt = statutoryBlock ? `${statutoryBlock}\n\n${prompt.user}` : prompt.user;
  let usedFallbackProvider = false;
  let result;
  try {
    result = await callStructuredJson({
      client,
      system: prompt.system + orgCtx,
      user: userPrompt,
      maxTokens: MAX_TOKENS.domainSurvey,
      signal,
      toolName: 'return_domain_survey',
      schemaLabel: 'domain survey output',
      schema: domainSurveyOutputSchema,
      searchGrounding: isRegulatory, // Enable Gemini search grounding for regulatory domains
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lowerMsg = msg.toLowerCase();
    const canFallback =
      lowerMsg.includes('gemini returned empty text response') ||
      lowerMsg.includes('could not parse json from gemini output') ||
      lowerMsg.includes('structured output validation failed') ||
      lowerMsg.includes('gemini request failed') ||
      lowerMsg.includes('"status": "unavailable"') ||
      lowerMsg.includes('"code": 503') ||
      lowerMsg.includes('rate limit') ||
      lowerMsg.includes('429') ||
      lowerMsg.includes('fetch failed') ||
      lowerMsg.includes('request timed out');
    if (!canFallback) throw err;

    const fallbackClient = createAIClient('anthropic');
    result = await callStructuredJson({
      client: fallbackClient,
      system: prompt.system + orgCtx,
      user: userPrompt,
      maxTokens: MAX_TOKENS.domainSurvey,
      signal,
      toolName: 'return_domain_survey',
      schemaLabel: 'domain survey output (fallback anthropic)',
      schema: domainSurveyOutputSchema,
      searchGrounding: false,
    });
    usedFallbackProvider = true;
  }

  // Store groundTruth on the job immediately so subsequent steps can access it
  const surveyOutput = result.parsed as DomainSurveyOutput;
  (job as import('./types.js').GenerationJob).groundTruth = surveyOutput.domainSurvey;

  return {
    stepKey: 'domainSurvey',
    status: 'done',
    rawOutput: usedFallbackProvider
      ? `[fallback:anthropic]\n${result.rawOutput}`
      : result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

// ─── Blueprint (Phase 1) ──────────────────────────────────────────────────────

export async function runBlueprint(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;
  const prompt = buildBlueprintPrompt(
    job.domainPrompt,
    job.audienceDescription,
    job.stageCount,
    job.lessonsPerStage,
    job.objectives,
    getRegulatoryContextFull(job),
    job.groundTruth   // Phase 0 output — grounding constraints
  );
  const orgCtx = getOrgContextBlock(job);

  const result = await callStructuredJson({
    client,
    system: prompt.system + orgCtx,
    user: prompt.user,
    maxTokens: MAX_TOKENS.blueprint,
    model: ctx.model,
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

  const isRegulatory = !!job.regulatoryClassification;
  const schemaIds = isRegulatory
    ? job.regulatoryClassification!.applicableSchemas.map((s) => s.schema.id)
    : [];

  const prompt = buildStageLessonsPrompt(
    job.domainPrompt,
    job.audienceDescription,
    bpStage,
    job.sourceReferences,
    job.objectives,
    getRegulatoryContextCompact(job),
    job.groundTruth   // Phase 0 grounding constraints
  );
  const orgCtx = getOrgContextBlock(job);

  // RAG: retrieve statute passages relevant to this stage's topic
  const stageQuery = `${job.domainPrompt} — ${bpStage.title}: ${bpStage.stageObjective}`;
  const statutoryBlock = isRegulatory
    ? await retrieveStatutoryContext(stageQuery, schemaIds, 4)
    : '';

  const result = await callStructuredJson({
    client,
    system: prompt.system + orgCtx,
    user: statutoryBlock ? `${statutoryBlock}\n\n${prompt.user}` : prompt.user,
    maxTokens: MAX_TOKENS.stageLesson,
    signal,
    toolName: `return_stage_${stageIndex}_lessons`,
    schemaLabel: `stage_${stageIndex} lessons output`,
    schema: stageLessonsOutputSchema
  });

  // Pass lesson templates to critique for template-aware rubric evaluation
  const lessonTemplates = bpStage.lessons.map((l) => ({ id: l.id, template: l.template }));
  const critique = await runCritiqueAndRepair(
    ctx,
    'stageLessons',
    stepKey,
    result.parsed,
    stageLessonsOutputSchema,
    lessonTemplates
  );
  const normalizedStageLessons = normalizeLessonVerbalQuestions(critique.finalJson as StageLessonsOutput);
  const resolvedStageLessons = await resolveLessonImages(
    normalizedStageLessons,
    {
      domainPrompt: job.domainPrompt,
      sourceReferences: job.sourceReferences,
      regulatoryClassification: job.regulatoryClassification,
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
    existingQuizPrompts,
    getRegulatoryContextCompact(job)
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

  const normalizedTest = normalizeStageTestQuestions(critique.finalJson as StageTestOutput);

  return {
    stepKey,
    status: 'done',
    rawOutput: critique.repairedRaw ?? result.rawOutput,
    parsedJson: normalizedTest,
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
    lessonSummaries,
    getRegulatoryContextCompact(job)
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
    job.objectives,
    getRegulatoryContextFull(job)
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
    model: ctx.model,
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

// ─── Phase 3: Coherence Pass (Gemini, cross-stage) ───────────────────────────

export async function runCoherencePass(ctx: RunnerContext): Promise<StepResult> {
  const { job, signal } = ctx;

  // Collect claim-level stage data (concept snippets + regulatoryRefs per lesson)
  // to enable the coherence model to detect cross-regulation contradictions, not
  // just title/objective drift.
  type CoherenceLessonEntry = {
    id: string;
    title: string;
    conceptSnippets: string[];   // first 2 concept bullets per lesson
    regulatoryRefs: string[];    // unique refs from quiz questions
  };
  type CoherenceStageSummary = {
    stageId: number;
    title: string;
    objective: string;
    lessons: CoherenceLessonEntry[];
  };

  const stageSummaries: CoherenceStageSummary[] = [];
  const blueprintOutput = job.steps['blueprint']?.parsedJson as BlueprintOutput | null;

  for (let i = 1; i <= job.stageCount; i++) {
    const stageOutput = job.steps[`stage_${i}`]?.parsedJson as StageLessonsOutput | null;
    const bpStage = blueprintOutput?.blueprint.find((s) => s.id === i);
    if (stageOutput?.stage) {
      const lessons: CoherenceLessonEntry[] = (stageOutput.stage.lessons ?? bpStage?.lessons ?? []).map((l) => {
        const lesson = l as { id: string; title: string; concept?: string[]; quiz?: Array<{ regulatoryRef?: string }> };
        const conceptSnippets = (lesson.concept ?? []).slice(0, 2);
        const regulatoryRefs = [...new Set(
          (lesson.quiz ?? [])
            .map((q) => q.regulatoryRef)
            .filter((r): r is string => typeof r === 'string' && r.length > 0)
        )];
        return { id: lesson.id, title: lesson.title, conceptSnippets, regulatoryRefs };
      });
      stageSummaries.push({
        stageId: i,
        title: stageOutput.stage.title,
        objective: stageOutput.stage.stageObjective ?? bpStage?.stageObjective ?? '',
        lessons,
      });
    }
  }

  if (stageSummaries.length === 0) {
    throw new Error('At least one stage must be completed before running coherence pass');
  }

  // Coherence pass always uses Gemini — cross-model check catches what Anthropic misses
  const geminiClient = createAIClient('gemini');
  const prompt = buildCoherencePassPrompt(job.domainPrompt, stageSummaries, job.groundTruth, getRegulatoryContextFull(job));

  const result = await callStructuredJson({
    client: geminiClient,
    system: prompt.system,
    user: prompt.user,
    maxTokens: MAX_TOKENS.coherencePass,
    signal,
    toolName: 'return_coherence_pass',
    schemaLabel: 'coherence pass output',
    schema: coherencePassOutputSchema,
  });

  return {
    stepKey: 'coherencePass',
    status: 'done',
    rawOutput: result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

// ─── Phase 4: Dual Fact-Check ─────────────────────────────────────────────────
// factCheckA (Anthropic) and factCheckG (Gemini) run in parallel.
// factCheckMerge combines both outputs: agreement → consensus, disagreement → disputed.

function buildFactCheckContext(job: GenerationJob): {
  curriculum: TrainingStage[];
  missions: TrainingMission[];
  sourceCatalog: SourceAttributionOutput['sourceCatalog'];
  citationMap: SourceAttributionOutput['citationMap'];
  placementQuestionCount: number;
} {
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
    | { placementAssessment?: { questions?: unknown[] } } | null;
  const placementQuestionCount = Array.isArray(placementRaw?.placementAssessment?.questions)
    ? placementRaw!.placementAssessment!.questions!.length : 0;
  return { curriculum, missions, sourceCatalog, citationMap, placementQuestionCount };
}

export async function runFactCheckA(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;
  const { curriculum, missions, sourceCatalog, citationMap, placementQuestionCount } = buildFactCheckContext(job);
  const artifactCount = curriculum.reduce((n, s) => n + s.lessons.length, 0) + missions.length + (placementQuestionCount > 0 ? 1 : 0);
  const minItems = job.fastMode ? 4 : 10;
  const maxItems = job.fastMode ? 8 : Math.min(20, Math.max(12, artifactCount * 2));

  const isRegulatory = !!job.regulatoryClassification;
  const schemaIds = isRegulatory
    ? job.regulatoryClassification!.applicableSchemas.map((s) => s.schema.id)
    : [];

  const prompt = buildFactCheckPrompt({
    domainPrompt: job.domainPrompt,
    objectives: job.objectives,
    sourceCatalog,
    citationMap,
    curriculum,
    missions,
    placementQuestionCount,
    regulatoryFactCheckConfig: getRegulatoryFactCheckConfig(job),
    minItems,
    maxItems,
    conciseRationales: !!job.fastMode,
  });
  const orgCtx = getOrgContextBlock(job);

  // RAG: inject relevant statute text so Anthropic can verify claims against real wording
  const statutoryBlock = isRegulatory
    ? await retrieveStatutoryContext(job.domainPrompt, schemaIds, 6)
    : '';

  const result = await callStructuredJson({
    client,
    system: prompt.system + orgCtx,
    user: statutoryBlock ? `${statutoryBlock}\n\n${prompt.user}` : prompt.user,
    maxTokens: MAX_TOKENS.factCheck,
    signal,
    toolName: 'return_fact_check',
    schemaLabel: 'fact-check output (Anthropic)',
    schema: factCheckOutputSchema
  });

  return {
    stepKey: 'factCheckA',
    status: 'done',
    rawOutput: result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

export async function runFactCheckG(ctx: RunnerContext): Promise<StepResult> {
  const { job, signal } = ctx;
  const { curriculum, missions, sourceCatalog, citationMap, placementQuestionCount } = buildFactCheckContext(job);
  const artifactCount = curriculum.reduce((n, s) => n + s.lessons.length, 0) + missions.length + (placementQuestionCount > 0 ? 1 : 0);
  const minItems = job.fastMode ? 4 : 10;
  const maxItems = job.fastMode ? 8 : Math.min(20, Math.max(12, artifactCount * 2));

  const geminiClient = createAIClient('gemini');
  const prompt = buildFactCheckPrompt({
    domainPrompt: job.domainPrompt,
    objectives: job.objectives,
    sourceCatalog,
    citationMap,
    curriculum,
    missions,
    placementQuestionCount,
    regulatoryFactCheckConfig: getRegulatoryFactCheckConfig(job),
    minItems,
    maxItems,
    conciseRationales: !!job.fastMode,
  });
  const orgCtx = getOrgContextBlock(job);

  const result = await callStructuredJson({
    client: geminiClient,
    system: prompt.system + orgCtx,
    user: prompt.user,
    maxTokens: MAX_TOKENS.factCheck,
    signal,
    toolName: 'return_fact_check',
    schemaLabel: 'fact-check output (Gemini)',
    schema: factCheckOutputSchema,
    searchGrounding: !!job.regulatoryClassification, // Gemini grounds in live regulation data
  });

  return {
    stepKey: 'factCheckG',
    status: 'done',
    rawOutput: result.rawOutput,
    parsedJson: result.parsed,
    validationErrors: [],
    tokensUsed: result.inputTokens + result.outputTokens,
    retryCount: 0
  };
}

export async function runFactCheckMerge(ctx: RunnerContext): Promise<StepResult> {
  const { job } = ctx;

  const fcA = (job.steps['factCheckA']?.parsedJson as FactCheckOutput | null)?.factCheck;
  const fcG = (job.steps['factCheckG']?.parsedJson as FactCheckOutput | null)?.factCheck;

  if (!fcA || !fcG) {
    throw new Error('Both factCheckA and factCheckG must complete before merging');
  }

  // Build a map of Gemini verdicts keyed by claim text (fuzzy match by claim)
  // Primary key: item id; fallback: first 80 chars of claim
  const geminiById = new Map<string, FactCheckItem>();
  const geminiByClaim = new Map<string, FactCheckItem>();
  for (const item of fcG.items) {
    geminiById.set(item.id, item as FactCheckItem);
    geminiByClaim.set(item.claim.slice(0, 80), item as FactCheckItem);
  }

  const mergedItems: FactCheckItem[] = fcA.items.map((aItem) => {
    const gItem = geminiById.get(aItem.id) ?? geminiByClaim.get(aItem.claim.slice(0, 80));
    const av = aItem.verdict as 'supported' | 'unsupported' | 'ambiguous';

    if (!gItem) {
      // Only Anthropic checked this claim — single-source
      return {
        ...aItem,
        anthropicVerdict: av,
        agreementLevel: 'single-source' as const,
      } as FactCheckItem;
    }

    const gv = gItem.verdict as 'supported' | 'unsupported' | 'ambiguous';
    const agree = av === gv;

    // Verdict resolution:
    // consensus (agree): use anthropic verdict
    // disputed: verdict = 'disputed' (surfaces as mandatory_review in Reviewer Portal)
    // Special case: if one says supported and other says ambiguous for low severity → trust supported
    const isLowStakesDisagreement = !agree && aItem.severity === 'low' &&
      ((av === 'supported' && gv === 'ambiguous') || (av === 'ambiguous' && gv === 'supported'));

    const finalVerdict: FactCheckItem['verdict'] = agree
      ? av
      : isLowStakesDisagreement ? 'ambiguous' : 'disputed';

    return {
      ...aItem,
      verdict: finalVerdict,
      // Use more conservative rationale when disputed
      rationale: agree
        ? aItem.rationale
        : `[DISPUTED] Anthropic: ${aItem.rationale} | Gemini: ${gItem.rationale}`,
      anthropicVerdict: av,
      geminiVerdict: gv,
      agreementLevel: agree ? 'consensus' : 'disputed',
    } as FactCheckItem;
  });

  // Count summary
  let supported = 0, unsupported = 0, ambiguous = 0, disputed = 0;
  for (const item of mergedItems) {
    if (item.verdict === 'supported') supported++;
    else if (item.verdict === 'unsupported') unsupported++;
    else if (item.verdict === 'ambiguous') ambiguous++;
    else if (item.verdict === 'disputed') disputed++;
  }

  const merged: FactCheckOutput = {
    factCheck: {
      items: mergedItems,
      summary: { supported, unsupported, ambiguous, disputed },
    }
  };

  return {
    stepKey: 'factCheckMerge',
    status: 'done',
    rawOutput: JSON.stringify(merged, null, 2),
    parsedJson: merged,
    validationErrors: [],
    tokensUsed: 0,  // merge is pure computation, no API calls
    retryCount: 0
  };
}

// ─── (Legacy) Fact-check — kept for runStep compatibility during migration ────
// Routes to runFactCheckA. Remove once dual-check is fully operational.

export async function runFactCheck(ctx: RunnerContext): Promise<StepResult> {
  return runFactCheckA(ctx);
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
    })),
    regulatoryContextBlock: getRegulatoryContextCompact(job)
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
    simulatorConcept,
    regulatoryContextBlock: getRegulatoryContextCompact(job)
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
    missionIds: missions.map((m) => m.id),
    regulatoryContextBlock: getRegulatoryContextCompact(job)
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
    model: ctx.model,
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

// ─── Repair artifacts ─────────────────────────────────────────────────────────
// Post-pipeline self-healing step. Runs after factCheck + missions and:
//  1. Resolves ambiguous high/regulatory fact-check items to supported/unsupported
//  2. Attributes source IDs to items that have none
//  3. Patches mission whyItMatters to cover objectives with zero mission hits
// All repairs mutate job.steps in-place so assembleModule picks up the fixes.
// Individual repair failures are silently swallowed (non-fatal by design).

export async function runRepairArtifacts(ctx: RunnerContext): Promise<StepResult> {
  const { client, job, signal } = ctx;

  type FactCheckItemLike = {
    id: string; claim: string; verdict: string; severity: string;
    rationale: string; sourceIds: string[]; relatedItemId: string; relatedItemType: string;
  };
  type MissionLike = {
    id: string; title: string; description?: string; whyItMatters?: string;
    branches?: Array<{ choice?: string; feedback?: string }>;
  };

  const factCheckKey = (job.steps['factCheckMerge'] != null) ? 'factCheckMerge' : 'factCheck';
  const factCheckStep = job.steps[factCheckKey];
  const factCheckData = factCheckStep?.parsedJson as { factCheck?: { items?: FactCheckItemLike[]; summary?: unknown } } | null;
  const sourceCatalog = (job.steps['sourceAttribution']?.parsedJson as { sourceCatalog?: Array<{ id: string; title: string; url: string }> } | null)?.sourceCatalog ?? [];
  const missionsStep = job.steps['missions'];
  const missionsData = missionsStep?.parsedJson as { missions?: MissionLike[] } | null;

  let totalTokensUsed = 0;
  let repairsApplied = 0;

  // ── 1. Resolve ambiguous high/regulatory fact-check items (parallel) ──────
  if (factCheckData?.factCheck?.items) {
    const items: FactCheckItemLike[] = JSON.parse(JSON.stringify(factCheckData.factCheck.items));
    const sourceList = sourceCatalog.map((s) => `[${s.id}] ${s.title} — ${s.url}`).join('\n');

    // Run up to 4 Haiku calls concurrently — bounded to avoid rate-limit spikes
    const CONCURRENCY = 4;
    const ambiguous = items.filter(
      (item) => item.verdict === 'ambiguous' && (item.severity === 'high' || item.severity === 'regulatory')
    );
    for (let i = 0; i < ambiguous.length; i += CONCURRENCY) {
      const batch = ambiguous.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map(async (item) => {
        try {
          const relevantSrcIds = Array.isArray(item.sourceIds) && item.sourceIds.length > 0
            ? item.sourceIds
            : sourceCatalog.slice(0, 5).map((s) => s.id);
          const relevantSources = sourceCatalog.filter((s) => relevantSrcIds.includes(s.id));
          const srcText = relevantSources.length > 0
            ? relevantSources.map((s) => `[${s.id}] ${s.title} — ${s.url}`).join('\n')
            : sourceList.slice(0, 1000);

          const repair = await callStructuredJson({
            client,
            model: 'claude-haiku-4-5-20251001',
            system: 'You are a UK health and safety regulatory fact-checker. A claim has been marked as ambiguous. Resolve it to a definitive verdict of "supported" or "unsupported". Never return "ambiguous". Use "unsupported" if genuinely uncertain. Respond with the repair_claim tool.',
            user: `Module domain: ${job.domainPrompt}\n\nClaim (ID: ${item.id}): "${item.claim}"\nCurrent rationale: "${item.rationale}"\nSeverity: ${item.severity}\n\nRelevant sources:\n${srcText}\n\nProvide verdict (supported/unsupported), updated rationale, and optionally updated sourceIds.`,
            maxTokens: MAX_TOKENS.repairArtifacts,
            signal,
            toolName: 'repair_claim',
            schemaLabel: 'fact-check item repair',
            schema: repairClaimSchema
          });

          const idx = items.findIndex((i) => i.id === item.id);
          if (idx >= 0) {
            items[idx] = {
              ...items[idx],
              verdict: repair.parsed.verdict,
              rationale: repair.parsed.rationale,
              sourceIds: repair.parsed.sourceIds?.length ? repair.parsed.sourceIds : items[idx].sourceIds
            };
            totalTokensUsed += repair.inputTokens + repair.outputTokens;
            repairsApplied++;
          }
        } catch {
          // Non-fatal — keep the original item; validator will still catch it but we tried
        }
      }));
    }

    // ── 2. Attribute source IDs to items with empty sourceIds (parallel) ────
    const unattributed = items.filter((item) => !Array.isArray(item.sourceIds) || item.sourceIds.length === 0);
    for (let i = 0; i < unattributed.length; i += CONCURRENCY) {
      const batch = unattributed.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map(async (item) => {
        try {
          const attr = await callStructuredJson({
            client,
            model: 'claude-haiku-4-5-20251001',
            system: 'You are attributing a UK H&S training claim to its source documents. Identify which source IDs from the provided catalog most directly support the claim. Use the attribute_claim tool.',
            user: `Claim (ID: ${item.id}): "${item.claim}"\n\nAvailable sources:\n${sourceList}\n\nReturn 1-3 source IDs from the catalog that best support this claim.`,
            maxTokens: MAX_TOKENS.repairArtifacts,
            signal,
            toolName: 'attribute_claim',
            schemaLabel: 'source attribution repair',
            schema: attributeClaimSchema
          });

          const idx = items.findIndex((i) => i.id === item.id);
          if (idx >= 0 && attr.parsed.sourceIds.length > 0) {
            items[idx] = { ...items[idx], sourceIds: attr.parsed.sourceIds };
            totalTokensUsed += attr.inputTokens + attr.outputTokens;
            repairsApplied++;
          }
        } catch {
          // Non-fatal
        }
      }));
    }

    // Always write back — even if no repairs landed, the frontend needs a
    // consistent snapshot so the SSE re-broadcast reflects the current state.
    (job.steps[factCheckKey] as StepResult).parsedJson = {
      factCheck: { ...factCheckData.factCheck, items }
    };
  }

  // ── 3. Detect objectives not covered by any mission (explicit gaps) ────────
  // Previously this silently appended text to whyItMatters; that masked the gap
  // rather than surfacing it. Now we record explicit coverage gap entries in the
  // repairArtifacts output so the frontend can show them as warnings.
  const coverageGaps: Array<{ objective: string; closestMissionId: string }> = [];

  if (missionsData?.missions && Array.isArray(job.objectives) && job.objectives.length > 0) {
    const missions: MissionLike[] = JSON.parse(JSON.stringify(missionsData.missions));

    const buildCorpus = (ms: MissionLike[]) =>
      ms.map((m) =>
        `${m.title} ${m.description ?? ''} ${m.whyItMatters ?? ''} ${
          (m.branches ?? []).map((b) => `${b.choice ?? ''} ${b.feedback ?? ''}`).join(' ')
        }`
      ).join(' ').toLowerCase();

    for (const objective of job.objectives) {
      const terms = objective.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 4);
      if (terms.length < 2) continue;

      const corpus = buildCorpus(missions);
      const hits = terms.filter((t) => corpus.includes(t)).length;
      if (hits >= 2) continue;

      // Record gap with the closest mission for the reviewer to act on
      let bestIdx = 0;
      let bestHits = -1;
      missions.forEach((m, i) => {
        const txt = `${m.title} ${m.description ?? ''}`.toLowerCase();
        const h = terms.filter((t) => txt.includes(t)).length;
        if (h > bestHits) { bestHits = h; bestIdx = i; }
      });

      coverageGaps.push({
        objective,
        closestMissionId: missions[bestIdx].id,
      });
      repairsApplied++;
    }
  }

  return {
    stepKey: 'repairArtifacts',
    status: 'done',
    rawOutput: JSON.stringify({ repairsApplied, coverageGaps }),
    parsedJson: { repairsApplied, coverageGaps },
    validationErrors: [],
    tokensUsed: totalTokensUsed,
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
  objectives: string[]
): Promise<PreflightResult> {
  const client = createAIClient();
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
  signal: AbortSignal,
  model?: string
): Promise<StepResult> {
  const ctx: RunnerContext = { client, job, onChunk, signal, model };

  // Phase 0
  if (stepKey === 'domainSurvey') return runDomainSurvey(ctx);
  // Phase 1
  if (stepKey === 'blueprint') return runBlueprint(ctx);
  // Phase 2 (stage/test dispatched at bottom)
  if (stepKey === 'missions') return runMissions(ctx);
  if (stepKey === 'placementAssessment') return runPlacementAssessment(ctx);
  if (stepKey === 'lessonMissionMap') return runLessonMissionMap(ctx);
  if (stepKey === 'sourceAttribution') return runSourceAttribution(ctx);
  // Phase 3
  if (stepKey === 'coherencePass') return runCoherencePass(ctx);
  // Phase 4
  if (stepKey === 'factCheckA') return runFactCheckA(ctx);
  if (stepKey === 'factCheckG') return runFactCheckG(ctx);
  if (stepKey === 'factCheckMerge') return runFactCheckMerge(ctx);
  if (stepKey === 'factCheck') return runFactCheck(ctx); // legacy compat
  // Phase 5
  if (stepKey === 'simulatorDesign') return runSimulatorDesign(ctx);
  if (stepKey === 'faultAndReference') return runFaultAndReference(ctx);
  if (stepKey === 'builderAndCapstone') return runBuilderAndCapstone(ctx);
  if (stepKey === 'themeShell') return runThemeShell(ctx);
  if (stepKey === 'repairArtifacts') return runRepairArtifacts(ctx);

  const stageIdx = stageIndexFromKey(stepKey);
  if (stepKey.startsWith('stage_') && stageIdx > 0) return runStageLesson(ctx, stageIdx);
  if (stepKey.startsWith('test_') && stageIdx > 0) return runStageTest(ctx, stageIdx);

  throw new Error(`Unknown step key: ${stepKey}`);
}

// ─── Retry wrapper for parallel execution ─────────────────────────────────────
// Wraps runStep with timeout + transient-error retry logic.
// Used by StudioPage to run stage/test batches in parallel without going
// through the single-stream useStreamedStep hook.

const DEFAULT_STEP_TIMEOUT_MS = Number(process.env.PIPELINE_STEP_TIMEOUT_MS ?? 4 * 60 * 1000);
const STAGE_STEP_TIMEOUT_MS = Number(process.env.PIPELINE_STAGE_STEP_TIMEOUT_MS ?? 10 * 60 * 1000);
const HEAVY_STEP_TIMEOUT_MS = Number(process.env.PIPELINE_HEAVY_STEP_TIMEOUT_MS ?? 6 * 60 * 1000);

function timeoutMsForStep(stepKey: string): number {
  if (/^stage_\d+$/.test(stepKey)) return STAGE_STEP_TIMEOUT_MS;
  if (stepKey === 'missions' || stepKey === 'coherencePass') return HEAVY_STEP_TIMEOUT_MS;
  return DEFAULT_STEP_TIMEOUT_MS;
}

function isTransientStepError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('connection error') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('could not parse json from gemini output') ||
    msg.includes('structured output validation failed') ||
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
  onChunk?: (chunk: string) => void,
  model?: string
): Promise<StepResult> {
  let lastErr: unknown;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutMs = timeoutMsForStep(stepKey);
    const timeoutController = new AbortController();
    const onParentAbort = () => timeoutController.abort();
    signal.addEventListener('abort', onParentAbort);
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    try {
      const result = await runStep(
        stepKey, client, job, onChunk ?? (() => {}), timeoutController.signal, model
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
      if (timedOut && attempt >= maxAttempts) {
        throw new Error(`Step "${stepKey}" timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      const shouldRetry = (timedOut || isTransientStepError(err)) && attempt < maxAttempts;
      if (!shouldRetry) break;
      await new Promise<void>((resolve) => setTimeout(resolve, attempt === 1 ? 1200 : 2500));
    }
  }
  throw lastErr;
}
