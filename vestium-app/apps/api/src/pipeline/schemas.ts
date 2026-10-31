import { z } from 'zod';

export const trainingQuestionSchema = z.object({
  id: z.string().min(1),
  type: z.preprocess(
    (v) => {
      const raw = String(v ?? '').trim().toLowerCase();
      if (['mcq', 'multiple-choice', 'multiple_choice', 'multiple choice'].includes(raw)) return 'mcq';
      if (['tf', 'true_false', 'true-false', 'true/false', 'boolean'].includes(raw)) return 'tf';
      if (['verbal', 'oral', 'spoken', 'voice'].includes(raw)) return 'verbal';
      return 'mcq';
    },
    z.enum(['mcq', 'tf', 'verbal'])
  ),
  prompt: z.string().min(1),
  intent: z.enum(['application', 'knowledge']).optional(),
  options: z.array(z.string()).nullish(),                 // LLM sometimes emits null for TF questions
  answer: z.union([z.string(), z.boolean()]).optional(),  // optional for verbal
  explanation: z.string().min(1),
  regulatoryRef: z.string().optional(),
  timerSeconds: z.number().int().min(15).max(300).optional(),
  triggerScrollPct: z.number().min(0).max(1).optional(),
  expectedKeywords: z.array(z.string().min(2)).max(12).optional(),
  minKeywordHits: z.number().int().min(1).max(12).optional(),
}).transform((q) => {
  // Auto-repair: if answer nearly matches an option (shared prefix ≥ 20 chars),
  // snap it to the exact option string so the strict check below passes.
  // Handles the common LLM failure of paraphrasing the tail of the correct option.
  if (q.type === 'mcq' && q.options && q.options.length > 0 && q.answer !== undefined) {
    const answerStr = String(q.answer);
    const opts = q.options.filter((o): o is string => typeof o === 'string');
    if (opts.length > 0 && !opts.includes(answerStr)) {
      const repaired = opts.find((o) => {
        const checkLen = Math.min(answerStr.length, o.length, 30);
        return checkLen >= 20 && answerStr.slice(0, checkLen) === o.slice(0, checkLen);
      });
      if (repaired) return { ...q, answer: repaired };
    }
  }
  return q;
}).superRefine((q, ctx) => {
  // For MCQ questions, the answer must be one of the provided options.
  // This catches the LLM "self-correcting in the explanation" failure mode where
  // it picks the wrong option then contradicts itself in the explanation text.
  if (q.type === 'mcq' && q.options && q.options.length > 0 && q.answer !== undefined) {
    const answerStr = String(q.answer);
    const opts = q.options.filter((o): o is string => typeof o === 'string');
    if (opts.length > 0 && !opts.includes(answerStr)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer'],
        message: `MCQ answer "${answerStr.slice(0, 80)}" is not one of the provided options. ` +
          `Options are: ${opts.map((o) => `"${o.slice(0, 50)}"`).join(' | ')}. ` +
          `The answer field must exactly match one of the option strings.`,
      });
    }
  }
  if (q.type === 'verbal') {
    if (!q.timerSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timerSeconds'],
        message: 'Verbal question must include timerSeconds (recommended: 60).',
      });
    }
    if (typeof q.triggerScrollPct !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['triggerScrollPct'],
        message: 'Verbal question must include triggerScrollPct (recommended: 0.55).',
      });
    }
    if (!Array.isArray(q.expectedKeywords) || q.expectedKeywords.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedKeywords'],
        message: 'Verbal question must include at least 3 expectedKeywords for transcript scoring.',
      });
    }
    if (typeof q.minKeywordHits !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minKeywordHits'],
        message: 'Verbal question must include minKeywordHits.',
      });
    } else if (Array.isArray(q.expectedKeywords) && q.minKeywordHits > q.expectedKeywords.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minKeywordHits'],
        message: 'minKeywordHits cannot exceed expectedKeywords length.',
      });
    }
  }
});

