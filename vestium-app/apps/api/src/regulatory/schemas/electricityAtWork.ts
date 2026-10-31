// ─── Electricity at Work Regulations 1989 — Regulatory Schema ─────────────────
// Electricity at Work Regulations 1989
// SI 1989/635
//
// Source authorities:
//   legislation.gov.uk/uksi/1989/635 (Open Government Licence v3.0)
//   HSE HSR25 — Memorandum of guidance on the Electricity at Work Regulations 1989
//   HSE HSG85 — Electricity at work: Safe working practices (3rd edition, 2013)
//
// Note: EAW has no ACOP. HSR25 is the memorandum of guidance (technical basis);
// HSG85 is the practical guidance publication.

import type { RegulatorySchema } from '../types.js';

export const ELECTRICITY_AT_WORK_1989: RegulatorySchema = {
    id: 'electricity-at-work-1989',
    shortTitle: 'Electricity at Work 1989',
    fullTitle: 'Electricity at Work Regulations 1989',
    siNumber: 'SI 1989/635',
    year: 1989,
    lastAmended: '1989-04-01', // No significant amendments — original SI still in force
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all workplaces where electrical systems are used. "Electrical system" ' +
        'means a system in which all the electrical equipment is, or may be, electrically ' +
        'connected to a common source of electrical energy. The Regulations cover all ' +
        'electrical work — from low-voltage office installations to high-voltage industrial ' +
        'systems — and apply to employers, self-employed persons, and employees. Most ' +
        'duties are absolute (not qualified by "reasonably practicable"), making breach ' +
        'of many provisions a strict liability offence under HSWA 1974. The Regulations ' +
        'apply across all industries but are particularly critical in utilities, oil and ' +
        'gas, manufacturing, and construction.',
    dutyHolders: [
        'Employer',
        'Self-employed person',
        'Employee (absolute duties under Regs 4–16)',
    ],
    keyDuties: [
        {
            regulation: 'Reg 4',
            title: 'Systems, Work Activities and Protective Equipment',
            summary: 'All systems must, at all times, be of such construction as to prevent, so ' +
                'far as is reasonably practicable, danger. All work activities — including ' +
                'operation, use, and maintenance of a system — must, so far as reasonably ' +
                'practicable, be carried out in such a manner as not to give rise to danger. ' +
                'Any protective equipment provided must be suitable for use in the manner it ' +
                'is provided.',
            dutyHolders: ['Employer', 'Employee', 'Self-employed person'],
            mandatory: true,
            acopReference: 'HSR25 paragraphs 23–38',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 5',
            title: 'Strength and Capability of Electrical Equipment',
            summary: 'No electrical equipment may be put into use where its strength and capability ' +
                'may be exceeded in such a way as may give rise to danger. Equipment must not ' +
                'be overloaded. Cables must be rated for the maximum load they will carry.',
            dutyHolders: ['Employer', 'Employee'],
            mandatory: true,
            acopReference: 'HSR25 paragraphs 39–46',
        },
        {
            regulation: 'Reg 7',
            title: 'Insulation, Protection and Placing of Conductors',
            summary: 'All conductors in a system which may give rise to danger must be covered with ' +
                'insulating material or be placed so as to prevent danger. Where insulation is ' +
                'used, it must be adequate to prevent danger. Underground cables must be marked ' +
                'or protected to prevent damage.',
            dutyHolders: ['Employer', 'Employee'],
            mandatory: true,
            acopReference: 'HSR25 paragraphs 57–78',
        },
        {
            regulation: 'Reg 8',
            title: 'Earthing or Other Suitable Precautions',
            summary: 'Precautions must be taken to prevent danger arising when any conductor ' +
                'which is not part of a circuit becomes charged as a result of being in ' +
                'contact with another conductor which is live. Earthing is the primary means ' +
                'of achieving this — where earthing is not practicable, other equivalent ' +
                'precautions must be taken.',
            dutyHolders: ['Employer', 'Employee'],
            mandatory: true,
            acopReference: 'HSR25 paragraphs 79–90',
        },
        {
            regulation: 'Reg 12',
            title: 'Means for Cutting Off the Supply and for Isolation',
            summary: 'Where necessary to prevent danger, suitable means must be available for: ' +
                '(a) cutting off the supply of electrical energy to any electrical equipment, ' +
                'and (b) isolating any electrical equipment from every source of electrical ' +
                'energy. Isolators must be clearly identifiable and accessible. Locking-off ' +
                '(lockout/tagout) must be in place to prevent inadvertent re-energisation ' +
                'during maintenance.',
            dutyHolders: ['Employer', 'Employee'],
            mandatory: true,
            acopReference: 'HSR25 paragraphs 103–116',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 13',
            title: 'Precautions for Work on Equipment Made Dead',
            summary: 'Adequate precautions must be taken to prevent electrical equipment which ' +
                'has been made dead from becoming electrically charged during work on it. ' +
                'This includes proving dead (using an approved voltage indicator), locking ' +
                'off, applying earths (on high-voltage systems), and erecting barriers and ' +
                'warning notices.',
            dutyHolders: ['Employer', 'Employee'],
            mandatory: true,
            conditionNote: 'The proving dead, locking off, and earthing sequence is mandatory before ' +
                'any work on dead systems begins. The sequence must be followed — none of ' +
                'the steps may be omitted. An approved voltage indicator (AVI) must be used ' +
                'to prove dead — a test lamp or other unapproved device is not sufficient.',
            acopReference: 'HSR25 paragraphs 117–140',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 14',
            title: 'Work on or Near Live Conductors',
            summary: 'No person may work on or so near any live conductor (other than one ' +
                'suitably covered with insulating material so as to prevent danger) that ' +
                'danger may arise, unless: (a) it is unreasonable in all the circumstances ' +
                'for the conductor to be dead, (b) it is reasonable in all the circumstances ' +
                'for the person to work on or near it while live, and (c) suitable precautions ' +
                '(including, where necessary, the provision of suitable protective equipment) ' +
                'are taken to prevent injury.',
            dutyHolders: ['Employer', 'Employee'],
            mandatory: true,
            conditionNote: 'Live working is the exception, not the rule — all three conditions must be ' +
                'satisfied simultaneously. Convenience or the cost of de-energising are not ' +
                'sufficient justification for live work. Live working requires a permit-to-work ' +
                'system, specialist training, and appropriate insulated tools and PPE.',
            acopReference: 'HSR25 paragraphs 141–164',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 16',
            title: 'Persons to Be Competent to Prevent Danger and Injury',
            summary: 'No person may carry out any work activity where technical knowledge or ' +
                'experience is necessary to prevent danger or, where appropriate, injury, ' +
                'unless he possesses such knowledge or experience, or is under such degree ' +
                'of supervision as may be appropriate, having regard to the nature of the work.',
            dutyHolders: ['Employer', 'Employee', 'Self-employed person'],
            mandatory: true,
            acopReference: 'HSR25 paragraphs 165–175',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
    ],
    assessmentMethodology: 'EAW compliance assessment focuses on: the electrical system design (suitable ' +
        'for purpose, adequate ratings), written safe systems of work for electrical ' +
        'maintenance, permit-to-work systems for high-risk work, locking-off arrangements ' +
        'and lockout/tagout procedures, competence management (who is authorised to work ' +
        'on what systems at what voltages), and inspection/testing records. HSG85 provides ' +
        'practical assessment guidance. For high-voltage systems, additional competence ' +
        'requirements and safety rules apply.',
    complianceCriteria: [
        'All electrical systems are designed, installed, and maintained to prevent danger',
        'Isolation means exist and are accessible for all electrical equipment',
        'A formal locking-off procedure (lockout/tagout) prevents inadvertent re-energisation during maintenance',
        'The prove dead → lock off → earth (HV) → bar and notice sequence is followed before work on dead systems',
        'Live working only where all three Reg 14 conditions are satisfied — a permit-to-work must be in place',
        'Only competent persons (Reg 16) carry out electrical work — authorisation levels are defined',
        'Periodic inspection and testing of fixed installations is carried out to the appropriate standard',
        'Content does not present live working as a normal or routine activity',
        'Underground cables are marked or protected and plans/drawings are available before groundworks begin',
    ],
    sourceDocuments: [
        {
            id: 'eaw-si',
            docType: 'primary-legislation',
            title: 'Electricity at Work Regulations 1989',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/1989/635/contents/made',
            year: 1989,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '1989-04-01',
        },
        {
            id: 'hsr25',
            docType: 'hse-guidance',
            title: 'Memorandum of guidance on the Electricity at Work Regulations 1989 (HSR25)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/hsr25.pdf',
            year: 1989,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '1989-04-01',
        },
        {
            id: 'hsg85',
            docType: 'hse-guidance',
            title: 'Electricity at work: Safe working practices (HSG85)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/hsg85.pdf',
            version: '3rd edition',
            year: 2013,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2013-01-01',
        },
    ],
    validationRules: [
        {
            ruleId: 'EAW-REG-001',
            description: 'Many EAW duties are absolute — not qualified by "reasonably practicable"',
            severity: 'regulatory',
            check: 'correct-legal-standard',
            failureMessage: 'Content characterises an absolute EAW duty as only requiring "reasonably practicable" steps. Several EAW regulations (notably Regs 4(3), 5, 7, 8, 9, 10, 11, 12, 13, 14, 16) impose absolute duties — breach is strict liability regardless of what precautions were taken.',
            reviewerGuidance: 'Check whether the specific regulation cited is absolute or "reasonably practicable". Reg 4(1) and 4(2) are qualified by "reasonably practicable"; most other EAW regulations are not. Absolute duties significantly affect enforcement and defence positions.',
        },
        {
            ruleId: 'EAW-REG-002',
            description: 'Live working requires all three Reg 14 conditions — it is the exception, not a routine option',
            severity: 'regulatory',
            check: 'control-hierarchy-correct',
            failureMessage: 'Content presents live electrical working as a normal or routine option. Live working under Reg 14 is only permissible where all three conditions are simultaneously satisfied: (a) it is unreasonable in all circumstances for the conductor to be dead, (b) it is reasonable in all circumstances for the work to be done live, and (c) suitable precautions are taken.',
            reviewerGuidance: 'The default position under EAW is that electrical work must be done dead. Live working requires explicit justification against all three Reg 14 conditions — cost or convenience of de-energising are not acceptable reasons.',
        },
        {
            ruleId: 'EAW-REG-003',
            description: 'Proving dead must use an approved voltage indicator (AVI) — not a test lamp or screwdriver',
            severity: 'high',
            check: 'correct-legal-standard',
            failureMessage: 'Content references proving dead without specifying the use of an approved voltage indicator (AVI), or implies that a test lamp or other improvised device is acceptable. HSR25 requires an AVI that itself has been proved on a known live source immediately before use.',
            reviewerGuidance: 'The proving dead sequence: (1) prove the AVI on a known live source, (2) test the equipment/circuit with the AVI, (3) prove the AVI on a known live source again. A test lamp or screwdriver are not acceptable substitutes for an approved voltage indicator.',
        },
        {
            ruleId: 'EAW-REG-004',
            description: 'Competence (Reg 16) is functional — it is not equivalent to possession of any specific qualification',
            severity: 'high',
            check: 'duty-holder-accuracy',
            failureMessage: 'Content implies that holding a specific electrical qualification automatically satisfies Reg 16 competence. Reg 16 requires technical knowledge or experience necessary to prevent danger for the specific work being carried out — this is task-specific and system-specific, not certificate-based.',
            reviewerGuidance: 'Reg 16 competence is assessed against the specific work activity and system voltage. An electrician qualified for domestic wiring may not be competent on high-voltage industrial systems. Authorisation levels should be system-specific.',
        },
        {
            ruleId: 'EAW-REG-005',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'Electricity at Work Regulations 1989 (SI 1989/635) apply to Great Britain only.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'electricity at work',
            'eaw.*regulation',
            'si 1989/635',
            'reg 14.*live',
            'reg 16.*competent',
            'live.*conductor',
        ],
        highPatterns: [
            'live working',
            'live work.*permit',
            'prove.*dead',
            'approved voltage indicator',
            'avi',
            'lockout.*tagout',
            'loto.*electrical',
            'isolation.*electrical',
            'permit.*work.*electrical',
        ],
        mediumPatterns: [
            'electrical competence',
            'hsg85',
            'hsr25',
            'authorised person.*electrical',
            'low voltage',
            'high voltage',
            'periodic inspection',
            'earth bonding',
        ],
    },
    learningArcStages: [
        'What the Electricity at Work Regulations cover — scope, duty holders, and absolute duties',
        'Electrical hazards — shock, burn, arc flash, and explosion risks',
        'Safe isolation — the prove dead, lock off, earth, bar and notice sequence',
        'Live working — the three Reg 14 conditions, permits to work, and when live work is justified',
        'Competence (Reg 16) — what it means, how it is assessed, and authorisation levels',
        'Permit-to-work systems for electrical work — issuing, working, clearance, and cancellation',
        'Electrical system inspection and testing — periodic inspection, Portable Appliance Testing (PAT)',
        'EAW in high-risk environments — utilities, oil and gas, and hazardous area electrical work',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'puwer-1998',
        'dsear-2002',
    ],
};
