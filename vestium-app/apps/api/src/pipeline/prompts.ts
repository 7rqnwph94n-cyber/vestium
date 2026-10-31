import type { BlueprintStage, GroundTruth, LessonTemplate } from './types.js';
import type { TrainingMission, TrainingStage } from '../lib/training-core/types.js';
import type { DistilledOrgContextDTO } from '@complianceforge/types';

// Each prompt builder returns { system, user } ready to send to the API.
// Every prompt embeds: (1) exact TypeScript interfaces, (2) verbatim controller example, (3) JSON-only instruction.

interface PromptPair {
  system: string;
  user: string;
}

const RULE_FIX_HINTS: Record<string, string> = {
  STAGE_ID_SEQUENTIAL: 'Renumber stage ids to contiguous integers starting at 1.',
  LESSON_ID_FORMAT: 'Use lesson id format "s{stage}-l{index}" (or "<prefix>-s{stage}-l{index}").',
  LESSON_QUIZ_QUESTION_ID_FORMAT: 'Use lesson quiz ids in q{N} format.',
  TEST_QUESTION_ID_FORMAT: 'Use stage test ids in t{N} format.',
  PLACEMENT_QUESTION_ID_FORMAT: 'Use placement ids in p{N} format.',
  DUPLICATE_LESSON_ID: 'Ensure each lesson id is globally unique across all stages.',
  DUPLICATE_QUESTION_ID_WITHIN_LESSON: 'Ensure quiz question ids are unique within each lesson.',
  DUPLICATE_MISSION_ID: 'Ensure each mission id is unique.',
  DUPLICATE_SOURCE_ID: 'Ensure each source id is unique.',
  DUPLICATE_FACT_CHECK_ID: 'Ensure each fact-check item id is unique.',
  REQUIRED_FIELD_MISSING: 'Fill missing required fields with concrete, domain-specific content.',
  MCQ_OPTIONS_PRESENT: 'For MCQ, provide options array with at least 2 items (prefer 3).',
  MCQ_ANSWER_IN_OPTIONS: 'Set MCQ answer to exactly one of the options strings.',
  TF_ANSWER_IS_BOOLEAN: 'Set TF answer as boolean true/false, not a string.',
  ORDERING_ANSWER_IS_PERMUTATION: 'For ordering activities, answer must be an ordered permutation of options.',
  MCQ_ACTIVITY_ANSWER_IN_OPTIONS: 'For scenario/mcq activity, answer must exactly match one option string.',
  MISSION_BRANCHES_REQUIRED: 'Add 3+ branches with choice/outcome/score/feedback populated.',
  MISSION_BRANCH_SCORE_NUMERIC: 'Use numeric scores only.',
  MISSION_BRANCH_SCORE_RANGE: 'Keep branch scores in 0..100.',
  MISSING_SCORE_100_BRANCH: 'Include at least one ideal branch with score 100.',
  MISSING_SCORE_0_BRANCH: 'Include at least one clearly wrong branch with score 0.',
  MISSING_INTERMEDIATE_BRANCH: 'Include at least one partially correct branch scored between 26 and 84.',
  MISSION_STAGE_RANGE_INVALID: 'Ensure stageMax >= stageMin.',
  MISSION_STAGE_BOUNDS: 'Keep stageMin/stageMax within available stage count.',
  PLACEMENT_QUESTIONS_REQUIRED: 'Provide placement questions array with realistic screening content.',
  PLACEMENT_QUESTION_COUNT_INVALID: 'Provide exactly 15 placement questions (p1..p15).',
  PLACEMENT_THRESHOLDS_REQUIRED: 'Provide recommendationThresholds entries with minScore and stage.',
  PLACEMENT_THRESHOLD_SCORE_RANGE: 'Keep minScore integer within 0..100.',
  PLACEMENT_THRESHOLD_STAGE_RANGE: 'Keep threshold stage within module stage bounds.',
  PLACEMENT_STAGE1_FALLBACK_MISSING: 'Add stage 1 fallback threshold (typically minScore 0).',
  SOURCE_CATALOG_EMPTY: 'Provide a non-empty sourceCatalog grounded in provided references.',
  UNKNOWN_SOURCE_ID: 'Replace unknown source ids with ids present in sourceCatalog.',
  LESSON_CITATION_MISSING: 'Add at least one citation per lesson.',
  MISSION_CITATION_MISSING: 'Add at least one citation per mission.',
  FACT_CHECK_SOURCE_IDS_EMPTY: 'Attach source ids for each fact-check item where possible.',
  FACT_CHECK_UNKNOWN_SOURCE_ID: 'Use only source ids that exist in sourceCatalog.',
  FACT_CHECK_UNSUPPORTED_HIGH: 'Either add support evidence or downgrade/remediate the unsafe unsupported claim.',
  FACT_CHECK_UNSUPPORTED_MEDIUM: 'Resolve unsupported medium-risk claims with evidence or safer wording.',
  FACT_CHECK_AMBIGUOUS_HIGH: 'Resolve high-severity ambiguous claims with stronger evidence or safer claim wording.',
  FACT_CHECK_SUMMARY_MISMATCH: 'Ensure fact-check summary counts exactly match items.',
  SOURCE_LAST_VERIFIED_MISSING: 'Add lastVerified date (YYYY-MM-DD) for each source.',
  SOURCE_RELIABILITY_MISSING: 'Set source reliability to authoritative, reputable, or secondary.',
  SOURCE_RELIABILITY_TOO_LOW: 'Replace weak/secondary-heavy sources with more authoritative references.',
  SOURCE_YEAR_OUTDATED: 'Prefer current/recent source editions unless historical context is intentional.',
  LESSON_MISSION_MAP_COVERAGE_OUT_OF_RANGE: 'Map roughly 20-50% of lessons to practical missions; focus on high-value practical skills.',
  LESSON_MISSION_MAP_STAGE_MISMATCH: 'Align mission stage range with the lesson stage and intended learner readiness.',
  LESSON_MISSION_MAP_SEMANTIC_MISMATCH: 'Choose missions whose scenario directly exercises the lesson objective/skill.',
  LESSON_MISSION_MAP_RATIONALE_GENERIC: 'Rationale must explicitly reference both the lesson skill and mission scenario evidence.',
  LESSON_MISSION_MAP_SKILL_MISMATCH: 'Avoid mapping if mission text does not contain the lesson skill domain terms.',
  LESSON_MISSION_MAP_RATIONALE_THIN: 'Expand rationale to explicitly name the practical decision/process being verified.',
  PLACEMENT_THRESHOLDS_COUNT_LOW: 'Provide at least 3 placement thresholds for stable recommendations.',
  PLACEMENT_THRESHOLD_STAGE_MONOTONICITY: 'Ensure descending score thresholds map to same-or-lower stage numbers only.',
  PLACEMENT_THRESHOLD_GAP_TOO_SMALL: 'Increase score spacing between thresholds to reduce unstable placements.',
  PLACEMENT_TOP_THRESHOLD_LOW: 'Raise top threshold so highest stage requires clearly strong performance.',
  CRITICAL_CLAIM_CITATION_DEPTH_LOW: 'Add a second citation for high-impact safety/legal/procedural claims.',
  OBJECTIVE_COVERAGE_LESSON_GAP: 'Add or revise lesson content so this objective is explicitly taught and practiced.',
  OBJECTIVE_COVERAGE_MISSION_GAP: 'Add or revise mission scenarios so this objective is demonstrated under practical decision pressure.',
  OBJECTIVE_TEXT_TOO_VAGUE: 'Rewrite objective with specific action, context, and observable outcome.',
  OBJECTIVE_EVIDENCE_LESSON_MISSING: 'Add explicit lesson content that teaches this objective.',
  OBJECTIVE_EVIDENCE_STAGE_TEST_MISSING: 'Add stage-test items that assess this objective directly.',
  OBJECTIVE_EVIDENCE_MISSION_MISSING: 'Add mission scenarios/branches that operationalize this objective.',
  OBJECTIVE_EVIDENCE_PLACEMENT_WEAK: 'Add placement questions that screen for baseline readiness on this objective.',
  LESSON_CONCEPT_COUNT_INVALID: 'Provide exactly 4 concept paragraphs per lesson.',
  LESSON_DIAGRAM_COUNT_LOW: 'Provide at least 2 diagrams per lesson.',
  LESSON_QUIZ_COUNT_INVALID: 'Provide exactly 4 quiz questions per lesson.',
  FAULT_CAMPAIGN_COUNT_INVALID: 'Provide exactly 20 fault/scenario campaign items.',
  FIELD_REFERENCE_COUNT_INVALID: 'Provide exactly 5 field reference cards.',
  BUILDER_EXERCISE_COUNT_INVALID: 'Provide exactly 4 builder exercises.',
  SYNTHETIC_PLACEMENT_PROFILE_MISMATCH: 'Adjust placement thresholds so novice/developing/advanced archetypes map to plausible stages.',
  SYNTHETIC_PROFILE_NO_ACCESSIBLE_MISSIONS: 'Ensure each plausible entry stage has at least one accessible mission.',
  SYNTHETIC_PROFILE_ORDER_INVALID: 'Fix threshold ordering so stronger profiles always map to higher stages than weaker profiles.',
  IMAGE_URL_REQUIRED: 'For image diagrams, provide a direct http(s) imageUrl.',
  IMAGE_URL_FORMAT: 'Use only valid http(s) URLs for image diagrams.',
  IMAGE_ALT_REQUIRED: 'Provide concise alt text describing the educational visual.',
  IMAGE_CAPTION_REQUIRED: 'Provide caption with context and learning intent.',
  IMAGE_ATTRIBUTION_REQUIRED: 'Include sourceName, sourceUrl, and licenseName for image attribution.',
  IMAGE_ATTRIBUTION_URL_FORMAT: 'Use valid http(s) attribution URLs.',
  IMAGE_RIGHTS_STATUS_MISSING: 'Set rightsStatus to public-domain, cc0, or other.',
  IMAGE_LICENSE_REVIEW_REQUIRED: 'Prefer public-domain/cc0; otherwise flag for manual license review.',
  LESSON_QUIZ_APPLICATION_RATIO_LOW: 'Increase lesson application/decision items to 40-50% of quiz questions.',
  LESSON_QUIZ_APPLICATION_RATIO_HIGH: 'Reduce lesson application/decision items so they stay near 40-50% and retain recall balance.',
  STAGE_TEST_APPLICATION_RATIO_LOW: 'Increase stage-test application/decision items to 40-50% of questions.',
  STAGE_TEST_APPLICATION_RATIO_HIGH: 'Reduce stage-test application/decision items so they stay near 40-50% and retain concept checks.',
  STAGE_TEST_SCOPE_MISMATCH: 'Do not test concepts/terms not explicitly taught in stage lessons.',
  PLACEMENT_SINGLE_STAGE_READINESS_ONLY: 'For 1-stage modules, frame placement as readiness diagnostics or disable it.'
};

function buildRuleRepairChecklist(errors: Array<{ rule: string; message: string }>): string {
  const uniqueRules = Array.from(new Set(errors.map((e) => e.rule))).filter(Boolean);
  if (uniqueRules.length === 0) return '- No specific validator rule IDs provided.';
  return uniqueRules
    .map((rule) => {
      const hint = RULE_FIX_HINTS[rule] ?? 'Apply validator rule semantics exactly and preserve instructional quality.';
      return `- ${rule}: ${hint}`;
    })
    .join('\n');
}

// ─── Org context injection helper ────────────────────────────────────────────
// Builds an XML-tagged block from the distilled org context for injection into
// generation prompts. Contains covered topics, reviewer corrections, and domain
// insights from previously deployed modules.

export function buildOrgContextBlock(ctx: DistilledOrgContextDTO | undefined): string {
  if (!ctx) return '';
  // Guard: empty JSONB default from DB is `{}` — all arrays will be undefined
  if (!ctx.moduleSummaries && !ctx.coveredTopics && !ctx.reviewerCorrections) return '';

  const sections: string[] = [];

  if (ctx.moduleSummaries?.length > 0) {
    const summaries = ctx.moduleSummaries.map(
      (m) => `  - "${m.title}" (deployed ${m.deployedAt?.slice(0, 10) ?? 'unknown'}): ${m.stageTopics.join(', ') || 'no topics extracted'}`
    ).join('\n');
    sections.push(`<PRIOR_MODULES>\n${summaries}\n</PRIOR_MODULES>`);
  }

  if (ctx.coveredTopics?.length > 0) {
    sections.push(`<COVERED_TOPICS>\nThese topics have already been covered in prior modules. Avoid repeating them — build on them instead.\n${ctx.coveredTopics.map((t) => `  - ${t}`).join('\n')}\n</COVERED_TOPICS>`);
  }

  if (ctx.coveredRegulations?.length > 0) {
    sections.push(`<COVERED_REGULATIONS>\nThese regulations have already been addressed:\n${ctx.coveredRegulations.map((r) => `  - ${r}`).join('\n')}\n</COVERED_REGULATIONS>`);
  }

  if (ctx.reviewerCorrections?.length > 0) {
    const corrections = ctx.reviewerCorrections.map(
      (c) => `  - [${c.disposition.toUpperCase()}] ${c.finding}${c.regulatoryRef ? ` (${c.regulatoryRef})` : ''} — Reviewer rationale: "${c.rationale}"`
    ).join('\n');
    sections.push(`<REVIEWER_CORRECTIONS>\nIMPORTANT: These are corrections from the organisation's competent person (MHSWR Reg 7 appointed reviewer). Treat these as hard constraints — they represent authoritative domain knowledge for this workplace.\n${corrections}\n</REVIEWER_CORRECTIONS>`);
  }

  if (ctx.domainInsights?.length > 0) {
    sections.push(`<DOMAIN_INSIGHTS>\n${ctx.domainInsights.map((i) => `  - ${i}`).join('\n')}\n</DOMAIN_INSIGHTS>`);
  }

  if (sections.length === 0) return '';
  return `\n<ORG_CONTEXT>\n${sections.join('\n\n')}\n</ORG_CONTEXT>\n`;
}

// ─── Ground truth injection helper ───────────────────────────────────────────
// Formats Phase 0 domainSurvey output as a <DOMAIN_GROUND_TRUTH> block for
// injection into blueprint and stageLesson prompts.

function buildGroundTruthBlock(gt: GroundTruth): string {
  const thresholds = gt.criticalNumericThresholds.length > 0
    ? gt.criticalNumericThresholds.map(
        (t) => `  - ${t.name}: ${t.value} ${t.unit} (${t.source})`
      ).join('\n')
    : '  (none identified for this domain)';

  return `<DOMAIN_GROUND_TRUTH>
MANDATORY TOPICS (every module MUST cover all of these):
${gt.mandatoryTopics.map((t) => `  - ${t}`).join('\n')}

COMMON LEARNER MISCONCEPTIONS (address each explicitly in lesson content):
${gt.commonMisconceptions.map((m) => `  - ${m}`).join('\n')}

CURRENT HSE ENFORCEMENT PRIORITIES:
${gt.enforcementPriorities.map((p) => `  - ${p}`).join('\n')}

HARD NUMERIC THRESHOLDS (cite these exact values — do not approximate):
${thresholds}

KEY DUTY HOLDERS:
${gt.keyDutyHolders.map((d) => `  - ${d}`).join('\n')}

CONTROL HIERARCHY (for this domain — apply in this order):
${gt.controlHierarchySteps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}

PRIMARY REGULATORY REFERENCES:
${gt.regulatoryRefs.map((r) => `  - ${r}`).join('\n')}
</DOMAIN_GROUND_TRUTH>`;
}