export const practiceActivitySchema = z.object({
  type: z.enum(['ordering', 'scenario', 'mcq']),
  prompt: z.string().min(1),
  options: z.array(z.string()).min(2),
  answer: z.union([z.array(z.string()), z.string()]),
  feedback: z.string().min(1)
});

export const lessonDiagramSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(['flow', 'rung', 'io', 'timeline', 'image']),
  nodes: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).default([]),
  imageUrl: z.string().url().optional(),
  alt: z.string().min(1).optional(),
  caption: z.string().min(1).optional(),
  attribution: z.object({
    sourceName: z.string().min(1),
    sourceUrl: z.string().url(),
    creator: z.string().min(1).optional(),
    licenseName: z.string().min(1),
    licenseUrl: z.string().url().optional(),
    rightsStatus: z.enum(['public-domain', 'cc0', 'other']).optional(),
    verifiedOn: z.string().min(1).optional(),
    verificationNotes: z.string().min(1).optional()
  }).optional()
});

export const trainingLessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  situationHook: z.string().min(1).optional(),
  concept: z.array(z.string()).min(1),
  diagrams: z.array(lessonDiagramSchema).min(1),
  workedExample: z.string().min(1),
  youTry: practiceActivitySchema,
  quiz: z.array(trainingQuestionSchema).min(1).superRefine((questions, ctx) => {
    // Reject duplicate question IDs — each question must be uniquely addressable.
    const seenIds = new Set<string>();
    // Reject near-duplicate prompts (first 100 chars) — catches the LLM re-asking
    // the same question with slightly different option wording.
    const seenPromptKeys = new Set<string>();
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (seenIds.has(q.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'id'],
          message: `Duplicate question ID "${q.id}" — every question in the quiz must have a unique id.`,
        });
      }
      seenIds.add(q.id);
      const key = q.prompt.slice(0, 100).toLowerCase().replace(/\s+/g, ' ');
      if (seenPromptKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'prompt'],
          message: `Duplicate question prompt detected (first 100 chars match a prior question). ` +
            `Replace this with a distinct question covering a different regulatory point.`,
        });
      }
      seenPromptKeys.add(key);
    }
  })
});

export const trainingStageBaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().min(1),
  stageObjective: z.string().optional(),
  prerequisiteCompetencies: z.array(z.string()).optional()
});

export const trainingMissionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  whyItMatters: z.string().optional(),
  stageMin: z.number().int().optional(),
  stageMax: z.number().int().optional(),
  branches: z.array(z.object({
    choice: z.string().min(1),
    outcome: z.string().min(1),
    score: z.number(),
    feedback: z.string().min(1)
  })).optional()
});

// ─── Lesson template ─────────────────────────────────────────────────────────

export const lessonTemplateSchema = z.enum([
  'regulatory-framework',
  'procedural',
  'risk-assessment',
  'emergency-response',
  'induction',
]);

export const blueprintLessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  // .catch() — LLMs occasionally return a non-enum value (e.g. 'compliance-framework').
  // Fall back to 'regulatory-framework' rather than failing the whole blueprint step.
  template: lessonTemplateSchema.catch('regulatory-framework'),
  templateReason: z.string().min(1).catch(''),
});

export const blueprintOutputSchema = z.object({
  blueprint: z.array(z.object({
    // z.coerce handles cases where the model returns id as a string ("1" → 1).
    id: z.coerce.number().int().positive(),
    title: z.string().min(1),
    description: z.string().min(1),
    stageObjective: z.string().min(1),
    prerequisiteCompetencies: z.array(z.string()).catch([]),
    lessons: z.array(blueprintLessonSchema),
    // z.coerce handles "8" → 8 and .catch(6) handles non-numeric values.
    testQuestionCount: z.coerce.number().int().positive().catch(6),
    // .catch() — LLMs occasionally return a non-enum value (e.g. 'knowledge-first').
    learningArc: z.enum(['conceptual-first', 'procedural-first', 'diagnostic-focus']).catch('conceptual-first')
  }))
});

