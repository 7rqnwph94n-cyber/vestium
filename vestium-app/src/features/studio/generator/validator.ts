import type { TrainingStage, TrainingMission, TrainingQuestion, PracticeActivity } from '../../../lib/training-core/types';
import type { AIClient } from '../api/aiClient';
import { aiValidationReviewSchema, moduleReviewReportSchema } from './schemas';
import type { ModuleReviewReport, ValidationError } from './types';

// ─── Public entry point ───────────────────────────────────────────────────────

export function validateCurriculum(
  curriculum: TrainingStage[],
  missions: TrainingMission[],
  expectedStageCount: number,
  expectedLessonsPerStage: number,
  expectedMissionCount: number,
  extras?: {
    placementAssessment?: {
      questions: TrainingQuestion[];
      recommendationThresholds?: Array<{ minScore: number; stage: number }>;
    } | null;
    lessonMissionMap?: Record<string, { lessonId: string; missionIds: string[]; rationale: string }>;
    sourceCatalog?: Array<{
      id: string;
      title: string;
      url: string;
      notes?: string;
      publisher?: string;
      reliability?: 'authoritative' | 'reputable' | 'secondary';
      year?: number;
      lastVerified?: string;
    }>;
    citationMap?: {
      lessonCitations: Record<string, string[]>;
      missionCitations: Record<string, string[]>;
    };
    factCheck?: {
      items: Array<{
        id: string;
        claim: string;
        relatedItemId: string;
        relatedItemType: 'lesson' | 'mission' | 'placement' | 'general';
        sourceIds: string[];
        verdict: 'supported' | 'unsupported' | 'ambiguous' | 'disputed';
        severity: 'low' | 'medium' | 'high' | 'regulatory';
        rationale: string;
      }>;
      summary?: { supported: number; unsupported: number; ambiguous: number; disputed?: number };
    } | null;
    advancedArtifacts?: {
      faultScenarioCampaign?: { scenarios?: unknown[] };
      fieldReferenceCards?: unknown[];
      builderExercises?: unknown[];
    } | null;
    sourceReferenceCount?: number;
    objectives?: string[];
  }
): ValidationError[] {
  const errors: ValidationError[] = [];

  validateStages(curriculum, expectedStageCount, expectedLessonsPerStage, errors);
  validateMissions(missions, expectedMissionCount, curriculum.length, errors);
  validatePlacementAssessment(extras?.placementAssessment ?? null, curriculum.length, errors);
  validateLessonMissionMap(extras?.lessonMissionMap ?? {}, curriculum, missions, errors);
  validateSourceAttribution(
    extras?.sourceCatalog ?? [],
    extras?.citationMap ?? { lessonCitations: {}, missionCitations: {} },
    curriculum,
    missions,
    extras?.sourceReferenceCount ?? 0,
    errors
  );
  validateFactCheck(extras?.factCheck ?? null, extras?.sourceCatalog ?? [], errors);
  validateAdvancedArtifacts(extras?.advancedArtifacts ?? null, errors);
  validateObjectiveCoverage(
    extras?.objectives ?? [],
    curriculum,
    missions,
    extras?.placementAssessment ?? null,
    errors
  );
  validateSyntheticLearnerProfiles(
    extras?.placementAssessment ?? null,
    curriculum.length,
    missions,
    errors
  );

  return errors;
}

interface AICurriculumValidationInput {
  client: AIClient;
  moduleId: string;
  domainPrompt: string;
  objectives: string[];
  curriculum: TrainingStage[];
  missions: TrainingMission[];
  placementAssessment: {
    questions: TrainingQuestion[];
    recommendationThresholds?: Array<{ minScore: number; stage: number }>;
  } | null;
  lessonMissionMap: Record<string, { lessonId: string; missionIds: string[]; rationale: string }>;
  sourceCatalog: Array<{
    id: string;
    title: string;
    url: string;
    notes?: string;
    publisher?: string;
    reliability?: 'authoritative' | 'reputable' | 'secondary';
    year?: number;
    lastVerified?: string;
  }>;
  factCheck: {
    items: Array<{
      id: string;
      claim: string;
      relatedItemId: string;
      relatedItemType: 'lesson' | 'mission' | 'placement' | 'general';
      sourceIds: string[];
      verdict: 'supported' | 'unsupported' | 'ambiguous' | 'disputed';
      severity: 'low' | 'medium' | 'high' | 'regulatory';
      rationale: string;
    }>;
    summary?: { supported: number; unsupported: number; ambiguous: number; disputed?: number };
  } | null;
  advancedArtifacts?: unknown;
}

function trimText(value: string, max = 500): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function buildAIValidationPayload(input: AICurriculumValidationInput): unknown {
  return {
    moduleId: input.moduleId,
    domainPrompt: input.domainPrompt,
    objectives: input.objectives,
    stageCount: input.curriculum.length,
    missionCount: input.missions.length,
    stages: input.curriculum.map((stage) => ({
      id: stage.id,
      title: stage.title,
      description: trimText(stage.description, 320),
      stageObjective: trimText(stage.stageObjective ?? '', 320),
      lessons: stage.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        objective: trimText(lesson.objective, 260),
        situationHook: trimText(lesson.situationHook ?? '', 240),
        concept: lesson.concept.map((line) => trimText(line, 320)),
        workedExample: trimText(lesson.workedExample, 360),
        quiz: lesson.quiz.map((q) => ({
          id: q.id,
          prompt: trimText(q.prompt, 220),
          intent: q.intent ?? null,
          type: q.type,
          answer: q.answer,
          explanation: trimText(q.explanation, 260)
        }))
      })),
      test: stage.test.map((q) => ({
        id: q.id,
        prompt: trimText(q.prompt, 220),
        intent: q.intent ?? null,
        type: q.type,
        answer: q.answer,
        explanation: trimText(q.explanation, 260)
      }))
    })),
    missions: input.missions.map((mission) => ({
      id: mission.id,
      title: mission.title,
      description: trimText(mission.description, 320),
      whyItMatters: trimText(mission.whyItMatters ?? '', 220),
      stageMin: mission.stageMin ?? 1,
      stageMax: mission.stageMax ?? input.curriculum.length,
      branches: (mission.branches ?? []).map((branch) => ({
        choice: trimText(branch.choice, 220),
        outcome: trimText(branch.outcome, 260),
        score: branch.score,
        feedback: trimText(branch.feedback, 260)
      }))
    })),
    placementAssessment: input.placementAssessment
      ? {
          questions: input.placementAssessment.questions.map((q) => ({
            id: q.id,
            prompt: trimText(q.prompt, 220),
            intent: q.intent ?? null,
            type: q.type,
            answer: q.answer,
            explanation: trimText(q.explanation, 260)
          })),
          recommendationThresholds: input.placementAssessment.recommendationThresholds ?? []
        }
      : null,
    lessonMissionMap: input.lessonMissionMap,
    sourceCatalog: input.sourceCatalog,
    factCheck: input.factCheck,
    advancedArtifacts: input.advancedArtifacts ?? null
  };
}

export async function validateCurriculumWithAI(input: AICurriculumValidationInput): Promise<ValidationError[]> {
  const payload = buildAIValidationPayload(input);
  const system = `You are a strict curriculum QA auditor for professional training modules.
Audit for: factual accuracy, pedagogical soundness, and objective alignment.

Return findings only when there is a concrete issue.
Do not restate valid content.
Avoid speculative claims.
Use precise rule names and exact JSON paths.

Severity rules:
- "error": likely factual inaccuracy, unsafe instruction, or major objective gap.
- "warning": weaker pedagogy, unclear wording, or minor alignment issue.

Response must be structured for the provided schema.`;

  const user = `Review this assembled module snapshot and identify quality issues.
Focus on:
1) Factual correctness and currency of claims.
2) Pedagogical quality (active recall, transfer, feedback quality, realistic scenarios).
3) Objective coverage and assessment alignment.

If no issues are found, return an empty findings array.

MODULE SNAPSHOT:
${JSON.stringify(payload, null, 2)}`;

  const result = await input.client.callStructuredJson({
    system,
    user,
    maxTokens: 3500,
    schema: aiValidationReviewSchema,
    toolName: 'submit_ai_validation_review',
    schemaLabel: 'AIValidationReview'
  });

  return result.parsed.findings.map((finding) => ({
    severity: finding.severity,
    path: finding.path,
    rule: finding.rule,
    message: finding.message
  }));
}

export async function generateFullModuleReviewWithAI(
  input: AICurriculumValidationInput
): Promise<ModuleReviewReport> {
  const payload = buildAIValidationPayload(input);
  const system = `You are a strict senior curriculum reviewer for interactive skills training modules.
Your job is to produce a candid publish-readiness review for serious educators and product owners.

Scoring guidance:
- scaffoldingScore: structure/template quality as generated scaffolding.
- publishReadyScore: quality if shipped now to learners.
- overallScore: weighted blend with publish readiness emphasized.

Output must follow schema exactly. Keep findings concrete, evidence-based, and path-specific.`;

  const user = `Review this module and produce a full quality report.
Focus on:
1) Competence coherence (lessons, tests, missions, placement alignment).
2) Pedagogical quality (transfer/application focus, cognitive load, feedback quality).
3) Factual reliability and source grounding.
4) Practical deployment readiness.

Use the same harshness as an expert red-team review.
Provide 3-8 strengths and 3-12 critical findings.

MODULE SNAPSHOT:
${JSON.stringify(payload, null, 2)}`;

  const result = await input.client.callStructuredJson({
    system,
    user,
    maxTokens: 5000,
    schema: moduleReviewReportSchema,
    toolName: 'submit_full_module_review',
    schemaLabel: 'ModuleReviewReport'
  });

  return result.parsed;
}