// ─── Lesson template rules injection ─────────────────────────────────────────
// Returns the structural content rules for a given lesson template.
// Injected into stageLesson prompts alongside the standard rules.

function buildTemplateRules(template: LessonTemplate): string {
  switch (template) {
    case 'regulatory-framework':
      return `LESSON TEMPLATE: regulatory-framework
This lesson covers legislation, duties, or regulatory framework. Required structure:
1. WHO IT APPLIES TO — duty holder identification and scope statement (include jurisdiction).
2. WHAT THE LAW REQUIRES — present key duties as a structured table or clear numbered list:
   Regulation | Duty | Duty Holder | Evidence Required
3. WORKED EXAMPLE — specific scenario in the learner's exact workplace context demonstrating compliance.
4. ENFORCEMENT LANDSCAPE — include real HSE statistics, a recent enforcement case outcome, or penalty range.
5. COMPLIANCE CHECKLIST — checklist items mapped explicitly to regulation paragraph numbers.
QUIZ STRATEGY: scenario-based questions (not pure recall). At least 2 of 4 must be:
  "Under Reg X, when [situation occurs], the [duty holder] must..." or
  "Which of the following would satisfy the requirement under [Reg] for [duty]?"`;

    case 'procedural':
      return `LESSON TEMPLATE: procedural
This lesson covers a step-by-step operation, inspection, or maintenance procedure. Required structure:
1. LEGAL BASIS — one sentence stating why this procedure is legally required (cite the Reg).
2. PRE-TASK SAFETY CHECK — ordered checklist (physical items to verify before starting).
3. STEP-BY-STEP PROCEDURE — numbered, action-verb led steps. Each step: what to do, what to observe, what constitutes a stop-work condition.
4. DEVIATION CONSEQUENCE TABLE — present as a table: Deviation | Potential Risk | Regulatory Consequence.
5. SIGN-OFF AND RECORDS — what evidence must be created, by whom, and for how long retained.
QUIZ STRATEGY: application questions. At least 2 of 4 must be:
  "At step [N] you observe [X]. The correct action is..." or
  "Which deviation from procedure would constitute a LOLER / PUWER / COSHH breach?"`;

    case 'risk-assessment':
      return `LESSON TEMPLATE: risk-assessment
This lesson covers hazard identification, risk rating, or control hierarchy application. Required structure:
1. RISK RATING METHOD — explain the likelihood × severity matrix used in this domain. State what score triggers mandatory controls.
2. HAZARD IDENTIFICATION WALKTHROUGH — specific to the learner's workplace operations, not generic lists.
3. CONTROL HIERARCHY APPLICATION — worked example showing the full hierarchy: Elimination → Substitution → Engineering Controls → Administrative Controls → PPE. Show WHY higher-order controls were considered before reaching PPE.
4. COMPLETED RISK ASSESSMENT EXAMPLE — for the exact workplace context given. Include likelihood score, severity score, risk rating, and selected controls.
5. REVIEW TRIGGERS — what events require the risk assessment to be reviewed (change of task, near-miss, new equipment, periodic review interval).
QUIZ STRATEGY: hazard-spotting and control-selection scenarios. At least 2 of 4 must present a hazard scenario and ask learners to identify the appropriate control tier or identify a missing control.`;

    case 'emergency-response':
      return `LESSON TEMPLATE: emergency-response
This lesson covers time-critical emergency response procedures. Required structure:
1. TRIGGER CONDITIONS — unambiguous criteria for when this emergency response activates. No grey areas.
2. RESPONSE DECISION TREE — structured as: Initial Trigger → First Action → Branch Conditions → Escalation Path. Presented as numbered decision steps, not prose.
3. ROLE ASSIGNMENTS — who does what in the first 5 minutes. Assign by role title (not individual name). Include primary responder, site contact, and emergency services liaison.
4. COMMUNICATION AND RIDDOR — when does this incident require RIDDOR notification? What must be reported, to whom, and within what timeframe?
5. RECOVERY AND DEBRIEF — scene preservation, evidence retention, return-to-work criteria, debrief requirements.
QUIZ STRATEGY: decision-under-pressure questions. At least 2 of 4 must present an emergency scenario and ask for the FIRST correct action (not a general knowledge question).`;

    case 'induction':
      return `LESSON TEMPLATE: induction
This lesson covers site-specific rules, policy, welfare arrangements, or organisational culture. Required structure:
1. POLICY STATEMENT — what the organisation's policy is and why it exists.
2. SITE/WORKPLACE SPECIFIC RULES — rules that apply specifically to this operation (not generic H&S generalities).
3. WELFARE ARRANGEMENTS — first aid provision, sanitation, rest facilities, drinking water — mapped to legal minimums.
4. REPORTING RESPONSIBILITIES — who to report hazards/incidents to, how, and by when. Include RIDDOR reportable categories.
5. CULTURAL EXPECTATIONS — what behaviours are expected; what the consequences of non-compliance are.
QUIZ STRATEGY: scenario and knowledge mix. At least 1 question must test reporting responsibilities; at least 1 must test a site-specific rule.`;

    default:
      return '';
  }
}

// ─── Domain classification + reference examples ───────────────────────────────
// Classifies the domain from keyword matching and returns a domain-appropriate
// reference example for each section type, preventing PLC-specific content from
// bleeding into unrelated domains (HVAC, customer service, history, cooking, etc.).

type DomainClass = 'technical' | 'interpersonal' | 'academic' | 'creative';

function classifyDomain(domainPrompt: string): DomainClass {
  const d = domainPrompt.toLowerCase();
  const technical = /electrical|hvac|mechanical|plumbing|welding|hydraulic|automotive|engineering|maintenance|repair|fault|diagnostic|calibrat|install|commission|wiring|circuit|motor|valve|pump|conveyor|sensor|automation|control|industrial|manufactur|machin|forklift|crane|boiler|pneumatic|refrigerant|compressor|instrument|process|chemical|construction|structural|network|server|data.?centre|cloud|devops|software|program|code|database|security/;
  const interpersonal = /sales|customer|service|communication|negotiation|coaching|leadership|conflict|de.?escalat|empathy|management|team|presentation|onboard|complaint|resolution|mentoring|hr|human.?resourc|feedback|interview|performance/;
  const academic = /history|geography|science|biology|chemistry|physics|maths|mathematics|literature|mythology|theory|research|sociology|economics|psychology|philosophy|politics|climate|ecology|archaeology|civics|grammar|linguistics|statistics|astronomy|geology|anatomy/;
  const creative = /design|art|music|cooking|cuisine|baking|photography|craft|writing|fashion|ceramic|textile|woodwork|sculpt|animation|film|brewing|drawing|illustrat|printmaking|jewellery|pottery/;

  if (technical.test(d)) return 'technical';
  if (interpersonal.test(d)) return 'interpersonal';
  if (academic.test(d)) return 'academic';
  if (creative.test(d)) return 'creative';
  return 'technical'; // safe fallback — technical is the most common domain
}

// ─── Blueprint stage reference examples ──────────────────────────────────────

const REF_BLUEPRINT: Record<DomainClass, string> = {
  technical: `{
  "id": 1,
  "title": "Safe Working and Refrigerant Handling",
  "description": "Foundation safety, PPE, and refrigerant regulations for new HVAC technicians.",
  "stageObjective": "Identify all required PPE for refrigerant work, explain legal recovery requirements, and demonstrate the pre-opening recovery procedure without referencing notes.",
  "prerequisiteCompetencies": [
    "Basic understanding of pressure and temperature",
    "Ability to follow written safety procedures",
    "No prior HVAC experience required"
  ],
  "lessonTitles": ["Refrigerant Regulations and GWP", "Pressure/Temperature Relationships", "Recovery Before Opening", "PPE and Site Safety"],
  "testQuestionCount": 8,
  "learningArc": "conceptual-first"
}`,
  interpersonal: `{
  "id": 1,
  "title": "Recognising and Responding to Escalation",
  "description": "Core listening skills, de-escalation language, and emotional regulation for frontline customer-facing roles.",
  "stageObjective": "Identify verbal and tonal escalation signals in a customer interaction, apply three de-escalation techniques, and demonstrate a calm solution-framing response to a hostile complaint — without a script.",
  "prerequisiteCompetencies": [
    "Basic workplace communication experience",
    "Ability to remain professional under mild pressure",
    "No prior customer service training required"
  ],
  "lessonTitles": ["Reading Escalation Signals", "De-escalation Language Patterns", "Emotional Regulation Under Pressure", "Solution Framing vs Blame Framing"],
  "testQuestionCount": 8,
  "learningArc": "conceptual-first"
}`,
  academic: `{
  "id": 1,
  "title": "Causes and Context of the Industrial Revolution",
  "description": "Economic, agricultural, and geographic factors that enabled industrialisation in 18th-century Britain.",
  "stageObjective": "Explain key economic, agricultural, and political conditions preceding industrialisation and evaluate why Britain industrialised before other European nations — with evidence-based reasoning.",
  "prerequisiteCompetencies": [
    "Basic understanding of pre-modern European trade and agriculture",
    "Ability to interpret primary source extracts",
    "No prior study of the Industrial Revolution required"
  ],
  "lessonTitles": ["The Agrarian Revolution as Prerequisite", "Capital Accumulation and Colonial Trade", "Why Britain First — A Geographic Argument", "Patent Law and Innovation Incentive"],
  "testQuestionCount": 8,
  "learningArc": "conceptual-first"
}`,
  creative: `{
  "id": 1,
  "title": "Mise en Place and Knife Technique",
  "description": "Foundation discipline, workspace organisation, and knife skills for cooks entering professional kitchen environments.",
  "stageObjective": "Execute julienne, brunoise, and chiffonade cuts to specification, explain why mise en place discipline prevents service failures, and identify the three most common knife safety errors in a professional kitchen — without demonstration.",
  "prerequisiteCompetencies": [
    "Basic kitchen orientation and hygiene awareness",
    "Ability to identify common knife types",
    "No prior professional cookery experience required"
  ],
  "lessonTitles": ["The Pinch Grip and Blade Control", "Classic Knife Cuts to Specification", "Mise en Place as Professional Discipline", "Knife Safety and Edge Maintenance"],
  "testQuestionCount": 8,
  "learningArc": "procedural-first"
}`
};

// ─── Full lesson reference examples ──────────────────────────────────────────

