// ─── PPE at Work Regulations 1992 — Regulatory Schema ─────────────────────────
// Personal Protective Equipment at Work Regulations 1992
// SI 1992/2966 (as amended by SI 2022/8 from 6 April 2022)

// The 2022 amendment (SI 2022/8) extended duty holder obligations from employees
// to workers — including limb workers and other similar worker relationships.
// Note: L25 is HSE regulatory guidance, not an ACOP (the original ACOP was withdrawn).

import type { RegulatorySchema } from '../types';

export const PPE_1992: RegulatorySchema = {
    id: 'ppe-1992',
    shortTitle: 'PPE at Work 1992',
    fullTitle: 'Personal Protective Equipment at Work Regulations 1992',
    siNumber: 'SI 1992/2966',
    year: 1992,
    lastAmended: '2022-04-06', // SI 2022/8 — extended duties to workers
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all employers (and, from 6 April 2022, to all engagers of workers ' +
        'including limb workers) where PPE is provided or is required to be provided. ' +
        'PPE must only be used as a control measure where the risk cannot be adequately ' +
        'controlled by other means — it is the measure of last resort in every relevant ' +
        'control hierarchy (COSHH, Manual Handling, MHSWR Schedule 1). The Regulations ' +
        'do not apply to PPE used for protection against weather conditions while not at ' +
        'work, or to certain other categories set out in Reg 3.',
    dutyHolders: [
        'Employer',
        'Engager (of workers, including limb workers) — from 6 April 2022',
        'Employee',
        'Worker — from 6 April 2022',
    ],
    keyDuties: [
        {
            regulation: 'Reg 4',
            title: 'Provision of Personal Protective Equipment',
            summary: 'Every employer must ensure that suitable PPE is provided to employees who ' +
                'may be exposed to a risk to their health or safety while at work, except ' +
                'where and to the extent that such risk has been adequately controlled by ' +
                'other means which are equally or more effective. PPE must be suitable for ' +
                'the risk, the conditions, the wearer, and the task. From 6 April 2022, ' +
                'the same duty applies to engagers of limb workers.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'PPE is only required where the risk cannot be adequately controlled by other ' +
                'means — it must never be presented as the primary control measure where ' +
                'engineering controls, substitution, or other higher-hierarchy measures are ' +
                'practicable.',
            acopReference: 'L25 paragraphs 24–72',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 5',
            title: 'Compatibility of PPE',
            summary: 'Where more than one item of PPE is worn at the same time, the employer must ' +
                'ensure that the items are compatible with each other and continue to be ' +
                'effective against the risks concerned. A compatibility assessment must be ' +
                'carried out before providing multiple PPE items to a single wearer.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Applies where two or more PPE items are used simultaneously — e.g., hard hat ' +
                'with hearing protection, RPE with eye protection. Incompatible combinations ' +
                'can reduce the effectiveness of both items.',
            acopReference: 'L25 paragraphs 73–82',
        },
        {
            regulation: 'Reg 6',
            title: 'Assessment Before Choosing Personal Protective Equipment',
            summary: 'Before choosing PPE, the employer must ensure that an assessment has been ' +
                'made to determine whether the PPE intended to be provided is suitable. The ' +
                'assessment must take into account the nature and degree of the risk, the ' +
                'part of the body to be protected, the conditions and activities in which the ' +
                'PPE is to be used, and the state of health of persons who may wear it.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L25 paragraphs 83–108',
        },
        {
            regulation: 'Reg 7',
            title: 'Maintenance and Replacement of PPE',
            summary: 'Every employer must ensure that any PPE provided is maintained — including ' +
                'being replaced or cleaned as appropriate — in an efficient state, in efficient ' +
                'working order, and in good repair. Maintenance must include appropriate testing.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L25 paragraphs 109–128',
        },
        {
            regulation: 'Reg 8',
            title: 'Accommodation for PPE',
            summary: 'Every employer must ensure that appropriate accommodation is provided for ' +
                'PPE when it is not in use. Accommodation must protect the PPE from ' +
                'contamination, loss, or damage.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L25 paragraphs 129–135',
        },
        {
            regulation: 'Reg 9',
            title: 'Information, Instruction and Training',
            summary: 'Every employer must ensure that employees are provided with adequate and ' +
                'appropriate information, instruction and training to enable them to know: ' +
                'the risk or risks the PPE will avoid or limit, the purpose for which and ' +
                'the manner in which the PPE is to be used, and any action required to ' +
                'maintain the PPE in an efficient state.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L25 paragraphs 136–155',
        },
        {
            regulation: 'Reg 10',
            title: "Employee's Duty to Use PPE",
            summary: 'Every employee must use any PPE provided in accordance with the training ' +
                'received and the instructions given by the employer. Employees must not ' +
                'intentionally misuse or damage PPE provided for their protection.',
            dutyHolders: ['Employee'],
            mandatory: true,
            acopReference: 'L25 paragraphs 156–163',
        },
        {
            regulation: 'Reg 11',
            title: 'Reporting Loss or Defect',
            summary: 'Every employee must report the loss or obvious defect in any PPE which ' +
                'they use to their employer forthwith.',
            dutyHolders: ['Employee'],
            mandatory: true,
            acopReference: 'L25 paragraphs 164–168',
        },
    ],
    assessmentMethodology: 'PPE assessments must consider the nature of the risk, the body part to be ' +
        'protected, and the conditions of use. The assessment is distinct from — but ' +
        'linked to — the risk assessment under MHSWR Reg 3. HSE L25 provides an ' +
        'assessment framework covering: hazard type → body area → PPE performance ' +
        'standard required → compatibility check where multiple items are worn. ' +
        'CE marking or UKCA marking confirms a product meets the relevant standard ' +
        'but does not substitute for a workplace-specific suitability assessment.',
    complianceCriteria: [
        'PPE is only provided where the risk cannot adequately be controlled by other means — not as a first resort',
        'A suitability assessment has been carried out before PPE is chosen (Reg 6)',
        'Where multiple PPE items are worn together, a compatibility assessment has been carried out (Reg 5)',
        'PPE carries the CE mark or UKCA mark appropriate to the risk category',
        'Maintenance records are kept for complex PPE (breathing apparatus, fall arrest equipment)',
        'Employees have received training in correct fit, use, maintenance, and limitations of their PPE',
        'Storage accommodation protects PPE from contamination and damage between uses',
        'Employees know how to report lost or defective PPE (Reg 11 duty)',
        'PPE is replaced when worn, damaged, or when its use-by date has passed',
        'Content does not present PPE as a substitute for engineering controls or substitution',
    ],
    sourceDocuments: [
        {
            id: 'ppe-si',
            docType: 'primary-legislation',
            title: 'Personal Protective Equipment at Work Regulations 1992',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/1992/2966/contents/made',
            year: 1992,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '1992-12-01',
        },
        {
            id: 'ppe-amend-2022',
            docType: 'primary-legislation',
            title: 'Personal Protective Equipment at Work (Amendment) Regulations 2022',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/2022/8/contents/made',
            year: 2022,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '2022-04-06',
        },
        {
            id: 'l25',
            docType: 'hse-guidance',
            title: 'Personal Protective Equipment at Work (L25)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l25.pdf',
            version: '4th edition',
            year: 2022,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2022-04-06',
        },
    ],
    validationRules: [
        {
            ruleId: 'PPE-REG-001',
            description: 'PPE must be presented as a last resort — not as the primary control measure',
            severity: 'regulatory',
            check: 'control-hierarchy-correct',
            failureMessage: 'Content presents PPE as a primary or preferred control measure. Under Reg 4, PPE is only required where the risk cannot be adequately controlled by other means. It is the final step in every relevant control hierarchy.',
            reviewerGuidance: 'Check whether higher-hierarchy controls (elimination, substitution, engineering, organisational) have been considered and dismissed before PPE is reached. Content promoting PPE without first exhausting other controls requires correction.',
        },
        {
            ruleId: 'PPE-REG-002',
            description: 'L25 is HSE guidance, not an ACOP — it does not carry the same evidential weight',
            severity: 'medium',
            check: 'acop-status-accurate',
            failureMessage: 'Content describes L25 as an Approved Code of Practice. L25 (4th edition, 2022) is HSE regulatory guidance — the original ACOP was withdrawn. It does not carry the same evidential weight as an ACOP in enforcement proceedings.',
            reviewerGuidance: 'Clarify that L25 is guidance rather than an ACOP. Following L25 is good practice but failure to do so is not itself evidential of a breach in the same way as non-compliance with an ACOP.',
        },
        {
            ruleId: 'PPE-REG-003',
            description: 'From 6 April 2022 duties extend to workers (limb workers) — not just employees',
            severity: 'high',
            check: 'duty-holder-accuracy',
            failureMessage: 'Content states that PPE Regulations duties apply only to employees. Since 6 April 2022 (SI 2022/8), duties also extend to engagers of workers, including limb workers. Content written for a post-April 2022 audience must reflect this extension.',
            reviewerGuidance: 'Verify whether the training context involves limb workers or agency staff. If so, the employer/engager duties under the amended Regulations must be addressed.',
        },
        {
            ruleId: 'PPE-REG-004',
            description: 'UKCA marking applies in Great Britain post-Brexit; CE marking remains valid in certain circumstances — both must be accurately characterised',
            severity: 'medium',
            check: 'correct-legal-standard',
            failureMessage: 'Content incorrectly states the marking required for PPE sold in Great Britain. UKCA marking applies for products placed on the GB market by UK-based manufacturers; CE marking continues to be recognised for products placed on the market before specific cut-off dates.',
            reviewerGuidance: 'PPE marking requirements changed post-Brexit. Verify the current marking position for the type of PPE being discussed. For most practical training purposes, stating that PPE must be marked to the appropriate product standard is sufficient.',
        },
        {
            ruleId: 'PPE-REG-005',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'PPE at Work Regulations 1992 (SI 1992/2966) apply to Great Britain only. Northern Ireland has equivalent but separate legislation.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'ppe.*regulation',
            'personal protective equipment.*regulation',
            'reg 4.*ppe',
            'si 1992/2966',
            'ppe.*last resort',
            'si 2022/8',
            'limb worker.*ppe',
        ],
        highPatterns: [
            'ppe assessment',
            'compatibility.*ppe',
            'suitable.*ppe',
            'ppe.*maintenance',
            'ppe.*training',
            'ce mark.*ppe',
            'ukca.*ppe',
            'respiratory protective equipment',
            'rpe.*fit test',
            'fall arrest.*ppe',
        ],
        mediumPatterns: [
            'hard hat',
            'safety boots',
            'high visibility',
            'glove.*chemical',
            'l25',
            'ppe.*storage',
            'ppe.*inspection',
        ],
    },
    learningArcStages: [
        'What are the PPE Regulations — scope, the 2022 extension to workers, and what they cover',
        'PPE as a last resort — understanding the control hierarchy and why PPE comes last',
        'Reg 6 assessment — choosing the right PPE: hazard type, body area, and performance standard',
        'Compatibility — managing multiple PPE items and the assessment required',
        'Maintenance, storage, and replacement — the employer duty under Reg 7',
        'CE and UKCA marking — what marking means and what it does not mean',
        'Employee and worker duties — Reg 10 (use) and Reg 11 (reporting defects)',
        'PPE training — what workers must know before they use PPE',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'coshh-2002',
        'manual-handling-1992',
        'work-at-height-2005',
    ],
};
