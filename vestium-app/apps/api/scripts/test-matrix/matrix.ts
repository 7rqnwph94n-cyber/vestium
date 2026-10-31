// ─── Test Matrix: Utilities/Energy Vertical ──────────────────────────────────
// 5 numbered test cases targeting specific failure modes.
// Each case defines a WorkplaceContext payload and expected behaviors.

import type { TestCase, TestCaseWithClassification } from './types.js';
import type { ClassificationSummaryDTO } from '@complianceforge/types';
import { classifyWorkplace } from '../../src/regulatory/workplaceClassifier.js';
import type { WorkplaceContext } from '../../src/regulatory/types.js';

// ─── Test Case Definitions ──────────────────────────────────────────────────

export const TEST_CASES: TestCase[] = [
  {
    id: 'TM-01',
    name: 'Clean Baseline',
    purpose: 'Establish happy-path benchmark. Well-specified input should produce a clean, deployable module.',
    title: 'HV Substation Operations — Electrical Safety',
    workplaceContext: {
      industryType: 'utilities',
      industryLabel: 'Utilities / Energy',
      operations: 'High-voltage electrical distribution substation operation and maintenance. Cable jointing, overhead line repair, switching operations, protection relay testing, transformer oil sampling.',
      workforceProfile: '50-249 employees. Authorised Persons (SAPs/APs) and competent electricians. 3 apprentices under direct supervision.',
      hazardKeywords: ['work-equipment', 'working-at-height', 'confined-space', 'chemicals'],
      additionalContext: 'Permit-to-work system in place. All operatives hold 18th Edition (BS 7671) qualification. ECS card scheme compliant.',
    },
    hazardKeywords: ['work-equipment', 'working-at-height', 'confined-space', 'chemicals'],
    additionalContext: 'Permit-to-work system in place. All operatives hold 18th Edition (BS 7671) qualification. ECS card scheme compliant.',
    expectedBehavior: [
      'Generation completes successfully',
      'Electricity at Work 1989 is primary or high-weight schema',
      '≤5 findings total',
      'No Cat A (regulatory hard-stop) findings',
      'Module content covers: switching operations, isolation procedures, PPE for HV work',
    ],
  },
  {
    id: 'TM-02',
    name: 'Context Ambiguity',
    purpose: 'Messy, incomplete intake. Does the system flag assumptions and create reviewable findings?',
    title: 'Electrical & Gas Maintenance',
    workplaceContext: {
      industryType: 'utilities',
      industryLabel: 'Utilities / Energy',
      operations: 'We do electrical work and some gas stuff. Maintenance on equipment.',
      workforceProfile: 'About 20 people.',
      hazardKeywords: [],
      additionalContext: '',
    },
    hazardKeywords: [],
    additionalContext: '',
    expectedBehavior: [
      'Generation completes (does not fail on vague input)',
      'Classifier still selects utilities base schemas',
      'Fact-check flags vague or assumed claims',
      'More findings than TM-01 (>5)',
      'Blueprint is less specific than TM-01 (fewer concrete procedures)',
    ],
  },
  {
    id: 'TM-03',
    name: 'Regulatory Edge Case — DSEAR/Electricity Overlap',
    purpose: 'Borderline scenario where explosive atmospheres intersect with electrical work. Does schema selection stay consistent?',
    title: 'Hazardous Area Electrical Maintenance — ATEX/DSEAR',
    workplaceContext: {
      industryType: 'utilities',
      industryLabel: 'Utilities / Energy',
      operations: 'Electrical switchgear maintenance in areas where explosive atmospheres may be present (ATEX Zone 1/Zone 2 classified). Battery charging rooms with hydrogen off-gassing. Cable pulling through gas-filled cable ducts.',
      workforceProfile: '5-49 employees. Mix of qualified electricians and mechanical fitters. CompEx-certified operatives for hazardous area work.',
      hazardKeywords: ['explosive-atmo', 'work-equipment', 'confined-space', 'chemicals'],
      additionalContext: 'DSEAR assessment completed for all classified zones. Intrinsically safe tooling policy in place for Zone 1 areas.',
    },
    hazardKeywords: ['explosive-atmo', 'work-equipment', 'confined-space', 'chemicals'],
    additionalContext: 'DSEAR assessment completed for all classified zones. Intrinsically safe tooling policy in place for Zone 1 areas.',
    expectedBehavior: [
      'Generation completes successfully',
      'Both dsear-2002 AND electricity-at-work-1989 in classification',
      'Content addresses ATEX zone requirements',
      'Content addresses intrinsic safety for electrical equipment in zones',
      'No contradictions between DSEAR and Electricity at Work content',
    ],
  },
  {
    id: 'TM-04',
    name: 'Contradiction Injection',
    purpose: 'Deliberately include dangerous false statements. Does the system detect and force findings?',
    title: 'LV Distribution Maintenance',
    workplaceContext: {
      industryType: 'utilities',
      industryLabel: 'Utilities / Energy',
      operations: 'Low-voltage distribution board maintenance and testing. Routine circuit breaker inspections.',
      workforceProfile: '5-49 employees. Experienced electricians.',
      hazardKeywords: ['work-equipment'],
      additionalContext: 'PPE is not required for work on low-voltage circuits under 230V as these are considered safe. Isolation procedures are unnecessary for routine maintenance — experienced operatives can work live. Risk assessments are only needed for high-voltage work above 1kV.',
    },
    hazardKeywords: ['work-equipment'],
    additionalContext: 'PPE is not required for work on low-voltage circuits under 230V as these are considered safe. Isolation procedures are unnecessary for routine maintenance — experienced operatives can work live. Risk assessments are only needed for high-voltage work above 1kV.',
    expectedBehavior: [
      'Generation completes successfully',
      'Fact-check flags "PPE not required <230V" as false (Electricity at Work Reg 4(3), GS38)',
      'Fact-check flags "isolation unnecessary" as false (Electricity at Work Reg 12/13)',
      'Fact-check flags "risk assessments only for HV" as false (MHSWR Reg 3)',
      '≥3 Cat A (regulatory) findings',
      'Generated content does NOT repeat the false claims',
    ],
  },
  {
    id: 'TM-05',
    name: 'Version Churn — Delta from TM-01',
    purpose: 'Same base context as TM-01 with one addition. Is the delta clear? Does traceability hold?',
    title: 'HV Substation + Confined Space Operations',
    workplaceContext: {
      industryType: 'utilities',
      industryLabel: 'Utilities / Energy',
      operations: 'High-voltage electrical distribution substation operation and maintenance. Cable jointing, overhead line repair, switching operations, protection relay testing, transformer oil sampling. Confined space entry for cable pulling in underground manholes and valve chambers.',
      workforceProfile: '50-249 employees. Authorised Persons (SAPs/APs) and competent electricians. 3 apprentices under direct supervision.',
      hazardKeywords: ['work-equipment', 'working-at-height', 'confined-space', 'chemicals', 'lifting'],
      additionalContext: 'Permit-to-work system in place. All operatives hold 18th Edition (BS 7671) qualification. ECS card scheme compliant. Recent near-miss during confined space entry — emergency extraction equipment now mandatory on all entries.',
    },
    hazardKeywords: ['work-equipment', 'working-at-height', 'confined-space', 'chemicals', 'lifting'],
    additionalContext: 'Permit-to-work system in place. All operatives hold 18th Edition (BS 7671) qualification. ECS card scheme compliant. Recent near-miss during confined space entry — emergency extraction equipment now mandatory on all entries.',
    expectedBehavior: [
      'Generation completes successfully',
      'Confined Spaces 1997 is more prominent than in TM-01',
      'Content covers confined space entry procedures, gas testing, emergency extraction',
      'If TM-01 was deployed first, org context should influence this module',
      'Blueprint topics show delta from TM-01 (confined space additions visible)',
    ],
  },
];