const REF_LESSON: Record<DomainClass, string> = {
  technical: `{
  "id": "s1-l1",
  "title": "Refrigerant Regulations and GWP",
  "objective": "Explain legal obligations for refrigerant handling and why GWP ratings drive equipment selection.",
  "concept": [
    "Refrigerant handling is regulated to limit HFC emissions. Technicians must hold a valid qualification (F-Gas EU/UK, EPA 608 USA) before purchasing, recovering, or handling refrigerants. Unqualified handling is a criminal offence in most jurisdictions.",
    "Global Warming Potential (GWP) compares a refrigerant's climate impact to CO₂ over 100 years. R410A has GWP 2088 — 1 kg released equals 2088 kg CO₂ equivalent. This drives the industry shift to lower-GWP alternatives such as R32 (GWP 675) and R454B (GWP 467).",
    "A common mistake: venting refrigerant to atmosphere to save time. This is illegal, attracts large fines, and depletes recoverable stock. Recovery cylinders must be rated for the refrigerant type and filled no more than 80% to allow for thermal expansion.",
    "Cylinder management matters. Overfilling above 80% creates overpressure risk during temperature rise. Cylinders must be labelled with refrigerant type and returned to a reclaim centre when full."
  ],
  "diagrams": [
    { "id": "d1", "title": "GWP Comparison by Refrigerant", "kind": "bar", "nodes": [{ "id": "r410a", "label": "R410A — GWP 2088" }, { "id": "r32", "label": "R32 — GWP 675" }, { "id": "r454b", "label": "R454B — GWP 467" }] },
    { "id": "d2", "title": "Recovery Sequence Before Circuit Opening", "kind": "flow", "nodes": [{ "id": "check", "label": "Check cylinder capacity" }, { "id": "connect", "label": "Connect recovery machine" }, { "id": "recover", "label": "Recover to 0 psig" }, { "id": "open", "label": "Open circuit safely" }] }
  ],
  "workedExample": "Before replacing a leaking TX valve on an R410A split system, the technician confirms the recovery cylinder is under 80% full, records its weight, connects the recovery machine, and runs until system pressure reaches 0 psig. Only then does she open the circuit. This prevents illegal release and keeps refrigerant recoverable for reclaim.",
  "youTry": {
    "type": "ordering",
    "prompt": "Order the steps before opening an R410A refrigerant circuit.",
    "options": ["Open the circuit", "Record cylinder weight", "Connect recovery machine", "Verify cylinder GWP compatibility"],
    "answer": ["Verify cylinder GWP compatibility", "Record cylinder weight", "Connect recovery machine", "Open the circuit"],
    "feedback": "Compatibility prevents cross-contamination. Weight before and after confirms full recovery. Never open before pressure reaches 0 psig."
  },
  "quiz": [
    { "id": "q1", "type": "mcq", "prompt": "What does GWP measure for a refrigerant?", "options": ["Cooling efficiency per kg", "Climate impact relative to CO₂ over 100 years", "Pressure at room temperature"], "answer": "Climate impact relative to CO₂ over 100 years", "explanation": "GWP is a climate impact index, not a performance metric." },
    { "id": "q2", "type": "tf", "prompt": "Venting a small quantity of refrigerant to atmosphere is legal if the system is under 3 kg.", "answer": false, "explanation": "Venting is illegal regardless of quantity in most jurisdictions. Recovery is always required." },
    { "id": "q3", "type": "mcq", "prompt": "Why must recovery cylinders not exceed 80% fill?", "options": ["To allow room for thermal expansion and prevent overpressure", "To keep the cylinder light enough to carry", "To ensure accurate GWP calculation"], "answer": "To allow room for thermal expansion and prevent overpressure", "explanation": "Liquid refrigerant expands significantly with temperature rise; overfilling creates overpressure risk." },
    { "id": "q4", "type": "tf", "prompt": "R454B has a lower GWP than R410A.", "answer": true, "explanation": "R454B GWP is 467 vs R410A at 2088 — a significant reduction driving the A2L refrigerant transition." }
  ]
}`,
  interpersonal: `{
  "id": "s1-l1",
  "title": "Reading Escalation Signals",
  "objective": "Identify verbal, tonal, and behavioural signals that indicate a customer interaction is escalating.",
  "concept": [
    "Escalation rarely begins as aggression. Early signals include raised pace of speech, repetition of the same complaint, shorter answers, and decreased patience with clarifying questions. Catching these early allows redirection before tone shifts to hostility.",
    "The three escalation stages are Frustrated (wants to be heard), Hostile (personalises the issue), and Threatening (boundary violation). Each requires a different response. Treating a frustrated customer as hostile accelerates escalation; treating a hostile customer as merely frustrated is under-reaction.",
    "A common mistake: focusing on policy before acknowledgement. Customers who feel unheard escalate — not because the policy is wrong, but because no one validated the impact on them. Acknowledgement is not agreement; it is recognition.",
    "In chat and email, ALL CAPS, excessive punctuation, and very short replies serve the same function as raised voice and shorter sentences on phone or in person. Escalation signals are consistent across channels."
  ],
  "diagrams": [
    { "id": "d1", "title": "Escalation Stage Progression", "kind": "flow", "nodes": [{ "id": "frustrated", "label": "Frustrated — wants to be heard" }, { "id": "hostile", "label": "Hostile — takes it personally" }, { "id": "threatening", "label": "Threatening — boundary violation" }] },
    { "id": "d2", "title": "Acknowledgement-First vs Policy-First", "kind": "bar", "nodes": [{ "id": "ack", "label": "Acknowledged early — avg 3 min resolution" }, { "id": "policy", "label": "Policy-first — avg 18 min, escalation risk" }] }
  ],
  "workedExample": "A customer calls about a delayed delivery and repeats 'this is the third time' twice in two minutes. Before addressing the delay, the rep says: 'I can hear this has been genuinely frustrating — three contacts is not the experience we want you to have.' The customer's tone shifts. The rep then resolves the issue. Leading with acknowledgement shortened the call by 12 minutes versus a policy-first approach.",
  "youTry": {
    "type": "decision",
    "prompt": "A customer says 'I don't want excuses — just fix it.' Which response best de-escalates?",
    "options": ["Explain company policy step by step", "Say 'I understand — let me focus on the solution right now'", "Transfer to a supervisor immediately"],
    "answer": "Say 'I understand — let me focus on the solution right now'",
    "feedback": "Acknowledging without arguing and shifting to solution focus prevents further escalation. Policy explanation at this moment feels dismissive."
  },
  "quiz": [
    { "id": "q1", "type": "mcq", "prompt": "What is the earliest customer escalation stage?", "options": ["Threatening", "Hostile", "Frustrated"], "answer": "Frustrated", "explanation": "Frustration is the most recoverable stage. Catching it here prevents progression to hostility." },
    { "id": "q2", "type": "tf", "prompt": "Acknowledging a customer's frustration means you agree their complaint is valid.", "answer": false, "explanation": "Acknowledgement is recognition of impact, not agreement with blame. It can be given without accepting fault." },
    { "id": "q3", "type": "mcq", "prompt": "A customer is speaking faster and repeating themselves. This most likely indicates:", "options": ["They are ready to accept a resolution", "They feel unheard — early escalation signal", "They want to speak to a manager"], "answer": "They feel unheard — early escalation signal", "explanation": "Repetition and pace change are early frustration signals. Acknowledgement and active listening are the correct response." },
    { "id": "q4", "type": "tf", "prompt": "Focusing on policy before acknowledgement typically speeds up resolution.", "answer": false, "explanation": "Policy-first responses when customers feel unheard tend to accelerate escalation." }
  ]
}`,
  academic: `{
  "id": "s1-l1",
  "title": "The Agrarian Revolution as Prerequisite",
  "objective": "Explain how agricultural change in 18th-century Britain freed labour and capital for industrial investment.",
  "concept": [
    "The Enclosure Acts converted common land into private holdings, displacing subsistence farmers. Between 1750 and 1830, over 3,000 Enclosure Acts were passed, forcing millions off the land into towns — creating the landless wage-labour force that factories required.",
    "Enclosure coincided with improved techniques — the Norfolk four-field crop rotation, selective breeding, and mechanised tools. Output per worker rose; fewer agricultural workers were needed. More food was grown by fewer people, freeing labour and reducing urban food prices simultaneously.",
    "A common misconception: the Enclosure Acts were primarily about efficiency. Historians debate whether efficiency or class power better explains them. Parliamentary Enclosure required only local landowner consent, not commoners' agreement — those who benefited controlled the legislation.",
    "Capital from agriculture funded the first wave of industrialisation. Prosperous landlords and tenant farmers accumulated surpluses they invested in textile mills, canal projects, and iron foundries. Without agricultural profit, there was no investment capital for industrialisation."
  ],
  "diagrams": [
    { "id": "d1", "title": "Agricultural to Industrial Capital Flow", "kind": "flow", "nodes": [{ "id": "enclosure", "label": "Enclosure Acts" }, { "id": "surplus", "label": "Agricultural Surplus" }, { "id": "investment", "label": "Mill and Canal Investment" }] },
    { "id": "d2", "title": "Labour Displacement Mechanism", "kind": "flow", "nodes": [{ "id": "common", "label": "Common land access removed" }, { "id": "displaced", "label": "Subsistence farmers displaced" }, { "id": "wagework", "label": "Enter urban wage labour" }] }
  ],
  "workedExample": "Robert Bakewell improved cattle and sheep breeds at Dishley Farm from the 1760s through selective breeding, tripling average Smithfield Market weights. Higher yield per animal meant fewer animals needed — reducing labour requirements and building landlord surplus reinvested into canal finance. His methods spread through agricultural societies, accelerating the surplus accumulation that funded early industrialisation.",
  "youTry": {
    "type": "decision",
    "prompt": "Which explanation best accounts for why Enclosure Acts passed despite widespread opposition?",
    "options": ["Agricultural productivity required them for national food security", "Parliament was controlled by landed gentry who benefited directly", "Commoners accepted them as economically inevitable"],
    "answer": "Parliament was controlled by landed gentry who benefited directly",
    "feedback": "Parliamentary Enclosure required only landowner petitions. Those who benefited from enclosure controlled its passage — a structural conflict of interest that explains why opposition rarely succeeded."
  },
  "quiz": [
    { "id": "q1", "type": "mcq", "prompt": "What was the primary labour-supply consequence of the Enclosure Acts?", "options": ["Increased demand for rural agricultural workers", "Displacement of commoners into factory wage-labour", "Reduced urban migration due to better farm wages"], "answer": "Displacement of commoners into factory wage-labour", "explanation": "Enclosure removed access to common land, pushing subsistence farmers into wage-labour markets — a precondition for factory production." },
    { "id": "q2", "type": "tf", "prompt": "The Norfolk four-field system increased output by leaving land fallow every fourth year.", "answer": false, "explanation": "The Norfolk system eliminated the fallow year by rotating nitrogen-restoring legumes (clover, turnips) — increasing continuous output." },
    { "id": "q3", "type": "mcq", "prompt": "Why did agricultural surplus matter for industrialisation?", "options": ["It reduced imported food dependency", "It provided investment capital for mills and infrastructure", "It allowed more workers to remain in farming"], "answer": "It provided investment capital for mills and infrastructure", "explanation": "Capital from agricultural profits directly funded early industrial ventures — the key link between the two revolutions." },
    { "id": "q4", "type": "tf", "prompt": "Parliamentary Enclosure required the consent of commoners with grazing rights.", "answer": false, "explanation": "Only local landowner petitions were required. Commoners had no formal consent mechanism in the Parliamentary Enclosure process." }
  ]
}`,
  creative: `{
  "id": "s1-l1",
  "title": "The Pinch Grip and Blade Control",
  "objective": "Apply the pinch grip correctly and explain why it enables safer, more precise knife work than the handle grip.",
  "concept": [
    "The pinch grip: thumb and index finger pinch the blade flat just above the bolster; remaining fingers curl around the handle. This moves the pivot point forward onto the blade, giving direct control of the cutting edge. The handle grip (all fingers behind the bolster) creates a longer, less controllable lever.",
    "Control is the safety argument. A slipping handle grip transfers all energy to the blade tip unpredictably. Pinch grip keeps the blade tracking vertically through the cut. Chefs who switch to pinch grip report faster cuts with significantly fewer contact incidents.",
    "The claw guide hand mirrors this logic. Fingertips curl under, knuckles forward — creating a vertical rail the blade rides against on every stroke. Flat-handed cutting is the most common source of finger injuries in teaching kitchens.",
    "Speed follows control, not the other way. Professional speed comes from correct blade angle, consistent stroke length, and grip stability — not force. Forcing the blade through food is the second leading cause of knife injuries in commercial kitchens."
  ],
  "diagrams": [
    { "id": "d1", "title": "Pinch Grip vs Handle Grip", "kind": "comparison", "nodes": [{ "id": "pinch", "label": "Pinch — pivot on blade, precise" }, { "id": "handle", "label": "Handle — long lever, less control" }] },
    { "id": "d2", "title": "Claw Guide Hand Position", "kind": "flow", "nodes": [{ "id": "curl", "label": "Fingertips curl under" }, { "id": "knuckle", "label": "Knuckles face blade" }, { "id": "rail", "label": "Knuckle acts as depth stop" }] }
  ],
  "workedExample": "A prep cook julienning carrots uses a pinch grip, positions the carrot with the claw guide hand, and uses the knuckle as a 3mm depth guide. Stroke speed is moderate and cuts are consistent. A colleague using a handle grip applies more downward force and produces slices varying from 2–5mm. Consistent grip produces consistent cuts — inconsistent cuts cause uneven cooking times during service.",
  "youTry": {
    "type": "ordering",
    "prompt": "Order the setup steps before making the first cut on a round carrot.",
    "options": ["Begin slicing", "Establish claw guide hand", "Apply pinch grip", "Square off one flat side for stability"],
    "answer": ["Square off one flat side for stability", "Apply pinch grip", "Establish claw guide hand", "Begin slicing"],
    "feedback": "Squaring prevents rolling on the first stroke — the most dangerous moment. Grip then guide hand, then cutting begins."
  },
  "quiz": [
    { "id": "q1", "type": "mcq", "prompt": "Where does the pinch grip contact the knife?", "options": ["All fingers on the handle behind the bolster", "Thumb and index finger on the blade above the bolster", "Three fingers on the spine with thumb on the handle"], "answer": "Thumb and index finger on the blade above the bolster", "explanation": "Blade contact moves the pivot point forward, giving direct control of the cutting edge." },
    { "id": "q2", "type": "tf", "prompt": "Cutting faster than comfortable control allows is the recommended way to build professional knife speed.", "answer": false, "explanation": "Professional speed develops from correct technique — grip, angle, and consistent stroke. Forced speed before correct technique causes injuries." },
    { "id": "q3", "type": "mcq", "prompt": "The claw guide hand position protects fingers because:", "options": ["Fingertips are furthest from the blade when curled under", "The flat hand gives more surface area to press food", "Knuckles act as a height stop limiting maximum blade depth"], "answer": "Knuckles act as a height stop limiting maximum blade depth", "explanation": "The blade rides against the knuckle rail on every stroke — knuckle height determines maximum slice thickness and keeps fingertips below the blade path." },
    { "id": "q4", "type": "tf", "prompt": "Squaring off a round vegetable before slicing reduces rolling risk during the first cut.", "answer": true, "explanation": "A flat base prevents the vegetable rolling unpredictably on the first downward stroke — the moment of highest instability." }
  ]
}`
};

// ─── Stage test question reference examples ───────────────────────────────────

const REF_TEST_QUESTION: Record<DomainClass, string> = {
  technical: `{
  "id": "t1",
  "type": "mcq",
  "prompt": "A recovery cylinder feels warmer than expected after connecting to an R410A system on a hot day. The first action should be:",
  "options": ["Continue — warmth is normal during recovery", "Check fill level and weigh the cylinder before continuing", "Switch to a larger cylinder immediately"],
  "answer": "Check fill level and weigh the cylinder before continuing",
  "explanation": "High ambient temperature increases refrigerant pressure. Verifying fill level before continuing prevents overpressure from thermal expansion inside the cylinder."
}`,
  interpersonal: `{
  "id": "t1",
  "type": "mcq",
  "prompt": "A customer's tone shifts from frustrated to personally hostile — 'You people are all useless.' The priority is to:",
  "options": ["Explain the company's customer code of conduct", "Acknowledge the frustration without matching tone, then redirect to a solution", "Transfer the call to a supervisor immediately"],
  "answer": "Acknowledge the frustration without matching tone, then redirect to a solution",
  "explanation": "Matching hostility or immediately escalating are both escalation triggers. Calm acknowledgement followed by solution focus is the highest-value response at the hostile stage."
}`,
  academic: `{
  "id": "t1",
  "type": "mcq",
  "prompt": "Britain industrialised before France despite France having a larger population and agricultural base. Which factor most directly explains this difference?",
  "options": ["Britain's coal deposits were near navigable water, reducing transport costs", "France had stricter guild regulations preventing factory formation", "Britain's population was more literate and technically skilled"],
  "answer": "Britain's coal deposits were near navigable water, reducing transport costs",
  "explanation": "Geographic proximity of coalfields to rivers and estuaries dramatically reduced fuel and raw material transport costs — a structural advantage France could not replicate through policy alone."
}`,
  creative: `{
  "id": "t1",
  "type": "mcq",
  "prompt": "During prep, a cook's brunoise cuts are inconsistent in size despite working at a reasonable pace. The most likely technical cause is:",
  "options": ["Their knife needs sharpening", "Their guide hand position is not maintaining consistent depth control", "They are using the wrong knife for the task"],
  "answer": "Their guide hand position is not maintaining consistent depth control",
  "explanation": "Inconsistent brunoise traces to an inconsistent guide hand — knuckle height drifting or fingertips not curled under. A dull knife shows as tearing, not inconsistent size."
}`
};

// ─── Mission reference examples ───────────────────────────────────────────────