// ─── Domain survey output (Phase 0 intelligence) ─────────────────────────────

export const groundTruthThresholdSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  unit: z.string().min(1),
  source: z.string().min(1),
});

export const domainSurveyOutputSchema = z.object({
  domainSurvey: z.object({
    // .catch([]) — if the model returns a partial response (e.g. missing a field
    // or returning null), fall back to an empty array rather than failing the whole
    // domainSurvey step. Downstream steps can still run with reduced ground truth.
    mandatoryTopics: z.array(z.string()).min(1).catch([]),
    commonMisconceptions: z.array(z.string()).min(1).catch([]),
    enforcementPriorities: z.array(z.string()).min(1).catch([]),
    criticalNumericThresholds: z.array(groundTruthThresholdSchema).catch([]),
    keyDutyHolders: z.array(z.string()).min(1).catch([]),
    controlHierarchySteps: z.array(z.string()).min(1).catch([]),
    regulatoryRefs: z.array(z.string()).catch([]),
  }),
});

// ─── Coherence pass output (Phase 3) ─────────────────────────────────────────

export const coherencePassOutputSchema = z.object({
  coherencePass: z.object({
    contradictions: z.array(z.object({
      stageA: z.string().min(1),
      stageB: z.string().min(1),
      description: z.string().min(1),
      severity: z.enum(['error', 'warning']).catch('warning'),
    })),
    duplicateCoverage: z.array(z.object({
      stageA: z.string().min(1),
      stageB: z.string().min(1),
      topic: z.string().min(1),
    })),
    regulatoryArcGaps: z.array(z.string()),
    templateConsistencyIssues: z.array(z.string()),
    overallCoherent: z.boolean(),
    repairInstructions: z.array(z.string()),
  }),
});

export const stageLessonsOutputSchema = z.object({
  stage: trainingStageBaseSchema.extend({
    lessons: z.array(trainingLessonSchema)
  })
});

export const stageTestOutputSchema = z.preprocess((input) => {
  // Deep-search helper: find the first array of question-like objects anywhere in the tree.
  function findQuestionArray(node: unknown, depth: number): unknown[] | null {
    if (depth > 4) return null;
    if (Array.isArray(node) && node.length > 0 && typeof node[0] === 'object' && node[0] !== null) {
      // Looks like a questions array if items have prompt/id/type keys
      const first = node[0] as Record<string, unknown>;
      if ('prompt' in first || 'id' in first || 'type' in first || 'question' in first) {
        return node;
      }
    }
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const val of Object.values(node as Record<string, unknown>)) {
        const found = findQuestionArray(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  if (Array.isArray(input)) {
    return { test: input };
  }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    // Already has a valid test array — pass through
    if (Array.isArray(obj.test) && obj.test.length > 0) return input;
    // Direct key matches
    if (Array.isArray(obj.questions)) return { ...obj, test: obj.questions };
    if (Array.isArray(obj.quiz)) return { ...obj, test: obj.quiz };
    // Nested stageTest / stage_test wrapper (camel or snake case)
    for (const wrapperKey of ['stageTest', 'stage_test', 'stageTestOutput', 'stage_test_output']) {
      const nested = obj[wrapperKey];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const inner = nested as Record<string, unknown>;
        if (Array.isArray(inner.test)) return { ...obj, test: inner.test };
        if (Array.isArray(inner.questions)) return { ...obj, test: inner.questions };
        if (Array.isArray(inner.quiz)) return { ...obj, test: inner.quiz };
      }
    }
    // Fallback 1: find any top-level key whose value is an array of objects
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        return { ...obj, test: val, _recoveredFrom: key };
      }
    }
    // Fallback 2: deep search for a question-like array anywhere in the tree
    const deepFound = findQuestionArray(input, 0);
    if (deepFound) {
      return { test: deepFound, _recoveredFrom: 'deep-search' };
    }
  }
  return input;
}, z.object({
  test: z.array(trainingQuestionSchema)
}));

