import type { ZodTypeAny } from 'zod';
import type {
  AIClient,
  AIStreamRequest,
  AIStreamResult,
  AIStructuredRequest,
  AIStructuredResult,
} from './aiClient.js';

function extractInt(pattern: RegExp, text: string, fallback: number): number {
  const m = text.match(pattern);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function makeQuestion(id: string, regulatoryRef?: string) {
  return {
    id,
    type: 'mcq' as const,
    intent: 'knowledge' as const,
    prompt: `Question ${id}`,
    options: ['A', 'B', 'C'],
    answer: 'A',
    explanation: `Explanation for ${id}`,
    ...(regulatoryRef ? { regulatoryRef } : {}),
  };
}

function makeMockStructuredOutput(toolName: string, req: { system: string; user: string }): unknown {
  const stageCount = extractInt(/STAGE COUNT:\s*(\d+)/i, req.user, 2);
  const lessonsPerStage = extractInt(/LESSONS PER STAGE:\s*(\d+)/i, req.user, 2);
  const missionCount = extractInt(/Write\s+(\d+)\s+practical scenario missions/i, req.user, 2);

  if (toolName === 'return_domain_survey') {
    return {
      domainSurvey: {
        mandatoryTopics: ['Legal duties', 'Risk assessment'],
        commonMisconceptions: ['PPE is always first control'],
        enforcementPriorities: ['Training records'],
        criticalNumericThresholds: [],
        keyDutyHolders: ['Employer', 'Employee'],
        controlHierarchySteps: ['Eliminate', 'Substitute', 'Control', 'PPE'],
        regulatoryRefs: ['MHSWR 1999 Reg 3'],
      },
    };
  }

  if (toolName === 'return_blueprint') {
    return {
      blueprint: Array.from({ length: stageCount }, (_, i) => ({
        id: i + 1,
        title: `Stage ${i + 1}`,
        description: `Description ${i + 1}`,
        stageObjective: `Objective ${i + 1}`,
        prerequisiteCompetencies: ['Basic awareness'],
        lessons: Array.from({ length: lessonsPerStage }, (_, j) => ({
          id: `s${i + 1}-l${j + 1}`,
          title: `Lesson ${i + 1}.${j + 1}`,
          template: 'procedural',
          templateReason: 'Mock template assignment',
        })),
        testQuestionCount: 8,
        learningArc: 'conceptual-first',
      })),
    };
  }

  {
    const m = toolName.match(/^return_stage_(\d+)_lessons$/);
    if (m) {
      const stage = Number(m[1]);
      return {
        stage: {
          id: stage,
          title: `Stage ${stage}`,
          description: `Stage ${stage} description`,
          stageObjective: `Stage ${stage} objective`,
          prerequisiteCompetencies: ['Mock prerequisite'],
          lessons: Array.from({ length: lessonsPerStage }, (_, i) => ({
            id: `s${stage}-l${i + 1}`,
            title: `Lesson ${stage}.${i + 1}`,
            objective: `Objective ${stage}.${i + 1}`,
            situationHook: `Hook for lesson ${stage}.${i + 1}`,
            concept: ['Concept A', 'Concept B', 'Concept C'],
            diagrams: [{
              id: `diag-${stage}-${i + 1}`,
              title: `Diagram ${stage}.${i + 1}`,
              kind: 'flow',
              nodes: [{ id: 'n1', label: 'Start' }, { id: 'n2', label: 'End' }],
            }],
            workedExample: `Worked example ${stage}.${i + 1}`,
            youTry: {
              type: 'scenario',
              prompt: `Try ${stage}.${i + 1}`,
              options: ['Step 1', 'Step 2'],
              answer: 'Step 1',
              feedback: 'Good',
            },
            quiz: [
              makeQuestion(`q-${stage}-${i + 1}-1`),
              makeQuestion(`q-${stage}-${i + 1}-2`),
              makeQuestion(`q-${stage}-${i + 1}-3`),
              makeQuestion(`q-${stage}-${i + 1}-4`),
            ],
          })),
        },
      };
    }
  }

  {
    const m = toolName.match(/^return_stage_(\d+)_test$/);
    if (m) {
      const stage = Number(m[1]);
      return {
        test: Array.from({ length: 8 }, (_, i) => makeQuestion(`t-${stage}-${i + 1}`)),
      };
    }
  }

  if (toolName === 'return_missions') {
    return {
      missions: Array.from({ length: missionCount }, (_, i) => ({
        id: `m${i + 1}`,
        title: `Mission ${i + 1}`,
        description: `Mission ${i + 1} scenario`,
        whyItMatters: 'Practice safe decision making',
        stageMin: 1,
        stageMax: Math.max(1, stageCount),
        branches: [
          { choice: 'Option A', outcome: 'Safe', score: 20, feedback: 'Good' },
          { choice: 'Option B', outcome: 'Risky', score: 5, feedback: 'Review controls' },
          { choice: 'Option C', outcome: 'Unsafe', score: 0, feedback: 'Incorrect' },
        ],
      })),
    };
  }

  if (toolName === 'return_placement_assessment') {
    return {
      placementAssessment: {
        title: 'Placement',
        quizTitle: 'Placement Quiz',
        introText: 'Quick diagnostic',
        completedResultLabel: 'Done',
        recommendedStartTitle: 'Recommended start',
        recommendedStartHint: 'Based on score',
        questions: Array.from({ length: 6 }, (_, i) => makeQuestion(`p-${i + 1}`)),
        recommendationThresholds: [
          { minScore: 0, stage: 1 },
          { minScore: 50, stage: Math.min(2, stageCount) },
        ],
      },
    };
  }

  if (toolName === 'return_lesson_mission_map') {
    return {
      lessonMissionMap: {
        's1-l1': { lessonId: 's1-l1', missionIds: ['m1'], rationale: 'Foundational mission mapping' },
      },
    };
  }

  if (toolName === 'return_source_attribution') {
    return {
      sourceCatalog: [
        {
          id: 'src1',
          title: 'Mock HSE Guidance',
          url: 'https://www.hse.gov.uk/mock-guidance',
          reliability: 'authoritative',
          lastVerified: '2026-01-01',
        },
        {
          id: 'src2',
          title: 'Mock Regulation',
          url: 'https://www.legislation.gov.uk/mock-regulation',
          reliability: 'authoritative',
          lastVerified: '2026-01-01',
        },
      ],
      citationMap: {
        lessonCitations: {
          's1-l1': ['src1'],
          's1-l2': ['src1'],
          's2-l1': ['src2'],
          's2-l2': ['src2'],
        },
        missionCitations: {
          m1: ['src1'],
          m2: ['src2'],
        },
      },
    };
  }

  if (toolName === 'return_coherence_pass') {
    return {
      coherencePass: {
        contradictions: [],
        duplicateCoverage: [],
        regulatoryArcGaps: [],
        templateConsistencyIssues: [],
        overallCoherent: true,
        repairInstructions: [],
      },
    };
  }

  if (toolName === 'return_fact_check') {
    return {
      factCheck: {
        items: [
          {
            id: 'fc1',
            claim: 'Claim 1',
            relatedItemId: 's1-l1',
            relatedItemType: 'lesson',
            sourceIds: ['src1'],
            verdict: 'supported',
            severity: 'medium',
            rationale: 'Mapped to source',
          },
          {
            id: 'fc2',
            claim: 'Claim 2',
            relatedItemId: 's1-l2',
            relatedItemType: 'lesson',
            sourceIds: ['src1'],
            verdict: 'supported',
            severity: 'low',
            rationale: 'Mapped to source',
          },
          {
            id: 'fc3',
            claim: 'Claim 3',
            relatedItemId: 'm1',
            relatedItemType: 'mission',
            sourceIds: ['src2'],
            verdict: 'unsupported',
            severity: 'high',
            rationale: 'Missing direct source evidence',
          },
          {
            id: 'fc4',
            claim: 'Claim 4',
            relatedItemId: 'placement',
            relatedItemType: 'placement',
            sourceIds: ['src2'],
            verdict: 'supported',
            severity: 'medium',
            rationale: 'Consistent with cited source',
          },
        ],
        summary: {
          supported: 3,
          unsupported: 1,
          ambiguous: 0,
        },
      },
    };
  }

  if (toolName === 'return_simulator_design') {
    return {
      simulatorDesign: {
        concept: 'Mock simulator concept',
        learnerControls: ['Start', 'Stop'],
        stateVariables: [
          { name: 'pressure', description: 'System pressure' },
          { name: 'temperature', description: 'System temperature' },
          { name: 'flow', description: 'System flow' },
        ],
        visibleOutcomes: ['Normal operation', 'Alarm'],
        subsystems: [
          { id: 'sub1', title: 'Input', purpose: 'Accept commands' },
          { id: 'sub2', title: 'Control', purpose: 'Apply control logic' },
        ],
        tickModel: {
          model: 'fixed',
          stepMs: 500,
          updateSequence: ['input', 'control'],
        },
        faultInjectionModel: {
          injectableFaultTypes: ['sensor-fault', 'actuator-fault'],
          examples: ['Pressure spike', 'Valve stuck'],
        },
        trainerPanels: [
          { id: 'tp1', title: 'Core', stageMin: 1, stageMax: Math.max(1, stageCount), focus: 'Core operation' },
          { id: 'tp2', title: 'Faults', stageMin: 1, stageMax: Math.max(1, stageCount), focus: 'Fault handling' },
        ],
      },
    };
  }

  if (toolName === 'return_fault_and_reference') {
    return {
      faultScenarioCampaign: {
        scenarios: Array.from({ length: 20 }, (_, i) => ({
          id: `fs${i + 1}`,
          symptomDescription: `Fault symptom ${i + 1}`,
          injectedIssues: ['Sensor drift'],
          compound: i % 3 === 0,
          difficulty: i < 7 ? 'beginner' : i < 14 ? 'intermediate' : 'advanced',
          expectedReasoningPath: ['Observe symptom', 'Identify likely cause'],
          successCriteria: ['Apply safe control'],
          scoreRange: { min: 0, max: 100 },
        })),
      },
      fieldReferenceCards: Array.from({ length: 5 }, (_, i) => ({
        id: `fr${i + 1}`,
        title: `Field card ${i + 1}`,
        purpose: 'Quick reference',
        checklist: ['Check status', 'Verify control', 'Confirm outcome'],
        preventsMistake: 'Skipping verification',
      })),
    };
  }

  if (toolName === 'return_builder_and_capstone') {
    return {
      builderExercises: Array.from({ length: 4 }, (_, i) => ({
        id: `be${i + 1}`,
        title: `Builder exercise ${i + 1}`,
        templateType: 'sequence',
        paletteItems: ['A', 'B', 'C'],
        requiredSlots: ['slot1', 'slot2'],
        validationLogic: 'Exact sequence match',
        testCases: [
          { id: `tc${i + 1}a`, input: 'A->B', expected: 'pass' },
          { id: `tc${i + 1}b`, input: 'B->A', expected: 'fail' },
        ],
      })),
      capstoneChallenge: {
        title: 'Capstone',
        requiredMissionIds: ['m1'],
        optionalBonusMissionIds: ['m2'],
        scoringRubric: [
          { criterion: 'Safety', weight: 40, description: 'Safe choices' },
          { criterion: 'Accuracy', weight: 35, description: 'Correct diagnosis' },
          { criterion: 'Efficiency', weight: 25, description: 'Reasonable speed' },
        ],
        guidanceBands: [
          { band: 'Developing', minScore: 0, maxScore: 49, guidance: 'Needs coaching' },
          { band: 'Competent', minScore: 50, maxScore: 79, guidance: 'Acceptable performance' },
          { band: 'Advanced', minScore: 80, maxScore: 100, guidance: 'High confidence' },
        ],
        reportFields: ['summary', 'decisions', 'errors', 'remediation', 'signoff'],
      },
      progressionScoringRules: {
        missionScoring: 'Sum branch scores',
        faultCampaignScoring: 'Average scenario score',
        stageProgression: 'Pass threshold by stage',
        capstonePassThreshold: 70,
      },
      implementationNotes: {
        dataModelNotes: ['Use stable IDs'],
        renderingHints: ['Display feedback inline'],
        idConventions: ['prefix-type-index'],
      },
    };
  }

  if (toolName === 'return_theme_shell') {
    return {
      themeShell: {
        id: 'mock-theme',
        title: 'Mock Training',
        icon: 'shield',
        shortDescription: 'Mock shell',
        description: 'Mock theme shell for smoke runs',
        suggestedAccentColor: 'amber',
        flags: {
          hasSimulator: true,
          hasPlacement: true,
          hasAdaptiveReview: true,
        },
        terms: {
          primaryDiscipline: 'Compliance',
          simulatorLabel: 'Simulator',
        },
      },
    };
  }

  if (toolName === 'repair_claim') {
    return { verdict: 'supported', rationale: 'Supported by source context', sourceIds: ['src1'] };
  }
  if (toolName === 'attribute_claim') {
    return { sourceIds: ['src1'] };
  }
  if (toolName.startsWith('return_fixed_')) {
    // Used by generic repair flow; return an empty object and let schema validate
    // against the caller-provided schema shape where possible.
    return {};
  }
  if (toolName === 'return_critique_verdict') {
    return {
      qualityScore: 92,
      requiresRevision: false,
      issues: [],
      repairPriorities: [],
    };
  }
  if (toolName === 'return_source_discovery') {
    return { discoveredSources: [] };
  }
  if (toolName === 'return_preflight') {
    return { clearEnough: true, issues: [] };
  }

  throw new Error(`Mock client has no fixture for tool "${toolName}"`);
}

async function mockStreamText(request: AIStreamRequest): Promise<AIStreamResult> {
  const text = 'mock-stream';
  request.onChunk(text);
  return { fullText: text, inputTokens: 5, outputTokens: 5 };
}

async function mockCallStructuredJson<TSchema extends ZodTypeAny>(
  request: AIStructuredRequest<TSchema>
): Promise<AIStructuredResult<TSchema>> {
  const fixture = makeMockStructuredOutput(request.toolName, {
    system: request.system,
    user: request.user,
  });
  const validated = request.schema.safeParse(fixture);
  if (!validated.success) {
    const first = validated.error.issues[0];
    throw new Error(`Mock fixture invalid for ${request.toolName}: ${first?.path.join('.') ?? '(root)'} ${first?.message ?? ''}`);
  }
  return {
    parsed: validated.data as TSchema['_output'],
    rawOutput: JSON.stringify(validated.data),
    inputTokens: 20,
    outputTokens: 30,
  };
}

export function createMockAIClient(): AIClient {
  return {
    providerId: 'mock',
    streamText: mockStreamText,
    callStructuredJson: mockCallStructuredJson,
  };
}