const REF_MISSION: Record<DomainClass, string> = {
  technical: `{
  "id": "m1",
  "title": "Refrigerant Recovery Under Time Pressure",
  "description": "You need to replace a leaking Schrader valve on a supermarket display cabinet (4.2 kg R410A). The store manager wants the unit back online within 2 hours. The recovery cylinder on your van shows 70% on the gauge.",
  "whyItMatters": "Venting refrigerant is illegal and costly. Pressure to reduce downtime is the leading cause of regulatory incidents among HVAC technicians.",
  "stageMin": 1,
  "stageMax": 2,
  "branches": [
    { "choice": "Weigh the cylinder, confirm capacity, and begin correct recovery", "outcome": "Recovery completes in 25 minutes. Valve replaced and system recharged correctly.", "score": 100, "feedback": "Weighing confirms capacity before connecting — prevents overfill regardless of gauge reading." },
    { "choice": "Trust the 70% gauge and begin recovery without weighing", "outcome": "Cylinder overfills and trips the safety cutout. 30 minutes lost sourcing another cylinder.", "score": 40, "feedback": "Recovery cylinder gauges are not reliable weight indicators. Always weigh to confirm remaining capacity." },
    { "choice": "Vent a small amount to reduce pressure, then recover the rest", "outcome": "A bystander reports you. A regulatory fine follows.", "score": 0, "feedback": "Any intentional venting is illegal regardless of quantity. The time saving is not worth the legal risk." }
  ]
}`,
  interpersonal: `{
  "id": "m1",
  "title": "The Third Call — Delivery Complaint",
  "description": "A customer calls for the third time about an order five days late. They open with: 'If this isn't fixed right now I'm posting about this everywhere.' You can offer a re-ship or a partial refund — but not both.",
  "whyItMatters": "Repeat-contact customers carry 4× the churn risk of first-contact complainants. How this call is handled determines whether a public review is posted.",
  "stageMin": 1,
  "stageMax": 2,
  "branches": [
    { "choice": "Acknowledge the repeated contacts first, then present the options clearly", "outcome": "Customer's tone softens. They choose a re-ship. No review posted.", "score": 100, "feedback": "Leading with acknowledgement of the customer's experience before the solution reduces hostility and builds trust." },
    { "choice": "Immediately offer both options before acknowledging the frustration", "outcome": "Customer asks 'Why wasn't this offered on call two?' The complaint broadens.", "score": 50, "feedback": "Jumping to resolution without acknowledgement can feel like closing the ticket rather than genuinely helping." },
    { "choice": "Apologise for company policy on what you can offer", "outcome": "Customer interprets this as blame-shifting and demands a manager.", "score": 20, "feedback": "Apologising for policy instead of the experience communicates helplessness and creates no resolution path." }
  ]
}`,
  academic: `{
  "id": "m1",
  "title": "The Enclosure Petition — 1793",
  "description": "You are a prosperous tenant farmer in Leicestershire with 40 acres. A Parliamentary Enclosure petition is being organised by three large landowners. Signing may secure your land allocation. Commoners in the parish collectively graze 200 sheep on the common threatened by enclosure.",
  "whyItMatters": "Understanding how individual economic decisions collectively produced the labour displacement that enabled industrialisation requires examining the incentives at the point of decision.",
  "stageMin": 1,
  "stageMax": 2,
  "branches": [
    { "choice": "Sign and secure a larger private allocation in the settlement", "outcome": "You receive 12 additional acres. Several commoner families leave the parish for Birmingham within three years.", "score": 60, "feedback": "This was the modal decision for prosperous tenant farmers — individual gain outweighed collective cost for those with signing power." },
    { "choice": "Refuse to sign and organise commoners to file an objection", "outcome": "The petition proceeds without you. Your objection is noted but changes nothing. You retain your current acreage.", "score": 80, "feedback": "Objections were common and rarely successful. The political structure gave commoners no effective veto — this illustrates the structural barriers within the Enclosure system." },
    { "choice": "Sign only if landowners agree to compensate displaced commoners", "outcome": "Landowners decline your condition. The petition proceeds. You are excluded from the preferential land distribution.", "score": 70, "feedback": "Conditional consent reflects nascent reform thinking. Its failure illustrates the limitations of reform within an Enclosure system structurally designed to exclude commoner interests." }
  ]
}`,
  creative: `{
  "id": "m1",
  "title": "Service Prep — Time Pressure Decision",
  "description": "Forty minutes before dinner service, the chef discovers 3kg of julienned leeks — standard garnish prep — hasn't been started. You are the most senior prep cook. Standard is 2mm strips, 6cm length. Two junior cooks are available but not confident with knife technique.",
  "whyItMatters": "Service failures in professional kitchens frequently trace to mise en place breakdowns under time pressure. Delegation decisions reveal fundamental professional discipline.",
  "stageMin": 1,
  "stageMax": 2,
  "branches": [
    { "choice": "Handle the julienne yourself; give junior cooks simpler prep", "outcome": "Julienne completed to specification with 8 minutes to spare. Service runs smoothly.", "score": 90, "feedback": "Delegating to skill level is professional kitchen management. High-precision knife work stays with the most competent hands." },
    { "choice": "Instruct both junior cooks to attempt the julienne to save time", "outcome": "One junior cook cuts inconsistently. Chef rejects 40% of the prep. Service starts 12 minutes late.", "score": 20, "feedback": "Speed of delegation does not outweigh quality risk when specification tolerances are tight. Assess skill before delegating." },
    { "choice": "Handle the julienne with one junior cook and coach them through technique", "outcome": "Prep is slightly slower but quality passes. The junior cook's technique noticeably improves.", "score": 100, "feedback": "Coaching during controlled prep time is the highest-value action — quality maintained and team capability built simultaneously." }
  ]
}`
};

function domainReferenceExample(
  domainPrompt: string,
  sectionType: 'blueprint' | 'lesson' | 'testQuestion' | 'mission'
): string {
  const cls = classifyDomain(domainPrompt);
  switch (sectionType) {
    case 'blueprint':    return REF_BLUEPRINT[cls];
    case 'lesson':       return REF_LESSON[cls];
    case 'testQuestion': return REF_TEST_QUESTION[cls];
    case 'mission':      return REF_MISSION[cls];
  }
}

// ─── Critique prompt (quality gate before accepting generated JSON) ──────────

export function buildCritiquePrompt(
  sectionType: 'stageLessons' | 'stageTest' | 'missions',
  sectionId: string,
  domainPrompt: string,
  generatedJson: unknown,
  lessonTemplates?: Array<{ id: string; template: LessonTemplate }>
): PromptPair {
  // Build template-aware rubric additions for stageLessons
  const templateAudit = (sectionType === 'stageLessons' && lessonTemplates && lessonTemplates.length > 0)
    ? `\nTEMPLATE COMPLIANCE AUDIT (check each lesson against its assigned template):
${lessonTemplates.map(({ id, template }) => {
  switch (template) {
    case 'regulatory-framework':
      return `  Lesson ${id} (regulatory-framework): Must have duty-holder table or structured duties list, enforcement landscape content, and compliance checklist. Quiz must include scenario-based questions, not pure recall.`;
    case 'procedural':
      return `  Lesson ${id} (procedural): Must have numbered step-by-step procedure with action verbs, deviation consequence table, and sign-off/records section. Quiz must test application of steps.`;
    case 'risk-assessment':
      return `  Lesson ${id} (risk-assessment): Must show full control hierarchy (elimination → PPE) in worked example. Must NOT reach for PPE as first control. Risk rating matrix must be present.`;
    case 'emergency-response':
      return `  Lesson ${id} (emergency-response): Must have unambiguous trigger criteria and decision tree structure. Quiz must test first-correct-action under time pressure.`;
    case 'induction':
      return `  Lesson ${id} (induction): Must include reporting responsibilities and site-specific rules (not generic H&S). Quiz must test reporting chain.`;
    default:
      return '';
  }
}).filter(Boolean).join('\n')}`
    : '';

  const rubric =
    sectionType === 'stageLessons'
      ? `RUBRIC:
- Pedagogical depth: teaches usable mental models/procedures, not definitions only.
- Realism: examples and scenarios reflect real operations/constraints/failure modes.
- Assessment quality: quiz items are valid, non-trivial, and explanation quality is strong.
- Practical readiness: lesson content supports practical mission/gating usage.
- Schema fidelity: IDs, answers, options, and required fields are consistent.
- Template fidelity: each lesson follows its assigned template's required structure.${templateAudit}`
      : sectionType === 'stageTest'
      ? `RUBRIC:
- Stage objective alignment: questions test stage mastery, not narrow trivia.
- Cognitive level: includes application/analysis, not recall-only.
- Distractor quality: plausible wrong answers tied to common errors.
- Coverage: spans different lesson sub-skills.
- Schema fidelity: IDs/answers/options/booleans are valid.`
      : `RUBRIC:
- Scenario realism: believable operational context and consequences.
- Branch quality: includes strong, weak, and intermediate choices.
- Coaching quality: feedback teaches sequence/decision quality.
- Stage fit: stageMin/stageMax are coherent with scenario difficulty.
- Schema fidelity: required mission/branch fields are complete and valid.`;

  const system = `You are a strict curriculum QA reviewer applying cross-model verification.
You are reviewing content generated by a different AI model. Approach this with genuine critical distance.
Assess generated JSON against the rubric and return a structured verdict.

Output must be valid JSON only. No markdown fences. No prose outside JSON.
Return exactly:
{
  "qualityScore": number,            // 0..100
  "requiresRevision": boolean,       // true if qualityScore < 80 OR critical issues found
  "issues": Array<{
    "rule": string,
    "message": string,
    "severity": "error" | "warning"
  }>,
  "repairPriorities": string[]       // short actionable repair instructions
}

Rules:
- Flag schema-breaking issues as severity "error".
- Flag depth/realism weaknesses as "warning".
- Flag template non-compliance (lesson missing required structural element) as "error".
- Keep issues concise and actionable.
- Use validator-style rule IDs in "rule" (e.g. MCQ_ANSWER_IN_OPTIONS, TEMPLATE_MISSING_PROCEDURE_STEPS, MISSING_CONTROL_HIERARCHY, REGULATORY_FRAMEWORK_NO_DUTY_TABLE).
- If content is strong and template-compliant, requiresRevision must be false.`;

  const user = `SECTION TYPE: ${sectionType}
SECTION ID: ${sectionId}
DOMAIN: ${domainPrompt}

${rubric}

GENERATED JSON TO REVIEW:
${JSON.stringify(generatedJson, null, 2)}

Return only the JSON verdict object.`;

  return { system, user };
}

// ─── Phase 0: Domain Survey (Gemini, before blueprint) ───────────────────────
// Produces a grounded intelligence block used to constrain all generation steps.
// Routes to Gemini with search grounding enabled to retrieve live HSE/legislation data.

export function buildDomainSurveyPrompt(
  domainPrompt: string,
  audienceDescription: string,
  isRegulatory: boolean,
  regulatorySchemaIds: string[] = []
): PromptPair {
  const system = `You are a UK health and safety regulatory intelligence analyst.
Your role is to produce a structured, factually grounded intelligence brief for a training module generation pipeline.
This brief will be injected as hard constraints into every subsequent content generation step.

CRITICAL: You must be precise about numeric thresholds. Only include thresholds you can cite to a specific regulation paragraph.
If you are uncertain of an exact value, omit it — do not approximate.
If search grounding is available, use it to retrieve current HSE.gov.uk and legislation.gov.uk content.

Output must be valid JSON only. No markdown fences. No prose outside JSON.
Return exactly:
{
  "domainSurvey": {
    "mandatoryTopics": string[],           // 8–10 specific topics this module MUST cover
    "commonMisconceptions": string[],      // 4–5 learner misconceptions to explicitly address
    "enforcementPriorities": string[],     // 3 current HSE enforcement focus areas for this domain
    "criticalNumericThresholds": Array<{   // Hard numeric values ONLY — cite source paragraph
      "name": string,
      "value": string,
      "unit": string,
      "source": string                     // e.g. "Control of Noise at Work Regulations 2005 Reg 4"
    }>,
    "keyDutyHolders": string[],            // who bears legal duties (e.g. "Employer", "Self-employed person")
    "controlHierarchySteps": string[],     // domain-specific ordered control sequence
    "regulatoryRefs": string[]             // primary SIs, ACOPs, HSE guidance docs for this domain
  }
}`;

  const user = `DOMAIN: ${domainPrompt}
TARGET AUDIENCE: ${audienceDescription}
${isRegulatory ? `APPLICABLE REGULATORY SCHEMAS: ${regulatorySchemaIds.join(', ')}
This is a UK compliance training module. All content must trace to UK legislation and HSE guidance.` : ''}

Produce a domain intelligence brief for this training module.
Focus on what a UK-based operator in this domain MUST know to be legally compliant.
Enforcement priorities should reflect current HSE operational focus (2024–2026 strategy period).
For numeric thresholds: only include values you can attribute to a specific regulation — omit if uncertain.`;

  return { system, user };
}

// ─── Phase 3: Coherence Pass (Gemini, after all stages, before fact-check) ───
// Cross-stage analysis to catch contradictions, duplicate coverage, and arc gaps.

export function buildCoherencePassPrompt(
  domainPrompt: string,
  stageSummaries: Array<{
    stageId: number;
    title: string;
    objective: string;
    lessons: Array<{
      id: string;
      title: string;
      // First 2 concept bullets (capped for token budget) — real claims, not titles
      conceptSnippets: string[];
      // All unique regulatoryRefs from quiz questions for this lesson
      regulatoryRefs: string[];
    }>;
  }>,
  groundTruth?: GroundTruth,
  regulatoryContextBlock?: string
): PromptPair {
  const gtBlock = groundTruth ? buildGroundTruthBlock(groundTruth) : '';

  const system = `You are a senior curriculum quality reviewer for UK regulatory compliance training.
Your task is a cross-stage coherence analysis of a generated training module.

You have access to actual lesson concept claims and regulatory citation references — use them to detect real contradictions, not just title-level drift.

Check for:
1. CONTRADICTIONS — does any lesson claim or regulatory citation contradict a claim/citation in another stage?
   (e.g. Lesson A cites MHSWR Reg 3 for one interpretation; Lesson B cites same reg for a contradictory duty)
2. DUPLICATE COVERAGE — do any two stages cover the same regulatory obligation with insufficient differentiation?
3. REGULATORY ARC GAPS — are mandatory duties from the ground truth and/or regulatory context block missing from all stages? List each unaddressed key duty as a specific gap.
4. TEMPLATE CONSISTENCY — are lesson templates appropriate for the learning goal?

Output must be valid JSON only. No markdown fences. No prose outside JSON.
Return exactly the coherencePass object.`;

  const stagesBlock = stageSummaries.map((s) => {
    const lessonsBlock = s.lessons.map((l) => {
      const snippets = l.conceptSnippets.length > 0
        ? `    Claims: ${l.conceptSnippets.map((c) => `"${c.slice(0, 120)}"`).join(' | ')}`
        : '';
      const refs = l.regulatoryRefs.length > 0
        ? `    RegRefs: ${l.regulatoryRefs.join(', ')}`
        : '';
      return [`  Lesson "${l.id}: ${l.title}"`, snippets, refs].filter(Boolean).join('\n');
    }).join('\n');
    return `Stage ${s.stageId}: "${s.title}"\n  Objective: ${s.objective}\n${lessonsBlock}`;
  }).join('\n\n');

  const user = `${gtBlock ? `${gtBlock}\n\n` : ''}${regulatoryContextBlock ? `${regulatoryContextBlock}\n\n` : ''}DOMAIN: ${domainPrompt}

STAGE CONTENT (lesson claims and regulatory citations):
${stagesBlock}

Perform a cross-stage coherence analysis. Return:
{
  "coherencePass": {
    "contradictions": Array<{ stageA, stageB, description, severity: "error"|"warning" }>,
    "duplicateCoverage": Array<{ stageA, stageB, topic }>,
    "regulatoryArcGaps": string[],       // mandatory topics absent from all stages
    "templateConsistencyIssues": string[], // lessons where assigned template seems wrong
    "overallCoherent": boolean,
    "repairInstructions": string[]       // actionable repair instructions for repairArtifacts
  }
}`;

  return { system, user };
}