export const missionsOutputSchema = z.object({
  missions: z.array(trainingMissionSchema)
});

export const placementAssessmentOutputSchema = z.object({
  placementAssessment: z.object({
    title: z.string().optional(),
    quizTitle: z.string().optional(),
    introText: z.string().optional(),
    completedResultLabel: z.string().optional(),
    recommendedStartTitle: z.string().optional(),
    recommendedStartHint: z.string().optional(),
    questions: z.array(trainingQuestionSchema),
    recommendationThresholds: z.array(z.object({
      minScore: z.number().int(),
      stage: z.number().int()
    }))
  })
});

export const lessonMissionMapOutputSchema = z.object({
  lessonMissionMap: z.record(z.object({
    lessonId: z.string().catch(''),
    missionIds: z.array(z.string()).catch([]),
    rationale: z.string().catch('')
  }))
});

export const sourceAttributionOutputSchema = z.object({
  sourceCatalog: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    notes: z.string().optional(),
    publisher: z.string().optional(),
    reliability: z.enum(['authoritative', 'reputable', 'secondary']).optional(),
    year: z.number().int().optional(),
    lastVerified: z.string().optional()
  })),
  citationMap: z.object({
    lessonCitations: z.record(z.array(z.string())),
    missionCitations: z.record(z.array(z.string()))
  })
});

export const sourceDiscoveryOutputSchema = z.object({
  discoveredSources: z.array(z.object({
    title: z.string().min(1),
    url: z.string().url(),
    rationale: z.string().min(1),
    priority: z.enum(['high', 'medium']).optional()
  }))
});

// factCheckItemSchema is shared by factCheckA, factCheckG, and factCheckMerge
export const factCheckItemSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
  relatedItemId: z.string().min(1),
  relatedItemType: z.enum(['lesson', 'mission', 'placement', 'general']),
  sourceIds: z.array(z.string()),
  verdict: z.enum(['supported', 'unsupported', 'ambiguous', 'disputed']),
  severity: z.enum(['low', 'medium', 'high', 'regulatory']),
  rationale: z.string().min(1),
  // Set by factCheckMerge — optional on individual model outputs
  anthropicVerdict: z.enum(['supported', 'unsupported', 'ambiguous']).optional(),
  geminiVerdict: z.enum(['supported', 'unsupported', 'ambiguous']).optional(),
  agreementLevel: z.enum(['consensus', 'disputed', 'single-source']).optional(),
});

export const factCheckOutputSchema = z.object({
  factCheck: z.object({
    items: z.array(factCheckItemSchema),
    summary: z.object({
      supported: z.number().int().nonnegative(),
      unsupported: z.number().int().nonnegative(),
      ambiguous: z.number().int().nonnegative(),
      disputed: z.number().int().nonnegative().optional(),
    }).optional()
  })
});