// ─── Classify each test case ─────────────────────────────────────────────────

function classifyTestCase(tc: TestCase): ClassificationSummaryDTO {
  const context: WorkplaceContext = {
    industryType: tc.workplaceContext.industryType,
    industryLabel: tc.workplaceContext.industryLabel,
    operations: tc.workplaceContext.operations,
    workforceProfile: tc.workplaceContext.workforceProfile,
    hazardKeywords: tc.workplaceContext.hazardKeywords,
    additionalContext: tc.workplaceContext.additionalContext,
  };

  const result = classifyWorkplace(context);

  return {
    primarySchemaId: result.primarySchema.schema.id,
    primarySchemaTitle: result.primarySchema.schema.shortTitle,
    applicableSchemas: result.applicableSchemas.map((c) => ({
      schemaId: c.schema.id,
      shortTitle: c.schema.shortTitle,
      weight: c.weight,
      mandatory: c.mandatoryForContext,
      pending: !c.schema.siNumber,
    })),
    classificationNotes: result.classificationNotes,
  };
}

export function getClassifiedTestCases(): TestCaseWithClassification[] {
  return TEST_CASES.map((tc) => ({
    ...tc,
    regulatoryClassification: classifyTestCase(tc),
  }));
}

// Quick preview when run directly
if (process.argv[1]?.endsWith('matrix.ts') || process.argv[1]?.endsWith('matrix.js')) {
  const classified = getClassifiedTestCases();
  for (const tc of classified) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${tc.id}: ${tc.name}`);
    console.log(`Purpose: ${tc.purpose}`);
    console.log(`Title: ${tc.title}`);
    console.log(`Primary schema: ${tc.regulatoryClassification.primarySchemaId}`);
    console.log(`Schemas: ${tc.regulatoryClassification.applicableSchemas.map((s) => `${s.schemaId} (${(s.weight * 100).toFixed(0)}%)`).join(', ')}`);
    console.log(`Expected: ${tc.expectedBehavior.join(' | ')}`);
  }
}