// ─── Blueprint (now Phase 1) ──────────────────────────────────────────────────

export function buildBlueprintPrompt(
  domainPrompt: string,
  audienceDescription: string,
  stageCount: number,
  lessonsPerStage: number,
  objectives: string[] = [],
  regulatoryContextBlock?: string,
  groundTruth?: GroundTruth
): PromptPair {
  const isRegulatory = !!regulatoryContextBlock;
  const gtBlock = groundTruth ? buildGroundTruthBlock(groundTruth) : '';

  const system = `You are a curriculum architect specialising in ${isRegulatory ? 'UK regulatory Health and Safety compliance training' : 'technical and vocational training'}.
You design learning progressions that build skills systematically from foundational theory through applied practice.
You are optimizing for workforce readiness, not generic educational content.
${isRegulatory ? '\nThis is a COMPLIANCE module. The regulatory context block and domain ground truth contain HARD CONSTRAINTS that govern all content. Read them before designing anything.' : ''}
${gtBlock ? '\nA DOMAIN_GROUND_TRUTH block is provided. All mandatory topics in it MUST be covered across the stage/lesson structure.' : ''}

Your output must be valid JSON only. No markdown fences. No explanation text before or after.
Output a single JSON object with the root key "blueprint".

The "blueprint" value must be an array of exactly ${stageCount} stage objects, each matching:
{
  id: number,                          // integer 1..${stageCount}
  title: string,                       // short stage title
  description: string,                 // 1–2 sentence plain description
  stageObjective: string,              // mastery statement starting "On completing this stage, a learner can..."
  prerequisiteCompetencies: string[],  // 2–4 strings, prior knowledge assumed
  lessons: Array<{                     // exactly ${lessonsPerStage} lessons for this stage
    id: string,                        // "s{stageId}-l{index}" e.g. "s1-l1"
    title: string,                     // specific, actionable lesson title
    template: "regulatory-framework" | "procedural" | "risk-assessment" | "emergency-response" | "induction",
    templateReason: string             // 1 sentence: why this template was chosen for this lesson
  }>,
  testQuestionCount: number,           // always 8
  learningArc: "conceptual-first" | "procedural-first" | "diagnostic-focus"
}

LESSON TEMPLATE ASSIGNMENT RULES:
- "regulatory-framework": legislation overview, duty holder tables, penalty landscape. Use for lessons that teach WHAT the law requires and WHO is responsible.
- "procedural": step-by-step operations, pre-task checklists, inspection sequences. Use for lessons that teach HOW to perform a specific task safely.
- "risk-assessment": hazard identification, likelihood/severity matrices, control hierarchy. Use for lessons that teach learners to EVALUATE risk and SELECT controls.
- "emergency-response": trigger criteria, decision trees, role assignments. Use for lessons that teach HOW TO RESPOND under time pressure.
- "induction": policy, culture, welfare, site rules. Use for orientation-style lessons.

PEDAGOGY RUBRIC (must influence the blueprint):
- Progression: each stage must prepare prerequisites for the next stage.
- Realism: stage titles and lesson titles should reflect real tasks, failure modes, and decisions in the domain.
- Practicality: later stages must emphasize diagnosis, troubleshooting, or applied decision-making (not just theory).
- Assessment-readiness: each stage should support meaningful stage-gate testing of the stated objective.
- Template variety: a well-designed module uses a mix of templates — avoid assigning all lessons the same template.
${isRegulatory ? '- Regulatory arc: stages must follow the compliance learning arc — legal framework → duty holder responsibilities → assessment methodology → control hierarchy → monitoring and review → audit readiness.' : ''}`;

  const user = `${gtBlock ? `${gtBlock}\n\n` : ''}${isRegulatory && regulatoryContextBlock ? `${regulatoryContextBlock}\n\n` : ''}DOMAIN: ${domainPrompt}
TARGET AUDIENCE: ${audienceDescription}
OBJECTIVES: ${JSON.stringify(objectives)}
STAGE COUNT: ${stageCount}
LESSONS PER STAGE: ${lessonsPerStage}

Design a ${stageCount}-stage curriculum blueprint for this domain.
Stages must progress from foundational concepts to applied diagnosis and mastery.
Each stage's lessons array must have exactly ${lessonsPerStage} lessons, each with a specific actionable title and an assigned template.
${gtBlock ? 'All mandatory topics in the DOMAIN_GROUND_TRUTH block must appear in the lesson titles across the blueprint.' : ''}
Avoid generic stage/lesson names like "Advanced Topics", "Best Practices", or "Overview".
Use domain-specific tasks, tools, constraints, and failure contexts in titles.
${isRegulatory ? '\nIMPORTANT: All regulatory content must respect the constraints above. Stage and lesson titles must be grounded in the applicable regulatory frameworks — not generic H&S topics.' : ''}

REFERENCE — example blueprint stage (match this depth, tone and progression):
${domainReferenceExample(domainPrompt, 'blueprint')}

Output only the JSON object. No preamble. No explanation.`;

  return { system, user };
}

// ─── Stage Lessons (Step 1...N) ───────────────────────────────────────────────

export function buildStageLessonsPrompt(
  domainPrompt: string,
  audienceDescription: string,
  stage: BlueprintStage,
  sourceReferences: string[] = [],
  objectives: string[] = [],
  regulatoryContextBlock?: string,
  groundTruth?: GroundTruth
): PromptPair {
  const isRegulatory = !!regulatoryContextBlock;

  const system = `You are an expert instructional designer for ${isRegulatory ? 'UK regulatory Health and Safety compliance training' : 'technical and vocational training'}.
You write lesson content that is concrete, jargon-aware, and appropriate for practitioners — not academic summaries.
You are designing content for mastery in a scenario-based trainer with gated practice and assessments.
${isRegulatory ? '\nThis is a COMPLIANCE module. The regulatory context block in the user message contains HARD CONSTRAINTS. Read it before writing any content. Regulatory violations are flagged as non-dismissable findings that block module deployment.' : ''}

Your output must be valid JSON only. No markdown fences. No explanation text before or after.
Output a single JSON object with the root key "stage".

The "stage" value must match this structure exactly:
{
  id: number,
  title: string,
  description: string,
  stageObjective: string,
  prerequisiteCompetencies: string[],
  lessons: TrainingLesson[]
}

Where TrainingLesson is:
{
  id: string,            // format "s{stageId}-l{lessonIndex}" e.g. "s2-l1"
  title: string,
  objective: string,     // single sentence beginning with an action verb
  situationHook?: string,// 2-3 sentence real-world "why this matters" hook shown before concept
  concept: string[],     // exactly 4 prose paragraphs, each 3–5 sentences (no bullet lists inside strings)
  diagrams: LessonDiagram[],
  workedExample: string, // 1 concrete paragraph, 70–140 words, using domain-specific names/tools/constraints
  youTry: PracticeActivity,
  quiz: TrainingQuestion[]  // exactly 4 questions
}

Where LessonDiagram is:
{
  id: string,                                         // "d1", "d2" scoped to this lesson
  title: string,
  kind: "flow" | "rung" | "io" | "timeline" | "image",
  nodes: Array<{ id: string, label: string }>,        // for non-image diagrams: 3–5 nodes, labels 1–5 words each
  imageUrl?: string,                                  // required when kind === "image"
  alt?: string,
  caption?: string,
  attribution?: {
    sourceName: string,
    sourceUrl: string,
    creator?: string,
    licenseName: string,
    licenseUrl?: string,
    rightsStatus?: "public-domain" | "cc0" | "other",
    verifiedOn?: string,
    verificationNotes?: string
  }
}

Where PracticeActivity is:
{
  type: "ordering" | "scenario" | "mcq",
  prompt: string,
  options: string[],        // 3–4 options; for ordering, list them shuffled
  answer: string[] | string, // array for ordering (correct sequence), string for mcq/scenario
  feedback: string          // 1–2 sentences explaining the correct answer
}

Where TrainingQuestion is:
{
  id: string,           // "q1", "q2", "q3", "q4" — unique within lesson
  type: "mcq" | "tf" | "verbal",
  prompt: string,
  intent?: "application" | "knowledge",
  options?: string[],   // required for mcq (3 options), omit for tf
  answer?: string | boolean, // for mcq: exact match to one option; for tf: true or false (boolean); omit for verbal
  explanation: string,
  regulatoryRef?: string,
  timerSeconds?: number,
  triggerScrollPct?: number,
  expectedKeywords?: string[],
  minKeywordHits?: number
}

CRITICAL RULES:
1. Lesson IDs must follow "s${stage.id}-l1", "s${stage.id}-l2", etc.
2. For MCQ questions: answer must exactly match one of the options strings (case-sensitive).
3. For TF questions: answer must be boolean true or false — not the string "true".
4. For ordering youTry: answer must be an array that is a permutation of options.
5. For mcq/scenario youTry: answer must be a string exactly matching one option.
6. concept is an array of exactly 4 prose strings — each 3–5 sentences, no bullet points, no nested lists.
7. Every lesson must have at least 2 diagrams. Never produce an empty diagrams array.
8. Each lesson must have exactly 4 MCQ/TF quiz questions (type: "mcq" or "tf"). Compliance modules additionally include 1 verbal question (type: "verbal") in EVERY lesson — each lesson will have 5 questions total (4 MCQ/TF + 1 verbal).
9. For non-image diagrams: nodes must be 3–5 items, labels 1–5 words.
10. If kind === "image", include imageUrl, alt, caption, and full attribution metadata.
11. If reliable open-license attribution is uncertain, do NOT use kind "image"; use flow/rung/io/timeline instead.
12. Prefer at most one image diagram per lesson, and only when it materially improves understanding.
13. At least one assessment item per lesson (youTry prompt or one quiz question) must explicitly reference a lesson diagram by ID or title (e.g. "Using diagram d1..." or "Based on W007...").

EDUCATIONAL QUALITY REQUIREMENTS (critical):
- Every lesson must teach a usable mental model, procedure, or decision process — not just definitions.
- At least 1 concept paragraph per lesson must cover a common mistake, misconception, or failure mode.
- workedExample must include realistic operational context (constraints, stakes, timing, handoffs, tools, customer/user impact, or safety implications as relevant).
- youTry should rehearse a realistic decision, ordering, or diagnostic move (not trivia).
- Lesson quiz mix must keep application/decision questions at 40-50% of the quiz.
- Explanations must teach why the answer is correct and why alternatives are risky/less effective when relevant.

FACTUAL SAFETY / SOURCE CONSCIOUSNESS:
- Do not invent standards codes, legal requirements, exact numeric thresholds, or vendor-specific claims unless they are broadly established and necessary.
- If a detail could vary by jurisdiction, organization, or equipment, describe it generically and state the dependency in neutral wording.
- Prefer operationally true, conservative guidance over precise but uncertain claims.
${isRegulatory ? `
REGULATORY COMPLIANCE RULES (compliance modules only — non-negotiable):
- Every regulation cited must use the exact reference from the regulatory context block (e.g. "Reg 3 of MHSWR 1999").
- Do not invent regulation numbers, ACOP paragraph numbers, or penalty figures.
- The legal standard for risk assessment is "suitable and sufficient" (Reg 3(1)) — do not substitute other phrases.
- Duty holders must be correctly identified per the regulatory context block.
- All regulatory claims will be flagged in the fact-check step — ensure every claim can be traced to a source document listed in the regulatory context block.
- Do not state that MHSWR applies in Northern Ireland — jurisdiction is Great Britain only.
- Each quiz question MUST include "regulatoryRef": the specific regulation and paragraph that answering this question correctly demonstrates competency in. Format: "MHSWR 1999 Reg 13(1)". Use only references from the regulatory context block above. Example: { "id": "q1", "type": "mcq", ..., "regulatoryRef": "MHSWR 1999 Reg 13(1)" }
- Compliance modules MUST include exactly one verbal question per lesson quiz array (type: "verbal"). Requirements:
  · Must target the most critical Cat A regulatory duty in that stage.
  · Must be answerable verbally in 60 seconds by an informed operator (not a legal essay).
  · Must include "timerSeconds": 60 and "triggerScrollPct": 0.55.
  · Must include "expectedKeywords": 3-8 concise evidence keywords and "minKeywordHits" (typically 2-4).
  · Must include "regulatoryRef". Do NOT include "options" or "answer" fields.
  · Example: { "id": "v1", "type": "verbal", "prompt": "Describe the duty on employers under MHSWR 1999 Reg 13(1) to provide training when employees face new or increased risks.", "regulatoryRef": "MHSWR 1999 Reg 13(1)", "timerSeconds": 60, "triggerScrollPct": 0.55, "expectedKeywords": ["adequate training", "new or increased risk", "during working hours"], "minKeywordHits": 2, "explanation": "Employers must provide adequate training whenever employees are exposed to new or changed risks, including on first employment or job transfer." }

OPERATIONAL DEPTH (compliance modules — non-negotiable):
- Content must reflect the SPECIFIC WORKPLACE CONTEXT given, not generic regulation summaries. Generic paraphrasing of duties is insufficient — explain how each duty applies to this operation.
- Hard numeric action values set by regulation MUST appear in the relevant lesson. Examples: 80 dB(A) lower and 85 dB(A) upper exposure action values (Control of Noise at Work Regs 2005 Reg 4); 12-month statutory thorough examination interval for lifting equipment in use (LOLER 1998 Reg 9(3)); 5-employee writing threshold for risk assessments (MHSWR 1999 Reg 3(6)). State the number, the threshold name, and the regulation in the lesson body — do not leave learners to infer limits.
- For mobile or vehicle-based operations (food vans, welfare units, mobile plant): the TILE (Task–Individual–Load–Environment) risk assessment framework must explicitly address how the Environment factor changes at each pitch or site (surface, slope, overhead clearance, proximity to public). A static TILE analysis is non-compliant for mobile workplaces.
- For small or enclosed workspaces (vehicles, confined spaces, plant rooms, vans under 20 m³): COSHH risk assessment must explicitly address inhalation risk from cleaning agents and spray sanitisers even at standard concentrations. Small workspace volume is a primary exposure control factor — this must be stated, not implied.
- For any work involving lifting on or from mobile vehicles (deliveries, loading ramps, tail-lifts, vehicle-mounted hoists): LOLER 1998 Reg 9 must be addressed with the 12-month examination interval. Learners must not assume LOLER applies only to construction sites or fixed cranes.
- Equipment purchased or originally designed for domestic use but operated commercially MUST be identified as non-compliant under PUWER 1998 Reg 4 (suitability for intended use). Domestic appliances are not CE-certified for continuous commercial duty cycles — this is a Category A finding.
- Worked examples and mission scenarios must demonstrate HIERARCHY OF CONTROLS in sequence: (1) Elimination → (2) Substitution → (3) Engineering controls → (4) Administrative controls → (5) PPE. Scenarios must show PPE as the LAST resort after higher-order controls have been considered and found impracticable. Scenarios that reach for PPE first are non-compliant with the Management Regulations and COSHH Reg 7.` : ''}

SELF-REVIEW (before returning JSON, verify each lesson — revise in-place if any check fails):
- Pedagogical depth: each lesson teaches a usable mental model, procedure, or decision process — not just definitions.
- Realism: situationHook, workedExample, and youTry reflect real operations, constraints, failure modes, or consequences — not generic theory.
- Assessment quality: each quiz item is non-trivial; explanation teaches why the answer is correct and why alternatives are wrong or risky.
- Application balance: exactly 2 of the 4 MCQ/TF quiz questions must have intent: "application" (verbal questions are excluded from this count).
- Schema fidelity: concept has exactly 4 prose paragraphs; each lesson has exactly 4 MCQ/TF questions plus exactly 1 verbal question for compliance modules; TF answers are boolean (not string); MCQ answer exactly matches one option string.
If any lesson fails a check, correct it before outputting.`;

  // Build per-lesson template rules block
  const templateRulesBlock = stage.lessons.map((lesson, i) => {
    const rules = buildTemplateRules(lesson.template);
    return rules ? `LESSON ${i + 1} ("${lesson.title}") — ID: ${lesson.id}\n${rules}` : `LESSON ${i + 1} ("${lesson.title}") — ID: ${lesson.id}`;
  }).join('\n\n---\n\n');

  const gtBlock = groundTruth ? buildGroundTruthBlock(groundTruth) : '';
  const lessonCount = stage.lessons.length;
  const lessonTitlesJson = JSON.stringify(stage.lessons.map((l) => ({ id: l.id, title: l.title, template: l.template })));

  const user = `${gtBlock ? `${gtBlock}\n\n` : ''}${isRegulatory && regulatoryContextBlock ? `${regulatoryContextBlock}\n\n` : ''}DOMAIN: ${domainPrompt}
TARGET AUDIENCE: ${audienceDescription}
STAGE ID: ${stage.id}
STAGE TITLE: ${stage.title}
STAGE DESCRIPTION: ${stage.description}
STAGE OBJECTIVE: ${stage.stageObjective}
PREREQUISITE COMPETENCIES: ${JSON.stringify(stage.prerequisiteCompetencies)}
LESSONS TO GENERATE (id, title, and assigned template for each):
${lessonTitlesJson}
OPTIONAL SOURCE REFERENCES (for image attribution grounding):
${JSON.stringify(sourceReferences, null, 2)}
MODULE OBJECTIVES:
${JSON.stringify(objectives, null, 2)}

PER-LESSON TEMPLATE RULES (each lesson must follow the structural rules for its assigned template):
${templateRulesBlock}

Generate all ${lessonCount} lessons for this stage.
Each lesson must follow its assigned template's required structure precisely.
Use domain-specific terminology and concrete, realistic scenarios in examples.
Write for serious learners who will later be evaluated in quizzes and practical missions.
Make the content feel like it was written by a practitioner-trainer, not a generic explainer.
${gtBlock ? 'Ground truth block above contains mandatory topics and hard numeric thresholds — cite these exact values in the relevant lessons.' : ''}
${isRegulatory ? '\nIMPORTANT: All content must comply with the regulatory constraints in the context block above. Regulatory violations are non-dismissable — they will block module deployment until resolved by a competent person reviewer.' : ''}

REFERENCE — example lesson (match this quality, realism, and instructional depth):
${domainReferenceExample(domainPrompt, 'lesson')}

Output only the JSON object. No preamble. No explanation.`;

  return { system, user };
}