function validateSyntheticLearnerProfiles(
  placementAssessment:
    | {
        questions: TrainingQuestion[];
        recommendationThresholds?: Array<{ minScore: number; stage: number }>;
      }
    | null,
  stageCount: number,
  missions: TrainingMission[],
  errors: ValidationError[]
): void {
  if (!placementAssessment?.recommendationThresholds || placementAssessment.recommendationThresholds.length === 0) {
    return;
  }

  const thresholds = [...placementAssessment.recommendationThresholds].sort((a, b) => b.minScore - a.minScore);
  const recommendStage = (score: number): number => {
    const hit = thresholds.find((t) => score >= t.minScore);
    return hit?.stage ?? 1;
  };

  const profiles = [
    { id: 'novice', score: 25, minExpectedStage: 1, maxExpectedStage: Math.min(2, stageCount) },
    { id: 'developing', score: 55, minExpectedStage: Math.min(2, stageCount), maxExpectedStage: Math.min(4, stageCount) },
    { id: 'advanced', score: 85, minExpectedStage: Math.max(1, stageCount - 1), maxExpectedStage: stageCount }
  ];

  profiles.forEach((profile) => {
    const stage = recommendStage(profile.score);
    if (stage < profile.minExpectedStage || stage > profile.maxExpectedStage) {
      const severity: ValidationError['severity'] = profile.id === 'novice' ? 'error' : 'warning';
      errors.push({
        severity,
        path: 'placementAssessment.recommendationThresholds',
        rule: 'SYNTHETIC_PLACEMENT_PROFILE_MISMATCH',
        message: `Synthetic profile "${profile.id}" (score ${profile.score}) mapped to stage ${stage}; expected ${profile.minExpectedStage}-${profile.maxExpectedStage}`
      });
    }

    const accessibleMissions = missions.filter((mission) => {
      const min = typeof mission.stageMin === 'number' ? mission.stageMin : 1;
      const max = typeof mission.stageMax === 'number' ? mission.stageMax : stageCount;
      return stage >= min && stage <= max;
    });

    if (accessibleMissions.length === 0) {
      errors.push({
        severity: 'warning',
        path: 'missions',
        rule: 'SYNTHETIC_PROFILE_NO_ACCESSIBLE_MISSIONS',
        message: `Synthetic profile "${profile.id}" (recommended stage ${stage}) has no accessible missions`
      });
    }
  });

  const noviceStage = recommendStage(25);
  const advancedStage = recommendStage(85);
  if (stageCount > 1 && noviceStage >= advancedStage) {
    errors.push({
      severity: 'error',
      path: 'placementAssessment.recommendationThresholds',
      rule: 'SYNTHETIC_PROFILE_ORDER_INVALID',
      message: `Synthetic placement ordering invalid: novice stage ${noviceStage} is not below advanced stage ${advancedStage}`
    });
  }
}

function validateObjectiveCoverage(
  objectives: string[],
  curriculum: TrainingStage[],
  missions: TrainingMission[],
  placementAssessment: { questions: TrainingQuestion[] } | null,
  errors: ValidationError[]
): void {
  if (!Array.isArray(objectives) || objectives.length === 0) {
    return;
  }

  const lessonCorpus = curriculum
    .flatMap((stage) =>
      stage.lessons.map((lesson) => `${lesson.title} ${lesson.objective} ${lesson.workedExample} ${lesson.concept.join(' ')}`)
    )
    .join(' ')
    .toLowerCase();
  const stageTestCorpus = curriculum
    .flatMap((stage) => stage.test.map((question) => `${question.prompt} ${question.explanation}`))
    .join(' ')
    .toLowerCase();
  const missionCorpus = missions
    .map((mission) => `${mission.title} ${mission.description} ${mission.whyItMatters ?? ''} ${(mission.branches ?? []).map((b) => `${b.choice} ${b.feedback}`).join(' ')}`)
    .join(' ')
    .toLowerCase();
  const placementCorpus = (placementAssessment?.questions ?? [])
    .map((question) => `${question.prompt} ${question.explanation}`)
    .join(' ')
    .toLowerCase();

  for (let i = 0; i < objectives.length; i++) {
    const objective = objectives[i];
    const terms = objective
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4);
    if (terms.length < 2) {
      errors.push({
        severity: 'warning',
        path: `objectives[${i}]`,
        rule: 'OBJECTIVE_TEXT_TOO_VAGUE',
        message: `Objective "${objective}" is too vague for robust evidence mapping; use more specific language`
      });
      continue;
    }

    const lessonHits = terms.filter((term) => lessonCorpus.includes(term)).length;
    const stageTestHits = terms.filter((term) => stageTestCorpus.includes(term)).length;
    const missionHits = terms.filter((term) => missionCorpus.includes(term)).length;
    const placementHits = terms.filter((term) => placementCorpus.includes(term)).length;

    if (lessonHits === 0) {
      errors.push({
        severity: 'error',
        path: `objectives[${i}]`,
        rule: 'OBJECTIVE_EVIDENCE_LESSON_MISSING',
        message: `Objective "${objective}" is missing explicit lesson evidence`
      });
    }
    if (stageTestHits === 0) {
      errors.push({
        severity: 'error',
        path: `objectives[${i}]`,
        rule: 'OBJECTIVE_EVIDENCE_STAGE_TEST_MISSING',
        message: `Objective "${objective}" is missing stage-test evidence`
      });
    }
    if (missionHits === 0) {
      errors.push({
        severity: 'error',
        path: `objectives[${i}]`,
        rule: 'OBJECTIVE_EVIDENCE_MISSION_MISSING',
        message: `Objective "${objective}" is missing mission evidence`
      });
    }
    if ((placementAssessment?.questions ?? []).length > 0 && placementHits === 0) {
      errors.push({
        severity: 'warning',
        path: `objectives[${i}]`,
        rule: 'OBJECTIVE_EVIDENCE_PLACEMENT_WEAK',
        message: `Objective "${objective}" has weak/no placement-screening coverage`
      });
    }
  }
}

// ─── Stage-level validation ───────────────────────────────────────────────────