const advancedArtifactsInnerSchema = z.object({
  simulatorDesign: z.object({
    concept: z.string().min(1),
    learnerControls: z.array(z.string().min(1)).min(1),
    stateVariables: z.array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1)
      })
    ).min(3),
    visibleOutcomes: z.array(z.string().min(1)).min(2),
    subsystems: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        purpose: z.string().min(1)
      })
    ).min(2),
    tickModel: z.object({
      model: z.string().min(1),
      stepMs: z.number().int().positive(),
      updateSequence: z.array(z.string().min(1)).min(2)
    }),
    faultInjectionModel: z.object({
      injectableFaultTypes: z.array(z.string().min(1)).min(2),
      examples: z.array(z.string().min(1)).min(2)
    }),
    trainerPanels: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        stageMin: z.number().int().positive(),
        stageMax: z.number().int().positive(),
        focus: z.string().min(1)
      })
    ).min(2)
  }),
  faultScenarioCampaign: z.object({
    scenarios: z.array(
      z.object({
        id: z.string().min(1),
        symptomDescription: z.string().min(1),
        injectedIssues: z.array(z.string().min(1)).min(1),
        compound: z.boolean(),
        difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
        expectedReasoningPath: z.array(z.string().min(1)).min(2),
        successCriteria: z.array(z.string().min(1)).min(1),
        scoreRange: z.object({
          min: z.number().int().min(0).max(100),
          max: z.number().int().min(0).max(100)
        })
      })
    ).length(20)
  }),
  fieldReferenceCards: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      purpose: z.string().min(1),
      checklist: z.array(z.string().min(1)).min(3),
      preventsMistake: z.string().min(1)
    })
  ).length(5),
  builderExercises: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      templateType: z.string().min(1),
      paletteItems: z.array(z.string().min(1)).min(3),
      requiredSlots: z.array(z.string().min(1)).min(2),
      validationLogic: z.string().min(1),
      testCases: z.array(
        z.object({
          id: z.string().min(1),
          input: z.string().min(1),
          expected: z.string().min(1)
        })
      ).min(2).max(3)
    })
  ).length(4),
  capstoneChallenge: z.object({
    title: z.string().min(1),
    requiredMissionIds: z.array(z.string().min(1)).min(1),
    optionalBonusMissionIds: z.array(z.string().min(1)).default([]),
    scoringRubric: z.array(
      z.object({
        criterion: z.string().min(1),
        weight: z.number().int().min(0).max(100),
        description: z.string().min(1)
      })
    ).min(3),
    guidanceBands: z.array(
      z.object({
        band: z.string().min(1),
        minScore: z.number().int().min(0).max(100),
        maxScore: z.number().int().min(0).max(100),
        guidance: z.string().min(1)
      })
    ).min(3),
    reportFields: z.array(z.string().min(1)).min(5)
  }),
  progressionScoringRules: z.object({
    missionScoring: z.string().min(1),
    faultCampaignScoring: z.string().min(1),
    stageProgression: z.string().min(1),
    capstonePassThreshold: z.number().int().min(0).max(100)
  }),
  implementationNotes: z.object({
    dataModelNotes: z.array(z.string().min(1)).min(1),
    renderingHints: z.array(z.string().min(1)).min(1),
    idConventions: z.array(z.string().min(1)).min(1)
  })
});

const ADVANCED_ARTIFACT_REQUIRED_KEYS = [
  'simulatorDesign',
  'faultScenarioCampaign',
  'fieldReferenceCards',
  'builderExercises',
  'capstoneChallenge',
  'progressionScoringRules',
  'implementationNotes'
] as const;

function tryParseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function hasAdvancedArtifactShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return ADVANCED_ARTIFACT_REQUIRED_KEYS.every((key) => key in value);
}

function unwrapAdvancedArtifacts(input: unknown): unknown {
  const normalizedInput = tryParseJsonString(input);
  if (hasAdvancedArtifactShape(normalizedInput)) return normalizedInput;

  const queue: unknown[] = [normalizedInput];
  const seen = new Set<unknown>();
  let fallbackObject: unknown = normalizedInput;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || Array.isArray(current)) continue;
    if (seen.has(current)) continue;
    seen.add(current);

    if (hasAdvancedArtifactShape(current)) return current;
    fallbackObject = current;

    for (const value of Object.values(current as Record<string, unknown>)) {
      const parsed = tryParseJsonString(value);
      if (hasAdvancedArtifactShape(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') queue.push(parsed);
    }
  }

  return fallbackObject;
}

export const advancedArtifactsOutputSchema = z.preprocess((input) => {
  return unwrapAdvancedArtifacts(input);
}, advancedArtifactsInnerSchema).transform((advancedArtifacts) => ({
  advancedArtifacts
}));

// ─── Split advanced artifact schemas (simulatorDesign / faultAndReference / builderAndCapstone) ─