// ─── Stage Test (Step per stage) ──────────────────────────────────────────────

export function buildStageTestPrompt(
  domainPrompt: string,
  stage: BlueprintStage,
  lessonSummaries: Array<{ title: string; objective: string }>,
  objectives: string[] = [],
  existingLessonQuizPrompts: string[] = [],
  regulatoryContextBlock?: string
): PromptPair {
  const isRegulatory = !!regulatoryContextBlock;

  const system = `You are a technical assessment writer creating stage-gate examination questions.
Questions must test understanding and application — not trivial recall of definitions.
The exam is used to gate progression after lessons and practical work.
${isRegulatory ? '\nThis is a COMPLIANCE MODULE stage-gate exam. The regulatory context block in the user message contains the applicable regulations — every question must be traceable to a specific duty or requirement from that context.' : ''}
Your output must be valid JSON only. No markdown fences. No explanation text before or after.
Output a single JSON object with the root key "test".

The "test" value must be an array of exactly 8 TrainingQuestion objects:
{
  id: string,          // "t1" through "t8"
  type: "mcq" | "tf",
  prompt: string,
  options?: string[],  // required for mcq (exactly 3 options), omit for tf
  answer: string | boolean, // for mcq: exact match to one option; for tf: boolean true or false
  explanation: string${isRegulatory ? `,
  regulatoryRef: string  // REQUIRED for compliance modules — e.g. "MHSWR 1999 Reg 3(1)". Must match a regulation from the context block.` : ''}
}

CRITICAL RULES:
1. IDs must be "t1" through "t8" exactly.
2. MCQ answer must exactly match one of the 3 options (case-sensitive string).
3. TF answer must be boolean true or false — never the string "true" or "false".
4. Questions must not duplicate any lesson quiz questions.
5. Use a mix: 5–6 mcq and 2–3 tf questions.
6. Difficulty mix: keep application/analysis questions at 40-50% of the stage test.
7. Include plausible distractors based on common mistakes, unsafe shortcuts, or misunderstanding of sequence/cause.
8. Cover the stage objective broadly; do not over-focus on a single lesson.
9. Do not introduce technical terms/mechanics that are absent from stage objective and lesson summaries.${isRegulatory ? `
10. Each question MUST include "regulatoryRef" citing the specific regulation and paragraph being tested — e.g. "PUWER 1998 Reg 6" or "MHSWR 1999 Reg 3(1)". Use only references that appear in the regulatory context block. Do not invent regulation numbers.` : ''}

SELF-REVIEW (before returning JSON, verify the test array — revise in-place if any check fails):
- Objective coverage: questions collectively span the full stage objective — not over-focused on a single lesson.
- Cognitive level: 40–50% of questions require applied or analytical reasoning, not recall.
- Distractor quality: each MCQ has plausible distractors grounded in common mistakes or unsafe shortcuts.
- No quiz echo: no question is a restatement or close synonym of a lesson quiz question.
- Schema fidelity: exactly 8 questions ("t1"–"t8"); MCQ answer exactly matches one option string; TF answer is boolean (not string).${isRegulatory ? `
- Regulatory fidelity: every question includes "regulatoryRef" citing a specific regulation from the context block — no question omits this field.` : ''}
If any check fails, correct it before outputting.`;

  const existingQuizBlock =
    existingLessonQuizPrompts.length > 0
      ? `\nLESSON QUIZ PROMPTS ALREADY USED (do not repeat or rephrase any of these):\n${existingLessonQuizPrompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n`
      : '';

  const user = `${isRegulatory && regulatoryContextBlock ? `${regulatoryContextBlock}\n\n` : ''}DOMAIN: ${domainPrompt}
STAGE ${stage.id}: ${stage.title}
STAGE OBJECTIVE: ${stage.stageObjective}
MODULE OBJECTIVES: ${JSON.stringify(objectives)}

LESSONS COVERED (titles and objectives — do not duplicate these lesson-level quiz questions):
${JSON.stringify(lessonSummaries, null, 2)}${existingQuizBlock}
Write 8 stage exam questions assessing mastery of the full stage objective.
Cover different lessons and sub-skills. No question should be a repeat of lesson quiz questions.
Prioritize scenario-based decisions, troubleshooting order, diagnosis, tradeoffs, or consequence reasoning where appropriate.
Reject any question that depends on jargon not present in the stage objective or lesson summaries.${isRegulatory ? '\nEach question must include "regulatoryRef" citing the specific regulation being tested. All references must appear in the regulatory context block above.' : ''}

REFERENCE — example stage exam question (match this difficulty and specificity):
${domainReferenceExample(domainPrompt, 'testQuestion')}

Output only the JSON object. No preamble. No explanation.`;

  return { system, user };
}

// ─── Missions (single call for entire module) ─────────────────────────────────

export function buildMissionsPrompt(
  domainPrompt: string,
  audienceDescription: string,
  stageTitles: string[],
  missionCount: number,
  objectives: string[] = [],
  lessonSummaries?: Array<{
    stageId: number;
    stageTitle: string;
    lessons: Array<{ id: string; title: string; objective: string }>;
  }>,
  regulatoryContextBlock?: string
): PromptPair {
  const system = `You are a scenario designer for practical training missions.${regulatoryContextBlock ? '\nThis module is regulatory compliance training. The regulatory context block in the user message lists key duties, duty holders, and compliance criteria. Mission scenarios must be grounded in these — test judgment about duty-holder decisions, regulatory thresholds, control hierarchy choices, and enforcement consequences. At least one mission per mandatory duty should exist across the set.' : ''}
Missions are branching decision scenarios where the learner chooses an action and receives differentiated feedback.
These missions are used as practical gates before stage progression. They must train judgment, sequence, and consequence awareness.

Your output must be valid JSON only. No markdown fences. No explanation text before or after.
Output a single JSON object with the root key "missions".

The "missions" value must be an array of exactly ${missionCount} TrainingMission objects:
{
  id: string,          // "m1", "m2", ... "m${missionCount}" (or domain-specific prefix if clearly consistent)
  title: string,
  description: string, // scenario setup, 2–4 sentences, includes context + constraint
  whyItMatters: string,// 1–2 sentences on business/safety/service/quality importance
  stageMin: number,    // earliest stage this mission appears (1..${stageTitles.length})
  stageMax: number,    // latest stage (inclusive); stageMax >= stageMin
  branches: Array<{
    choice: string,    // what the learner decides to do
    outcome: string,   // what happens as a result (1–2 sentences)
    score: number,     // integer 0..100 (higher = better decision quality)
    feedback: string   // why this score (1–2 sentences)
  }>                   // 3–6 branches
}

CRITICAL RULES:
1. Every mission must have 3–6 branches.
2. Every mission must include:
   - at least one ideal/strong response (score >= 85)
   - at least one weak/harmful response (score <= 25)
   - at least one partially-correct but incomplete response (score 30..75)
2. stageMax must be >= stageMin and <= ${stageTitles.length}.
3. Spread missions across different stages (not all at stageMin 1).
4. Branch choices must represent realistic options a learner might actually choose under pressure (including tempting shortcuts).
5. Feedback must coach decision quality, sequence, and consequence — not just say "correct/incorrect".

SELF-REVIEW (before returning JSON, verify each mission — revise in-place if any check fails):
- Scenario realism: the situation is something a practitioner would genuinely face in this domain, with real stakes or constraints.
- Branch quality: at least one ideal response (score >= 85), one weak/harmful response (score <= 25), one partial (score 30–75).
- Coaching quality: feedback explains consequence and reasoning — not just whether the choice was right.
- Stage fit: stageMin/stageMax reflect the lesson skills required; missions are spread across stages, not all at stage 1.
- Schema fidelity: every mission has 3–6 branches; stageMax >= stageMin and <= total stage count.
If any mission fails a check, correct it before outputting.`;

  const lessonSummariesBlock =
    lessonSummaries && lessonSummaries.length > 0
      ? `\nLESSON SUMMARIES (use these to write missions that practise specific lesson skills — each mission should connect to at least one lesson's skill or objective):\n${JSON.stringify(lessonSummaries, null, 2)}\n`
      : '';

  const user = `${regulatoryContextBlock ? `${regulatoryContextBlock}\n\n` : ''}DOMAIN: ${domainPrompt}
TARGET AUDIENCE: ${audienceDescription}
STAGE TITLES: ${JSON.stringify(stageTitles)}
MODULE OBJECTIVES: ${JSON.stringify(objectives)}${lessonSummariesBlock}
Write ${missionCount} practical scenario missions for this training module.
Scenarios should reflect realistic situations the learner will face on the job in this domain.
Design missions that could realistically be used as lesson/stage practical gates.
Prioritize consequences, risk, sequence, and escalation judgment over trivia.
Use varied scenario types across stages (first response, diagnosis, communication, handoff, escalation, recovery, prevention).
Where lesson summaries are provided, ensure each mission maps clearly to at least one lesson skill — use the lesson IDs as your anchor.

REFERENCE — example mission (match this realism and branching quality):
${domainReferenceExample(domainPrompt, 'mission')}

Output only the JSON object. No preamble. No explanation.`;

  return { system, user };
}

// ─── Placement Assessment (single call) ──────────────────────────────────────

export function buildPlacementAssessmentPrompt(
  domainPrompt: string,
  audienceDescription: string,
  stageTitles: string[],
  curriculum: TrainingStage[],
  objectives: string[] = [],
  regulatoryContext = ''
): PromptPair {
  const isSingleStageModule = stageTitles.length <= 1;
  const lessonSummaries = curriculum.map((stage) => ({
    stageId: stage.id,
    stageTitle: stage.title,
    lessons: stage.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, objective: lesson.objective }))
  }));

  const system = `You are a placement assessment designer for a scenario-based mastery trainer.
You are creating a short entry assessment that estimates the best starting stage while preserving later practical gates.

Your output must be valid JSON only. No markdown fences. No explanation text before or after.
Output a single JSON object with root key "placementAssessment".

The "placementAssessment" value must match:
{
  title: string,
  quizTitle: string,
  introText: string,
  completedResultLabel: string,
  recommendedStartTitle: string,
  recommendedStartHint: string,
  questions: TrainingQuestion[],          // exactly 15 questions
  recommendationThresholds: Array<{       // sorted descending by minScore
    minScore: number,                     // integer 0..100
    stage: number                         // integer 1..${stageTitles.length}
  }>                                      // 3-4 threshold entries recommended, must include stage 1 fallback
}

TrainingQuestion schema:
{
  id: string,                // "p1" ... "p15"
  type: "mcq" | "tf",
  prompt: string,
  options?: string[],        // required for mcq (3 options)
  answer: string | boolean,  // mcq answer exact option string; tf answer boolean
  explanation: string${regulatoryContext ? `,
  regulatoryRef: string      // REQUIRED — cite the specific regulation being screened, e.g. "MHSWR 1999 Reg 3(1)". Use only references from the regulatory context.` : ''}
}

