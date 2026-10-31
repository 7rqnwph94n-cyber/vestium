import { z } from 'zod';

export const trainingQuestionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['mcq', 'tf', 'verbal']),
  prompt: z.string().min(1),
  intent: z.enum(['application', 'knowledge']).optional(),
  options: z.array(z.string()).optional(),
  answer: z.union([z.string(), z.boolean()]).optional(),
  explanation: z.string().min(1),
  regulatoryRef: z.string().optional(),
  timerSeconds: z.number().int().min(15).max(300).optional(),
  triggerScrollPct: z.number().min(0).max(1).optional(),
  expectedKeywords: z.array(z.string().min(2)).max(12).optional(),
  minKeywordHits: z.number().int().min(1).max(12).optional(),
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
  quiz: z.array(trainingQuestionSchema).min(1)
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

export const blueprintOutputSchema = z.object({
  blueprint: z.array(z.object({
    id: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().min(1),
    stageObjective: z.string().min(1),
    prerequisiteCompetencies: z.array(z.string()),
    lessonTitles: z.array(z.string()),
    testQuestionCount: z.number().int(),
    learningArc: z.enum(['conceptual-first', 'procedural-first', 'diagnostic-focus'])
  }))
});

export const stageLessonsOutputSchema = z.object({
  stage: trainingStageBaseSchema.extend({
    lessons: z.array(trainingLessonSchema)
  })
});

export const stageTestOutputSchema = z.object({
  test: z.array(trainingQuestionSchema)
});

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
    lessonId: z.string().min(1),
    missionIds: z.array(z.string()).min(1),
    rationale: z.string().min(1)
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

export const factCheckOutputSchema = z.object({
  factCheck: z.object({
    items: z.array(z.object({
      id: z.string().min(1),
      claim: z.string().min(1),
      relatedItemId: z.string().min(1),
      relatedItemType: z.enum(['lesson', 'mission', 'placement', 'general']),
      sourceIds: z.array(z.string()),
      verdict: z.enum(['supported', 'unsupported', 'ambiguous', 'disputed']),
      severity: z.enum(['low', 'medium', 'high', 'regulatory']),
      rationale: z.string().min(1)
    })),
    summary: z.object({
      supported: z.number().int().nonnegative(),
      unsupported: z.number().int().nonnegative(),
      ambiguous: z.number().int().nonnegative()
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