function validateStages(
  stages: TrainingStage[],
  expectedCount: number,
  expectedLessonsPerStage: number,
  errors: ValidationError[]
): void {
  if (stages.length !== expectedCount) {
    errors.push({
      severity: 'warning',
      path: 'stages',
      rule: 'STAGE_COUNT_MISMATCH',
      message: `Generated ${stages.length} stage(s); expected ${expectedCount}`
    });
  }

  // Rule 9: Stage IDs must be sequential from 1
  const stageIds = stages.map((s) => s.id);
  const expectedIds = Array.from({ length: stages.length }, (_, i) => i + 1);
  if (JSON.stringify(stageIds) !== JSON.stringify(expectedIds)) {
    errors.push({
      severity: 'error',
      path: 'stages',
      rule: 'STAGE_ID_SEQUENTIAL',
      message: `Stage IDs must be [1, 2, 3, ...]. Got: [${stageIds.join(', ')}]`
    });
  }

  // Collect all lesson IDs across stages for duplicate check
  const allLessonIds: string[] = [];

  for (const stage of stages) {
    const stagePath = `stages[${stage.id}]`;

    // Rule 1: Required stage fields
    requireString(stage.title, `${stagePath}.title`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(stage.description, `${stagePath}.description`, 'REQUIRED_FIELD_MISSING', errors);

    // Rule 18: Lesson count
    if (stage.lessons.length < expectedLessonsPerStage) {
      errors.push({
        severity: 'warning',
        path: `${stagePath}.lessons`,
        rule: 'LESSON_COUNT_MISMATCH',
        message: `Stage ${stage.id} has ${stage.lessons.length} lesson(s); expected ${expectedLessonsPerStage}`
      });
    }

    validateLessons(stage, expectedLessonsPerStage, allLessonIds, errors);
    validateStageTest(stage, errors);
  }

  // Rule 10: Duplicate lesson IDs across whole module
  const seen = new Set<string>();
  for (const id of allLessonIds) {
    if (seen.has(id)) {
      errors.push({
        severity: 'error',
        path: 'stages',
        rule: 'DUPLICATE_LESSON_ID',
        message: `Duplicate lesson ID "${id}" found across stages`
      });
    }
    seen.add(id);
  }
}

// ─── Lesson-level validation ──────────────────────────────────────────────────

function validateLessons(
  stage: TrainingStage,
  expectedLessonsPerStage: number,
  allLessonIds: string[],
  errors: ValidationError[]
): void {
  if (stage.lessons.length > expectedLessonsPerStage + 1) {
    errors.push({
      severity: 'warning',
      path: `stages[${stage.id}].lessons`,
      rule: 'LESSON_COUNT_HIGH',
      message: `Stage ${stage.id} has ${stage.lessons.length} lesson(s); expected about ${expectedLessonsPerStage}`
    });
  }

  for (let li = 0; li < stage.lessons.length; li++) {
    const lesson = stage.lessons[li];
    const path = `stages[${stage.id}].lessons[${li}]`;

    // Rule 1: Required fields
    requireString(lesson.id, `${path}.id`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(lesson.title, `${path}.title`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(lesson.objective, `${path}.objective`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(lesson.workedExample, `${path}.workedExample`, 'REQUIRED_FIELD_MISSING', errors);

    // Rule 6: Lesson ID format
    if (lesson.id && !isValidLessonId(lesson.id)) {
      errors.push({
        severity: 'error',
        path: `${path}.id`,
        rule: 'LESSON_ID_FORMAT',
        message: `Lesson ID "${lesson.id}" must match "s{N}-l{N}" or "<prefix>-s{N}-l{N}" (e.g. "s1-l1" or "sales-s1-l1")`
      });
    } else if (lesson.id) {
      allLessonIds.push(lesson.id);
    }

    // Rule 1: concept non-empty
    if (!Array.isArray(lesson.concept) || lesson.concept.length === 0) {
      errors.push({
        severity: 'error',
        path: `${path}.concept`,
        rule: 'REQUIRED_FIELD_MISSING',
        message: `Lesson ${lesson.id}: concept must be a non-empty array of strings`
      });
    } else {
      if (lesson.concept.length !== 4) {
        errors.push({
          severity: 'error',
          path: `${path}.concept`,
          rule: 'LESSON_CONCEPT_COUNT_INVALID',
          message: `Lesson ${lesson.id}: concept must contain exactly 4 paragraphs; found ${lesson.concept.length}`
        });
      }
      // Rule 13: thin concept
      if (lesson.concept.length < 3) {
        errors.push({
          severity: 'warning',
          path: `${path}.concept`,
          rule: 'LESSON_CONCEPT_THIN',
          message: `Lesson ${lesson.id}: concept has only ${lesson.concept.length} paragraph(s); 3+ recommended`
        });
      }
      // Rule 14: short paragraphs
      lesson.concept.forEach((para, pi) => {
        if (typeof para === 'string' && para.length < 50) {
          errors.push({
            severity: 'warning',
            path: `${path}.concept[${pi}]`,
            rule: 'SHORT_CONCEPT_PARAGRAPH',
            message: `Lesson ${lesson.id}: concept paragraph ${pi + 1} is very short (${para.length} chars)`
          });
        }
      });
    }

    // Rule 19: thin workedExample
    if (lesson.workedExample && lesson.workedExample.length < 80) {
      errors.push({
        severity: 'warning',
        path: `${path}.workedExample`,
        rule: 'WORDED_EXAMPLE_THIN',
        message: `Lesson ${lesson.id}: workedExample is very short (${lesson.workedExample.length} chars)`
      });
    }

    // Diagrams
    if (!Array.isArray(lesson.diagrams) || lesson.diagrams.length === 0) {
      errors.push({
        severity: 'error',
        path: `${path}.diagrams`,
        rule: 'REQUIRED_FIELD_MISSING',
        message: `Lesson ${lesson.id}: diagrams array is empty — every lesson needs at least 1 diagram`
      });
    } else {
      if (lesson.diagrams.length < 2) {
        errors.push({
          severity: 'error',
          path: `${path}.diagrams`,
          rule: 'LESSON_DIAGRAM_COUNT_LOW',
          message: `Lesson ${lesson.id}: at least 2 diagrams are required; found ${lesson.diagrams.length}`
        });
      }
      lesson.diagrams.forEach((diagram, di) => {
        const dPath = `${path}.diagrams[${di}]`;
        if (diagram.kind === 'image') {
          requireString(diagram.imageUrl, `${dPath}.imageUrl`, 'IMAGE_URL_REQUIRED', errors);
          if (diagram.imageUrl && !/^https?:\/\//.test(diagram.imageUrl)) {
            errors.push({
              severity: 'error',
              path: `${dPath}.imageUrl`,
              rule: 'IMAGE_URL_FORMAT',
              message: `Lesson ${lesson.id}: image diagram "${diagram.id}" imageUrl must be http(s)`
            });
          }
          requireString(diagram.alt, `${dPath}.alt`, 'IMAGE_ALT_REQUIRED', errors);
          requireString(diagram.caption, `${dPath}.caption`, 'IMAGE_CAPTION_REQUIRED', errors);

          if (!diagram.attribution) {
            errors.push({
              severity: 'error',
              path: `${dPath}.attribution`,
              rule: 'IMAGE_ATTRIBUTION_REQUIRED',
              message: `Lesson ${lesson.id}: image diagram "${diagram.id}" must include attribution metadata`
            });
          } else {
            requireString(diagram.attribution.sourceName, `${dPath}.attribution.sourceName`, 'IMAGE_ATTRIBUTION_REQUIRED', errors);
            requireString(diagram.attribution.sourceUrl, `${dPath}.attribution.sourceUrl`, 'IMAGE_ATTRIBUTION_REQUIRED', errors);
            requireString(diagram.attribution.licenseName, `${dPath}.attribution.licenseName`, 'IMAGE_ATTRIBUTION_REQUIRED', errors);

            if (diagram.attribution.sourceUrl && !/^https?:\/\//.test(diagram.attribution.sourceUrl)) {
              errors.push({
                severity: 'error',
                path: `${dPath}.attribution.sourceUrl`,
                rule: 'IMAGE_ATTRIBUTION_URL_FORMAT',
                message: `Lesson ${lesson.id}: image attribution sourceUrl must be http(s)`
              });
            }
            if (diagram.attribution.licenseUrl && !/^https?:\/\//.test(diagram.attribution.licenseUrl)) {
              errors.push({
                severity: 'warning',
                path: `${dPath}.attribution.licenseUrl`,
                rule: 'IMAGE_ATTRIBUTION_URL_FORMAT',
                message: `Lesson ${lesson.id}: image attribution licenseUrl should be http(s)`
              });
            }
            if (!diagram.attribution.rightsStatus) {
              errors.push({
                severity: 'warning',
                path: `${dPath}.attribution.rightsStatus`,
                rule: 'IMAGE_RIGHTS_STATUS_MISSING',
                message: `Lesson ${lesson.id}: image attribution should include rightsStatus`
              });
            } else if (diagram.attribution.rightsStatus === 'other') {
              errors.push({
                severity: 'warning',
                path: `${dPath}.attribution.rightsStatus`,
                rule: 'IMAGE_LICENSE_REVIEW_REQUIRED',
                message: `Lesson ${lesson.id}: image diagram "${diagram.id}" uses non-CC0/public-domain rightsStatus and should be manually reviewed`
              });
            }
            if (!diagram.attribution.verifiedOn) {
              errors.push({
                severity: 'warning',
                path: `${dPath}.attribution.verifiedOn`,
                rule: 'IMAGE_VERIFIED_ON_MISSING',
                message: `Lesson ${lesson.id}: image attribution should include verifiedOn date`
              });
            }
            const verificationNotes = diagram.attribution.verificationNotes ?? '';
            if (!verificationNotes) {
              errors.push({
                severity: 'warning',
                path: `${dPath}.attribution.verificationNotes`,
                rule: 'IMAGE_CONTEXT_VERIFICATION_MISSING',
                message: `Lesson ${lesson.id}: image attribution should include relevance verification notes`
              });
            } else if (!/matched terms?:/i.test(verificationNotes) && !/relevan/i.test(verificationNotes)) {
              errors.push({
                severity: 'warning',
                path: `${dPath}.attribution.verificationNotes`,
                rule: 'IMAGE_CONTEXT_VERIFICATION_WEAK',
                message: `Lesson ${lesson.id}: verificationNotes should state why the image is contextually relevant`
              });
            }
          }
        } else if (!Array.isArray(diagram.nodes) || diagram.nodes.length === 0) {
          // Rule 20: non-image diagram has empty nodes
          errors.push({
            severity: 'warning',
            path: `${dPath}.nodes`,
            rule: 'DIAGRAM_NO_NODES',
            message: `Lesson ${lesson.id}: diagram "${diagram.id}" (kind: ${diagram.kind}) has no nodes`
          });
        }
      });
    }

    // Visual-aid integration check: at least one assessment prompt should
    // explicitly reference a diagram ID/title so visual aids are tested, not decorative.
    if (Array.isArray(lesson.diagrams) && lesson.diagrams.length > 0) {
      const visualKeys = lesson.diagrams
        .flatMap((d) => [d.id, d.title])
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.toLowerCase());

      const assessmentText = [
        lesson.youTry?.prompt ?? '',
        ...(lesson.quiz ?? []).flatMap((q) => [q.prompt ?? '', q.explanation ?? '']),
      ].join(' ').toLowerCase();

      const hasVisualReference = visualKeys.some((key) => assessmentText.includes(key));
      if (!hasVisualReference) {
        errors.push({
          severity: 'warning',
          path: `${path}.quiz`,
          rule: 'VISUAL_AID_NOT_ASSESSED',
          message: `Lesson ${lesson.id}: no quiz/youTry item references diagram IDs/titles; add at least one visual-aid-linked assessment prompt`
        });
      }
    }

    // youTry
    if (!lesson.youTry) {
      errors.push({
        severity: 'error',
        path: `${path}.youTry`,
        rule: 'REQUIRED_FIELD_MISSING',
        message: `Lesson ${lesson.id}: youTry is missing`
      });
    } else {
      validatePracticeActivity(lesson.youTry, `${path}.youTry`, lesson.id, errors);
    }

    // Quiz
    if (!Array.isArray(lesson.quiz) || lesson.quiz.length === 0) {
      errors.push({
        severity: 'error',
        path: `${path}.quiz`,
        rule: 'REQUIRED_FIELD_MISSING',
        message: `Lesson ${lesson.id}: quiz is missing or empty`
      });
    } else {
      // Verbal questions are evidence artifacts — exclude from MCQ/TF count and ID-format checks
      const scoredQuestions = lesson.quiz.filter(q => q.type !== 'verbal');
      if (scoredQuestions.length !== 4) {
        errors.push({
          severity: 'error',
          path: `${path}.quiz`,
          rule: 'LESSON_QUIZ_COUNT_INVALID',
          message: `Lesson ${lesson.id}: quiz must contain exactly 4 scored questions; found ${scoredQuestions.length}`
        });
      }
      const questionIds = new Set<string>();
      let lessonVerbalCount = 0;
      lesson.quiz.forEach((q, qi) => {
        const qPath = `${path}.quiz[${qi}]`;
        if (q.type === 'verbal') {
          lessonVerbalCount += 1;
          // Verbal questions use their own ID format (e.g. "v1") — skip MCQ/TF rules
          validateQuestion(q, qPath, errors);
          return;
        }
        // Rule 8: question ID format
        if (!/^q\d+$/.test(q.id)) {
          errors.push({
            severity: 'error',
            path: `${qPath}.id`,
            rule: 'LESSON_QUIZ_QUESTION_ID_FORMAT',
            message: `Lesson ${lesson.id}: question ID "${q.id}" must match q{N} (e.g. "q1")`
          });
        }
        // Rule 11: duplicate question IDs within lesson
        if (questionIds.has(q.id)) {
          errors.push({
            severity: 'error',
            path: `${qPath}.id`,
            rule: 'DUPLICATE_QUESTION_ID_WITHIN_LESSON',
            message: `Lesson ${lesson.id}: duplicate question ID "${q.id}"`
          });
        }
        questionIds.add(q.id);
        validateQuestion(q, qPath, errors);
      });
      if (lessonVerbalCount !== 1) {
        errors.push({
          severity: 'error',
          path: `${path}.quiz`,
          rule: 'LESSON_VERBAL_QUESTION_RULE',
          message: `Lesson ${lesson.id}: must contain exactly 1 verbal question; found ${lessonVerbalCount}`
        });
      }
      validateApplicationQuestionRatio(
        scoredQuestions,
        `${path}.quiz`,
        'LESSON_QUIZ_APPLICATION_RATIO_LOW',
        'LESSON_QUIZ_APPLICATION_RATIO_HIGH',
        errors
      );
    }
  }

}

// ─── Stage test validation ────────────────────────────────────────────────────

function validateStageTest(stage: TrainingStage, errors: ValidationError[]): void {
  const basePath = `stages[${stage.id}].test`;

  if (!Array.isArray(stage.test) || stage.test.length === 0) {
    errors.push({
      severity: 'error',
      path: basePath,
      rule: 'REQUIRED_FIELD_MISSING',
      message: `Stage ${stage.id}: test questions array is missing or empty`
    });
    return;
  }

  stage.test.forEach((q, qi) => {
    const qPath = `${basePath}[${qi}]`;
    if (q.type === 'verbal') {
      errors.push({
        severity: 'error',
        path: `${qPath}.type`,
        rule: 'STAGE_TEST_NO_VERBAL',
        message: `Stage ${stage.id} test: verbal questions are not allowed`
      });
    }
    // Rule 7: test question ID format
    if (!/^t\d+$/.test(q.id)) {
      errors.push({
        severity: 'error',
        path: `${qPath}.id`,
        rule: 'TEST_QUESTION_ID_FORMAT',
        message: `Stage ${stage.id} test: question ID "${q.id}" must match t{N} (e.g. "t1")`
      });
    }
    validateQuestion(q, qPath, errors);
  });
  validateApplicationQuestionRatio(
    stage.test,
    basePath,
    'STAGE_TEST_APPLICATION_RATIO_LOW',
    'STAGE_TEST_APPLICATION_RATIO_HIGH',
    errors
  );
  validateStageTestScope(stage, basePath, errors);
}

const ASSESSMENT_SCOPE_STOPWORDS = new Set([
  'which',
  'what',
  'when',
  'where',
  'would',
  'could',
  'should',
  'best',
  'most',
  'likely',
  'first',
  'next',
  'step',
  'given',
  'based',
  'after',
  'before',
  'during',
  'because',
  'about',
  'through',
  'against',
  'without',
  'between',
  'under',
  'from',
  'this',
  'that',
  'these',
  'those',
  'into',
  'over',
  'only',
  'always',
  'never',
  'true',
  'false'
]);

function validateStageTestScope(stage: TrainingStage, basePath: string, errors: ValidationError[]): void {
  const taughtCorpus = stage.lessons
    .map(
      (lesson) =>
        `${lesson.title} ${lesson.objective} ${lesson.situationHook ?? ''} ${lesson.workedExample ?? ''} ${lesson.concept.join(' ')} ` +
        `${lesson.quiz.map((q) => `${q.prompt} ${q.explanation}`).join(' ')} ${lesson.youTry?.prompt ?? ''} ${lesson.youTry?.feedback ?? ''}`
    )
    .join(' ');
  const taughtTerms = tokenizeForOverlap(taughtCorpus);
  if (taughtTerms.size === 0) return;

  stage.test.forEach((question, idx) => {
    const qTerms = tokenizeForOverlap(
      `${question.prompt} ${question.explanation} ${question.type === 'mcq' ? (question.options ?? []).join(' ') : ''}`
    );
    if (qTerms.size === 0) return;
    const overlap = intersectionSize(qTerms, taughtTerms);
    const overlapRatio = overlap / Math.max(1, qTerms.size);
    const novelTerms = [...qTerms].filter(
      (term) => !taughtTerms.has(term) && !ASSESSMENT_SCOPE_STOPWORDS.has(term)
    );
    if (overlapRatio < 0.3 && novelTerms.length >= 3) {
      errors.push({
        severity: 'warning',
        path: `${basePath}[${idx}]`,
        rule: 'STAGE_TEST_SCOPE_MISMATCH',
        message: `Question may test concepts not explicitly taught in this stage; check scope for terms: ${novelTerms
          .slice(0, 4)
          .join(', ')}`
      });
    }
  });
}

// ─── Question validation ──────────────────────────────────────────────────────

function validateQuestion(q: TrainingQuestion, path: string, errors: ValidationError[]): void {
  requireString(q.prompt, `${path}.prompt`, 'REQUIRED_FIELD_MISSING', errors);
  requireString(q.explanation, `${path}.explanation`, 'REQUIRED_FIELD_MISSING', errors);

  if (q.type === 'mcq') {
    // Rule 12: options array present and large enough
    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push({
        severity: 'error',
        path: `${path}.options`,
        rule: 'MCQ_OPTIONS_PRESENT',
        message: `Question ${q.id}: MCQ must have options array with at least 2 items`
      });
      return;
    }
    // Rule 2: answer in options
    if (typeof q.answer !== 'string' || !q.options.includes(q.answer)) {
      errors.push({
        severity: 'error',
        path: `${path}.answer`,
        rule: 'MCQ_ANSWER_IN_OPTIONS',
        message: `Question ${q.id}: answer "${q.answer}" is not in options [${q.options.join(', ')}]`
      });
    }
  } else if (q.type === 'tf') {
    // Rule 3: TF answer is boolean
    if (typeof q.answer !== 'boolean') {
      errors.push({
        severity: 'error',
        path: `${path}.answer`,
        rule: 'TF_ANSWER_IS_BOOLEAN',
        message: `Question ${q.id}: TF answer must be boolean (true/false), got ${typeof q.answer} "${q.answer}"`
      });
    }
  } else if (q.type === 'verbal') {
    if (typeof q.timerSeconds !== 'number' || q.timerSeconds < 15) {
      errors.push({
        severity: 'error',
        path: `${path}.timerSeconds`,
        rule: 'VERBAL_TIMER_REQUIRED',
        message: `Question ${q.id}: verbal question must include timerSeconds >= 15`
      });
    }
    if (typeof q.triggerScrollPct !== 'number') {
      errors.push({
        severity: 'error',
        path: `${path}.triggerScrollPct`,
        rule: 'VERBAL_TRIGGER_REQUIRED',
        message: `Question ${q.id}: verbal question must include triggerScrollPct`
      });
    }
    if (!Array.isArray(q.expectedKeywords) || q.expectedKeywords.length < 3) {
      errors.push({
        severity: 'error',
        path: `${path}.expectedKeywords`,
        rule: 'VERBAL_KEYWORDS_REQUIRED',
        message: `Question ${q.id}: verbal question must include at least 3 expectedKeywords`
      });
    }
    if (typeof q.minKeywordHits !== 'number') {
      errors.push({
        severity: 'error',
        path: `${path}.minKeywordHits`,
        rule: 'VERBAL_MIN_KEYWORD_HITS_REQUIRED',
        message: `Question ${q.id}: verbal question must include minKeywordHits`
      });
    } else if (Array.isArray(q.expectedKeywords) && q.minKeywordHits > q.expectedKeywords.length) {
      errors.push({
        severity: 'error',
        path: `${path}.minKeywordHits`,
        rule: 'VERBAL_MIN_KEYWORD_HITS_INVALID',
        message: `Question ${q.id}: minKeywordHits cannot exceed expectedKeywords length`
      });
    }
  }
}

const APPLICATION_QUESTION_HINTS = [
  'given',
  'scenario',
  'customer',
  'fault',
  'fails',
  'best first',
  'next step',
  'you should',
  'what should',
  'what is the best',
  'first action',
  'most appropriate',
  'most likely',
  'based on'
];

function isApplicationQuestion(question: TrainingQuestion): boolean {
  if (question.intent === 'application') return true;
  const text = `${question.prompt} ${question.explanation}`.toLowerCase();
  return APPLICATION_QUESTION_HINTS.some((hint) => text.includes(hint));
}

function validateApplicationQuestionRatio(
  questions: TrainingQuestion[],
  path: string,
  lowRule: string,
  highRule: string,
  errors: ValidationError[]
): void {
  if (!Array.isArray(questions) || questions.length === 0) return;
  const applicationCount = questions.filter(isApplicationQuestion).length;
  const ratio = applicationCount / questions.length;
  if (ratio < 0.4) {
    errors.push({
      severity: 'warning',
      path,
      rule: lowRule,
      message: `Application/decision question ratio is ${(ratio * 100).toFixed(0)}%; target 40-50%`
    });
  } else if (ratio > 0.5) {
    errors.push({
      severity: 'warning',
      path,
      rule: highRule,
      message: `Application/decision question ratio is ${(ratio * 100).toFixed(0)}%; target 40-50%`
    });
  }
}

// ─── PracticeActivity validation ──────────────────────────────────────────────

function validatePracticeActivity(
  activity: PracticeActivity,
  path: string,
  lessonId: string,
  errors: ValidationError[]
): void {
  if (!activity.prompt) {
    errors.push({ severity: 'error', path: `${path}.prompt`, rule: 'REQUIRED_FIELD_MISSING', message: `Lesson ${lessonId}: youTry prompt is missing` });
  }
  if (!activity.feedback) {
    errors.push({ severity: 'error', path: `${path}.feedback`, rule: 'REQUIRED_FIELD_MISSING', message: `Lesson ${lessonId}: youTry feedback is missing` });
  }
  if (!Array.isArray(activity.options) || activity.options.length < 2) {
    errors.push({ severity: 'error', path: `${path}.options`, rule: 'REQUIRED_FIELD_MISSING', message: `Lesson ${lessonId}: youTry options must have at least 2 items` });
    return;
  }

  if (activity.type === 'ordering') {
    // Rule 4: answer is permutation of options
    if (!Array.isArray(activity.answer)) {
      errors.push({ severity: 'error', path: `${path}.answer`, rule: 'ORDERING_ANSWER_IS_PERMUTATION', message: `Lesson ${lessonId}: ordering youTry answer must be an array` });
    } else {
      const sortedOptions = [...activity.options].sort();
      const sortedAnswer = [...(activity.answer as string[])].sort();
      if (JSON.stringify(sortedOptions) !== JSON.stringify(sortedAnswer)) {
        errors.push({
          severity: 'error',
          path: `${path}.answer`,
          rule: 'ORDERING_ANSWER_IS_PERMUTATION',
          message: `Lesson ${lessonId}: ordering youTry answer is not a permutation of options`
        });
      }
    }
  } else if (activity.type === 'mcq' || activity.type === 'scenario') {
    // Rule 5: answer in options
    if (typeof activity.answer !== 'string' || !activity.options.includes(activity.answer as string)) {
      errors.push({
        severity: 'error',
        path: `${path}.answer`,
        rule: 'MCQ_ACTIVITY_ANSWER_IN_OPTIONS',
        message: `Lesson ${lessonId}: youTry answer "${activity.answer}" is not in options [${activity.options.join(', ')}]`
      });
    }
  }
}

// ─── Mission validation ───────────────────────────────────────────────────────

function validateMissions(
  missions: TrainingMission[],
  expectedCount: number,
  stageCount: number,
  errors: ValidationError[]
): void {
  if (missions.length !== expectedCount) {
    errors.push({
      severity: 'warning',
      path: 'missions',
      rule: 'MISSION_COUNT_MISMATCH',
      message: `Generated ${missions.length} mission(s); expected ${expectedCount}`
    });
  }

  const seenMissionIds = new Set<string>();

  for (let mi = 0; mi < missions.length; mi++) {
    const m = missions[mi];
    const path = `missions[${mi}]`;

    requireString(m.id, `${path}.id`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(m.title, `${path}.title`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(m.description, `${path}.description`, 'REQUIRED_FIELD_MISSING', errors);

    if (m.id) {
      if (seenMissionIds.has(m.id)) {
        errors.push({
          severity: 'error',
          path: `${path}.id`,
          rule: 'DUPLICATE_MISSION_ID',
          message: `Duplicate mission ID "${m.id}"`
        });
      }
      seenMissionIds.add(m.id);
    }

    if (typeof m.stageMin === 'number' && (m.stageMin < 1 || m.stageMin > stageCount)) {
      errors.push({
        severity: 'warning',
        path: `${path}.stageMin`,
        rule: 'MISSION_STAGE_BOUNDS',
        message: `Mission "${m.id}": stageMin (${m.stageMin}) is outside 1..${stageCount}`
      });
    }

    // Rule 15: stageMax bounds
    if (typeof m.stageMax === 'number' && m.stageMax > stageCount) {
      errors.push({
        severity: 'warning',
        path: `${path}.stageMax`,
        rule: 'MISSION_STAGE_BOUNDS',
        message: `Mission "${m.id}": stageMax (${m.stageMax}) exceeds module stage count (${stageCount})`
      });
    }

    if (
      typeof m.stageMin === 'number' &&
      typeof m.stageMax === 'number' &&
      m.stageMax < m.stageMin
    ) {
      errors.push({
        severity: 'error',
        path: `${path}.stageMax`,
        rule: 'MISSION_STAGE_RANGE_INVALID',
        message: `Mission "${m.id}": stageMax (${m.stageMax}) must be >= stageMin (${m.stageMin})`
      });
    }

    if (!Array.isArray(m.branches) || m.branches.length === 0) {
      errors.push({
        severity: 'error',
        path: `${path}.branches`,
        rule: 'MISSION_BRANCHES_REQUIRED',
        message: `Mission "${m.id}": branches array is missing or empty`
      });
      continue;
    }

    if (m.branches.length < 3) {
      errors.push({
        severity: 'warning',
        path: `${path}.branches`,
        rule: 'MISSION_BRANCH_COUNT_LOW',
        message: `Mission "${m.id}": only ${m.branches.length} branch(es); 3+ recommended for meaningful practice`
      });
    }

    if (Array.isArray(m.branches)) {
      const scores = m.branches.map((b) => b.score);
      let hasIntermediate = false;

      m.branches.forEach((branch, bi) => {
        const bPath = `${path}.branches[${bi}]`;
        requireString(branch.choice, `${bPath}.choice`, 'REQUIRED_FIELD_MISSING', errors);
        requireString(branch.outcome, `${bPath}.outcome`, 'REQUIRED_FIELD_MISSING', errors);
        requireString(branch.feedback, `${bPath}.feedback`, 'REQUIRED_FIELD_MISSING', errors);

        if (!Number.isFinite(branch.score)) {
          errors.push({
            severity: 'error',
            path: `${bPath}.score`,
            rule: 'MISSION_BRANCH_SCORE_NUMERIC',
            message: `Mission "${m.id}": branch score must be numeric`
          });
          return;
        }
        if (branch.score < 0 || branch.score > 100) {
          errors.push({
            severity: 'warning',
            path: `${bPath}.score`,
            rule: 'MISSION_BRANCH_SCORE_RANGE',
            message: `Mission "${m.id}": branch score ${branch.score} is outside recommended 0..100`
          });
        }
        if (branch.score > 25 && branch.score < 85) {
          hasIntermediate = true;
        }
      });

      // Rule 16: missing score-100
      if (!scores.includes(100)) {
        errors.push({
          severity: 'warning',
          path: `${path}.branches`,
          rule: 'MISSING_SCORE_100_BRANCH',
          message: `Mission "${m.id}": no branch has score 100 (the ideal response)`
        });
      }
      // Rule 17: missing score-0
      if (!scores.includes(0)) {
        errors.push({
          severity: 'warning',
          path: `${path}.branches`,
          rule: 'MISSING_SCORE_0_BRANCH',
          message: `Mission "${m.id}": no branch has score 0 (the clearly wrong response)`
        });
      }
      if (!hasIntermediate) {
        errors.push({
          severity: 'warning',
          path: `${path}.branches`,
          rule: 'MISSING_INTERMEDIATE_BRANCH',
          message: `Mission "${m.id}": no branch appears partially correct/intermediate (recommended for coaching value)`
        });
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(
  value: unknown,
  path: string,
  rule: string,
  errors: ValidationError[]
): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push({
      severity: 'error',
      path,
      rule,
      message: `Required field at "${path}" is missing or empty`
    });
  }
}

function isValidLessonId(lessonId: string): boolean {
  return /^s\d+-l\d+$/.test(lessonId) || /^[a-z0-9]+-s\d+-l\d+$/.test(lessonId);
}

function validateSourceAttribution(
  sourceCatalog: Array<{
    id: string;
    title: string;
    url: string;
    notes?: string;
    publisher?: string;
    reliability?: 'authoritative' | 'reputable' | 'secondary';
    year?: number;
    lastVerified?: string;
  }>,
  citationMap: {
    lessonCitations: Record<string, string[]>;
    missionCitations: Record<string, string[]>;
  },
  curriculum: TrainingStage[],
  missions: TrainingMission[],
  sourceReferenceCount: number,
  errors: ValidationError[]
): void {
  if (sourceCatalog.length === 0) {
    errors.push({
      severity: sourceReferenceCount > 0 ? 'error' : 'warning',
      path: 'sourceCatalog',
      rule: 'SOURCE_CATALOG_EMPTY',
      message:
        sourceReferenceCount > 0
          ? 'Source references were provided, but generated sourceCatalog is empty'
          : 'No source catalog generated; correctness and attribution confidence is reduced'
    });
  }

  const sourceIds = new Set<string>();
  const sourceReliabilityCounts: Record<'authoritative' | 'reputable' | 'secondary', number> = {
    authoritative: 0,
    reputable: 0,
    secondary: 0
  };
  const lowTrustDomainPattern = /(reddit\.com|quora\.com|medium\.com|blogspot\.|wordpress\.com)/i;
  const currentYear = new Date().getFullYear();
  sourceCatalog.forEach((source, idx) => {
    const path = `sourceCatalog[${idx}]`;
    requireString(source.id, `${path}.id`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(source.title, `${path}.title`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(source.url, `${path}.url`, 'REQUIRED_FIELD_MISSING', errors);

    if (source.id) {
      if (sourceIds.has(source.id)) {
        errors.push({
          severity: 'error',
          path: `${path}.id`,
          rule: 'DUPLICATE_SOURCE_ID',
          message: `Duplicate source ID "${source.id}"`
        });
      }
      sourceIds.add(source.id);
    }

    if (source.url && !/^https?:\/\//.test(source.url)) {
      errors.push({
        severity: 'warning',
        path: `${path}.url`,
        rule: 'SOURCE_URL_FORMAT',
        message: `Source URL "${source.url}" does not look like http(s)`
      });
    }
    if (source.url && lowTrustDomainPattern.test(source.url)) {
      errors.push({
        severity: 'warning',
        path: `${path}.url`,
        rule: 'SOURCE_RELIABILITY_TOO_LOW',
        message: `Source URL "${source.url}" appears low-trust for authoritative training claims`
      });
    }
    if (!source.reliability) {
      errors.push({
        severity: 'error',
        path: `${path}.reliability`,
        rule: 'SOURCE_RELIABILITY_MISSING',
        message: `Source "${source.id}" is missing reliability classification`
      });
    } else {
      sourceReliabilityCounts[source.reliability] += 1;
    }
    if (!source.lastVerified) {
      errors.push({
        severity: 'error',
        path: `${path}.lastVerified`,
        rule: 'SOURCE_LAST_VERIFIED_MISSING',
        message: `Source "${source.id}" is missing lastVerified date`
      });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(source.lastVerified)) {
      errors.push({
        severity: 'error',
        path: `${path}.lastVerified`,
        rule: 'SOURCE_LAST_VERIFIED_MISSING',
        message: `Source "${source.id}" lastVerified should use YYYY-MM-DD format`
      });
    }
    if (typeof source.year === 'number' && source.year < currentYear - 12) {
      // Official government and legislation sources (.gov, .gov.uk) are statutes in force —
      // age is not a validity concern. Skip the warning for these authoritative domains.
      const isGovSource = (() => {
        try { const h = new URL(source.url).hostname.toLowerCase(); return h.endsWith('.gov') || h.endsWith('.gov.uk'); }
        catch { return false; }
      })();
      if (!isGovSource) {
        errors.push({
          severity: 'warning',
          path: `${path}.year`,
          rule: 'SOURCE_YEAR_OUTDATED',
          message: `Source "${source.id}" appears old (${source.year}); verify if a newer revision exists`
        });
      }
    }
  });

  if (sourceCatalog.length > 0) {
    const weakRatio = sourceReliabilityCounts.secondary / sourceCatalog.length;
    if (weakRatio > 0.4) {
      errors.push({
        severity: 'warning',
        path: 'sourceCatalog',
        rule: 'SOURCE_RELIABILITY_TOO_LOW',
        message: `Secondary sources are ${Math.round(weakRatio * 100)}% of catalog; target <= 40%`
      });
    }
  }

  const lessonIds = curriculum.flatMap((s) => s.lessons.map((l) => l.id));
  const missionIds = missions.map((m) => m.id);
  const lessonSet = new Set(lessonIds);
  const missionSet = new Set(missionIds);

  const lessonCitations = citationMap.lessonCitations ?? {};
  const missionCitations = citationMap.missionCitations ?? {};

  for (const lessonId of lessonIds) {
    const citations = lessonCitations[lessonId] ?? [];
    if (!Array.isArray(citations) || citations.length === 0) {
      errors.push({
        severity: sourceReferenceCount > 0 ? 'error' : 'warning',
        path: `citationMap.lessonCitations.${lessonId}`,
        rule: 'LESSON_CITATION_MISSING',
        message: `Lesson "${lessonId}" has no citations`
      });
      continue;
    }
    citations.forEach((sourceId, i) => {
      if (!sourceIds.has(sourceId)) {
        errors.push({
          severity: 'error',
          path: `citationMap.lessonCitations.${lessonId}[${i}]`,
          rule: 'UNKNOWN_SOURCE_ID',
          message: `Lesson "${lessonId}" references unknown source ID "${sourceId}"`
        });
      }
    });
  }

  for (const missionId of missionIds) {
    const citations = missionCitations[missionId] ?? [];
    if (!Array.isArray(citations) || citations.length === 0) {
      errors.push({
        severity: sourceReferenceCount > 0 ? 'error' : 'warning',
        path: `citationMap.missionCitations.${missionId}`,
        rule: 'MISSION_CITATION_MISSING',
        message: `Mission "${missionId}" has no citations`
      });
      continue;
    }
    citations.forEach((sourceId, i) => {
      if (!sourceIds.has(sourceId)) {
        errors.push({
          severity: 'error',
          path: `citationMap.missionCitations.${missionId}[${i}]`,
          rule: 'UNKNOWN_SOURCE_ID',
          message: `Mission "${missionId}" references unknown source ID "${sourceId}"`
        });
      }
    });
  }

  Object.keys(lessonCitations).forEach((lessonId) => {
    if (!lessonSet.has(lessonId)) {
      errors.push({
        severity: 'warning',
        path: `citationMap.lessonCitations.${lessonId}`,
        rule: 'CITATION_UNKNOWN_LESSON',
        message: `Citation map contains unknown lesson "${lessonId}"`
      });
    }
  });

  Object.keys(missionCitations).forEach((missionId) => {
    if (!missionSet.has(missionId)) {
      errors.push({
        severity: 'warning',
        path: `citationMap.missionCitations.${missionId}`,
        rule: 'CITATION_UNKNOWN_MISSION',
        message: `Citation map contains unknown mission "${missionId}"`
      });
    }
  });

  // Critical-claim items should prefer >=2 citations for robustness.
  const criticalPattern = /\b(safety|legal|regulat|compliance|incident|breach|emergency|hazard|risk|policy|standard|procedure|step|diagnos|forensic|secure|vulnerability|threat)\b/i;
  const lessonById = new Map(curriculum.flatMap((stage) => stage.lessons.map((lesson) => [lesson.id, lesson])));
  const missionById = new Map(missions.map((mission) => [mission.id, mission]));

  for (const lessonId of lessonIds) {
    const lesson = lessonById.get(lessonId);
    if (!lesson) continue;
    const text = `${lesson.title} ${lesson.objective} ${lesson.workedExample}`;
    if (!criticalPattern.test(text)) continue;
    const citations = lessonCitations[lessonId] ?? [];
    if (citations.length < 2) {
      errors.push({
        severity: 'warning',
        path: `citationMap.lessonCitations.${lessonId}`,
        rule: 'CRITICAL_CLAIM_CITATION_DEPTH_LOW',
        message: `Lesson "${lessonId}" appears high-impact but has only ${citations.length} citation(s); 2+ recommended`
      });
    }
  }

  for (const missionId of missionIds) {
    const mission = missionById.get(missionId);
    if (!mission) continue;
    const text = `${mission.title} ${mission.description} ${mission.whyItMatters ?? ''}`;
    if (!criticalPattern.test(text)) continue;
    const citations = missionCitations[missionId] ?? [];
    if (citations.length < 2) {
      errors.push({
        severity: 'warning',
        path: `citationMap.missionCitations.${missionId}`,
        rule: 'CRITICAL_CLAIM_CITATION_DEPTH_LOW',
        message: `Mission "${missionId}" appears high-impact but has only ${citations.length} citation(s); 2+ recommended`
      });
    }
  }
}

function validateFactCheck(
  factCheck:
    | {
        items: Array<{
          id: string;
          claim: string;
          relatedItemId: string;
          relatedItemType: 'lesson' | 'mission' | 'placement' | 'general';
          sourceIds: string[];
          verdict: 'supported' | 'unsupported' | 'ambiguous' | 'disputed';
          severity: 'low' | 'medium' | 'high' | 'regulatory';
          rationale: string;
        }>;
        summary?: { supported: number; unsupported: number; ambiguous: number; disputed?: number };
      }
    | null,
  sourceCatalog: Array<{
    id: string;
    title: string;
    url: string;
    notes?: string;
    publisher?: string;
    reliability?: 'authoritative' | 'reputable' | 'secondary';
    year?: number;
    lastVerified?: string;
  }>,
  errors: ValidationError[]
): void {
  if (!factCheck) {
    errors.push({
      severity: 'warning',
      path: 'factCheck',
      rule: 'FACT_CHECK_MISSING',
      message: 'Fact-check step output is missing'
    });
    return;
  }

  if (!Array.isArray(factCheck.items) || factCheck.items.length === 0) {
    errors.push({
      severity: 'warning',
      path: 'factCheck.items',
      rule: 'FACT_CHECK_EMPTY',
      message: 'Fact-check report has no items'
    });
    return;
  }

  const sourceIds = new Set(sourceCatalog.map((s) => s.id));
  const seenIds = new Set<string>();
  let supported = 0;
  let unsupported = 0;
  let ambiguous = 0;
  let disputed = 0;

  factCheck.items.forEach((item, i) => {
    const path = `factCheck.items[${i}]`;
    requireString(item.id, `${path}.id`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(item.claim, `${path}.claim`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(item.relatedItemId, `${path}.relatedItemId`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(item.rationale, `${path}.rationale`, 'REQUIRED_FIELD_MISSING', errors);

    if (item.id && seenIds.has(item.id)) {
      errors.push({
        severity: 'error',
        path: `${path}.id`,
        rule: 'DUPLICATE_FACT_CHECK_ID',
        message: `Duplicate fact-check item id "${item.id}"`
      });
    }
    seenIds.add(item.id);

    if (!['lesson', 'mission', 'placement', 'general'].includes(item.relatedItemType)) {
      errors.push({
        severity: 'error',
        path: `${path}.relatedItemType`,
        rule: 'FACT_CHECK_RELATED_TYPE_INVALID',
        message: `Invalid relatedItemType "${String(item.relatedItemType)}"`
      });
    }

    if (!['supported', 'unsupported', 'ambiguous', 'disputed'].includes(item.verdict)) {
      errors.push({
        severity: 'error',
        path: `${path}.verdict`,
        rule: 'FACT_CHECK_VERDICT_INVALID',
        message: `Invalid verdict "${String(item.verdict)}"`
      });
    }
    if (!['low', 'medium', 'high', 'regulatory'].includes(item.severity)) {
      errors.push({
        severity: 'error',
        path: `${path}.severity`,
        rule: 'FACT_CHECK_SEVERITY_INVALID',
        message: `Invalid severity "${String(item.severity)}"`
      });
    }

    if (!Array.isArray(item.sourceIds) || item.sourceIds.length === 0) {
      errors.push({
        severity: 'error',
        path: `${path}.sourceIds`,
        rule: 'FACT_CHECK_SOURCE_IDS_EMPTY',
        message: `Fact-check item "${item.id}" has no source IDs`
      });
    } else {
      item.sourceIds.forEach((sourceId, si) => {
        if (!sourceIds.has(sourceId)) {
          errors.push({
            severity: 'error',
            path: `${path}.sourceIds[${si}]`,
            rule: 'FACT_CHECK_UNKNOWN_SOURCE_ID',
            message: `Fact-check item "${item.id}" references unknown source ID "${sourceId}"`
          });
        }
      });
    }

    if (item.verdict === 'supported') supported += 1;
    if (item.verdict === 'unsupported') {
      unsupported += 1;
      if (item.severity === 'high') {
        errors.push({
          severity: 'error',
          path,
          rule: 'FACT_CHECK_UNSUPPORTED_HIGH',
          message: `High-severity unsupported claim: "${item.claim}"`
        });
      } else if (item.severity === 'medium') {
        errors.push({
          severity: 'error',
          path,
          rule: 'FACT_CHECK_UNSUPPORTED_MEDIUM',
          message: `Medium-severity unsupported claim: "${item.claim}"`
        });
      }
    }
    if (item.verdict === 'ambiguous') {
      ambiguous += 1;
      if (item.severity === 'high' || item.severity === 'regulatory') {
        errors.push({
          severity: 'error',
          path,
          rule: 'FACT_CHECK_AMBIGUOUS_HIGH',
          message: `High-severity ambiguous claim needs manual verification: "${item.claim}"`
        });
      }
    }
    if (item.verdict === 'disputed') {
      disputed += 1;
    }
  });

  if (factCheck.summary) {
    if (factCheck.summary.supported !== supported) {
      errors.push({
        severity: 'error',
        path: 'factCheck.summary.supported',
        rule: 'FACT_CHECK_SUMMARY_MISMATCH',
        message: `Summary supported count ${factCheck.summary.supported} does not match items count ${supported}`
      });
    }
    if (factCheck.summary.unsupported !== unsupported) {
      errors.push({
        severity: 'error',
        path: 'factCheck.summary.unsupported',
        rule: 'FACT_CHECK_SUMMARY_MISMATCH',
        message: `Summary unsupported count ${factCheck.summary.unsupported} does not match items count ${unsupported}`
      });
    }
    if (factCheck.summary.ambiguous !== ambiguous) {
      errors.push({
        severity: 'error',
        path: 'factCheck.summary.ambiguous',
        rule: 'FACT_CHECK_SUMMARY_MISMATCH',
        message: `Summary ambiguous count ${factCheck.summary.ambiguous} does not match items count ${ambiguous}`
      });
    }
    if (typeof factCheck.summary.disputed === 'number' && factCheck.summary.disputed !== disputed) {
      errors.push({
        severity: 'error',
        path: 'factCheck.summary.disputed',
        rule: 'FACT_CHECK_SUMMARY_MISMATCH',
        message: `Summary disputed count ${factCheck.summary.disputed} does not match items count ${disputed}`
      });
    }
  }
}

function validateAdvancedArtifacts(
  advancedArtifacts:
    | {
        faultScenarioCampaign?: { scenarios?: unknown[] };
        fieldReferenceCards?: unknown[];
        builderExercises?: unknown[];
      }
    | null,
  errors: ValidationError[]
): void {
  if (!advancedArtifacts) {
    errors.push({
      severity: 'warning',
      path: 'advancedArtifacts',
      rule: 'ADVANCED_ARTIFACTS_MISSING',
      message: 'Advanced artifacts are missing (simulator/fault campaign/reference/builder/capstone package)'
    });
    return;
  }

  const scenarios = advancedArtifacts.faultScenarioCampaign?.scenarios ?? [];
  if (!Array.isArray(scenarios) || scenarios.length !== 20) {
    errors.push({
      severity: 'error',
      path: 'advancedArtifacts.faultScenarioCampaign.scenarios',
      rule: 'FAULT_CAMPAIGN_COUNT_INVALID',
      message: `Fault scenario campaign must contain exactly 20 scenarios; found ${Array.isArray(scenarios) ? scenarios.length : 0}`
    });
  }

  const refs = advancedArtifacts.fieldReferenceCards ?? [];
  if (!Array.isArray(refs) || refs.length !== 5) {
    errors.push({
      severity: 'error',
      path: 'advancedArtifacts.fieldReferenceCards',
      rule: 'FIELD_REFERENCE_COUNT_INVALID',
      message: `Field reference must contain exactly 5 cards; found ${Array.isArray(refs) ? refs.length : 0}`
    });
  }

  const builders = advancedArtifacts.builderExercises ?? [];
  if (!Array.isArray(builders) || builders.length !== 4) {
    errors.push({
      severity: 'error',
      path: 'advancedArtifacts.builderExercises',
      rule: 'BUILDER_EXERCISE_COUNT_INVALID',
      message: `Builder exercises must contain exactly 4 items; found ${Array.isArray(builders) ? builders.length : 0}`
    });
  }
}

function validatePlacementAssessment(
  placementAssessment:
    | {
        questions: TrainingQuestion[];
        recommendationThresholds?: Array<{ minScore: number; stage: number }>;
      }
    | null,
  stageCount: number,
  errors: ValidationError[]
): void {
  if (!placementAssessment) {
    errors.push({
      severity: 'warning',
      path: 'placementAssessment',
      rule: 'PLACEMENT_ASSESSMENT_MISSING',
      message: 'Placement assessment step output is missing'
    });
    return;
  }

  if (!Array.isArray(placementAssessment.questions) || placementAssessment.questions.length === 0) {
    errors.push({
      severity: 'error',
      path: 'placementAssessment.questions',
      rule: 'PLACEMENT_QUESTIONS_REQUIRED',
      message: 'Placement assessment questions are missing or empty'
    });
  } else {
    if (placementAssessment.questions.length !== 15) {
      errors.push({
        severity: 'error',
        path: 'placementAssessment.questions',
        rule: 'PLACEMENT_QUESTION_COUNT_INVALID',
        message: `Placement assessment must contain exactly 15 questions; found ${placementAssessment.questions.length}`
      });
    }
    if (placementAssessment.questions.length < 10) {
      errors.push({
        severity: 'warning',
        path: 'placementAssessment.questions',
        rule: 'PLACEMENT_QUESTION_COUNT_LOW',
        message: `Placement assessment has ${placementAssessment.questions.length} question(s); 10+ recommended`
      });
    }
    const ids = new Set<string>();
    placementAssessment.questions.forEach((q, i) => {
      const qPath = `placementAssessment.questions[${i}]`;
      if (!/^p\d+$/.test(q.id)) {
        errors.push({
          severity: 'error',
          path: `${qPath}.id`,
          rule: 'PLACEMENT_QUESTION_ID_FORMAT',
          message: `Placement question ID "${q.id}" must match p{N} (e.g. "p1")`
        });
      }
      if (ids.has(q.id)) {
        errors.push({
          severity: 'error',
          path: `${qPath}.id`,
          rule: 'DUPLICATE_PLACEMENT_QUESTION_ID',
          message: `Duplicate placement question ID "${q.id}"`
        });
      }
      ids.add(q.id);
      validateQuestion(q, qPath, errors);
    });
  }

  const thresholds = placementAssessment.recommendationThresholds ?? [];
  if (!Array.isArray(thresholds) || thresholds.length === 0) {
    errors.push({
      severity: 'error',
      path: 'placementAssessment.recommendationThresholds',
      rule: 'PLACEMENT_THRESHOLDS_REQUIRED',
      message: 'Placement recommendation thresholds are missing'
    });
    return;
  }

  const sorted = [...thresholds].sort((a, b) => b.minScore - a.minScore);
  if (stageCount <= 1) {
    errors.push({
      severity: 'warning',
      path: 'placementAssessment',
      rule: 'PLACEMENT_SINGLE_STAGE_READINESS_ONLY',
      message:
        'Module has one stage; treat placement as readiness diagnostics (not stage routing), or disable placement'
    });
  }
  if (sorted.length < 3) {
    errors.push({
      severity: 'warning',
      path: 'placementAssessment.recommendationThresholds',
      rule: 'PLACEMENT_THRESHOLDS_COUNT_LOW',
      message: `Placement threshold count is ${sorted.length}; 3+ entries are recommended for stable placement`
    });
  }
  sorted.forEach((threshold, i) => {
    const tPath = `placementAssessment.recommendationThresholds[${i}]`;
    if (!Number.isInteger(threshold.minScore) || threshold.minScore < 0 || threshold.minScore > 100) {
      errors.push({
        severity: 'error',
        path: `${tPath}.minScore`,
        rule: 'PLACEMENT_THRESHOLD_SCORE_RANGE',
        message: `Threshold minScore ${threshold.minScore} must be an integer 0..100`
      });
    }
    if (!Number.isInteger(threshold.stage) || threshold.stage < 1 || threshold.stage > stageCount) {
      errors.push({
        severity: 'error',
        path: `${tPath}.stage`,
        rule: 'PLACEMENT_THRESHOLD_STAGE_RANGE',
        message: `Threshold stage ${threshold.stage} must be in 1..${stageCount}`
      });
    }
  });

  if (!sorted.some((t) => t.stage === 1)) {
    errors.push({
      severity: 'warning',
      path: 'placementAssessment.recommendationThresholds',
      rule: 'PLACEMENT_STAGE1_FALLBACK_MISSING',
      message: 'Placement thresholds do not include a Stage 1 fallback'
    });
  }

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minScore > sorted[i - 1].minScore) {
      errors.push({
        severity: 'error',
        path: 'placementAssessment.recommendationThresholds',
        rule: 'PLACEMENT_THRESHOLDS_NOT_SORTABLE',
        message: 'Placement thresholds have invalid score ordering'
      });
      break;
    }
    if (sorted[i].stage > sorted[i - 1].stage) {
      errors.push({
        severity: 'error',
        path: `placementAssessment.recommendationThresholds[${i}].stage`,
        rule: 'PLACEMENT_THRESHOLD_STAGE_MONOTONICITY',
        message: `Higher scores must not map to lower rigor: stage progression is non-monotonic at index ${i}`
      });
    }
    const gap = sorted[i - 1].minScore - sorted[i].minScore;
    if (gap > 0 && gap < 5) {
      errors.push({
        severity: 'warning',
        path: 'placementAssessment.recommendationThresholds',
        rule: 'PLACEMENT_THRESHOLD_GAP_TOO_SMALL',
        message: `Threshold gap of ${gap} points is narrow; small score noise may cause unstable stage recommendations`
      });
    }
  }

  const highestStage = Math.max(...sorted.map((t) => t.stage));
  const top = sorted[0];
  if (highestStage > 1 && top.minScore < 60) {
    errors.push({
      severity: 'warning',
      path: 'placementAssessment.recommendationThresholds[0].minScore',
      rule: 'PLACEMENT_TOP_THRESHOLD_LOW',
      message: `Top threshold (${top.minScore}) is likely too permissive for highest unlocked stage`
    });
  }
}

function validateLessonMissionMap(
  lessonMissionMap: Record<string, { lessonId: string; missionIds: string[]; rationale: string }>,
  curriculum: TrainingStage[],
  missions: TrainingMission[],
  errors: ValidationError[]
): void {
  const lessonById = new Map(curriculum.flatMap((stage) => stage.lessons.map((lesson) => [lesson.id, lesson])));
  const lessonIds = new Set(curriculum.flatMap((s) => s.lessons.map((l) => l.id)));
  const missionIds = new Set(missions.map((m) => m.id));
  const totalLessons = curriculum.reduce((sum, stage) => sum + stage.lessons.length, 0);
  const lessonToStage = new Map(curriculum.flatMap((stage) => stage.lessons.map((lesson) => [lesson.id, stage.id])));
  const lessonText = new Map(
    curriculum.flatMap((stage) =>
      stage.lessons.map((lesson) => [
        lesson.id,
        `${lesson.title} ${lesson.objective} ${lesson.situationHook ?? ''} ${lesson.workedExample ?? ''}`.toLowerCase()
      ])
    )
  );
  const missionById = new Map(missions.map((mission) => [mission.id, mission]));

  const entries = Object.entries(lessonMissionMap ?? {});
  if (entries.length === 0) {
    errors.push({
      severity: 'warning',
      path: 'lessonMissionMap',
      rule: 'LESSON_MISSION_MAP_EMPTY',
      message: 'Lesson mission map is empty — practical gating mappings were not generated'
    });
    return;
  }

  const coverageRatio = totalLessons > 0 ? entries.length / totalLessons : 0;
  if (coverageRatio < 0.2 || coverageRatio > 0.5) {
    errors.push({
      severity: 'warning',
      path: 'lessonMissionMap',
      rule: 'LESSON_MISSION_MAP_COVERAGE_OUT_OF_RANGE',
      message: `Mapped ${entries.length}/${totalLessons} lessons (${Math.round(coverageRatio * 100)}%); target is typically 20-50%`
    });
  }

  for (const [key, entry] of entries) {
    const path = `lessonMissionMap.${key}`;
    if (!entry) {
      errors.push({
        severity: 'error',
        path,
        rule: 'LESSON_MISSION_MAP_ENTRY_INVALID',
        message: `Lesson mission map entry "${key}" is missing`
      });
      continue;
    }
    requireString(entry.lessonId, `${path}.lessonId`, 'REQUIRED_FIELD_MISSING', errors);
    requireString(entry.rationale, `${path}.rationale`, 'REQUIRED_FIELD_MISSING', errors);

    if (entry.lessonId && key !== entry.lessonId) {
      errors.push({
        severity: 'warning',
        path: `${path}.lessonId`,
        rule: 'LESSON_MISSION_MAP_KEY_MISMATCH',
        message: `Map key "${key}" does not match entry.lessonId "${entry.lessonId}"`
      });
    }

    if (entry.lessonId && !lessonIds.has(entry.lessonId)) {
      errors.push({
        severity: 'error',
        path: `${path}.lessonId`,
        rule: 'LESSON_MISSION_MAP_UNKNOWN_LESSON',
        message: `Lesson mission map references unknown lessonId "${entry.lessonId}"`
      });
    }

    if (!Array.isArray(entry.missionIds) || entry.missionIds.length === 0) {
      errors.push({
        severity: 'error',
        path: `${path}.missionIds`,
        rule: 'LESSON_MISSION_MAP_MISSIONS_REQUIRED',
        message: `Lesson mission map entry "${key}" must include at least one missionId`
      });
      continue;
    }

    for (let i = 0; i < entry.missionIds.length; i++) {
      const missionId = entry.missionIds[i];
      const mission = missionById.get(missionId);
      if (!missionIds.has(missionId) || !mission) {
        errors.push({
          severity: 'error',
          path: `${path}.missionIds[${i}]`,
          rule: 'LESSON_MISSION_MAP_UNKNOWN_MISSION',
          message: `Lesson mission map entry "${key}" references unknown missionId "${missionId}"`
        });
        continue;
      }

      const lessonStage = lessonToStage.get(entry.lessonId);
      if (
        typeof lessonStage === 'number' &&
        typeof mission.stageMin === 'number' &&
        typeof mission.stageMax === 'number' &&
        (lessonStage < mission.stageMin - 1 || lessonStage > mission.stageMax + 1)
      ) {
        errors.push({
          severity: 'warning',
          path: `${path}.missionIds[${i}]`,
          rule: 'LESSON_MISSION_MAP_STAGE_MISMATCH',
          message: `Lesson "${entry.lessonId}" (stage ${lessonStage}) is weakly aligned to mission "${missionId}" stage range ${mission.stageMin}-${mission.stageMax}`
        });
      }

      const lessonTerms = tokenizeForOverlap(lessonText.get(entry.lessonId) ?? '');
      const missionTerms = tokenizeForOverlap(
        `${mission.title} ${mission.description} ${mission.whyItMatters ?? ''} ${(mission.branches ?? [])
          .map((branch) => `${branch.choice} ${branch.outcome} ${branch.feedback}`)
          .join(' ')}`
      );
      const overlapCount = intersectionSize(lessonTerms, missionTerms);
      if (overlapCount < 2) {
        errors.push({
          severity: 'warning',
          path: `${path}.missionIds[${i}]`,
          rule: 'LESSON_MISSION_MAP_SEMANTIC_MISMATCH',
          message: `Lesson "${entry.lessonId}" and mission "${missionId}" show low semantic overlap; verify pedagogical fit`
        });
      }

      const rationaleTerms = tokenizeForOverlap(entry.rationale ?? '');
      const rationaleLessonOverlap = intersectionSize(rationaleTerms, lessonTerms);
      const rationaleMissionOverlap = intersectionSize(rationaleTerms, missionTerms);
      if (rationaleLessonOverlap < 1 || rationaleMissionOverlap < 1) {
        errors.push({
          severity: 'warning',
          path: `${path}.rationale`,
          rule: 'LESSON_MISSION_MAP_RATIONALE_GENERIC',
          message:
            `Rationale for lesson "${entry.lessonId}" does not clearly reference both lesson skill and mission scenario`
        });
      }

      const lesson = lessonById.get(entry.lessonId);
      const salientLessonTerms = tokenizeForOverlap(`${lesson?.objective ?? ''} ${lesson?.title ?? ''}`);
      const salientOverlap = intersectionSize(salientLessonTerms, missionTerms);
      if (salientLessonTerms.size > 0 && salientOverlap === 0) {
        errors.push({
          severity: 'warning',
          path: `${path}.missionIds[${i}]`,
          rule: 'LESSON_MISSION_MAP_SKILL_MISMATCH',
          message:
            `Mission "${missionId}" does not appear to exercise the lesson's named skill/terminology for "${entry.lessonId}"`
        });
      }
    }

    if ((entry.rationale ?? '').trim().length < 24) {
      errors.push({
        severity: 'warning',
        path: `${path}.rationale`,
        rule: 'LESSON_MISSION_MAP_RATIONALE_THIN',
        message: `Lesson mission rationale for "${entry.lessonId}" is too short to justify gating clearly`
      });
    }
  }

  // ── Reverse index: every mission must be referenced by at least one lesson ─
  const referencedMissionIds = new Set<string>();
  for (const [, entry] of entries) {
    if (!entry || !Array.isArray(entry.missionIds)) continue;
    for (const mid of entry.missionIds) {
      if (typeof mid === 'string') referencedMissionIds.add(mid);
    }
  }
  for (const missionId of missionIds) {
    if (!referencedMissionIds.has(missionId)) {
      errors.push({
        severity: 'warning',
        path: 'lessonMissionMap',
        rule: 'LESSON_MISSION_MAP_ORPHAN_MISSION',
        message: `Mission "${missionId}" is not referenced by any lesson — learners may never unlock it`
      });
    }
  }
}

function tokenizeForOverlap(text: string): Set<string> {
  const genericTerms = new Set([
    'learn',
    'lesson',
    'module',
    'stage',
    'practice',
    'skill',
    'skills',
    'scenario',
    'decision',
    'diagnosis',
    'diagnose',
    'process',
    'system',
    'issue',
    'problem',
    'correct',
    'incorrect',
    'safety',
    'check',
    'review'
  ]);
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .filter((token) => !genericTerms.has(token));
  return new Set(terms);
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const term of a) {
    if (b.has(term)) count += 1;
  }
  return count;
}