export const simulatorDesignOutputSchema = z.object({
  simulatorDesign: z.object({
    concept: z.string().min(1),
    learnerControls: z.array(z.string().min(1)).min(1),
    stateVariables: z.array(
      z.object({ name: z.string().min(1), description: z.string().min(1) })
    ).min(3),
    visibleOutcomes: z.array(z.string().min(1)).min(2),
    subsystems: z.array(
      z.object({ id: z.string().min(1), title: z.string().min(1), purpose: z.string().min(1) })
    ).min(2),
    tickModel: z.object({
      model: z.string().min(1),
      stepMs: z.number().int().positive(),
      updateSequence: z.array(z.string().min(1)).min(2)
    }),
    faultInjectionModel: z.object({
      injectableFaultTypes: z.array(z.string().min(1)).min(2),
      examples: z.array(z.string().min(1)).min(2)
    }),
    trainerPanels: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        stageMin: z.number().int().positive(),
        stageMax: z.number().int().positive(),
        focus: z.string().min(1)
      })
    ).min(2)
  })
});

export const faultAndReferenceOutputSchema = z.object({
  faultScenarioCampaign: z.object({
    scenarios: z.array(
      z.object({
        id: z.string().min(1),
        symptomDescription: z.string().min(1),
        injectedIssues: z.array(z.string().min(1)).min(1),
        compound: z.boolean(),
        difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
        expectedReasoningPath: z.array(z.string().min(1)).min(2),
        successCriteria: z.array(z.string().min(1)).min(1),
        scoreRange: z.object({
          min: z.number().int().min(0).max(100),
          max: z.number().int().min(0).max(100)
        })
      })
    ).length(20)
  }),
  fieldReferenceCards: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      purpose: z.string().min(1),
      checklist: z.array(z.string().min(1)).min(3),
      preventsMistake: z.string().min(1)
    })
  ).length(5)
});

export const builderAndCapstoneOutputSchema = z.object({
  builderExercises: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      templateType: z.string().min(1),
      paletteItems: z.array(z.string().min(1)).min(3),
      requiredSlots: z.array(z.string().min(1)).min(2),
      validationLogic: z.string().min(1),
      testCases: z.array(
        z.object({
          id: z.string().min(1),
          input: z.string().min(1),
          expected: z.string().min(1)
        })
      ).min(2).max(3)
    })
  ).length(4),
  capstoneChallenge: z.object({
    title: z.string().min(1),
    requiredMissionIds: z.array(z.string().min(1)).min(1),
    optionalBonusMissionIds: z.array(z.string().min(1)).default([]),
    scoringRubric: z.array(
      z.object({
        criterion: z.string().min(1),
        weight: z.number().int().min(0).max(100),
        description: z.string().min(1)
      })
    ).min(3),
    guidanceBands: z.array(
      z.object({
        band: z.string().min(1),
        minScore: z.number().int().min(0).max(100),
        maxScore: z.number().int().min(0).max(100),
        guidance: z.string().min(1)
      })
    ).min(3),
    reportFields: z.array(z.string().min(1)).min(5)
  }),
  progressionScoringRules: z.object({
    missionScoring: z.string().min(1),
    faultCampaignScoring: z.string().min(1),
    stageProgression: z.string().min(1),
    capstonePassThreshold: z.number().int().min(0).max(100)
  }),
  implementationNotes: z.object({
    dataModelNotes: z.array(z.string().min(1)).min(1),
    renderingHints: z.array(z.string().min(1)).min(1),
    idConventions: z.array(z.string().min(1)).min(1)
  })
});

