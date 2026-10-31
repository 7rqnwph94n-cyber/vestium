// ─── DSE Regulations 1992 — Regulatory Schema ─────────────────────────────────
// Health and Safety (Display Screen Equipment) Regulations 1992
// SI 1992/2792 (as amended by SI 2002/2174)
//
// Source authorities:
//   legislation.gov.uk/uksi/1992/2792 (Open Government Licence v3.0)
//   HSE L26 — Work with display screen equipment ACOP (2nd edition, 2003)
//   HSE INDG36 — Working with display screen equipment: A guide for DSE users

import type { RegulatorySchema } from '../types';

export const DSE_1992: RegulatorySchema = {
    id: 'dse-1992',
    shortTitle: 'DSE Regs 1992',
    fullTitle: 'Health and Safety (Display Screen Equipment) Regulations 1992',
    siNumber: 'SI 1992/2792',
    year: 1992,
    lastAmended: '2002-09-03', // SI 2002/2174 — extended duties, removed "habitual" threshold
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to employers where display screen equipment (DSE) is used by workers. ' +
        '"Display screen equipment" means any alphanumeric or graphic display screen ' +
        'regardless of the display process involved — including desktop monitors, laptops ' +
        'and notebook computers, touch screens, and similar devices. The Regulations apply ' +
        'where an employee uses DSE as a significant part of their normal work. The 2002 ' +
        'amendment removed the prior "habitual" user threshold — the Regulations now apply ' +
        'to any user who uses DSE as a significant part of their work. Occasional use of ' +
        'DSE is not covered. Home workers using DSE provided by their employer are covered.',
    dutyHolders: [
        'Employer',
        'Self-employed person (limited duties)',
    ],
    keyDuties: [
        {
            regulation: 'Reg 2',
            title: 'Analysis of Workstations to Assess and Reduce Risks',
            summary: 'Employers must perform a suitable and sufficient analysis of workstations ' +
                'used by DSE users to assess the health and safety risks. The assessment must ' +
                'take account of the display screen, keyboard, work desk, chair, work environment, ' +
                'task design, and software. Significant findings must be recorded. Where risks ' +
                'are identified, appropriate measures must be taken to reduce them to the lowest ' +
                'extent reasonably practicable.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'A workstation assessment must be carried out for every user — not generically ' +
                'for a type of workstation. The assessment should be reviewed when the user ' +
                'reports discomfort, when the workstation is significantly changed, or when ' +
                'the nature of the work changes significantly.',
            acopReference: 'L26 paragraphs 14–56',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 3',
            title: 'Requirements for Workstations — Minimum Standards',
            summary: 'Workstations used by DSE users must meet the minimum requirements set out ' +
                'in the Schedule to the Regulations. These cover the display screen (legible, ' +
                'stable image, adjustable), keyboard (separate, tiltable, non-reflective), ' +
                'work surface (sufficient space, low reflectance), work chair (stable, ' +
                'adjustable height, adjustable back rest), space requirements, lighting ' +
                '(no glare or reflections), noise, heat, radiation, and humidity.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'The Schedule sets minimum standards — not best practice. Existing workstations ' +
                'in use at the time the Regulations came into force were given a 4-year ' +
                'transition period; all workstations provided after that date must comply ' +
                'from the outset.',
            acopReference: 'L26 paragraphs 57–121',
        },
        {
            regulation: 'Reg 4',
            title: 'Daily Work Routine of Users — Rest Breaks and Activity Changes',
            summary: 'Employers must plan the activities of DSE users such that daily work on ' +
                'display screen equipment is periodically interrupted by breaks or changes ' +
                'of activity to reduce workload at the display screen. Short frequent breaks ' +
                'are more beneficial than longer infrequent ones. Breaks must be away from ' +
                'the screen.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'The Regulations do not specify a minimum break duration or frequency — this ' +
                'must be determined by assessment. HSE guidance suggests a 5–10 minute ' +
                'break after approximately 50–60 minutes of continuous screen use, but this ' +
                'is guidance, not a statutory requirement.',
            acopReference: 'L26 paragraphs 122–135',
        },
        {
            regulation: 'Reg 5',
            title: 'Eyes and Eyesight',
            summary: 'Employers must ensure that DSE users are entitled to, and on request provided ' +
                'with, appropriate eye and eyesight tests carried out by a competent person. ' +
                'Tests must be provided: before the employee becomes a DSE user; on request ' +
                'at regular intervals; and where a user experiences visual difficulties which ' +
                'may reasonably be considered to be connected with their DSE work. Where tests ' +
                'show that special corrective appliances (glasses) are needed specifically for ' +
                'DSE work, the employer must provide them at the employer\'s cost.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'The employer\'s obligation to pay for glasses applies only where normal corrective ' +
                'glasses do not correct for DSE use — i.e., where the user requires glasses ' +
                'specifically for the viewing distance of their screen. Normal reading glasses ' +
                'or general-purpose glasses paid for by the employee are not covered unless ' +
                'they are insufficient for DSE work.',
            acopReference: 'L26 paragraphs 136–155',
        },
        {
            regulation: 'Reg 6',
            title: 'Provision of Training',
            summary: 'Employers must ensure that DSE users receive adequate health and safety ' +
                'training in the use of any workstation on which they may be required to work. ' +
                'Training must be provided when the employee first becomes a user of a ' +
                'workstation and whenever the organisation of the workstation is substantially ' +
                'modified.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L26 paragraphs 156–168',
        },
        {
            regulation: 'Reg 7',
            title: 'Provision of Information',
            summary: 'Employers must ensure that DSE users are provided with adequate information ' +
                'about the health and safety aspects of their workstations, the measures taken ' +
                'to comply with the Regulations, and their entitlements to eye tests and to ' +
                'workstation assessments.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L26 paragraphs 169–178',
        },
    ],
    assessmentMethodology: 'DSE workstation assessment uses the Schedule criteria (display, keyboard, desk, ' +
        'chair, environment) as the checklist framework. HSE provides a self-assessment ' +
        'checklist (available online) that employees can complete with manager review. ' +
        'The assessment should identify posture, viewing distance, lighting conditions, ' +
        'glare, and task organisation issues. Where a user reports discomfort or pain, ' +
        'a more detailed assessment by an occupational health professional may be required. ' +
        'Home workers using employer-provided DSE must also receive a workstation assessment.',
    complianceCriteria: [
        'A workstation assessment has been carried out for each DSE user — not a generic assessment',
        'Assessment covers all Schedule elements: screen, keyboard, desk, chair, environment, software',
        'Actions arising from the assessment have been taken to reduce identified risks',
        'DSE users have been offered an eye test before becoming a user and at regular intervals',
        'Where glasses are required specifically for DSE work, the employer provides them at cost',
        'Daily work routine includes breaks or activity changes to reduce continuous DSE exposure',
        'Training on workstation setup and safe use has been provided to DSE users',
        'Home workers using employer-provided DSE have received equivalent assessment and training',
        'Assessment is reviewed when the workstation changes significantly or when the user reports discomfort',
    ],
    sourceDocuments: [
        {
            id: 'dse-si',
            docType: 'primary-legislation',
            title: 'Health and Safety (Display Screen Equipment) Regulations 1992',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/1992/2792/contents/made',
            year: 1992,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '1992-12-01',
        },
        {
            id: 'l26',
            docType: 'acop',
            title: 'Work with display screen equipment: Health and Safety (Display Screen Equipment) Regulations 1992 (L26)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l26.pdf',
            version: '2nd edition',
            year: 2003,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2003-01-01',
        },
    ],
    validationRules: [
        {
            ruleId: 'DSE-REG-001',
            description: 'Workstation assessments must be individual — not generic by workstation type',
            severity: 'high',
            check: 'correct-legal-standard',
            failureMessage: 'Content implies a generic workstation assessment is sufficient for all users. Under Reg 2, the assessment must be of the workstation as used by each individual user — it is an individual assessment that takes account of the specific user\'s task, posture, and requirements.',
            reviewerGuidance: 'A single assessment of a generic workstation type is not sufficient. Each user\'s workstation must be assessed, taking into account the individual user\'s physical characteristics, the tasks they perform, and the specific equipment they use.',
        },
        {
            ruleId: 'DSE-REG-002',
            description: 'Employer pays for glasses only where they are specifically required for DSE work — not for normal corrective eyewear',
            severity: 'high',
            check: 'correct-legal-standard',
            failureMessage: 'Content implies the employer must pay for any glasses worn by a DSE user. The Reg 5 obligation applies only where normal corrective glasses are insufficient for DSE use and special DSE-specific glasses are required. Ordinary reading glasses or general-purpose glasses are not covered.',
            reviewerGuidance: 'The employer\'s obligation is to pay for corrective appliances required specifically for DSE work — i.e., where the user would not require glasses at all or where their existing glasses are not suitable for the DSE viewing distance. General eyewear costs are not covered.',
        },
        {
            ruleId: 'DSE-REG-003',
            description: 'No statutory minimum break duration exists — the Regulations require breaks or activity changes, not a specific interval',
            severity: 'medium',
            check: 'no-invented-threshold',
            failureMessage: 'Content states a specific break duration (e.g., "5 minutes every hour") as a statutory requirement. The DSE Regulations require that daily work is periodically interrupted by breaks or changes of activity — the frequency and duration are not prescribed by law.',
            reviewerGuidance: 'HSE guidance suggests short frequent breaks (5–10 minutes per 50–60 minutes of screen use) but these are not statutory minimums. Content should not present specific break intervals as legal requirements.',
        },
        {
            ruleId: 'DSE-REG-004',
            description: 'Home workers using employer-provided DSE are covered by the Regulations',
            severity: 'medium',
            check: 'duty-holder-accuracy',
            failureMessage: 'Content implies DSE Regulations only apply to office-based workers. Home workers who use DSE provided by their employer as a significant part of their work are also covered by the Regulations.',
            reviewerGuidance: 'Verify that content addresses home working DSE obligations. The employer has the same assessment and training duties for home-based DSE users. Remote/self-assessment tools may be used for home assessments.',
        },
        {
            ruleId: 'DSE-REG-005',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'Health and Safety (Display Screen Equipment) Regulations 1992 (SI 1992/2792) apply to Great Britain only.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'dse.*regulation',
            'display screen.*regulation',
            'si 1992/2792',
            'reg 2.*workstation',
            'reg 5.*eye',
            'display screen equipment',
        ],
        highPatterns: [
            'workstation assessment',
            'dse assessment',
            'eye test.*dse',
            'dse.*glasses',
            'dse.*break',
            'home.*working.*dse',
            'individual.*assessment.*dse',
        ],
        mediumPatterns: [
            'screen glare',
            'viewing distance',
            'l26',
            'indg36',
            'posture.*desk',
            'chair adjustment',
            'dse training',
        ],
    },
    learningArcStages: [
        'What is DSE — scope, what counts as a DSE user, and who is covered',
        'Workstation assessment — the Schedule elements, how to assess, and when to review',
        'Minimum workstation requirements — screen, keyboard, desk, chair, and environment',
        'Rest breaks and activity changes — why short frequent breaks are recommended',
        'Eye tests and glasses — when the employer pays and when they do not',
        'Home working DSE — assessment obligations for remote workers',
        'Training obligations — what DSE users must be trained on and when',
        'Musculoskeletal issues from DSE — causes, symptoms, and early intervention',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'workplace-1992',
    ],
};