CRITICAL RULES:
1. Exactly 15 questions.
2. Questions should mainly test stages 1-4 readiness (fundamentals + core operational judgment), not late-stage specialization.
3. Use 40-50% decision/application questions and the rest knowledge/comprehension.
4. recommendationThresholds must be realistic and monotonic (higher score -> same or higher stage).
5. Include stage 1 as the lowest fallback threshold (typically minScore 0).
6. Internally calibrate thresholds against at least 4 archetypes (novice, basic practitioner, intermediate practitioner, advanced practitioner) and ensure cutoffs separate these profiles plausibly.
7. Prefer threshold spacing with meaningful gaps (typically 8-20 points) to avoid unstable recommendations from a 1-question swing.
8. If stage count is 1, treat this as a readiness diagnostic; all thresholds should map to stage 1 and wording should avoid implying multi-stage routing.${regulatoryContext ? `
9. Every question MUST include "regulatoryRef" citing the specific regulation and paragraph it screens for. Use only references from the regulatory context provided. Do not invent regulation numbers.` : ''}`;

  const user = `DOMAIN: ${domainPrompt}
TARGET AUDIENCE: ${audienceDescription}
STAGE TITLES: ${JSON.stringify(stageTitles)}
MODULE OBJECTIVES: ${JSON.stringify(objectives)}
${regulatoryContext ? `\nREGULATORY CONTEXT:\n${regulatoryContext}\n` : ''}
LESSON SUMMARY CONTEXT (use for topic coverage, do not copy verbatim):
${JSON.stringify(lessonSummaries, null, 2)}

Create a 15-question placement assessment and recommended-start thresholds.
The goal is to place experienced learners into an appropriate starting stage while keeping practical scenario gates intact.
Questions must be useful screening questions, not niche trivia.
Before finalizing output, run an internal check: "Would this threshold set place a capable but rusty learner too high?" If yes, make thresholds more conservative.
${isSingleStageModule ? 'This module has one stage. Keep recommendationThresholds for stage 1 only and position the assessment as readiness profiling.' : ''}

Output only the JSON object. No preamble. No explanation.`;

  return { system, user };
}

// ─── Lesson Mission Map (single call) ────────────────────────────────────────

export function buildLessonMissionMapPrompt(
  domainPrompt: string,
  curriculum: TrainingStage[],
  missions: TrainingMission[],
  objectives: string[] = []
): PromptPair {
  const lessonSummaries = curriculum.map((stage) => ({
    stageId: stage.id,
    stageTitle: stage.title,
    lessons: stage.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      objective: lesson.objective
    }))
  }));
  const missionSummaries = missions.map((mission) => ({
    id: mission.id,
    title: mission.title,
    description: mission.description,
    stageMin: mission.stageMin ?? null,
    stageMax: mission.stageMax ?? null
  }));

  const system = `You are designing practical gating for a scenario-based mastery trainer.
Your task is to map lessons to simulator missions so key skills require practice evidence before completion.

Your output must be valid JSON only. No markdown fences. No explanation text before or after.
Output a single JSON object with root key "lessonMissionMap".

The "lessonMissionMap" value must be an object keyed by lessonId:
{
  "<lessonId>": {
    lessonId: string,
    missionIds: string[],   // 1-2 mission IDs
    rationale: string       // 1-2 sentences explaining what practical skill is being verified
  },
  ...
}

CRITICAL RULES:
1. Only map lessons that genuinely benefit from practical scenario gating (do not map every lesson).
2. Prefer 20-45% of lessons to have mission gates.
3. missionIds must reference the provided missions exactly.
4. Mission-stage fit should make sense (avoid mapping a Stage 1 lesson to a Stage 6-only mission).
5. Rationales must name the skill/decision being verified (not generic text).
6. Each mapping must be semantically aligned: lesson objective/title should clearly connect to mission scenario and mission stage range.
7. Avoid convenience mappings ("closest stage mission") if the mission does not actually test the lesson skill.
8. Do not map a lesson to a mission if overlap is only generic terms (e.g., "safety", "diagnose", "check"). Require concrete skill-term overlap.
9. Rationale must cite one concrete lesson skill phrase and one concrete mission decision/outcome phrase.`;

  const user = `DOMAIN: ${domainPrompt}
MODULE OBJECTIVES: ${JSON.stringify(objectives)}

LESSONS:
${JSON.stringify(lessonSummaries, null, 2)}

MISSIONS:
${JSON.stringify(missionSummaries, null, 2)}

Map the most important practical lessons to scenario missions for gating.
Prioritize lessons involving diagnosis, sequencing, communication under pressure, handoffs, escalation, or consequence-sensitive decisions.
Internally reject any mapping where the rationale could apply equally to 5+ lessons (too generic).

Output only the JSON object. No preamble. No explanation.`;

  return { system, user };
}

// ─── Source Attribution (single call) ────────────────────────────────────────

export function buildSourceAttributionPrompt(
  domainPrompt: string,
  sourceReferences: string[],
  curriculum: TrainingStage[],
  missions: TrainingMission[],
  objectives: string[] = []
): PromptPair {
  const lessonContext = curriculum.flatMap((stage) =>
    stage.lessons.map((lesson) => ({
      lessonId: lesson.id,
      stageId: stage.id,
      title: lesson.title,
      objective: lesson.objective
    }))
  );
  const missionContext = missions.map((mission) => ({
    missionId: mission.id,
    title: mission.title,
    description: mission.description
  }));

  const system = `You are a training content attribution assistant.
Your task is to produce a source catalog and citation mappings for generated curriculum content.

Your output must be valid JSON only. No markdown fences. No explanation text before or after.
Output a single JSON object with this exact root structure:
{
  sourceCatalog: Array<{
    id: string,         // e.g. "src1", "src2"
    title: string,
    url: string,
    notes?: string,
    publisher?: string,
    reliability?: "authoritative" | "reputable" | "secondary",
    year?: number,
    lastVerified?: string
  }>,
  citationMap: {
    lessonCitations: Record<string, string[]>,   // lessonId -> source IDs
    missionCitations: Record<string, string[]>   // missionId -> source IDs
  }
}

CRITICAL RULES:
1. Use the provided references as the basis for sourceCatalog whenever possible.
2. Every lessonId and missionId from the input context must appear in citationMap with at least 1 source ID.
3. Citation IDs must exist in sourceCatalog.
4. If provided references are sparse, still produce best-effort attribution but mark notes conservatively.
5. Do not fabricate highly specific standards/legal claims in source titles; keep titles faithful to provided references.
6. Prefer stable, verifiable URLs; avoid placeholder or obviously fake links.
7. For lessons/missions that include safety, legal, compliance, incident-response, or numeric/procedural claims, attach at least 2 citations when possible.
8. Internally verify citation coverage for every item before output (no uncited lesson/mission).
9. Include reliability and lastVerified for each source entry.
10. Prefer authoritative/reputable sources for procedural and safety-relevant claims.`;

  const user = `DOMAIN: ${domainPrompt}
MODULE OBJECTIVES: ${JSON.stringify(objectives)}

PROVIDED SOURCE REFERENCES (URLs, may be empty):
${JSON.stringify(sourceReferences, null, 2)}

LESSONS TO CITE:
${JSON.stringify(lessonContext, null, 2)}

MISSIONS TO CITE:
${JSON.stringify(missionContext, null, 2)}

Build sourceCatalog and citationMap for this generated module.
Prefer direct mappings to provided references.
Keep source IDs short and stable (src1, src2, ...).

Output only the JSON object. No preamble. No explanation.`;

  return { system, user };
}

// ─── Source Discovery (single call) ──────────────────────────────────────────

export function buildSourceDiscoveryPrompt(input: {
  domainPrompt: string;
  audienceDescription: string;
  objectives: string[];
  providedSourceReferences: string[];
  curriculum: TrainingStage[];
  missions: TrainingMission[];
}): PromptPair {
  const lessonContext = input.curriculum.flatMap((stage) =>
    stage.lessons.map((lesson) => ({
      lessonId: lesson.id,
      title: lesson.title,
      objective: lesson.objective
    }))
  );
  const missionContext = input.missions.map((mission) => ({
    missionId: mission.id,
    title: mission.title,
    description: mission.description
  }));

  const system = `You are a source discovery assistant for professional training content.
Find high-quality, relevant references to support generated lessons and missions.

Output must be valid JSON only. No markdown fences.
Return exactly:
{
  "discoveredSources": Array<{
    "title": string,
    "url": string,
    "rationale": string,
    "priority": "high" | "medium"
  }>
}

RULES:
- Prefer official docs, standards bodies, reputable education/government pages, and known technical references.
- Avoid forums, random blogs, and untrusted aggregators unless no stronger source exists.
- Include 6-12 sources.
- URLs must be plausible http(s) links.
- Prioritize sources likely to support safety, legal/compliance, incident-response, or procedural claims.
- Prefer current revisions/editions and sources with recent update signals when guidance changes quickly.
- Exclude sources you would not trust as a training authority.`;

  const user = `DOMAIN: ${input.domainPrompt}
TARGET AUDIENCE: ${input.audienceDescription}
OBJECTIVES: ${JSON.stringify(input.objectives)}

PROVIDED SOURCE REFERENCES:
${JSON.stringify(input.providedSourceReferences, null, 2)}

LESSONS:
${JSON.stringify(lessonContext, null, 2)}

MISSIONS:
${JSON.stringify(missionContext, null, 2)}

Generate discoveredSources to supplement provided references.
Output only JSON.`;

  return { system, user };
}

// ─── Fact-check (single call) ────────────────────────────────────────────────

export function buildFactCheckPrompt(input: {
  domainPrompt: string;
  objectives: string[];
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
  citationMap: {
    lessonCitations: Record<string, string[]>;
    missionCitations: Record<string, string[]>;
  };
  curriculum: TrainingStage[];
  missions: TrainingMission[];
  placementQuestionCount: number;
  regulatoryFactCheckConfig?: string;   // injected severity config for compliance modules
  minItems?: number;
  maxItems?: number;
  conciseRationales?: boolean;
}): PromptPair {
  const lessonContext = input.curriculum.flatMap((stage) =>
    stage.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      objective: lesson.objective
    }))
  );
  const missionContext = input.missions.map((mission) => ({
    id: mission.id,
    title: mission.title,
    description: mission.description
  }));

  const isRegulatory = !!input.regulatoryFactCheckConfig;
  const minItems = Math.max(1, input.minItems ?? 10);
  const maxItems = Math.max(minItems, input.maxItems ?? 16);

  const system = `You are a strict fact-check reviewer for generated training content.
You must produce a risk-focused fact-check report from available source attribution context.
${isRegulatory ? '\nThis is a COMPLIANCE MODULE. The severity configuration in the user message defines which claim patterns must be flagged at which severity level. "regulatory" severity items are non-dismissable in the reviewer portal.' : ''}

Output must be valid JSON only. No markdown fences. No prose outside JSON.
Return exactly:
{
  "factCheck": {
    "items": Array<{
      "id": string,                           // fc1, fc2, ...
      "claim": string,
      "relatedItemId": string,                // lessonId, missionId, or "placement"
      "relatedItemType": "lesson" | "mission" | "placement" | "general",
      "sourceIds": string[],
      "verdict": "supported" | "unsupported" | "ambiguous",
      "severity": "low" | "medium" | "high"${isRegulatory ? ' | "regulatory"' : ''},
      "rationale": string
    }>,
    "summary": {
      "supported": number,
      "unsupported": number,
      "ambiguous": number
    }
  }
}

RULES:
- Focus on high-impact procedural, safety, legal/regulatory, and numeric claims.
- Mark unsupported only when available attribution context is insufficient or contradictory.
- Use severity "high" for claims that could cause unsafe/incorrect decisions if wrong.
${isRegulatory ? '- Use severity "regulatory" for any claim matching the regulatory severity patterns in the config block — these are non-dismissable in the reviewer portal and require a recorded rationale before deployment.' : ''}
- CRITICAL: For items with severity "high" or "regulatory", NEVER use verdict "ambiguous". You MUST return "supported" or "unsupported". If evidence is genuinely insufficient, use "unsupported" and state what specific evidence is needed. Additionally, for ANY item — regardless of severity — that involves a specific regulation number, a statutory numeric action value, or a named duty-holder assignment, NEVER use verdict "ambiguous". Ambiguous verdicts on legally specific claims cannot be resolved by reviewers and block export.
- Include between ${minItems} and ${maxItems} items.
- sourceIds must come from provided sourceCatalog IDs when possible.
- For unsupported high-risk claims, rationale must explicitly state what evidence is missing.${input.conciseRationales ? '\n- Keep each rationale to one sentence and under 180 characters.' : ''}
- Ensure summary counts exactly match item verdict totals.
- If a claim cannot be supported confidently, prefer conservative wording and mark it clearly.`;

  const user = `${isRegulatory && input.regulatoryFactCheckConfig ? `${input.regulatoryFactCheckConfig}\n\n` : ''}DOMAIN: ${input.domainPrompt}
MODULE OBJECTIVES: ${JSON.stringify(input.objectives)}

SOURCE CATALOG:
${JSON.stringify(input.sourceCatalog, null, 2)}

CITATION MAP:
${JSON.stringify(input.citationMap, null, 2)}

LESSONS:
${JSON.stringify(lessonContext, null, 2)}

MISSIONS:
${JSON.stringify(missionContext, null, 2)}

PLACEMENT QUESTION COUNT: ${input.placementQuestionCount}

Generate a fact-check report that prioritizes risk and educational consequence.${isRegulatory ? ' Apply the regulatory severity configuration above — any claim matching regulatory-severity patterns must be flagged at "regulatory" severity.' : ''}
Output only the JSON object.`;

  return { system, user };
}

// ─── Advanced Artifacts — Split prompts ──────────────────────────────────────
// advancedArtifacts is split into 3 focused API calls to reduce per-call token
// load and isolate failures to the affected section only.

// ─── simulatorDesign sub-step ─────────────────────────────────────────────────

export function buildSimulatorDesignPrompt(input: {
  domainPrompt: string;
  audienceDescription: string;
  objectives: string[];
  stageTitles: string[];
  lessonsPerStage: Array<{ stageId: number; stageTitle: string; lessons: Array<{ id: string; title: string; objective: string }> }>;
  regulatoryContextBlock?: string;
}): PromptPair {
  const system = `You are designing a domain-specific training simulator for a vocational module.
Your output must be valid JSON only. No markdown fences. No prose outside JSON.

Return exactly:
{
  "simulatorDesign": {
    "concept": string,
    "learnerControls": string[],
    "stateVariables": Array<{ "name": string, "description": string }>,
    "visibleOutcomes": string[],
    "subsystems": Array<{ "id": string, "title": string, "purpose": string }>,
    "tickModel": {
      "model": string,
      "stepMs": number,
      "updateSequence": string[]
    },
    "faultInjectionModel": {
      "injectableFaultTypes": string[],
      "examples": string[]
    },
    "trainerPanels": Array<{
      "id": string,
      "title": string,
      "stageMin": number,
      "stageMax": number,
      "focus": string
    }>
  }
}