export const themeShellOutputSchema = z.object({
  themeShell: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    icon: z.string().min(1),
    shortDescription: z.string().min(1),
    description: z.string().min(1),
    suggestedAccentColor: z.enum(['amber', 'sky', 'teal', 'emerald', 'violet', 'rose']),
    flags: z.object({
      hasSimulator: z.boolean(),
      hasPlacement: z.boolean(),
      hasAdaptiveReview: z.boolean()
    }),
    terms: z.object({
      primaryDiscipline: z.string().min(1),
      simulatorLabel: z.string().min(1)
    }),
    labels: z.object({
      dashboardExtensionsTitle: z.string().optional(),
      ladderBuilderTitle: z.string().optional(),
      faultCampaignTitle: z.string().optional(),
      capstoneTitle: z.string().optional(),
      fieldReferenceTitle: z.string().optional(),
      sourcesTitle: z.string().optional(),
      pidIntroTitle: z.string().optional()
    }).optional(),
    tooling: z.object({
      availability: z.object({
        simulator: z.boolean().optional(),
        review: z.boolean().optional(),
        builder: z.boolean().optional(),
        faultCampaign: z.boolean().optional(),
        pidIntro: z.boolean().optional(),
        capstone: z.boolean().optional()
      }).optional(),
      artifacts: z.object({
        simulator: z.boolean().optional(),
        review: z.boolean().optional(),
        builder: z.boolean().optional(),
        faultCampaign: z.boolean().optional(),
        pidIntro: z.boolean().optional(),
        capstone: z.boolean().optional()
      }).optional(),
      stagePlans: z.array(z.object({
        stageId: z.number().int().positive(),
        primaryTool: z.enum(['simulator', 'review', 'builder', 'faultCampaign', 'pidIntro', 'capstone']),
        supportingTools: z.array(z.enum(['simulator', 'review', 'builder', 'faultCampaign', 'pidIntro', 'capstone'])).optional(),
        rationale: z.string().min(1)
      })).optional()
    }).optional()
  })
});

export const critiqueVerdictSchema = z.object({
  qualityScore: z.number().min(0).max(100),
  requiresRevision: z.boolean(),
  issues: z.array(z.object({
    rule: z.string().min(1),
    message: z.string().min(1),
    severity: z.enum(['error', 'warning']).optional()
  })),
  repairPriorities: z.array(z.string()).optional()
});

export const aiValidationReviewSchema = z.object({
  findings: z.array(z.object({
    severity: z.enum(['error', 'warning']),
    rule: z.string().min(1),
    path: z.string().min(1),
    message: z.string().min(1)
  })).max(24),
  summary: z.object({
    factualAccuracy: z.number().min(0).max(100),
    pedagogicalSoundness: z.number().min(0).max(100),
    objectiveAlignment: z.number().min(0).max(100),
    notes: z.string().optional()
  }).optional()
});

export const moduleReviewReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  scaffoldingScore: z.number().min(0).max(100),
  publishReadyScore: z.number().min(0).max(100),
  verdict: z.enum([
    'must-have killer app in niche',
    'strong contender',
    'solid good enough',
    'niche specialized',
    'has potential not there yet',
    'below average hard to recommend'
  ]),
  oneSentenceRecommendation: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1).max(8),
  criticalFindings: z.array(
    z.object({
      severity: z.enum(['error', 'warning']),
      title: z.string().min(1),
      evidencePath: z.string().min(1),
      message: z.string().min(1),
      recommendation: z.string().min(1)
    })
  ).max(12),
  priorities: z.array(z.string().min(1)).min(1).max(8),
  notes: z.string().optional()
});

export const preflightOutputSchema = z.object({
  clearEnough: z.boolean(),
  issues: z.array(z.string()),
  suggestedImprovement: z.string().optional()
});

// ─── Repair artifacts schemas ─────────────────────────────────────────────────

// Used by repairArtifacts to resolve ambiguous high/regulatory fact-check items
export const repairClaimSchema = z.object({
  id: z.string().min(1),
  verdict: z.enum(['supported', 'unsupported']),  // never ambiguous
  rationale: z.string().min(1),
  sourceIds: z.array(z.string()).optional()
});

// Used by repairArtifacts to attribute source IDs to un-sourced fact-check items
export const attributeClaimSchema = z.object({
  id: z.string().min(1),
  sourceIds: z.array(z.string()).min(1).max(5)
});
