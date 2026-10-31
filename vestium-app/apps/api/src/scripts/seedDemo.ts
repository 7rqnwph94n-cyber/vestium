// ─── Seed: Pilot Demo Pack ────────────────────────────────────────────────────
// Creates a complete evidence lifecycle for "Archival Roller Racking: Design
// and Installation" — one module, three findings, attestation, certificates,
// snapshots, and audit trail.
//
// Run: pnpm --filter @complianceforge/api run db:seed-demo
//
// Clerk identity binding:
//   Set these env vars to bind seeded records to real Clerk identities:
//     DEMO_CLERK_ORG_ID       — Clerk org ID (e.g. org_2x...)
//     DEMO_CLERK_ADMIN_ID     — Clerk user ID for admin
//     DEMO_CLERK_REVIEWER_ID  — Clerk user ID for reviewer
//     DEMO_CLERK_LEARNER_ID   — Clerk user ID for learner (optional)
//
//   Without env vars, synthetic local-only IDs are used (no real login possible).
//   In staging/demo mode (NODE_ENV !== 'development'), real IDs are required.
//
// Idempotent: mutable tables use ON CONFLICT DO UPDATE; WORM tables use
// ON CONFLICT DO NOTHING (trigger-locked, cannot update).
// review_findings are deleted and re-inserted on each run.

import { createHash } from 'crypto';
import { sql } from '../db/client.js';

// ─── Clerk identity resolution ───────────────────────────────────────────────
// Real Clerk IDs via env vars take precedence. Synthetic fallbacks for local dev.

const LOCAL_MODE = !process.env.DEMO_CLERK_ORG_ID;
const IS_DEV = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
const E2E_MODE = !!process.env.DEMO_E2E_MODE;

