// ─── Manual Handling 1992 — Regulatory Schema ─────────────────────────────────
// Manual Handling Operations Regulations 1992
// SI 1992/2793 (as amended by SI 2002/2174)

// IMPORTANT: No absolute weight limits exist in MHOR. The guideline figures
// in L23 (e.g., 25 kg for males at knuckle height) are not legal limits.
// The regulations are entirely risk-based.

import type { RegulatorySchema } from '../types';

export const MANUAL_HANDLING_1992: RegulatorySchema = {
    id: 'manual-handling-1992',
    shortTitle: 'Manual Handling 1992',
    fullTitle: 'Manual Handling Operations Regulations 1992',
    siNumber: 'SI 1992/2793',
    year: 1992,
    lastAmended: '2002-09-03', // SI 2002/2174 — implementation of EC Directive
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all employers where employees carry out manual handling operations ' +
        'that involve a risk of injury. "Manual handling operations" means transporting ' +
        'or supporting a load — including lifting, putting down, pushing, pulling, carrying, ' +
        'or moving — by hand or bodily force. The regulations implement the EC Manual ' +
        'Handling Directive (90/269/EEC). They apply in all industries and are particularly ' +
        'significant in construction, warehousing, healthcare (patient handling), and ' +
        'manufacturing.',
    dutyHolders: [
        'Employer',
        'Self-employed person',
        'Employee',
    ],
    keyDuties: [
        {
            regulation: 'Reg 4(1)(a)',
            title: 'Avoidance of Manual Handling Where Reasonably Practicable',
            summary: 'Each employer shall, so far as is reasonably practicable, avoid the need ' +
                'for employees to undertake any manual handling operations at work which ' +
                'involve a risk of their being injured. This is the first step in the ' +
                'hierarchy — only if avoidance is not reasonably practicable do the ' +
                'assessment and reduction duties (Reg 4(1)(b)) apply.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'This duty applies only to manual handling operations involving a risk of ' +
                'injury. Trivially safe operations are not in scope. The employer must ' +
                'genuinely consider whether mechanisation or automation can eliminate the ' +
                'need for the operation before proceeding.',
            acopReference: 'L23 paragraphs 22–36',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 4(1)(b)(i)',
            title: 'Assessment of Unavoidable Manual Handling Operations',
            summary: 'Where it is not reasonably practicable to avoid the manual handling ' +
                'operation, each employer must make a suitable and sufficient assessment ' +
                'of all such operations having regard to the factors listed in Schedule 1 ' +
                '(task, individual capability, load, working environment — the "TILE" ' +
                'framework). The assessment must be reviewed where it is no longer valid ' +
                'or a significant change has occurred.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'The TILE assessment framework is the standard approach: Task (how is the ' +
                'load moved?), Individual (what are the personal characteristics of the ' +
                'handler?), Load (what is being handled?), Environment (what are the ' +
                'space, temperature, floor conditions?). There are no absolute weight limits — ' +
                'all assessment is risk-based.',
            acopReference: 'L23 paragraphs 37–87',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 4(1)(b)(ii)',
            title: 'Reduction of Risk to Lowest Level Reasonably Practicable',
            summary: 'Each employer must take appropriate steps to reduce the risk of injury ' +
                'from unavoidable manual handling operations to the lowest level reasonably ' +
                'practicable. Steps may include mechanical assistance, improving task layout, ' +
                'reducing load size or weight, adapting the environment, and providing ' +
                'appropriate training.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L23 paragraphs 88–145',
        },
        {
            regulation: 'Reg 4(1)(b)(iii)',
            title: 'Provision of Information on Load Weight',
            summary: 'Each employer must take appropriate steps to provide general indications ' +
                'of the weight of each load, and the heaviest side of any load whose centre ' +
                'of gravity is not centrally positioned. This information enables handlers ' +
                'to make informed judgements about the manual handling operation.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'Applies to all unavoidable manual handling operations. The information ' +
                'must be made available to handlers — this may be by physical marking on ' +
                'the load, labelling, or instruction.',
            acopReference: 'L23 paragraphs 146–157',
        },
        {
            regulation: 'Reg 4(2)',
            title: 'Review of Assessment',
            summary: 'The assessment under Reg 4(1)(b)(i) must be reviewed by the employer where ' +
                'there is reason to suspect it is no longer valid, or there has been a ' +
                'significant change in the manual handling operations to which it relates. ' +
                'Where review indicates changes are needed to the assessment, the employer ' +
                'must make appropriate changes.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L23 paragraphs 158–167',
        },
        {
            regulation: 'Reg 5',
            title: "Employees' Duty",
            summary: 'While at work, each employee must make full and proper use of any system ' +
                'of work provided by their employer in accordance with Reg 4(1)(b)(ii) — ' +
                'for example, using mechanical handling aids provided, following safe ' +
                'lifting techniques taught in training, and not bypassing safe systems.',
            dutyHolders: ['Employee'],
            mandatory: true,
            acopReference: 'L23 paragraphs 168–172',
        },
    ],
    assessmentMethodology: 'Manual handling assessments use the TILE framework — Task, Individual, Load, ' +
        'Environment — against the factors listed in Schedule 1 of the Regulations. ' +
        'HSE provides filter questions in L23 to help determine whether a more detailed ' +
        'assessment is needed: operations clearly within the L23 guideline figures and ' +
        'posing no other significant risk factors may not require full assessment. ' +
        'The guideline figures (25 kg for males and 16.7 kg for females at knuckle ' +
        'height) indicate where a more detailed assessment is likely to be needed — ' +
        'they are NOT legal limits. Operations in non-ideal postures (above shoulder, ' +
        'below mid-thigh, at extended reach) trigger lower guideline figures.',
    complianceCriteria: [
        'Avoidance has been genuinely considered before assessment — can the operation be automated or mechanised?',
        'A TILE-based assessment has been completed for all unavoidable operations involving a risk of injury',
        'The assessment is specific to the task, individual, load, and environment — not generic',
        'Risk reduction measures address all significant factors identified in the TILE assessment',
        'Mechanical handling aids have been considered and provided where they reduce risk',
        'Load weight information is available to handlers (weight marked on load or communicated)',
        'Training covers safe handling technique, use of aids, and the specific risks of the operation',
        'The assessment is reviewed after a significant change or when no longer valid',
        'Records of significant findings are kept (required where 5 or more employees)',
        'Content does not state absolute weight limits — guideline figures from L23 are correctly characterised',
    ],
    sourceDocuments: [
        {
            id: 'mhor-si',
            docType: 'primary-legislation',
            title: 'Manual Handling Operations Regulations 1992',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/1992/2793/contents/made',
            year: 1992,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '1992-12-01',
        },
        {
            id: 'l23',
            docType: 'acop',
            title: 'Manual handling: Manual Handling Operations Regulations 1992: Approved Code of Practice and guidance (L23)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l23.pdf',
            version: '3rd edition',
            year: 2016,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2016-01-01',
        },
        {
            id: 'mhor-amend-2002',
            docType: 'primary-legislation',
            title: 'Health and Safety (Miscellaneous Amendments) Regulations 2002',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/2002/2174/contents/made',
            year: 2002,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '2002-09-03',
        },
    ],
    validationRules: [
        {
            ruleId: 'MHOR-REG-001',
            description: 'Regulation numbers must be cited accurately against SI 1992/2793',
            severity: 'regulatory',
            check: 'no-invented-regulation',
            failureMessage: 'Generated content contains a Manual Handling Regulations citation that does not match SI 1992/2793. Invented or misattributed regulation numbers are a regulatory-severity finding.',
            reviewerGuidance: 'Cross-check the specific regulation cited against MHOR 1992 at legislation.gov.uk/uksi/1992/2793.',
        },
        {
            ruleId: 'MHOR-REG-002',
            description: 'No absolute weight limits exist in MHOR — guideline figures from L23 must not be presented as legal limits',
            severity: 'regulatory',
            check: 'no-invented-threshold',
            failureMessage: 'Content presents weight limits (e.g., "25 kg legal limit", "maximum 16 kg") as if they are legal requirements. The Manual Handling Regulations contain NO absolute weight limits. The guideline figures in L23 indicate where a more detailed assessment is needed — they are not legal maxima.',
            reviewerGuidance: 'The 25 kg (male) and 16.7 kg (female) figures from L23 are guideline figures used to indicate when fuller assessment is advisable. They are NOT legal limits. Content stating a weight as a legal maximum must be corrected.',
        },
        {
            ruleId: 'MHOR-REG-003',
            description: 'The TILE assessment framework must be correctly identified — Task, Individual, Load, Environment',
            severity: 'high',
            check: 'correct-legal-standard',
            failureMessage: 'Content mis-states or mis-sequences the TILE framework. TILE stands for Task, Individual, Load, Environment — these are the four Schedule 1 assessment factors.',
            reviewerGuidance: 'Verify the TILE framework against Schedule 1 of MHOR 1992. Some sources use alternative orders — the canonical HSE presentation is Task, Individual, Load, Environment. All four factors must be addressed in a suitable and sufficient assessment.',
        },
        {
            ruleId: 'MHOR-REG-004',
            description: 'The avoidance duty (Reg 4(1)(a)) must be addressed before assessment — avoidance is the first step in the hierarchy',
            severity: 'medium',
            check: 'control-hierarchy-correct',
            failureMessage: 'Content presents manual handling assessment as the first compliance step, skipping the avoidance duty. Under Reg 4(1)(a), employers must first consider whether the manual handling operation can be avoided entirely before moving to assessment.',
            reviewerGuidance: 'The correct hierarchy under Reg 4 is: (1) avoid where reasonably practicable, (2) if unavoidable — assess, reduce risk, provide load information. Content must not skip step 1.',
        },
        {
            ruleId: 'MHOR-REG-005',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'MHOR 1992 (SI 1992/2793) applies to Great Britain only. Northern Ireland has equivalent but separate legislation.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'manual handling.*regulation',
            'reg 4.*manual handling',
            'si 1992/2793',
            'mhor',
            'reasonably practicable.*manual handling',
            'manual handling operations regulations',
        ],
        highPatterns: [
            'tile.*assessment',
            'manual handling assessment',
            '25.*kg.*limit',
            '16.*kg.*limit',
            'no.*absolute.*weight.*limit',
            'musculoskeletal.*disorder',
            'msd.*manual',
            'risk.*manual handling',
            'guideline figure',
            'schedule 1.*manual handling',
        ],
        mediumPatterns: [
            'ergonomic',
            'posture.*manual',
            'repetitive.*lifting',
            'manual handling training',
            'l23',
            'knuckle height',
            'mechanical aid',
            'pushing.*pulling.*risk',
        ],
    },
    learningArcStages: [
        'What is MHOR — scope, what counts as a manual handling operation, and who is covered',
        'The three-step duty hierarchy — avoid, assess, reduce risk',
        'The TILE assessment framework — Task, Individual, Load, Environment in detail',
        'Why there are no absolute weight limits — understanding guideline figures from L23',
        'Risk reduction in practice — mechanical aids, task redesign, team handling',
        'Musculoskeletal disorders — causes, early symptoms, and long-term health implications',
        'Patient and people handling — specific considerations for healthcare and care settings',
        'Training and information obligations — what handlers need to know and when',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'puwer-1998',
    ],
};
