// ─── COSHH 2002 — Regulatory Schema ───────────────────────────────────────────
// Control of Substances Hazardous to Health Regulations 2002
// SI 2002/2677

import type { RegulatorySchema } from '../types';

export const COSHH_2002: RegulatorySchema = {
    id: 'coshh-2002',
    shortTitle: 'COSHH 2002',
    fullTitle: 'Control of Substances Hazardous to Health Regulations 2002',
    siNumber: 'SI 2002/2677',
    year: 2002,
    lastAmended: '2004-01-28', // SI 2004/3386 — amendment relating to biological agents
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all employers where employees may be exposed to substances hazardous ' +
        'to health in the course of their work. Covers chemicals, dusts, fumes, vapours, ' +
        'mists, gases, biological agents, and carcinogens/mutagens. COSHH sits on top of ' +
        'MHSWR 1999 — the general risk assessment duty under Reg 3 MHSWR is supplemented ' +
        'by the more specific COSHH assessment requirement under Reg 6.',
    dutyHolders: [
        'Employer',
        'Employee',
        'Self-employed person',
    ],
    keyDuties: [
        {
            regulation: 'Reg 6',
            title: 'Assessment of Health Risks',
            summary: 'Employers must not carry out work which is liable to expose employees to ' +
                'any substance hazardous to health unless a suitable and sufficient assessment ' +
                'of the risks created by that work has been made. The assessment must identify ' +
                'the measures needed to comply with COSHH, be reviewed if no longer valid, ' +
                'and significant findings must be recorded where 5 or more employees are employed.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'Written record of significant findings required where 5 or more employees ' +
                'are employed. Assessment must be reviewed when materially changed or when ' +
                'there is reason to believe it is no longer valid.',
            acopReference: 'L5 paragraphs 38–84',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 7',
            title: 'Prevention or Control of Exposure',
            summary: 'Every employer must ensure that exposure of employees to substances hazardous ' +
                'to health is either prevented or, where prevention is not reasonably practicable, ' +
                'adequately controlled. Control measures must be applied in accordance with the ' +
                'hierarchy: (1) elimination, (2) substitution with less hazardous substance, ' +
                '(3) total enclosure of process, (4) engineering controls including local exhaust ' +
                'ventilation (LEV), (5) systems of work and supervision, (6) appropriate PPE ' +
                'as a last resort only. For carcinogens and mutagens, exposure must be reduced ' +
                'to as low a level as is reasonably practicable.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'For carcinogens, mutagens, and biological agents classified as hazard group 3 ' +
                'or 4, the standard is ALARP not merely "adequate control". PPE may only be ' +
                'used where adequate control cannot be achieved by other means (Reg 7(1)).',
            acopReference: 'L5 paragraphs 85–161',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 8',
            title: 'Use of Control Measures',
            summary: 'Every employer must take all reasonable steps to ensure that control measures, ' +
                'including PPE, are properly used or applied. Every employee must make full and ' +
                'proper use of any control measure, protective equipment, or other measures ' +
                'provided by the employer, and report any defect immediately.',
            dutyHolders: ['Employer', 'Employee'],
            mandatory: true,
            acopReference: 'L5 paragraphs 162–171',
        },
        {
            regulation: 'Reg 9',
            title: 'Maintenance, Examination and Test of Control Measures',
            summary: 'Employers must ensure that control measures — including engineering controls ' +
                'such as LEV systems, enclosed systems, and respiratory protective equipment — ' +
                'are maintained in an efficient state, in efficient working order, and in good ' +
                'repair. LEV systems must be examined and tested at least once every 14 months ' +
                '(or at intervals specified in Schedule 4 for certain processes). Records of ' +
                'examination and tests must be kept for at least 5 years.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'Schedule 4 specifies shorter examination intervals for certain processes ' +
                '(e.g., blasting in chambers: 1 month; jute cloth manufacture: 1 month; ' +
                'electrolytic processes: 14 months). Records must be kept for 5 years.',
            acopReference: 'L5 paragraphs 172–200',
        },
        {
            regulation: 'Reg 10',
            title: 'Monitoring Exposure at the Workplace',
            summary: 'Employers must ensure that the exposure of employees to substances hazardous ' +
                'to health is monitored in accordance with a suitable procedure where: (a) it ' +
                'is requisite for ensuring maintenance of adequate control, or (b) it is ' +
                'otherwise requisite for protecting the health of employees. Results of ' +
                'monitoring must be kept for at least 5 years, or 40 years where the record ' +
                'relates to identifiable employees exposed to a substance linked to disease ' +
                'with long latency.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Monitoring is required where the risk assessment indicates it is necessary ' +
                'to confirm adequate control or to protect health. Mandatory for certain ' +
                'substances listed in Schedule 5 (e.g., vinyl chloride monomer, nitro/amino ' +
                'compounds of benzene).',
            acopReference: 'L5 paragraphs 201–221',
        },
        {
            regulation: 'Reg 11',
            title: 'Health Surveillance',
            summary: 'Employers must ensure that employees are under suitable health surveillance ' +
                'where: (a) there is a valid technique to detect the disease or adverse health ' +
                'effect, (b) it is reasonably likely that the disease or effect may occur given ' +
                'the exposure, and (c) surveillance is likely to further protect employee health. ' +
                'Health records must be kept for at least 40 years.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Health surveillance is mandatory for employees exposed to substances listed ' +
                'in Schedule 6 (including certain isocyanates, hardwood dust, and vinyl ' +
                'chloride monomer). For other substances, the decision is risk-assessment-based.',
            acopReference: 'L5 paragraphs 222–265',
        },
        {
            regulation: 'Reg 12',
            title: 'Information, Instruction and Training',
            summary: 'Every employer must provide employees who are or who may be exposed to ' +
                'substances hazardous to health with suitable and sufficient information, ' +
                'instruction and training. This includes the nature of substances, risks to ' +
                'health, precautions to take, results of monitoring (in anonymised form), ' +
                'and health surveillance results.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L5 paragraphs 266–283',
        },
        {
            regulation: 'Reg 13',
            title: 'Arrangements to Deal with Accidents, Incidents and Emergencies',
            summary: 'Where it is necessary to protect health following an accident, incident, ' +
                'or emergency involving a substance hazardous to health, the employer must ' +
                'put in place procedures and provide first aid facilities, warning systems, ' +
                'and arrangements for clean-up. Employees and emergency services must be ' +
                'provided with information about emergency arrangements and the substances ' +
                'involved.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Emergency arrangements are required where the risk assessment identifies ' +
                'a credible emergency scenario — e.g., chemical spill, uncontrolled release ' +
                'of biological agent.',
            acopReference: 'L5 paragraphs 284–300',
        },
    ],
    assessmentMethodology: 'COSHH assessments must be substance-specific and task-specific — a generic ' +
        'COSHH assessment is not suitable and sufficient. HSE recommends using ' +
        'COSHH Essentials (an online tool) for lower-risk substances and tasks, ' +
        'and formal quantitative exposure assessment (air monitoring) where exposures ' +
        'may approach or exceed a Workplace Exposure Limit (WEL). The assessment must ' +
        'consider route of entry (inhalation, skin absorption, ingestion), likelihood ' +
        'of occurrence, frequency and duration of exposure, and effectiveness of ' +
        'existing controls.',
    complianceCriteria: [
        'A substance-specific and task-specific COSHH assessment has been carried out before work begins',
        'Control measures follow the hierarchy: elimination → substitution → enclosure → LEV → systems of work → PPE',
        'PPE is used only where engineering controls cannot achieve adequate control',
        'For carcinogens and mutagens, exposure is reduced to ALARP, not merely "adequate"',
        'LEV systems are examined and tested at least every 14 months (or per Schedule 4 interval)',
        'Records of LEV examination and tests are retained for at least 5 years',
        'Health surveillance is in place where Schedule 6 substances are present or risk assessment requires it',
        'Health surveillance records are retained for at least 40 years',
        'Employees have received specific COSHH information, instruction, and training for the substances they encounter',
        'WELs from EH40 are treated as ceiling limits for carcinogens and as benchmark standards for other substances',
    ],
    controlHierarchy: [
        'Elimination — remove the substance from the process entirely',
        'Substitution — replace with a less hazardous substance or form',
        'Total enclosure of the process or system',
        'Engineering controls — local exhaust ventilation (LEV), partial enclosure',
        'Systems of work and supervision',
        'Appropriate personal protective equipment (PPE) as a last resort',
    ],
    sourceDocuments: [
        {
            id: 'coshh-si',
            docType: 'primary-legislation',
            title: 'Control of Substances Hazardous to Health Regulations 2002',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/2002/2677/contents/made',
            year: 2002,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '2002-11-21',
        },
        {
            id: 'l5',
            docType: 'acop',
            title: 'Control of substances hazardous to health: Approved Code of Practice and guidance (L5)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l5.pdf',
            version: '6th edition',
            year: 2013,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2013-01-01',
        },
        {
            id: 'eh40',
            docType: 'hse-guidance',
            title: 'EH40/2005 Workplace Exposure Limits',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/eh40.pdf',
            version: '4th edition',
            year: 2020,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2020-01-01',
        },
        {
            id: 'coshh-amend-2004',
            docType: 'primary-legislation',
            title: 'Control of Substances Hazardous to Health (Amendment) Regulations 2004',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/2004/3386/contents/made',
            year: 2004,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '2004-01-28',
        },
    ],
    validationRules: [
        {
            ruleId: 'COSHH-REG-001',
            description: 'Regulation numbers must be cited accurately — no paraphrase of COSHH regulation titles as different numbers',
            severity: 'regulatory',
            check: 'no-invented-regulation',
            failureMessage: 'Generated content contains a COSHH regulation reference that does not match SI 2002/2677. Invented or misattributed regulation numbers are a regulatory-severity finding.',
            reviewerGuidance: 'Cross-check the specific regulation cited against COSHH 2002 at legislation.gov.uk/uksi/2002/2677. Do not accept without verification.',
        },
        {
            ruleId: 'COSHH-REG-002',
            description: 'Workplace Exposure Limits (WELs) must be sourced from EH40 and not stated as absolute legal maximums for non-carcinogenic substances',
            severity: 'regulatory',
            check: 'correct-legal-standard',
            failureMessage: 'A WEL value has been stated without referencing EH40, or a WEL has been incorrectly characterised as an absolute maximum for a non-carcinogenic substance. WELs are benchmark standards; for carcinogens, ALARP below the WEL applies.',
            reviewerGuidance: 'Verify all WEL values against the current edition of EH40. For carcinogens, the standard is ALARP, not "stay below the WEL". Ensure TWA (time-weighted average) and STEL (short-term exposure limit) are distinguished.',
        },
        {
            ruleId: 'COSHH-REG-003',
            description: 'PPE must be positioned as a last resort in the control hierarchy — not presented as the primary control measure',
            severity: 'high',
            check: 'control-hierarchy-correct',
            failureMessage: 'Content presents PPE as a primary COSHH control measure. Under Reg 7, PPE is at the bottom of the hierarchy — it may only be used where adequate control cannot be achieved by other means.',
            reviewerGuidance: 'If the content presents PPE as the first or primary control for a COSHH substance, this is a regulatory inaccuracy. The Reg 7 hierarchy must be followed — engineering controls and substitution take precedence over PPE.',
        },
        {
            ruleId: 'COSHH-REG-004',
            description: 'LEV examination intervals must be correctly stated — 14 months as the standard maximum with Schedule 4 specifying shorter intervals',
            severity: 'regulatory',
            check: 'no-invented-threshold',
            failureMessage: 'Content states an incorrect LEV examination interval. The standard maximum is 14 months under Reg 9. Schedule 4 of COSHH specifies shorter intervals for specific processes.',
            reviewerGuidance: 'Verify the 14-month interval against Reg 9(2) and Schedule 4. If a process-specific shorter interval applies (e.g., 1 month for blasting in chambers), that must be used instead.',
        },
        {
            ruleId: 'COSHH-REG-005',
            description: 'Health surveillance record retention period is 40 years for COSHH, not the MHSWR standard periods',
            severity: 'high',
            check: 'correct-legal-standard',
            failureMessage: 'Content states an incorrect record retention period for COSHH health surveillance. Under Reg 11(3), health records must be kept for at least 40 years where the record relates to an identifiable person exposed to a substance associated with long-latency disease.',
            reviewerGuidance: 'Health surveillance records: 40 years (Reg 11(3)). Exposure monitoring records for identifiable employees: 40 years (Reg 10(5)). LEV examination records: 5 years (Reg 9(4)). These are distinct from each other.',
        },
        {
            ruleId: 'COSHH-REG-006',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'COSHH 2002 (SI 2002/2677) applies to Great Britain only. Northern Ireland has equivalent but separate legislation.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
        {
            ruleId: 'COSHH-REG-007',
            description: 'No invented WEL values or substance hazard classifications',
            severity: 'regulatory',
            check: 'no-numeric-fabrication',
            failureMessage: 'Content states a Workplace Exposure Limit or hazard classification that cannot be verified against EH40 or the current SDS for that substance. All WEL values must trace to EH40.',
            reviewerGuidance: 'Remove any WEL values not directly traceable to the current EH40. Do not accept numeric thresholds without a cited source.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'coshh assessment',
            'workplace exposure limit',
            'wel ',
            'reg 6.*coshh',
            'reg 7.*coshh',
            'reg 8.*coshh',
            'carcinogen',
            'mutagen',
            'biological agent',
            'si 2002/2677',
            'control of substances',
        ],
        highPatterns: [
            'health surveillance',
            'local exhaust ventilation',
            'lev',
            'ppe.*coshh',
            'oel',
            'stel',
            'twa ',
            'in-use test',
            'thorough examination.*lev',
            'eh40',
            'schedule 4.*coshh',
            'schedule 5.*coshh',
            'schedule 6.*coshh',
            'welding fume',
            'isocyanate',
            'hardwood dust',
            'silica dust',
        ],
        mediumPatterns: [
            'control measure',
            'substance substitut',
            'biological monitoring',
            'coshh suitable and sufficient',
            'coshh essentials',
            'l5.*coshh',
            'exposure monitoring',
            'respiratory protective equipment',
        ],
    },
    learningArcStages: [
        'What is COSHH — scope, substances covered, and why it exists',
        'Duty holders and when COSHH applies — employer obligations and employee duties',
        'COSHH assessment — how to carry out a suitable and sufficient assessment',
        'Prevention and control hierarchy — from elimination to PPE as a last resort',
        'LEV systems — selection, use, maintenance, and the 14-month examination requirement',
        'Workplace exposure limits — WELs, EH40, TWA, STEL, and carcinogen ALARP standard',
        'Health surveillance and monitoring — when required and record-keeping obligations',
        'Emergency arrangements, information, and training requirements',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'dsear-2002',
        'puwer-1998',
    ],
};