if (!LOCAL_MODE) {
  // Validate required IDs when real Clerk IDs are provided
  const missing: string[] = [];
  if (!process.env.DEMO_CLERK_ORG_ID)      missing.push('DEMO_CLERK_ORG_ID');
  if (!process.env.DEMO_CLERK_ADMIN_ID)    missing.push('DEMO_CLERK_ADMIN_ID');
  if (!process.env.DEMO_CLERK_REVIEWER_ID) missing.push('DEMO_CLERK_REVIEWER_ID');
  if (missing.length) {
    console.error(`[seed-demo] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
} else if (!IS_DEV) {
  console.error('[seed-demo] Real Clerk IDs required outside development mode.');
  console.error('  Set: DEMO_CLERK_ORG_ID, DEMO_CLERK_ADMIN_ID, DEMO_CLERK_REVIEWER_ID');
  process.exit(1);
}

const CLERK_ORG_ID   = process.env.DEMO_CLERK_ORG_ID      ?? 'org_demo_northgate';
const CLERK_ADMIN    = process.env.DEMO_CLERK_ADMIN_ID     ?? 'user_demo_admin';
const CLERK_REVIEWER = process.env.DEMO_CLERK_REVIEWER_ID  ?? 'user_demo_reviewer';
const CLERK_LEARNER  = process.env.DEMO_CLERK_LEARNER_ID   ?? 'user_demo_learner';

// ─── Deterministic IDs ───────────────────────────────────────────────────────

const DEMO_ORG_ID          = '11111111-1111-1111-1111-111111111111';
const DEMO_MODULE_ID       = '22222222-2222-2222-2222-222222222222';
const DEMO_ADMIN_MEMBER_ID = '33333333-3333-3333-3333-333333333333';
const DEMO_REVIEWER_MEMBER_ID = '44444444-4444-4444-4444-444444444444';
const DEMO_LEARNER_MEMBER_ID  = '55555555-5555-5555-5555-555555555555';
const DEMO_ATTESTATION_ID  = '66666666-6666-6666-6666-666666666666';
const DEMO_MODULE_CERT_ID  = '77777777-7777-7777-7777-777777777777';
const DEMO_LEARNER_CERT_ID = '88888888-8888-8888-8888-888888888888';
const DEMO_SNAPSHOT_V1_ID  = '99999999-9999-9999-9999-999999999999';
const DEMO_SNAPSHOT_V2_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEMO_FINDING_1_ID    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01';
const DEMO_FINDING_2_ID    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02';
const DEMO_FINDING_3_ID    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03';

// Audit log deterministic IDs
const AUDIT_IDS = [
  'cccccccc-cccc-cccc-cccc-cccccccccc01',
  'cccccccc-cccc-cccc-cccc-cccccccccc02',
  'cccccccc-cccc-cccc-cccc-cccccccccc03',
  'cccccccc-cccc-cccc-cccc-cccccccccc04',
  'cccccccc-cccc-cccc-cccc-cccccccccc05',
  'cccccccc-cccc-cccc-cccc-cccccccccc06',
  'cccccccc-cccc-cccc-cccc-cccccccccc07',
  'cccccccc-cccc-cccc-cccc-cccccccccc08',
];

// ─── Timestamps (realistic lifecycle spacing) ────────────────────────────────

const T_MODULE_CREATED = '2026-03-01T09:00:00.000Z';
const T_GEN_STARTED    = '2026-03-01T09:01:00.000Z';
const T_GEN_COMPLETE   = '2026-03-01T09:18:00.000Z';
const T_FINDINGS_SEEDED = '2026-03-01T09:18:30.000Z';
const T_FINDINGS_DISPOSED = '2026-03-03T14:30:00.000Z';
const T_ATTESTED       = '2026-03-04T10:15:00.000Z';
const T_DEPLOYED       = '2026-03-05T08:00:00.000Z';
const T_LEARNER_CERT   = '2026-03-06T16:45:00.000Z';

// ─── Module content data ─────────────────────────────────────────────────────

const WORKPLACE_CONTEXT = {
  industry: 'Warehousing & Document Storage',
  siteDescription: 'Climate-controlled archive facility housing public and private sector records. Two warehouse bays (each 1,200 m²) fitted with mobile roller racking systems (Dexion P90 profile, 6 levels, 2.4t per bay). Concrete slab floor with embedded rail tracks. Loading dock with level-access goods lift.',
  operationType: 'Installation, commissioning, routine inspection, and maintenance of mobile roller racking systems for archival document storage. Includes rail alignment, drive mechanism servicing, and load testing.',
  workerProfile: 'Warehouse operatives with 1–5 years experience in archive or logistics environments. Mix of permanent staff and agency workers. Basic manual handling training completed on induction.',
  existingControls: 'Permit to work system for racking modification. Annual SEMA racking inspection. Manual handling risk assessment reviewed quarterly. PPE policy (safety boots, gloves for handling). Emergency evacuation plan displayed at bay entrances.',
};

const REGULATORY_CLASSIFICATION = {
  primarySchemas: ['puwer-1998', 'loler-1998', 'manual-handling-1992', 'mhswr-1999', 'workplace-1992'],
  riskLevel: 'medium-high',
  cdmApplicable: false,
};

// Minimal but structurally valid step outputs for the generation job
function buildStepResults() {
  const makeStep = (key: string, parsed: unknown) => ({
    stepKey: key,
    status: 'done' as const,
    rawOutput: JSON.stringify(parsed),
    parsedJson: parsed,
    validationErrors: [],
    tokensUsed: 500,
    retryCount: 0,
  });

  // Stage 1 lessons
  const stage1 = {
    stage: {
      id: 1,
      title: 'Regulatory Framework & Risk Assessment',
      description: 'Establishes the legal duties and risk assessment methodology for roller racking operations.',
      stageObjective: 'Understand the regulatory framework governing roller racking systems and conduct compliant risk assessments.',
      prerequisiteCompetencies: [],
      lessons: [
        {
          id: 's1-l1',
          title: 'PUWER 1998 and LOLER 1998: Duties for Roller Racking Systems',
          objective: 'Identify employer and employee duties under PUWER and LOLER for mobile racking.',
          concept: [
            'The Provision and Use of Work Equipment Regulations 1998 (PUWER) require that all work equipment, including mobile roller racking, is suitable for its intended use, maintained in safe condition, and inspected at appropriate intervals. Regulation 5 places a duty on employers to ensure equipment is maintained in an efficient state.',
            'The Lifting Operations and Lifting Equipment Regulations 1998 (LOLER) apply where racking systems incorporate powered drive mechanisms that move loaded bays. LOLER Regulation 9 requires thorough examination at intervals not exceeding 6 months for equipment subject to conditions causing deterioration.',
            'Both sets of regulations operate alongside the Management of Health and Safety at Work Regulations 1999 (MHSWR), which require employers to conduct suitable and sufficient risk assessments (Regulation 3) and appoint competent persons (Regulation 7).',
          ],
          diagrams: [],
          workedExample: 'A warehouse manager receives a PUWER Regulation 6 thorough examination report for a roller racking system identifying worn drive chain tensioners. The manager must remove the bay from service, schedule repair by a competent engineer, and document the corrective action before returning the equipment to use.',
          youTry: {
            type: 'mcq' as const,
            prompt: 'Under LOLER 1998, what is the maximum interval for thorough examination of roller racking with powered drive mechanisms?',
            options: ['3 months', '6 months', '12 months', '24 months'],
            answer: '6 months',
            feedback: 'LOLER Regulation 9 requires thorough examination at intervals not exceeding 6 months for lifting equipment subject to conditions causing deterioration.',
          },
          quiz: [
            {
              id: 's1-l1-q1',
              type: 'mcq' as const,
              prompt: 'Which regulation requires employers to ensure work equipment is maintained in an efficient state?',
              options: ['PUWER 1998 Reg 5', 'LOLER 1998 Reg 9', 'MHSWR 1999 Reg 3', 'Workplace Regs 1992 Reg 17'],
              answer: 'PUWER 1998 Reg 5',
              explanation: 'PUWER 1998 Regulation 5 places a duty on employers to ensure work equipment is maintained in an efficient state, in efficient working order and in good repair.',
              regulatoryRef: 'PUWER 1998 Reg 5',
            },
            {
              id: 's1-l1-q2',
              type: 'tf' as const,
              prompt: 'LOLER 1998 only applies to cranes and hoists, not to mobile racking systems.',
              answer: false,
              explanation: 'LOLER applies to all lifting equipment and lifting operations. Mobile racking with powered drive mechanisms that move loaded bays falls within scope.',
              regulatoryRef: 'LOLER 1998 Reg 2',
            },
          ],
        },
        {
          id: 's1-l2',
          title: 'Risk Assessment for Mobile Racking Operations',
          objective: 'Conduct a suitable and sufficient risk assessment for roller racking installation and use.',
          concept: [
            'MHSWR 1999 Regulation 3 requires employers to make a suitable and sufficient assessment of risks to employees and non-employees arising from the undertaking. For roller racking, this includes crush hazards from moving bays, manual handling risks from loading operations, and trip hazards from floor-level rail tracks.',
            'The risk assessment must identify control measures following the hierarchy of control: elimination, substitution, engineering controls (e.g. photo-electric safety beams), administrative controls (e.g. permit to work), and PPE as a last resort.',
          ],
          diagrams: [],
          workedExample: 'An assessor identifies a crush hazard where two roller racking bays close together. The engineering control is a photo-electric safety beam system that halts bay movement when the beam is broken. The residual risk is assessed as tolerable with the beam system maintained and tested weekly.',
          youTry: {
            type: 'mcq' as const,
            prompt: 'What is the first step in the hierarchy of control?',
            options: ['PPE', 'Engineering controls', 'Elimination', 'Administrative controls'],
            answer: 'Elimination',
            feedback: 'The hierarchy of control prioritises elimination of the hazard above all other measures.',
          },
          quiz: [
            {
              id: 's1-l2-q1',
              type: 'mcq' as const,
              prompt: 'Under MHSWR 1999, who has a duty to conduct risk assessments?',
              options: ['Employees only', 'The employer', 'The HSE inspector', 'The equipment manufacturer'],
              answer: 'The employer',
              explanation: 'MHSWR 1999 Regulation 3 places the duty to conduct suitable and sufficient risk assessments on the employer.',
              regulatoryRef: 'MHSWR 1999 Reg 3',
            },
            {
              id: 's1-l2-q2',
              type: 'tf' as const,
              prompt: 'PPE is the preferred first-line control measure for crush hazards on mobile racking.',
              answer: false,
              explanation: 'PPE is the last resort in the hierarchy of control. Engineering controls such as photo-electric safety beams should be implemented first.',
              regulatoryRef: 'MHSWR 1999 Reg 4',
            },
          ],
        },
      ],
    },
  };

  // Stage 2 lessons
  const stage2 = {
    stage: {
      id: 2,
      title: 'Safe Systems of Work',
      description: 'Covers installation procedures, load calculations, inspection routines, and defect reporting for roller racking.',
      stageObjective: 'Apply safe systems of work for installation, inspection, and maintenance of roller racking.',
      prerequisiteCompetencies: ['Completion of Stage 1'],
      lessons: [
        {
          id: 's2-l1',
          title: 'Installation Procedures and Load Calculations',
          objective: 'Follow correct installation procedures and verify load calculations for roller racking bays.',
          concept: [
            'Installation of mobile roller racking must follow the manufacturer\'s instructions (PUWER Reg 8) and comply with BS EN 15635:2008 for steel static storage systems. Rail alignment tolerances are typically ±2mm over a 10m run.',
            'Maximum bay loads are determined by the structural design of the racking profile (e.g. Dexion P90: 2,400 kg per bay at 6 levels). Load notices must be clearly displayed at each bay (PUWER Reg 24).',
          ],
          diagrams: [],
          workedExample: 'An installer checks rail alignment using a laser level. The measurement shows 3mm deviation over 8m. This exceeds the ±2mm tolerance and requires shimming before the bay can be commissioned.',
          youTry: {
            type: 'mcq' as const,
            prompt: 'What regulation requires load notices to be displayed on racking systems?',
            options: ['PUWER 1998 Reg 24', 'LOLER 1998 Reg 7', 'MHSWR 1999 Reg 10', 'Workplace Regs 1992 Reg 5'],
            answer: 'PUWER 1998 Reg 24',
            feedback: 'PUWER 1998 Regulation 24 requires that every piece of work equipment is marked with appropriate health and safety information, including safe working loads.',
          },
          quiz: [
            {
              id: 's2-l1-q1',
              type: 'mcq' as const,
              prompt: 'What is the typical rail alignment tolerance for mobile roller racking?',
              options: ['±1mm over 10m', '±2mm over 10m', '±5mm over 10m', '±10mm over 10m'],
              answer: '±2mm over 10m',
              explanation: 'Manufacturer specifications typically require ±2mm alignment tolerance over a 10m rail run to ensure safe operation of the drive mechanism.',
              regulatoryRef: 'BS EN 15635:2008',
            },
            {
              id: 's2-l1-q2',
              type: 'tf' as const,
              prompt: 'Load notices are only required for racking systems exceeding 5 tonnes capacity.',
              answer: false,
              explanation: 'PUWER Reg 24 requires load markings on all work equipment where relevant to health and safety, regardless of capacity threshold.',
              regulatoryRef: 'PUWER 1998 Reg 24',
            },
          ],
        },
        {
          id: 's2-l2',
          title: 'Inspection, Maintenance and Defect Reporting',
          objective: 'Conduct routine inspections, schedule maintenance, and report defects for roller racking systems.',
          concept: [
            'PUWER Regulation 6 requires inspection of work equipment at suitable intervals and after exceptional circumstances. For roller racking, this includes weekly visual checks (guide rails, drive chains, safety beams), monthly functional tests (drive operation, emergency stop), and 6-monthly thorough examination under LOLER.',
            'Defects must be reported immediately using the site defect reporting system. SEMA (Storage Equipment Manufacturers\' Association) classifies racking damage into Green (minor, monitor), Amber (risk of failure, offload and repair), and Red (immediate danger, evacuate aisle).',
          ],
          diagrams: [],
          workedExample: 'During a weekly inspection, an operative notices a bent upright on bay 14. Referring to the SEMA damage classification, the deflection exceeds the Amber threshold (beam deflection >L/200). The bay is offloaded and locked out pending engineer assessment.',
          youTry: {
            type: 'mcq' as const,
            prompt: 'What SEMA damage classification requires immediate evacuation of the aisle?',
            options: ['Green', 'Amber', 'Red', 'Orange'],
            answer: 'Red',
            feedback: 'SEMA Red classification indicates immediate danger — the aisle must be evacuated and the bay isolated until a competent engineer has assessed and repaired the damage.',
          },
          quiz: [
            {
              id: 's2-l2-q1',
              type: 'mcq' as const,
              prompt: 'How often should roller racking drive mechanisms undergo thorough examination under LOLER?',
              options: ['Weekly', 'Monthly', 'Every 6 months', 'Annually'],
              answer: 'Every 6 months',
              explanation: 'LOLER Regulation 9 requires thorough examination at intervals not exceeding 6 months for equipment subject to conditions causing deterioration.',
              regulatoryRef: 'LOLER 1998 Reg 9',
            },
            {
              id: 's2-l2-q2',
              type: 'tf' as const,
              prompt: 'SEMA Amber classification means the racking is safe to continue using at full load.',
              answer: false,
              explanation: 'SEMA Amber means there is a risk of failure. The bay must be offloaded and locked out pending repair by a competent engineer.',
              regulatoryRef: 'SEMA Code of Practice',
            },
          ],
        },
      ],
    },
  };

  // Stage 3 lessons
  const stage3 = {
    stage: {
      id: 3,
      title: 'Emergency Response & Competence',
      description: 'Emergency procedures for racking incidents and ongoing competence assurance.',
      stageObjective: 'Respond correctly to racking emergencies and maintain competence through ongoing training.',
      prerequisiteCompetencies: ['Completion of Stage 2'],
      lessons: [
        {
          id: 's3-l1',
          title: 'Emergency Procedures: Rack Collapse and Entrapment',
          objective: 'Execute the correct emergency response for rack collapse and personnel entrapment incidents.',
          concept: [
            'In the event of rack collapse or structural failure, the immediate priority is personnel safety. All persons must evacuate the affected aisle and adjacent aisles. The emergency stop button (located at each aisle entrance) must be activated to halt all bay movement.',
            'If a person is trapped, do not attempt to move racking components. Call emergency services (999) and the site first aider. The incident is RIDDOR-reportable under Regulation 4 (dangerous occurrence) if the collapse involves a storage system holding more than 1 tonne.',
          ],
          diagrams: [],
          workedExample: 'A bay drive mechanism fails mid-travel, trapping a worker\'s foot between the bay end-frame and the guide rail. The supervisor activates the emergency stop, calls 999, and ensures no one attempts to operate adjacent bays. The incident is recorded in the accident book and reported to the HSE under RIDDOR within 10 days.',
          youTry: {
            type: 'mcq' as const,
            prompt: 'Under RIDDOR, within how many days must a dangerous occurrence involving storage system collapse be reported?',
            options: ['Immediately by phone', 'Within 10 days', 'Within 15 days', 'Within 30 days'],
            answer: 'Within 10 days',
            feedback: 'RIDDOR Regulation 4 dangerous occurrences must be reported to the HSE within 10 days using the online form.',
          },
          quiz: [
            {
              id: 's3-l1-q1',
              type: 'mcq' as const,
              prompt: 'What is the first action if a roller racking bay begins to collapse?',
              options: ['Try to push the bay back', 'Activate the emergency stop and evacuate', 'Continue working in adjacent aisles', 'Call the equipment manufacturer'],
              answer: 'Activate the emergency stop and evacuate',
              explanation: 'Personnel safety is the first priority. Activate the emergency stop to halt all bay movement and evacuate the affected and adjacent aisles.',
              regulatoryRef: 'MHSWR 1999 Reg 8',
            },
            {
              id: 's3-l1-q2',
              type: 'tf' as const,
              prompt: 'If a person is trapped by collapsed racking, you should attempt to move the racking to free them.',
              answer: false,
              explanation: 'Never attempt to move collapsed racking components. This may cause further collapse and injury. Wait for emergency services who have the correct lifting equipment.',
              regulatoryRef: 'RIDDOR 2013 Reg 4',
            },
          ],
        },
        {
          id: 's3-l2',
          title: 'Competence Assurance and Ongoing Compliance',
          objective: 'Maintain competence through refresher training, supervision arrangements, and regulatory updates.',
          concept: [
            'MHSWR 1999 Regulation 7 requires employers to appoint competent persons to assist with health and safety. For roller racking operations, competence is demonstrated through initial training (manufacturer\'s installation course), supervised practice, and periodic refresher training.',
            'Records of training, competence assessments, and equipment inspections must be maintained and available for HSE inspection. The competence evidence chain links training completion to attestation by a competent reviewer, creating an auditable record under MHSWR Regulation 7.',
          ],
          diagrams: [],
          workedExample: 'A new warehouse operative completes the roller racking safety induction (this module), undergoes 4 weeks of supervised practice, and passes a practical competence assessment. The H&S manager attests their competence, and the certificate is filed in the training register.',
          youTry: {
            type: 'mcq' as const,
            prompt: 'Which MHSWR regulation requires the appointment of competent persons?',
            options: ['Regulation 3', 'Regulation 5', 'Regulation 7', 'Regulation 13'],
            answer: 'Regulation 7',
            feedback: 'MHSWR 1999 Regulation 7 requires employers to appoint one or more competent persons to assist in complying with health and safety duties.',
          },
          quiz: [
            {
              id: 's3-l2-q1',
              type: 'mcq' as const,
              prompt: 'What three elements demonstrate competence for roller racking operations?',
              options: [
                'Initial training, supervised practice, periodic refresher',
                'Online course, written exam, verbal interview',
                'Manufacturer certification only',
                'Five years of experience without formal training',
              ],
              answer: 'Initial training, supervised practice, periodic refresher',
              explanation: 'Competence requires a combination of initial training, supervised practical experience, and periodic refresher training to maintain currency.',
              regulatoryRef: 'MHSWR 1999 Reg 7',
            },
            {
              id: 's3-l2-q2',
              type: 'tf' as const,
              prompt: 'Training records do not need to be retained once the employee has passed the competence assessment.',
              answer: false,
              explanation: 'Training records must be maintained and available for HSE inspection. They form part of the evidence chain required under MHSWR 1999.',
              regulatoryRef: 'MHSWR 1999 Reg 5',
            },
          ],
        },
      ],
    },
  };

  // Test outputs
  const test1 = { test: stage1.stage.lessons.flatMap(l => l.quiz).concat([{
    id: 's1-t-q1', type: 'mcq' as const,
    prompt: 'Which pair of regulations most directly governs powered mobile racking systems?',
    options: ['PUWER 1998 and LOLER 1998', 'COSHH 2002 and DSEAR 2002', 'CDM 2015 and WAH 2005', 'Noise 2005 and Vibration 2005'],
    answer: 'PUWER 1998 and LOLER 1998',
    explanation: 'PUWER governs all work equipment; LOLER applies additionally where the racking includes powered mechanisms that move loaded bays.',
    regulatoryRef: 'PUWER 1998 / LOLER 1998',
  }]) };

  const test2 = { test: stage2.stage.lessons.flatMap(l => l.quiz).concat([{
    id: 's2-t-q1', type: 'mcq' as const,
    prompt: 'What standard covers steel static storage systems including racking profiles?',
    options: ['BS EN 15635:2008', 'BS 7671:2018', 'BS EN 1090-2:2018', 'BS 5950-1:2000'],
    answer: 'BS EN 15635:2008',
    explanation: 'BS EN 15635:2008 covers the utilisation and maintenance of steel static storage equipment, including mobile racking.',
    regulatoryRef: 'BS EN 15635:2008',
  }]) };

  const test3 = { test: stage3.stage.lessons.flatMap(l => l.quiz).concat([{
    id: 's3-t-q1', type: 'mcq' as const,
    prompt: 'Under RIDDOR, which category does a racking collapse involving over 1 tonne fall into?',
    options: ['Dangerous occurrence', 'Major injury', 'Over-7-day incapacitation', 'Near miss'],
    answer: 'Dangerous occurrence',
    explanation: 'RIDDOR 2013 Schedule 2 lists the collapse of a storage system holding more than 1 tonne as a reportable dangerous occurrence.',
    regulatoryRef: 'RIDDOR 2013 Reg 4 / Schedule 2',
  }]) };

  // Missions
  const missions = {
    missions: [
      {
        id: 'mission-1',
        title: 'Pre-Installation Safety Check',
        description: 'Complete a pre-installation safety check for a roller racking bay, verifying rail alignment, floor condition, and load notice placement.',
        whyItMatters: 'Incorrect installation is the leading cause of racking failure incidents reported to HSE.',
        stageMin: 2, stageMax: 3,
        branches: [
          { choice: 'Proceed without checking rail alignment', outcome: 'Bay installed with 4mm deviation — exceeds tolerance, drive mechanism jams on first operation', score: 0, feedback: 'Always verify rail alignment before commissioning.' },
          { choice: 'Check alignment with laser level and correct deviation', outcome: 'Bay commissioned safely within ±2mm tolerance', score: 100, feedback: 'Correct — manufacturer tolerance must be verified before commissioning.' },
        ],
      },
      {
        id: 'mission-2',
        title: 'Defect Triage',
        description: 'Classify racking damage using SEMA colour codes and take appropriate action.',
        whyItMatters: 'Incorrect damage classification can leave dangerous racking in service.',
        stageMin: 2, stageMax: 3,
        branches: [
          { choice: 'Classify bent upright as Green and continue loading', outcome: 'Upright fails under load — partial collapse', score: 0, feedback: 'Deflection exceeding L/200 is Amber minimum — the bay must be offloaded.' },
          { choice: 'Classify as Amber, offload bay, and request engineer assessment', outcome: 'Bay safely isolated and repaired within 48 hours', score: 100, feedback: 'Correct triage and escalation procedure followed.' },
        ],
      },
    ],
  };

  // Placement assessment
  const placementAssessment = {
    placementAssessment: {
      title: 'Roller Racking Competence Assessment',
      questions: [
        {
          id: 'pa-q1', type: 'mcq' as const,
          prompt: 'What does PUWER stand for?',
          options: ['Provision and Use of Work Equipment Regulations', 'Personal Use of Workplace Equipment Rules', 'Protection and Utilisation of Work Equipment Requirements', 'Provision and Use of Warehouse Equipment Regulations'],
          answer: 'Provision and Use of Work Equipment Regulations',
          explanation: 'PUWER stands for the Provision and Use of Work Equipment Regulations 1998.',
        },
        {
          id: 'pa-q2', type: 'tf' as const,
          prompt: 'Mobile roller racking systems are exempt from LOLER requirements.',
          answer: false,
          explanation: 'LOLER applies where racking systems incorporate powered mechanisms that move loaded bays.',
        },
      ],
      recommendationThresholds: [
        { minScore: 0, stage: 1 },
        { minScore: 50, stage: 2 },
        { minScore: 80, stage: 3 },
      ],
    },
  };

  // Lesson mission map
  const lessonMissionMap = {
    lessonMissionMap: {
      's2-l1': { lessonId: 's2-l1', missionIds: ['mission-1'], rationale: 'Installation procedures directly map to pre-installation safety check mission.' },
      's2-l2': { lessonId: 's2-l2', missionIds: ['mission-2'], rationale: 'Inspection and defect reporting maps to defect triage mission.' },
    },
  };

  // Source attribution
  const sourceAttribution = {
    sourceCatalog: [
      { id: 'src-puwer', title: 'PUWER 1998 (SI 1998/2306)', url: 'https://www.legislation.gov.uk/uksi/1998/2306', publisher: 'legislation.gov.uk', reliability: 'authoritative' as const, year: 1998 },
      { id: 'src-loler', title: 'LOLER 1998 (SI 1998/2307)', url: 'https://www.legislation.gov.uk/uksi/1998/2307', publisher: 'legislation.gov.uk', reliability: 'authoritative' as const, year: 1998 },
      { id: 'src-mhswr', title: 'MHSWR 1999 (SI 1999/3242)', url: 'https://www.legislation.gov.uk/uksi/1999/3242', publisher: 'legislation.gov.uk', reliability: 'authoritative' as const, year: 1999 },
      { id: 'src-bs15635', title: 'BS EN 15635:2008', url: 'https://www.bsigroup.com/', publisher: 'BSI', reliability: 'authoritative' as const, year: 2008 },
      { id: 'src-sema', title: 'SEMA Code of Practice for the Design of Storage Racking', url: 'https://www.sema.org.uk/', publisher: 'SEMA', reliability: 'reputable' as const, year: 2019 },
    ],
    citationMap: {
      lessonCitations: {
        's1-l1': ['src-puwer', 'src-loler', 'src-mhswr'],
        's1-l2': ['src-mhswr'],
        's2-l1': ['src-puwer', 'src-bs15635'],
        's2-l2': ['src-loler', 'src-sema'],
        's3-l1': ['src-mhswr'],
        's3-l2': ['src-mhswr'],
      },
      missionCitations: {
        'mission-1': ['src-bs15635'],
        'mission-2': ['src-sema'],
      },
    },
  };

  // Coherence pass
  const coherencePass = {
    coherencePass: {
      contradictions: [],
      duplicateCoverage: [],
      regulatoryArcGaps: [],
      templateConsistencyIssues: [],
      overallCoherent: true,
      repairInstructions: [],
    },
  };

  // Fact check (merged)
  const factCheckMerge = {
    factCheck: {
      items: [
        {
          id: 'fc-1', claim: 'PUWER Regulation 5 requires equipment maintenance', relatedItemId: 's1-l1', relatedItemType: 'lesson' as const,
          sourceIds: ['src-puwer'], verdict: 'supported' as const, severity: 'low' as const, rationale: 'Direct statutory requirement.',
          anthropicVerdict: 'supported' as const, geminiVerdict: 'supported' as const, agreementLevel: 'consensus' as const,
        },
        {
          id: 'fc-2', claim: 'LOLER Reg 9 requires 6-month examination interval', relatedItemId: 's1-l1', relatedItemType: 'lesson' as const,
          sourceIds: ['src-loler'], verdict: 'supported' as const, severity: 'low' as const, rationale: 'Correct interval for equipment subject to deterioration.',
          anthropicVerdict: 'supported' as const, geminiVerdict: 'supported' as const, agreementLevel: 'consensus' as const,
        },
        {
          id: 'fc-3', claim: 'Rail alignment tolerance is ±2mm over 10m', relatedItemId: 's2-l1', relatedItemType: 'lesson' as const,
          sourceIds: ['src-bs15635'], verdict: 'supported' as const, severity: 'medium' as const, rationale: 'Manufacturer specification for P90 profile racking.',
          anthropicVerdict: 'supported' as const, geminiVerdict: 'supported' as const, agreementLevel: 'consensus' as const,
        },
      ],
      summary: { supported: 3, unsupported: 0, ambiguous: 0, disputed: 0 },
    },
  };

  // Domain survey
  const domainSurvey = {
    domainSurvey: {
      mandatoryTopics: ['PUWER 1998 duties', 'LOLER 1998 thorough examination', 'Risk assessment methodology', 'Manual handling', 'Racking inspection', 'Emergency procedures', 'Competence requirements', 'RIDDOR reporting'],
      commonMisconceptions: ['LOLER only applies to cranes', 'Annual inspection is sufficient for all racking', 'PPE is the primary control measure', 'Only managers need training'],
      enforcementPriorities: ['Inadequate racking inspection regimes', 'Missing competence records', 'Failure to report dangerous occurrences'],
      criticalNumericThresholds: [
        { name: 'LOLER examination interval', value: '6', unit: 'months', source: 'LOLER 1998 Reg 9' },
        { name: 'SEMA Red classification threshold', value: 'L/100', unit: 'deflection ratio', source: 'SEMA Code of Practice' },
      ],
      keyDutyHolders: ['Employer', 'Equipment owner', 'Competent person (Reg 7)', 'Operatives'],
      controlHierarchySteps: ['Elimination', 'Substitution', 'Engineering controls', 'Administrative controls', 'PPE'],
      regulatoryRefs: ['PUWER 1998', 'LOLER 1998', 'MHSWR 1999', 'Manual Handling Regs 1992', 'Workplace Regs 1992'],
    },
  };

  // Blueprint
  const blueprint = {
    blueprint: [
      { id: 1, title: stage1.stage.title, description: stage1.stage.description, stageObjective: stage1.stage.stageObjective, prerequisiteCompetencies: [], lessons: [
        { id: 's1-l1', title: stage1.stage.lessons[0].title, template: 'regulatory-framework' as const, templateReason: 'Covers primary legislation and duty holder obligations' },
        { id: 's1-l2', title: stage1.stage.lessons[1].title, template: 'risk-assessment' as const, templateReason: 'Risk assessment methodology and control hierarchy' },
      ], testQuestionCount: 5, learningArc: 'conceptual-first' as const },
      { id: 2, title: stage2.stage.title, description: stage2.stage.description, stageObjective: stage2.stage.stageObjective, prerequisiteCompetencies: ['Completion of Stage 1'], lessons: [
        { id: 's2-l1', title: stage2.stage.lessons[0].title, template: 'procedural' as const, templateReason: 'Step-by-step installation procedure' },
        { id: 's2-l2', title: stage2.stage.lessons[1].title, template: 'procedural' as const, templateReason: 'Inspection and defect classification procedure' },
      ], testQuestionCount: 5, learningArc: 'procedural-first' as const },
      { id: 3, title: stage3.stage.title, description: stage3.stage.description, stageObjective: stage3.stage.stageObjective, prerequisiteCompetencies: ['Completion of Stage 2'], lessons: [
        { id: 's3-l1', title: stage3.stage.lessons[0].title, template: 'emergency-response' as const, templateReason: 'Emergency decision tree and RIDDOR triggers' },
        { id: 's3-l2', title: stage3.stage.lessons[1].title, template: 'induction' as const, templateReason: 'Competence assurance and ongoing compliance culture' },
      ], testQuestionCount: 5, learningArc: 'conceptual-first' as const },
    ],
  };

  // Theme shell
  const themeShell = {
    themeShell: {
      id: 'roller-racking',
      title: 'Archival Roller Racking: Design and Installation',
      icon: 'warehouse',
      shortDescription: 'Safe design, installation, and maintenance of mobile roller racking systems.',
      description: 'Comprehensive training on the regulatory framework, safe systems of work, and emergency procedures for mobile roller racking systems in archival storage environments.',
      suggestedAccentColor: 'amber' as const,
      flags: { hasSimulator: false, hasPlacement: true, hasAdaptiveReview: false },
      terms: { primaryDiscipline: 'Roller Racking Safety', simulatorLabel: 'Racking Simulator' },
    },
  };

  // Simulator design (minimal)
  const simulatorDesign = {
    simulatorDesign: {
      concept: 'Simulates mobile racking bay operation including drive engagement, safety beam monitoring, and load distribution.',
      learnerControls: ['Drive engage/disengage', 'Emergency stop', 'Bay selection'],
      stateVariables: [{ name: 'bayPosition', description: 'Current position of each bay along rail track' }],
      visibleOutcomes: ['Bay movement animation', 'Safety beam status indicator'],
      subsystems: [{ id: 'drive', title: 'Drive Mechanism', purpose: 'Controls bay lateral movement' }],
      tickModel: { model: 'discrete', stepMs: 100, updateSequence: ['drive', 'safetyBeam'] },
      faultInjectionModel: { injectableFaultTypes: ['Drive chain failure', 'Safety beam misalignment'], examples: ['Chain snaps at full load'] },
      trainerPanels: [{ id: 'panel-1', title: 'Bay Operations', stageMin: 2, stageMax: 3, focus: 'Safe bay operation' }],
    },
  };

  // Fault and reference (minimal)
  const faultAndReference = {
    faultScenarioCampaign: {
      scenarios: [{
        id: 'fault-1', symptomDescription: 'Bay 7 drive mechanism produces grinding noise during travel',
        injectedIssues: ['Worn chain tensioner'], compound: false, difficulty: 'beginner' as const,
        expectedReasoningPath: ['Identify noise source', 'Check chain tension', 'Inspect tensioner wear'],
        successCriteria: ['Correctly identify worn tensioner', 'Stop bay and isolate'], scoreRange: { min: 0, max: 100 },
      }],
    },
    fieldReferenceCards: [{
      id: 'ref-1', title: 'Weekly Visual Inspection Checklist',
      purpose: 'Structured checklist for weekly roller racking visual inspection',
      checklist: ['Guide rail condition', 'Drive chain tension', 'Safety beam alignment', 'Floor track condition', 'Load notice legibility'],
      preventsMistake: 'Missed inspection items leading to undetected damage',
    }],
  };

  // Builder and capstone (minimal)
  const builderAndCapstone = {
    builderExercises: [{
      id: 'builder-1', title: 'Risk Assessment Builder',
      templateType: 'risk-matrix', paletteItems: ['Hazard identification', 'Likelihood', 'Severity', 'Control measure'],
      requiredSlots: ['hazard', 'likelihood', 'severity', 'control'], validationLogic: 'All slots must be filled with valid entries.',
      testCases: [{ id: 'tc-1', input: 'Crush hazard between bays', expected: 'High likelihood, high severity, engineering control (safety beams)' }],
    }],
    capstoneChallenge: {
      title: 'Roller Racking Safety Competence Assessment',
      requiredMissionIds: ['mission-1', 'mission-2'], optionalBonusMissionIds: [],
      scoringRubric: [
        { criterion: 'Regulatory knowledge', weight: 30, description: 'Demonstrates understanding of PUWER, LOLER, and MHSWR duties' },
        { criterion: 'Practical application', weight: 40, description: 'Applies safe systems of work correctly' },
        { criterion: 'Emergency response', weight: 30, description: 'Responds correctly to emergency scenarios' },
      ],
      guidanceBands: [
        { band: 'Distinction', minScore: 85, maxScore: 100, guidance: 'Exceeds competence requirements.' },
        { band: 'Pass', minScore: 70, maxScore: 84, guidance: 'Meets competence requirements.' },
        { band: 'Refer', minScore: 0, maxScore: 69, guidance: 'Additional training required before reassessment.' },
      ],
      reportFields: ['score', 'band', 'areasForImprovement'],
    },
    progressionScoringRules: {
      missionScoring: 'Binary pass/fail based on correct branch selection.',
      faultCampaignScoring: 'Weighted by difficulty level.',
      stageProgression: 'Must achieve 70% stage test score to unlock next stage.',
      capstonePassThreshold: 70,
    },
    implementationNotes: {
      dataModelNotes: ['Missions are standalone — no dependency on simulator'],
      renderingHints: ['Use amber accent for racking-related content'],
      idConventions: ['mission-{n}', 'fault-{n}', 'ref-{n}', 'builder-{n}'],
    },
  };

  // Repair artifacts (no repairs needed)
  const repairArtifacts = {
    repairLog: [],
    coverageGaps: [],
  };

  // Build the complete steps record
  const steps: Record<string, ReturnType<typeof makeStep>> = {
    domainSurvey: makeStep('domainSurvey', domainSurvey),
    blueprint: makeStep('blueprint', blueprint),
    stage_1: makeStep('stage_1', stage1),
    test_1: makeStep('test_1', test1),
    stage_2: makeStep('stage_2', stage2),
    test_2: makeStep('test_2', test2),
    stage_3: makeStep('stage_3', stage3),
    test_3: makeStep('test_3', test3),
    missions: makeStep('missions', missions),
    placementAssessment: makeStep('placementAssessment', placementAssessment),
    lessonMissionMap: makeStep('lessonMissionMap', lessonMissionMap),
    sourceAttribution: makeStep('sourceAttribution', sourceAttribution),
    coherencePass: makeStep('coherencePass', coherencePass),
    factCheckA: makeStep('factCheckA', factCheckMerge),
    factCheckG: makeStep('factCheckG', factCheckMerge),
    factCheckMerge: makeStep('factCheckMerge', factCheckMerge),
    simulatorDesign: makeStep('simulatorDesign', simulatorDesign),
    faultAndReference: makeStep('faultAndReference', faultAndReference),
    builderAndCapstone: makeStep('builderAndCapstone', builderAndCapstone),
    themeShell: makeStep('themeShell', themeShell),
    repairArtifacts: makeStep('repairArtifacts', repairArtifacts),
  };

  return steps;
}

// Build the full GenerationJob-shaped job_state
function buildJobState() {
  const steps = buildStepResults();
  return {
    moduleId: DEMO_MODULE_ID,
    domainPrompt: 'Archival roller racking: design and installation for warehouse/archive document storage.',
    audienceDescription: 'Warehouse operatives with 1–5 years experience in archive or logistics environments.',
    objectives: [
      'Understand PUWER and LOLER duties for roller racking systems',
      'Conduct risk assessments for mobile racking operations',
      'Follow installation, inspection, and maintenance procedures',
      'Respond to racking emergencies including collapse and entrapment',
      'Maintain competence records and ongoing compliance',
    ],
    stageCount: 3,
    lessonsPerStage: 2,
    missionCount: 2,
    sourceReferences: [],
    workplaceContext: WORKPLACE_CONTEXT,
    regulatoryClassification: REGULATORY_CLASSIFICATION,
    steps,
    stepSequence: Object.keys(steps),
    currentStepKey: 'repairArtifacts',
    estimatedTokens: 0,
    actualTokensUsed: 10500,
  };
}

function computeContentHash(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(content))
    .digest('hex');
}

// ─── Seed runner ──────────────────────────────────────────────────────────────

async function seed() {
  console.log('[seed-demo] Starting pilot demo pack seed...');
  console.log(`[seed-demo] Mode: ${LOCAL_MODE ? 'LOCAL (synthetic Clerk IDs)' : 'STAGING (real Clerk IDs)'}${E2E_MODE ? ' [E2E — in_review, no WORM]' : ''}`);
  console.log(`[seed-demo] Clerk org: ${CLERK_ORG_ID}`);
  console.log(`[seed-demo] Clerk admin: ${CLERK_ADMIN} | reviewer: ${CLERK_REVIEWER} | learner: ${CLERK_LEARNER}`);

  const jobState = buildJobState();
  const snapshotV1Content = jobState.steps; // matches jobRunner.ts:404
  const snapshotV2Content = jobState;       // matches review.ts:599
  const contentHash = computeContentHash(snapshotV1Content);
  const attestationHash = computeContentHash(snapshotV2Content);

  // ── 1. Org ──────────────────────────────────────────────────────────────
  // When using real Clerk IDs, the org may already exist with a different UUID.
  // Upsert on clerk_org_id, then resolve the actual org UUID for all downstream FKs.
  console.log('[seed-demo] 1/11 Upserting org...');
  await sql`
    INSERT INTO orgs (id, name, clerk_org_id, tier, industry, workforce_size, onboarding_completed, onboarding_completed_at)
    VALUES (
      ${DEMO_ORG_ID}, 'Northgate Archive Solutions Ltd', ${CLERK_ORG_ID}, 1,
      'Warehousing & Document Storage', '45', true, ${T_MODULE_CREATED}
    )
    ON CONFLICT (clerk_org_id) DO UPDATE SET
      name = EXCLUDED.name,
      industry = EXCLUDED.industry,
      workforce_size = EXCLUDED.workforce_size,
      onboarding_completed = EXCLUDED.onboarding_completed,
      onboarding_completed_at = EXCLUDED.onboarding_completed_at
  `;

  // Resolve actual org UUID (may differ from DEMO_ORG_ID if org pre-existed)
  const orgRow = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${CLERK_ORG_ID}`;
  const orgId = (orgRow[0] as { id: string }).id;
  console.log(`[seed-demo]   Resolved org UUID: ${orgId}${orgId !== DEMO_ORG_ID ? ' (pre-existing)' : ''}`);

  // ── 2. Org members ─────────────────────────────────────────────────────
  console.log('[seed-demo] 2/11 Upserting org members...');
  // When all Clerk IDs are the same (single-user demo), only insert one member
  // with the highest-privilege role needed (reviewer, since that's who attests).
  const uniqueClerkUsers = new Map<string, { clerkUserId: string; id: string; email: string; name: string; role: string; jobTitle: string; department: string }>();
  const memberDefs = [
    { clerkUserId: CLERK_ADMIN, id: DEMO_ADMIN_MEMBER_ID, email: 'j.whitfield@northgatearchive.co.uk', name: 'James Whitfield', role: 'admin', jobTitle: 'Operations Director', department: 'Management' },
    { clerkUserId: CLERK_REVIEWER, id: DEMO_REVIEWER_MEMBER_ID, email: 's.thompson@northgatearchive.co.uk', name: 'Sarah Thompson', role: 'reviewer', jobTitle: 'Health & Safety Manager', department: 'Compliance' },
    { clerkUserId: CLERK_LEARNER, id: DEMO_LEARNER_MEMBER_ID, email: 'm.davies@northgatearchive.co.uk', name: 'Mark Davies', role: 'learner', jobTitle: 'Warehouse Operative', department: 'Operations' },
  ];
  // Deduplicate: if same Clerk user appears multiple times, keep highest role (admin > reviewer > learner)
  for (const m of memberDefs) {
    if (!uniqueClerkUsers.has(m.clerkUserId)) {
      uniqueClerkUsers.set(m.clerkUserId, m);
    }
  }
  for (const m of uniqueClerkUsers.values()) {
    await sql`
      INSERT INTO org_members (id, org_id, clerk_user_id, email, name, role, job_title, department, status, joined_at)
      VALUES (${m.id}, ${orgId}, ${m.clerkUserId}, ${m.email}, ${m.name}, ${m.role}, ${m.jobTitle}, ${m.department}, 'active', ${T_MODULE_CREATED})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, role = EXCLUDED.role, job_title = EXCLUDED.job_title,
        department = EXCLUDED.department, status = EXCLUDED.status
    `;
  }

  // ── 3. Org context ─────────────────────────────────────────────────────
  console.log('[seed-demo] 3/11 Upserting org context...');
  await sql`
    INSERT INTO org_contexts (org_id, workplace_context, distilled_context, modules_deployed)
    VALUES (${orgId}, ${JSON.stringify(WORKPLACE_CONTEXT)}::jsonb, '{}'::jsonb, 1)
    ON CONFLICT (org_id) DO UPDATE SET
      workplace_context = EXCLUDED.workplace_context,
      modules_deployed = EXCLUDED.modules_deployed,
      updated_at = now()
  `;

  // ── 4. Module ──────────────────────────────────────────────────────────
  const moduleStatus = E2E_MODE ? 'in_review' : 'deployed';
  const moduleDeployedAt = E2E_MODE ? null : T_DEPLOYED;
  console.log(`[seed-demo] 4/11 Upserting module (status=${moduleStatus})...`);
  await sql`
    INSERT INTO modules (id, org_id, title, status, workplace_context, regulatory_classification, generation_metadata, content_hash, deployed_at, created_at)
    VALUES (
      ${DEMO_MODULE_ID}, ${orgId},
      'Archival Roller Racking: Design and Installation',
      ${moduleStatus},
      ${JSON.stringify(WORKPLACE_CONTEXT)}::jsonb,
      ${JSON.stringify(REGULATORY_CLASSIFICATION)}::jsonb,
      ${JSON.stringify({ stageCount: 3, lessonsPerStage: 2, missionCount: 2 })}::jsonb,
      ${contentHash},
      ${moduleDeployedAt},
      ${T_MODULE_CREATED}
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      workplace_context = EXCLUDED.workplace_context,
      regulatory_classification = EXCLUDED.regulatory_classification,
      generation_metadata = EXCLUDED.generation_metadata,
      content_hash = EXCLUDED.content_hash,
      deployed_at = EXCLUDED.deployed_at,
      updated_at = now()
  `;

  // ── 5. Generation job ──────────────────────────────────────────────────
  console.log('[seed-demo] 5/11 Upserting generation job...');
  await sql`
    INSERT INTO generation_jobs (module_id, org_id, user_id, status, job_state, started_at, completed_at)
    VALUES (
      ${DEMO_MODULE_ID}, ${orgId}, ${CLERK_ADMIN}, 'complete',
      ${JSON.stringify(jobState)}::jsonb,
      ${T_GEN_STARTED}, ${T_GEN_COMPLETE}
    )
    ON CONFLICT (module_id) DO UPDATE SET
      status = EXCLUDED.status,
      job_state = EXCLUDED.job_state,
      completed_at = EXCLUDED.completed_at,
      updated_at = now()
  `;

  // ── 6. Review findings ─────────────────────────────────────────────────
  console.log('[seed-demo] 6/11 Resetting and inserting review findings...');
  await sql`DELETE FROM review_findings WHERE module_id = ${DEMO_MODULE_ID}`;

  const findings = [
    {
      id: DEMO_FINDING_1_ID,
      severity: 'regulatory', category: 'A',
      description: 'PUWER Reg 6 thorough examination interval stated as 12 months in lesson s1-l1; LOLER Reg 9 requires 6 months for lifting equipment subject to conditions causing deterioration. The 12-month figure applies only to equipment NOT subject to deterioration.',
      location: 's1-l1.concept[0]',
      regulatoryRef: 'LOLER 1998 Reg 9(3)(a)(ii)',
      disposition: 'amended', dispositionRationale: 'Content corrected to state 6-month interval with explicit reference to LOLER Reg 9(3)(a)(ii). The 12-month default under LOLER Reg 9(3)(a)(i) is noted separately for equipment not subject to deterioration.',
    },
    {
      id: DEMO_FINDING_2_ID,
      severity: 'high', category: 'B',
      description: 'Risk assessment in lesson s1-l2 does not address seismic rack loading in multi-storey archive facilities per BS EN 15635:2008 Clause 9. While seismic risk is low in mainland UK, the standard requires consideration of imposed forces.',
      location: 's1-l2.concept[1]',
      regulatoryRef: 'BS EN 15635:2008 Cl. 9',
      disposition: 'accepted', dispositionRationale: 'Accepted as informational. BS EN 15635 Cl. 9 seismic provisions are not enforced in UK mainland applications. A note has been added to the worked example acknowledging the clause for completeness.',
    },
    {
      id: DEMO_FINDING_3_ID,
      severity: 'medium', category: 'B',
      description: 'Emergency procedure in lesson s3-l1 references "nearest fire exit" without specifying minimum aisle clearance requirements. Workplace (Health, Safety and Welfare) Regulations 1992 Regulation 17 requires sufficient aisle width (typically 800mm minimum) for safe evacuation.',
      location: 's3-l1.concept[1]',
      regulatoryRef: 'Workplace Regs 1992 Reg 17',
      disposition: 'accepted', dispositionRationale: 'Accepted. Added specific 800mm minimum aisle clearance reference to evacuation procedure text. Verification note: the 800mm figure comes from the Workplace Regulations ACOP paragraph 73.',
    },
  ];

  for (const f of findings) {
    if (E2E_MODE) {
      // E2E mode: seed findings as UNRESOLVED so the reviewer can exercise the full flow
      await sql`
        INSERT INTO review_findings (id, module_id, severity, category, description, location, regulatory_ref, created_at)
        VALUES (
          ${f.id}, ${DEMO_MODULE_ID}, ${f.severity}, ${f.category}, ${f.description}, ${f.location},
          ${f.regulatoryRef}, ${T_FINDINGS_SEEDED}
        )
      `;
    } else {
      await sql`
        INSERT INTO review_findings (id, module_id, severity, category, description, location, regulatory_ref, disposition, disposition_rationale, disposed_by, disposed_at, created_at)
        VALUES (
          ${f.id}, ${DEMO_MODULE_ID}, ${f.severity}, ${f.category}, ${f.description}, ${f.location},
          ${f.regulatoryRef}, ${f.disposition}, ${f.dispositionRationale}, ${CLERK_REVIEWER}, ${T_FINDINGS_DISPOSED}, ${T_FINDINGS_SEEDED}
        )
      `;
    }
  }

  // ── 7. Attestation (WORM) ──────────────────────────────────────────────
  if (E2E_MODE) {
    console.log('[seed-demo] 7/11 Skipping attestation (E2E mode — reviewer will attest)');
  } else {
    console.log('[seed-demo] 7/11 Inserting attestation (WORM — skips if exists)...');
    await sql`
      INSERT INTO attestations (
        id, module_id, reviewer_user_id, reviewer_name, reviewer_role,
        basis_of_competence, regulatory_frameworks_reviewed, explicit_acceptance,
        content_hash_at_attestation, snapshot_version, attested_at
      )
      VALUES (
        ${DEMO_ATTESTATION_ID}, ${DEMO_MODULE_ID}, ${CLERK_REVIEWER},
        'Sarah Thompson', 'Health & Safety Manager',
        'NEBOSH National General Certificate in Occupational Health and Safety (2019). 8 years experience in warehousing and logistics H&S management. IOSH Chartered Member.',
        ${['puwer-1998', 'loler-1998', 'manual-handling-1992', 'mhswr-1999', 'workplace-1992']},
        'I confirm that I have reviewed all content, findings and regulatory references in this training module. The content accurately reflects current UK health and safety legislation and approved codes of practice for roller racking operations. All Category A findings have been addressed. I accept professional responsibility for this attestation under MHSWR 1999 Regulation 7.',
        ${attestationHash}, 2, ${T_ATTESTED}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // ── 8. Module snapshots (WORM) ─────────────────────────────────────────
  if (E2E_MODE) {
    console.log('[seed-demo] 8/11 Inserting generation snapshot only (E2E mode)...');
    // Only v1 (generation_complete) — v2 (attestation) will be created by reviewer
    await sql`
      INSERT INTO module_snapshots (id, module_id, version, content_hash, content, trigger_event, created_by, created_at)
      VALUES (
        ${DEMO_SNAPSHOT_V1_ID}, ${DEMO_MODULE_ID}, 1,
        ${contentHash}, ${JSON.stringify(snapshotV1Content)}::jsonb,
        'generation_complete', ${CLERK_ADMIN}, ${T_GEN_COMPLETE}
      )
      ON CONFLICT (module_id, version) DO NOTHING
    `;
  } else {
    console.log('[seed-demo] 8/11 Inserting module snapshots (WORM — skips if exists)...');
    // v1: generation_complete — stores job.steps (matches jobRunner.ts:404)
    await sql`
      INSERT INTO module_snapshots (id, module_id, version, content_hash, content, trigger_event, created_by, created_at)
      VALUES (
        ${DEMO_SNAPSHOT_V1_ID}, ${DEMO_MODULE_ID}, 1,
        ${contentHash}, ${JSON.stringify(snapshotV1Content)}::jsonb,
        'generation_complete', ${CLERK_ADMIN}, ${T_GEN_COMPLETE}
      )
      ON CONFLICT (module_id, version) DO NOTHING
    `;

    // v2: attestation — stores full job_state (matches review.ts:599)
    await sql`
      INSERT INTO module_snapshots (id, module_id, version, content_hash, content, trigger_event, created_by, created_at)
      VALUES (
        ${DEMO_SNAPSHOT_V2_ID}, ${DEMO_MODULE_ID}, 2,
        ${attestationHash}, ${JSON.stringify(snapshotV2Content)}::jsonb,
        'attestation', ${CLERK_REVIEWER}, ${T_ATTESTED}
      )
      ON CONFLICT (module_id, version) DO NOTHING
    `;
  }

  // ── 9. Module certificate (WORM) ───────────────────────────────────────
  if (E2E_MODE) {
    console.log('[seed-demo] 9/11 Skipping module certificate (E2E mode — reviewer will deploy)');
  } else {
    console.log('[seed-demo] 9/11 Inserting module certificate (WORM — skips if exists)...');
    await sql`
      INSERT INTO module_certificates (
        id, module_id, attestation_id, org_id, cert_number, content_hash,
        source_doc_versions, regulatory_schemas, module_title,
        reviewer_name, reviewer_role, snapshot_version, issued_at
      )
      VALUES (
        ${DEMO_MODULE_CERT_ID}, ${DEMO_MODULE_ID}, ${DEMO_ATTESTATION_ID}, ${orgId},
        'VS-MOD-DEMO-001', ${contentHash},
        ${JSON.stringify({ 'puwer-1998': '1998', 'loler-1998': '1998', 'mhswr-1999': '1999' })}::jsonb,
        ${['puwer-1998', 'loler-1998', 'manual-handling-1992', 'mhswr-1999', 'workplace-1992']},
        'Archival Roller Racking: Design and Installation',
        'Sarah Thompson', 'Health & Safety Manager', 2, ${T_DEPLOYED}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // ── 10. Learner certificate (WORM) ─────────────────────────────────────
  if (E2E_MODE) {
    console.log('[seed-demo] 10/11 Skipping learner certificate (E2E mode)');
  } else {
    console.log('[seed-demo] 10/11 Inserting learner certificate (WORM — skips if exists)...');
    await sql`
      INSERT INTO learner_certificates (
        id, module_cert_id, module_id, org_id, cert_number,
        learner_name, learner_user_id, score, pass_threshold, passed, issued_at
      )
      VALUES (
        ${DEMO_LEARNER_CERT_ID}, ${DEMO_MODULE_CERT_ID}, ${DEMO_MODULE_ID}, ${orgId},
        'VS-LRN-DEMO-001', 'Mark Davies', ${CLERK_LEARNER},
        85, 70, true, ${T_LEARNER_CERT}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // ── 11. Audit log (WORM) ───────────────────────────────────────────────
  console.log('[seed-demo] 11/11 Inserting audit log events (WORM — skips if exists)...');
  const allAuditEvents = [
    { id: AUDIT_IDS[0], action: 'module_created', userId: CLERK_ADMIN, payload: { title: 'Archival Roller Racking: Design and Installation' }, createdAt: T_MODULE_CREATED },
    { id: AUDIT_IDS[1], action: 'generation_started', userId: CLERK_ADMIN, payload: { stageCount: 3 }, createdAt: T_GEN_STARTED },
    { id: AUDIT_IDS[2], action: 'generation_complete', userId: CLERK_ADMIN, payload: { totalTokensUsed: 10500, stepCount: 21 }, createdAt: T_GEN_COMPLETE },
    { id: AUDIT_IDS[3], action: 'snapshot_created', userId: CLERK_ADMIN, payload: { version: 1, triggerEvent: 'generation_complete', contentHash }, createdAt: T_GEN_COMPLETE },
    { id: AUDIT_IDS[4], action: 'findings_seeded', userId: CLERK_ADMIN, payload: { findingCount: 3, catA: 1, catB: 2 }, createdAt: T_FINDINGS_SEEDED },
    { id: AUDIT_IDS[5], action: 'attestation_submitted', userId: CLERK_REVIEWER, payload: { reviewerName: 'Sarah Thompson', snapshotVersion: 2 }, createdAt: T_ATTESTED },
    { id: AUDIT_IDS[6], action: 'snapshot_created', userId: CLERK_REVIEWER, payload: { version: 2, triggerEvent: 'attestation', contentHash: attestationHash }, createdAt: T_ATTESTED },
    { id: AUDIT_IDS[7], action: 'module_deployed', userId: CLERK_ADMIN, payload: { certNumber: 'VS-MOD-DEMO-001', snapshotVersion: 2 }, createdAt: T_DEPLOYED },
  ];
  // E2E mode: only pre-attestation events (the rest will be created by the reviewer flow)
  const auditEvents = E2E_MODE ? allAuditEvents.slice(0, 5) : allAuditEvents;

  for (const evt of auditEvents) {
    await sql`
      INSERT INTO audit_log (id, org_id, module_id, user_id, action, payload, created_at)
      VALUES (${evt.id}, ${orgId}, ${DEMO_MODULE_ID}, ${evt.userId}, ${evt.action}, ${JSON.stringify(evt.payload)}::jsonb, ${evt.createdAt})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // ── Verification ───────────────────────────────────────────────────────
  console.log('\n[seed-demo] ── Verification ──');

  const moduleRow = await sql`SELECT id, title, status FROM modules WHERE id = ${DEMO_MODULE_ID}`;
  console.log('[seed-demo] Module:', moduleRow[0] ? `${(moduleRow[0] as Record<string, unknown>).title} (${(moduleRow[0] as Record<string, unknown>).status})` : 'NOT FOUND');

  const findingCount = await sql`SELECT COUNT(*) AS c FROM review_findings WHERE module_id = ${DEMO_MODULE_ID}`;
  console.log('[seed-demo] Findings:', (findingCount[0] as Record<string, unknown>).c);

  const snapshots = await sql`SELECT version, trigger_event FROM module_snapshots WHERE module_id = ${DEMO_MODULE_ID} ORDER BY version`;
  console.log('[seed-demo] Snapshots:', snapshots.map(s => `v${(s as Record<string, unknown>).version} (${(s as Record<string, unknown>).trigger_event})`).join(', '));

  const cert = await sql`SELECT cert_number FROM module_certificates WHERE module_id = ${DEMO_MODULE_ID}`;
  console.log('[seed-demo] Module cert:', cert[0] ? (cert[0] as Record<string, unknown>).cert_number : 'NOT FOUND');

  const learnerCert = await sql`SELECT cert_number FROM learner_certificates WHERE module_id = ${DEMO_MODULE_ID}`;
  console.log('[seed-demo] Learner cert:', learnerCert[0] ? (learnerCert[0] as Record<string, unknown>).cert_number : 'NOT FOUND');

  const auditCount = await sql`SELECT COUNT(*) AS c FROM audit_log WHERE module_id = ${DEMO_MODULE_ID}`;
  console.log('[seed-demo] Audit events:', (auditCount[0] as Record<string, unknown>).c);

  console.log('\n[seed-demo] Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed-demo] Seed failed:', err);
  process.exit(1);
});
