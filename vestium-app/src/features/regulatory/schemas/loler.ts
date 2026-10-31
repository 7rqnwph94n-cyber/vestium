// ─── LOLER 1998 — Regulatory Schema ───────────────────────────────────────────
// Lifting Operations and Lifting Equipment Regulations 1998
// SI 1998/2307

import type { RegulatorySchema } from '../types';

export const LOLER_1998: RegulatorySchema = {
    id: 'loler-1998',
    shortTitle: 'LOLER 1998',
    fullTitle: 'Lifting Operations and Lifting Equipment Regulations 1998',
    siNumber: 'SI 1998/2307',
    year: 1998,
    lastAmended: '2002-01-01',
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all employers and self-employed persons who provide or use lifting ' +
        'equipment at work. "Lifting equipment" means work equipment for lifting or ' +
        'lowering loads — including cranes, fork-lift trucks, lifts, hoists, mobile ' +
        'elevating work platforms (MEWPs), patient hoists, and accessories such as ' +
        'slings, shackles, eyebolts, and chains. LOLER applies in addition to PUWER ' +
        '(Reg 3(2)) — PUWER requirements continue to apply to all lifting equipment. ' +
        'LOLER does not apply to escalators (which are covered by the Workplace ' +
        'Regulations 1992).',
    dutyHolders: [
        'Employer',
        'Self-employed person',
        'Person who has control of lifting equipment',
    ],
    keyDuties: [
        {
            regulation: 'Reg 4',
            title: 'Strength and Stability',
            summary: 'Every employer must ensure that lifting equipment used at work is strong ' +
                'and stable enough for the particular use and marked accordingly. All ' +
                'accessories for lifting must also be appropriate for the purposes, compatible ' +
                'with the other equipment, and stored appropriately.',
            dutyHolders: ['Employer', 'Self-employed person'],
            mandatory: true,
            acopReference: 'L113 paragraphs 34–54',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 5',
            title: 'Lifting Equipment for Lifting Persons',
            summary: 'Where lifting equipment is used for lifting persons, it must be suitable for ' +
                'this purpose, designed with features preventing fall of the carrier. Where ' +
                'persons are at risk of being crushed, trapped, struck, or falling from the ' +
                'carrier, additional features must prevent such events. Emergency lowering ' +
                'provision must be made where the carrier can trap persons.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Applies specifically where lifting equipment is used to lift persons — ' +
                'e.g., personnel baskets on cranes, MEWPs used to lift people, patient ' +
                'hoists. Additional requirements beyond Reg 4 apply in these circumstances.',
            acopReference: 'L113 paragraphs 55–98',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 6',
            title: 'Positioning and Installation',
            summary: 'Every employer must ensure that lifting equipment is positioned or installed ' +
                'in such a way as to reduce to as low as reasonably practicable the risk of ' +
                'the lifting equipment or load striking a person, or from the load drifting, ' +
                'falling freely, or being released unintentionally. Steps must be taken to ' +
                'ensure the equipment cannot become destabilised.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L113 paragraphs 99–118',
        },
        {
            regulation: 'Reg 7',
            title: 'Marking of Lifting Equipment',
            summary: 'Every employer must ensure that machinery and accessories for lifting are ' +
                'clearly marked to indicate their safe working load (SWL) or working load ' +
                'limit (WLL). Where the SWL depends on the configuration of the equipment, ' +
                'this information must be available on the equipment. Accessories for lifting ' +
                'persons must be appropriately marked.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L113 paragraphs 119–142',
        },
        {
            regulation: 'Reg 8',
            title: 'Organisation of Lifting Operations',
            summary: 'Every employer must ensure that every lifting operation involving lifting ' +
                'equipment is: (a) properly planned by a competent person, (b) appropriately ' +
                'supervised, and (c) carried out in a safe manner. A lifting plan must be in ' +
                'place before the lift is carried out. The plan must address the load, the ' +
                'equipment, the environment, and the personnel involved.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'The planning competent person must have the necessary skills, knowledge, ' +
                'experience, and training. For routine repetitive lifts (e.g., a single ' +
                'operator using a pallet truck), the plan may be generic rather than lift-specific, ' +
                'but a considered plan is always required.',
            acopReference: 'L113 paragraphs 143–184',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 9',
            title: 'Thorough Examination and Inspection',
            summary: 'Every employer must ensure that lifting equipment and accessories are ' +
                'thoroughly examined: (a) before first use (unless an EC declaration of ' +
                'conformity not more than 12 months old is available), (b) after installation ' +
                'where safety depends on installation conditions, (c) at the following intervals — ' +
                '6 months for equipment used to lift persons and accessories for lifting, ' +
                '12 months for all other lifting equipment — or in accordance with a written ' +
                'examination scheme. Where exceptional circumstances have occurred which may ' +
                'have jeopardised safety, the equipment must be thoroughly examined before further use.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'A thorough examination is more than a visual inspection — it is a detailed ' +
                'examination by a competent person to detect defects and assess whether the ' +
                'equipment can continue to perform its function safely. The 6-month interval ' +
                'applies where persons are lifted; 12 months for all other lifting equipment. ' +
                'A written examination scheme prepared by a competent person may specify ' +
                'different intervals if appropriate.',
            acopReference: 'L113 paragraphs 185–272',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 10',
            title: 'Reports and Defects',
            summary: 'After a thorough examination, the competent person must notify the employer ' +
                'immediately of any defect which is or could become a danger to persons. ' +
                'A written report must be made as soon as practicable and sent to the relevant ' +
                'enforcing authority where there is a defect involving existing or imminent ' +
                'risk of serious personal injury. Copies of thorough examination reports must ' +
                'be kept until the next report is made (or for 2 years for accessories).',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'Reports must be made to the relevant enforcing authority (HSE or local ' +
                'authority) where there is an imminent danger risk. Equipment must not be ' +
                'put into service until the defect is rectified.',
            acopReference: 'L113 paragraphs 273–314',
        },
    ],
    assessmentMethodology: 'LOLER compliance is assessed by verifying the planned approach to lifting ' +
        'operations and the thorough examination regime. Key indicators include: ' +
        'written lifting plans prepared by competent persons, valid thorough examination ' +
        'reports within the required intervals (6 or 12 months), SWL/WLL markings ' +
        'visible on all lifting equipment and accessories, and traceability of the ' +
        'competent person who carried out examinations. For complex lifting operations, ' +
        'a method statement and risk assessment covering the lift must be available.',
    complianceCriteria: [
        'All lifting equipment has a valid thorough examination — 6 months (persons lifted) or 12 months',
        'A written examination scheme prepared by a competent person is in place where relevant',
        'Every lifting operation is planned by a competent person with a documented lifting plan',
        'Lifting equipment and accessories are clearly marked with SWL or WLL',
        'Equipment used to lift persons meets the additional requirements of Reg 5',
        'Thorough examination reports are retained — until next examination for equipment; 2 years for accessories',
        'Defects identified on thorough examination are reported to the employer immediately',
        'Where imminent risk of serious injury, the defect is reported to the enforcing authority',
        'Lifting operations are appropriately supervised by a competent person',
        'PUWER requirements (suitability, maintenance, guarding) apply in addition to LOLER',
    ],
    sourceDocuments: [
        {
            id: 'loler-si',
            docType: 'primary-legislation',
            title: 'Lifting Operations and Lifting Equipment Regulations 1998',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/1998/2307/contents/made',
            year: 1998,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '1998-12-05',
        },
        {
            id: 'l113',
            docType: 'acop',
            title: 'Safe Use of Lifting Equipment: Approved Code of Practice and guidance (L113)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l113.pdf',
            version: '2nd edition',
            year: 2014,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2014-01-01',
        },
    ],
    validationRules: [
        {
            ruleId: 'LOLER-REG-001',
            description: 'Regulation numbers must be cited accurately against SI 1998/2307',
            severity: 'regulatory',
            check: 'no-invented-regulation',
            failureMessage: 'Generated content contains a LOLER regulation reference that does not match SI 1998/2307. Invented or misattributed regulation numbers are a regulatory-severity finding.',
            reviewerGuidance: 'Cross-check the specific regulation cited against LOLER 1998 at legislation.gov.uk/uksi/1998/2307.',
        },
        {
            ruleId: 'LOLER-REG-002',
            description: 'Thorough examination intervals must be correctly stated: 6 months (persons lifted) and 12 months (other lifting equipment)',
            severity: 'regulatory',
            check: 'no-invented-threshold',
            failureMessage: 'Content states an incorrect thorough examination interval. LOLER Reg 9(3) specifies: 6 months for equipment used to lift persons and lifting accessories; 12 months for all other lifting equipment — or in accordance with a written examination scheme.',
            reviewerGuidance: 'Verify the interval stated against LOLER Reg 9(3). The 6-month interval is for equipment that actually lifts persons (e.g., personnel baskets, MEWPs, patient hoists) — not all cranes. A written examination scheme can specify alternative intervals.',
        },
        {
            ruleId: 'LOLER-REG-003',
            description: 'PUWER continues to apply alongside LOLER — LOLER is not a complete replacement',
            severity: 'high',
            check: 'regulatory-interaction',
            failureMessage: 'Content implies LOLER replaces PUWER for lifting equipment. LOLER Reg 3(2) is explicit — PUWER applies to lifting equipment in addition to LOLER requirements.',
            reviewerGuidance: 'Lifting equipment must comply with both PUWER (suitability, maintenance, guarding, controls, information and training) and LOLER (strength and stability, planning, thorough examination, marking).',
        },
        {
            ruleId: 'LOLER-REG-004',
            description: '"Thorough examination" must not be conflated with routine inspection or maintenance',
            severity: 'high',
            check: 'correct-legal-standard',
            failureMessage: 'Content uses "thorough examination" interchangeably with "inspection" or "service". A LOLER thorough examination is a defined legal concept — a detailed examination by a competent person to detect defects — distinct from routine inspection.',
            reviewerGuidance: 'Thorough examination (Reg 9) is carried out by a competent person (typically an independent inspecting engineer) at statutory intervals. It is distinct from routine inspection under Reg 6 PUWER or from maintenance. Do not conflate these three activities.',
        },
        {
            ruleId: 'LOLER-REG-005',
            description: 'Safe working load (SWL) and working load limit (WLL) must not be overstated or transposed',
            severity: 'regulatory',
            check: 'no-numeric-fabrication',
            failureMessage: 'Content states an SWL or WLL value that cannot be verified against marked equipment or design documents. Any SWL/WLL figure used in training must be contextual — generic values must not be invented.',
            reviewerGuidance: 'SWL/WLL values are equipment-specific and must be taken from the manufacturer\'s documentation or the marking on the equipment itself. Do not accept invented generic values.',
        },
        {
            ruleId: 'LOLER-REG-006',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'LOLER 1998 (SI 1998/2307) applies to Great Britain only. Northern Ireland has equivalent but separate legislation.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'loler',
            'thorough examination.*lift',
            '6.month.*lift',
            '12.month.*lift',
            'swl',
            'wll',
            'si 1998/2307',
            'lifting operations.*plan',
            'reg 8.*loler',
            'reg 9.*loler',
            'lifting operations and lifting equipment',
        ],
        highPatterns: [
            'safe working load',
            'written scheme.*examination',
            'competent person.*lift',
            'lifting plan',
            'crane.*competent',
            'forklift.*inspection',
            'sling.*examination',
            'mewp.*examination',
            'patient hoist.*loler',
            'imminent danger.*lift',
        ],
        mediumPatterns: [
            'lift.*marking',
            'lifting accessory',
            'loler assessment',
            'thorough examination interval',
            'l113',
            'ec declaration.*conformity.*lift',
            'examination scheme',
        ],
    },
    learningArcStages: [
        'What is LOLER — scope, "lifting equipment" definition, and how it interacts with PUWER',
        'Strength, stability, and marking — SWL/WLL requirements and what markings are required',
        'Planning lifting operations — the Reg 8 duty, competent person, and what a lifting plan must cover',
        'Equipment for lifting persons — additional requirements under Reg 5',
        'Thorough examination — 6 vs 12 month intervals, written examination schemes, and competence',
        'Reports and defects — when to report to the enforcing authority and retention requirements',
        'Lifting accessories — slings, shackles, chains: examination intervals and safe use',
        'LOLER in practice — construction, warehousing, healthcare, and industrial applications',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'puwer-1998',
    ],
};