Rules:
- Domain-native content only. Do not use controller/PLC terms unless the domain explicitly is PLC.
- Build a meaningful simulator with observable state, learner-controlled inputs, and visible consequences.
- stateVariables: at least 3 variables tracking meaningful domain quantities.
- subsystems: at least 3 distinct functional areas of the simulator.
- trainerPanels: at least 2 panels covering different stage ranges.
- stepMs should be a realistic tick rate (100–2000ms) for the domain's dynamic timescale.
- faultInjectionModel examples must be realistic failure modes for this domain.`;

  const user = `${input.regulatoryContextBlock ? `${input.regulatoryContextBlock}\n\n` : ''}DOMAIN: ${input.domainPrompt}
AUDIENCE: ${input.audienceDescription}
OBJECTIVES: ${JSON.stringify(input.objectives)}
STAGES: ${JSON.stringify(input.stageTitles)}
LESSONS:
${JSON.stringify(input.lessonsPerStage, null, 2)}

Design a subject-specific simulator. Make it feel like it was designed by a domain practitioner, not a generic training tool.${input.regulatoryContextBlock ? ' faultInjectionModel examples must represent realistic regulatory non-compliance scenarios (e.g. overdue statutory examination, missing authorisation record, exceeded threshold) — not just generic mechanical failures.' : ''}
Output only the JSON object.`;

  return { system, user };
}

// ─── faultAndReference sub-step ───────────────────────────────────────────────

export function buildFaultAndReferencePrompt(input: {
  domainPrompt: string;
  audienceDescription: string;
  stageTitles: string[];
  lessonsPerStage: Array<{ stageId: number; stageTitle: string; lessons: Array<{ id: string; title: string; objective: string }> }>;
  simulatorConcept?: string;
  regulatoryContextBlock?: string;
}): PromptPair {
  const simulatorBlock = input.simulatorConcept
    ? `\nSIMULATOR CONCEPT (fault scenarios should target this simulator's fault injection model):\n${input.simulatorConcept}`
    : '';

  const system = `You are designing fault scenario campaigns and field reference cards for a vocational training module.
Your output must be valid JSON only. No markdown fences. No prose outside JSON.

Return exactly:
{
  "faultScenarioCampaign": {
    "scenarios": Array<{
      "id": string,
      "symptomDescription": string,
      "injectedIssues": string[],
      "compound": boolean,
      "difficulty": "beginner" | "intermediate" | "advanced",
      "expectedReasoningPath": string[],
      "successCriteria": string[],
      "scoreRange": { "min": number, "max": number }
    }>
  },
  "fieldReferenceCards": Array<{
    "id": string,
    "title": string,
    "purpose": string,
    "checklist": string[],
    "preventsMistake": string
  }>
}

Rules:
- faultScenarioCampaign.scenarios must contain exactly 20 items.
- Difficulty distribution: 8 beginner, 7 intermediate, 5 advanced.
- Compound faults should appear mainly in intermediate/advanced.
- scoreRange min and max must be integers 0..100 and min < max.
- fieldReferenceCards must contain exactly 5 items.
- Each reference card checklist must have at least 3 actionable items.
- Content must be domain-native — no controller/PLC references unless the domain is controller/PLC.`;

  const user = `${input.regulatoryContextBlock ? `${input.regulatoryContextBlock}\n\n` : ''}DOMAIN: ${input.domainPrompt}
AUDIENCE: ${input.audienceDescription}
STAGES: ${JSON.stringify(input.stageTitles)}
LESSONS:
${JSON.stringify(input.lessonsPerStage, null, 2)}${simulatorBlock}

Generate exactly 20 fault/scenario campaign items with escalating difficulty and exactly 5 field reference cards.${input.regulatoryContextBlock ? '\nFor compliance modules: fault scenarios must include regulatory non-compliance failures (missed statutory examination, incorrect duty-holder action, threshold breach). Field reference cards should map directly to the key duties in the regulatory context block — e.g. inspection checklists, authorisation records, reporting procedures.' : ''}
Output only the JSON object.`;

  return { system, user };
}

// ─── builderAndCapstone sub-step ──────────────────────────────────────────────

export function buildBuilderAndCapstonePrompt(input: {
  domainPrompt: string;
  audienceDescription: string;
  objectives: string[];
  stageTitles: string[];
  missionIds: string[];
  regulatoryContextBlock?: string;
}): PromptPair {
  const missionIdsStr = input.missionIds.length > 0 ? input.missionIds.join(', ') : 'm1, m2, m3';

  const system = `You are designing builder exercises, a capstone challenge, progression scoring rules, and implementation notes for a vocational training module.
Your output must be valid JSON only. No markdown fences. No prose outside JSON.

Return exactly:
{
  "builderExercises": Array<{
    "id": string,
    "title": string,
    "templateType": string,
    "paletteItems": string[],
    "requiredSlots": string[],
    "validationLogic": string,
    "testCases": Array<{ "id": string, "input": string, "expected": string }>
  }>,
  "capstoneChallenge": {
    "title": string,
    "requiredMissionIds": string[],
    "optionalBonusMissionIds": string[],
    "scoringRubric": Array<{ "criterion": string, "weight": number, "description": string }>,
    "guidanceBands": Array<{ "band": string, "minScore": number, "maxScore": number, "guidance": string }>,
    "reportFields": string[]
  },
  "progressionScoringRules": {
    "missionScoring": string,
    "faultCampaignScoring": string,
    "stageProgression": string,
    "capstonePassThreshold": number
  },
  "implementationNotes": {
    "dataModelNotes": string[],
    "renderingHints": string[],
    "idConventions": string[]
  }
}

Rules:
- builderExercises: exactly 4 items, each with 2–3 testCases.
- capstoneChallenge.requiredMissionIds must reference IDs from the provided MISSION IDS list.
- capstoneChallenge scoringRubric weights must sum to 100.
- capstoneChallenge guidanceBands: at least 3 bands covering the 0–100 score range.
- capstoneChallenge reportFields: at least 5 items.
- capstonePassThreshold: integer 0..100.
- Content must be domain-native — no controller/PLC references unless the domain is controller/PLC.`;

  const user = `${input.regulatoryContextBlock ? `${input.regulatoryContextBlock}\n\n` : ''}DOMAIN: ${input.domainPrompt}
AUDIENCE: ${input.audienceDescription}
OBJECTIVES: ${JSON.stringify(input.objectives)}
STAGES: ${JSON.stringify(input.stageTitles)}
MISSION IDS (use for capstoneChallenge.requiredMissionIds): [${missionIdsStr}]

Generate 4 builder exercises, a capstone challenge referencing the provided mission IDs, scoring rules, and implementation notes.${input.regulatoryContextBlock ? '\nFor compliance modules: capstoneChallenge.scoringRubric must include regulatory competency criteria drawn from the key duties in the regulatory context block. Builder exercises should require the learner to construct or sequence compliance artefacts (risk assessments, inspection records, authorisation documents).' : ''}
Output only the JSON object.`;

  return { system, user };
}

// ─── Theme Shell (single call) ────────────────────────────────────────────────

export function buildThemeShellPrompt(
  domainPrompt: string,
  moduleId: string,
  audienceDescription: string,
  stageCount: number
): PromptPair {
  const system = `You are generating a configuration object for a training module.
You are creating a theme shell for a serious training product, not a marketing landing page.
Your output must be valid JSON only. No markdown fences. No explanation text before or after.
Output a single JSON object with the root key "themeShell".

The "themeShell" value must match:
{
  id: string,                    // must be exactly "${moduleId}"
  title: string,                 // display name e.g. "Hydraulics Training Platform"
  icon: string,                  // 2–6 character abbreviation e.g. "HYD"
  shortDescription: string,      // 1–2 sentence summary for module selector
  description: string,           // 2–3 sentence description for dashboard header
  suggestedAccentColor: "amber" | "sky" | "teal" | "emerald" | "violet" | "rose",
  flags: {
    hasSimulator: boolean,
    hasPlacement: boolean,
    hasAdaptiveReview: boolean
  },
  terms: {
    primaryDiscipline: string,   // e.g. "Hydraulics", "Electrical", "Welding"
    simulatorLabel: string       // e.g. "Simulator", "Role-Play Simulator"
  },
  labels: {
    dashboardExtensionsTitle: string,  // e.g. "Practice Labs & Tools" (NOT "Labs & Extensions")
    ladderBuilderTitle: string,        // name for the builder tool in this domain — e.g. "Wiring Builder", "Assembly Trainer", "Conversation Builder"
    faultCampaignTitle: string,        // name for the campaign drill — e.g. "Fault Diagnosis Drill", "Objection Drill Campaign", "Diagnostic Practice Run"
    capstoneTitle: string,             // final challenge name — e.g. "Capstone Repair Challenge", "Final Competency Assessment"
    fieldReferenceTitle: string,       // reference card collection name — e.g. "Repair Reference Guide", "Hydraulics Field Reference"
    sourcesTitle: string               // bibliography label — e.g. "References & Sources"
  },
  tooling?: {
    availability?: {
      simulator?: boolean,
      review?: boolean,
      builder?: boolean,
      faultCampaign?: boolean,
      pidIntro?: boolean,
      capstone?: boolean
    },
    artifacts?: {
      simulator?: boolean,
      review?: boolean,
      builder?: boolean,
      faultCampaign?: boolean,
      pidIntro?: boolean,
      capstone?: boolean
    },
    stagePlans?: Array<{
      stageId: number,
      primaryTool: "simulator" | "review" | "builder" | "faultCampaign" | "pidIntro" | "capstone",
      supportingTools?: Array<"simulator" | "review" | "builder" | "faultCampaign" | "pidIntro" | "capstone">,
      rationale: string
    }>
  }
}

Color guidance — choose based on domain character:
- amber: industrial/warnings/mechanical (default for technical)
- sky: analytical/data/systems
- teal: process/service/communication
- emerald: safety/environmental/green energy
- violet: advanced/specialist/engineering
- rose: medical/care/life safety`;

  const user = `DOMAIN: ${domainPrompt}
MODULE ID: ${moduleId}
TARGET AUDIENCE: ${audienceDescription}
STAGE COUNT: ${stageCount}

Generate the theme configuration shell for this module.
The id field must be exactly "${moduleId}".
Choose suggestedAccentColor based on the domain's character.
Set hasSimulator: true, hasPlacement: true, hasAdaptiveReview: true for all modules unless the domain clearly cannot support a meaningful placement assessment.

LABELS (required): Provide domain-specific names for every label key. NEVER use generic names like "Builder", "Practice Campaign", "Capstone", or "Labs & Extensions". Use vocabulary from the actual domain — what a practitioner would call these activities. Examples: a bicycle repair course might use "Repair Task Trainer", "Fault Diagnosis Drill", "Capstone Repair Assessment", "Repair Reference Guide". A welding course might use "Weld Sequence Builder", "Defect Inspection Campaign", "Final Weld Certification".

TOOLING: The generation pipeline always produces a simulator, fault campaign, field reference guide, builder exercises, and capstone challenge — all domain-adapted. Set tooling.availability and tooling.artifacts to true for simulator, builder, faultCampaign, and capstone. Leave pidIntro false. Set review availability and artifacts to match hasAdaptiveReview. Set stagePlans to reflect the domain-appropriate primary tool (simulator for technical/practical domains, review for knowledge-only domains).

Output only the JSON object. No preamble. No explanation.`;

  return { system, user };
}

// ─── Fix/Retry prompt (used when validation finds errors) ─────────────────────

export function buildFixPrompt(
  sectionType: string,
  sectionId: string,
  offendingJson: unknown,
  errors: Array<{ rule: string; message: string }>
): PromptPair {
  const system = `You are correcting JSON curriculum data that failed schema validation.
You will receive the problematic JSON section and a list of validation errors.
Fix only what is listed in the errors. Do not change any content that is not flagged.
Preserve the instructional intent, difficulty level, and scenario realism while fixing structural issues.
Repairs must be deterministic and directly mapped to the listed validator rule IDs.
If two fixes conflict, prioritize schema validity first, then pedagogical fidelity.

Your output must be valid JSON only. No markdown fences. No explanation text.
Output the corrected JSON for the specified section only, maintaining the same root key structure.`;

  const user = `SECTION TYPE: ${sectionType}
SECTION ID: ${sectionId}

PROBLEMATIC JSON:
${JSON.stringify(offendingJson, null, 2)}

VALIDATION ERRORS TO FIX:
${errors.map((e) => `- [${e.rule}] ${e.message}`).join('\n')}

RULE-KEYED REPAIR CHECKLIST (apply all relevant lines):
${buildRuleRepairChecklist(errors)}

RULES TO REMEMBER:
- MCQ answer must exactly match one of the options strings
- TF answer must be boolean true or false (not a string)
- Ordering youTry answer must contain the same items as options in correct sequence
- All IDs must follow their naming convention (lesson: s{n}-l{n} OR <prefix>-s{n}-l{n}; quiz: q{n}; test: t{n})
- Do not introduce new IDs unless needed to resolve duplicate/format rule failures
- Do not remove branches/questions unless required to satisfy explicit count/range rules
- Do not make content more generic while fixing schema mistakes

Output the corrected JSON only. No preamble. No explanation.`;

  return { system, user };
}

// ─── Domain preflight prompt (Haiku call, runs before job creation) ───────────

export function buildPreflightPrompt(
  domainPrompt: string,
  audienceDescription: string,
  objectives: string[]
): PromptPair {
  const system = `You are a lenient pre-flight check for a curriculum generator.
A skilled curriculum writer will handle missing details through reasonable inference — your job is NOT to demand completeness.
Only flag a genuine blocker: something so vague the generator would produce meaningless filler content.

Output must be valid JSON only. No markdown. No text before or after.
Output a single JSON object:
{
  "clearEnough": boolean,
  "issues": string[],              // empty array if clearEnough is true; MAX 2 issues if false
  "suggestedImprovement": string   // one short sentence if clearEnough is false; omit if true
}

PASS (clearEnough: true) in all of these cases:
- Short but interpretable domain ("AI coding agents", "customer service", "forklift safety") → PASS
- Audience with any contextual clue ("teenagers", "new starters", "18 year old boy") → the generator infers depth → PASS
- Vague or absent objectives → the generator will infer suitable learning goals from the domain → PASS
- Informal or incomplete phrasing → PASS

ONLY return clearEnough: false if:
- The domain string is completely meaningless (e.g. "things", "stuff", "a topic") AND no other context helps
- No domain is provided at all (empty string)
If in doubt, return clearEnough: true.`;

  const objectiveBlock =
    objectives.length > 0
      ? `OBJECTIVES (${objectives.length}): ${JSON.stringify(objectives)}`
      : 'OBJECTIVES: none provided';

  const user = `DOMAIN DESCRIPTION: ${domainPrompt}
AUDIENCE: ${audienceDescription}
${objectiveBlock}

Can a curriculum be generated from this? Only block if the domain is genuinely uninterpretable.
Output only the JSON object.`;

  return { system, user };
}
