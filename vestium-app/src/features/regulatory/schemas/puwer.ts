// ─── PUWER 1998 — Regulatory Schema ───────────────────────────────────────────
// Provision and Use of Work Equipment Regulations 1998
// SI 1998/2306

import type { RegulatorySchema } from '../types';

export const PUWER_1998: RegulatorySchema = {
    id: 'puwer-1998',
    shortTitle: 'PUWER 1998',
    fullTitle: 'Provision and Use of Work Equipment Regulations 1998',
    siNumber: 'SI 1998/2306',
    year: 1998,
    lastAmended: '2002-01-01',
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all employers and self-employed persons who provide or control work ' +
        'equipment used by workers at work. "Work equipment" is defined broadly — it ' +
        'includes any machinery, appliance, apparatus, tool, or installation used at work. ' +
        'PUWER applies to virtually all workplaces. Where equipment is also lifting ' +
        'equipment, LOLER 1998 applies in addition to PUWER. PUWER does not apply to ' +
        'equipment on ships, to aircraft, or to equipment covered by more specific ' +
        'legislation where an equivalent level of protection is provided.',
    dutyHolders: [
        'Employer',
        'Self-employed person',
        'Person who has control of work equipment',
    ],
    keyDuties: [
        {
            regulation: 'Reg 4',
            title: 'Suitability of Work Equipment',
            summary: 'Every employer must ensure that work equipment is so constructed or adapted ' +
                'as to be suitable for the purpose for which it is used or provided. The ' +
                'equipment must only be used for operations for which, and under conditions ' +
                'for which, it is suitable. "Suitable" means suitable in any respect which ' +
                'it is reasonably foreseeable will affect the health or safety of any person.',
            dutyHolders: ['Employer', 'Self-employed person'],
            mandatory: true,
            acopReference: 'L22 paragraphs 69–104',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 5',
            title: 'Maintenance',
            summary: 'Every employer must ensure that work equipment is maintained in an efficient ' +
                'state, in efficient working order, and in good repair. Where a maintenance ' +
                'log is kept, it must be kept up to date.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L22 paragraphs 105–128',
        },
        {
            regulation: 'Reg 6',
            title: 'Inspection',
            summary: 'Where the safety of work equipment depends on the installation conditions, ' +
                'it must be inspected after installation and before first use, and after ' +
                'assembly at a new site. Work equipment exposed to conditions causing ' +
                'deterioration liable to result in dangerous situations must be inspected ' +
                'at suitable intervals and each time exceptional circumstances occur. ' +
                'Records of inspections must be kept and, where relevant, made available ' +
                'to a labour inspector.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Inspection is required where safety depends on installation conditions, or ' +
                'where deterioration is possible. The frequency of inspection must be ' +
                'determined by risk assessment. Where LOLER applies (lifting equipment), ' +
                'thorough examination under LOLER satisfies the inspection duty under Reg 6.',
            acopReference: 'L22 paragraphs 129–160',
        },
        {
            regulation: 'Reg 7',
            title: 'Specific Risks',
            summary: 'Where work equipment may involve a specific risk to health or safety, ' +
                'the employer must ensure that use of the equipment is restricted to those ' +
                'persons given the task of using it, and that repairs, modifications, ' +
                'maintenance, or servicing are restricted to designated persons.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Applies where the risk assessment identifies that the equipment poses specific ' +
                'risks that require controlled access — e.g., chainsaws, certain woodworking ' +
                'machines, power presses.',
            acopReference: 'L22 paragraphs 161–170',
        },
        {
            regulation: 'Reg 8',
            title: 'Information and Instructions',
            summary: 'Every employer must ensure that persons who use work equipment have available ' +
                'to them adequate health and safety information and, where appropriate, written ' +
                'instructions on the use of the equipment. Information must include conditions ' +
                'in which the equipment may be used, foreseeable abnormal situations, and ' +
                'conclusions from experience in using the equipment.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L22 paragraphs 171–188',
        },
        {
            regulation: 'Reg 9',
            title: 'Training',
            summary: 'Every employer must ensure that all persons who use work equipment have ' +
                'received adequate training for purposes of health and safety, including ' +
                'training in the methods which may be adopted when using the equipment, ' +
                'any risks which such use may entail, and precautions to be taken.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L22 paragraphs 189–200',
        },
        {
            regulation: 'Reg 11',
            title: 'Dangerous Parts of Machinery',
            summary: 'Every employer must ensure that measures are taken to prevent access to ' +
                'dangerous parts of machinery, or to stop the movement of dangerous parts ' +
                'before any part of a person enters a danger zone. Measures must be taken ' +
                'in priority order: (1) fixed enclosing guards, (2) other guards or ' +
                'protection devices, (3) protection appliances (jigs, holders, push sticks), ' +
                '(4) provision of information, instruction, training and supervision. Higher ' +
                'priority measures must be used where practicable before lower ones.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'Applies to all machinery with dangerous parts — rotating parts, cutting tools, ' +
                'in-running nips, ejection risks. The guarding hierarchy in Reg 11(2) mirrors ' +
                'the control hierarchy principle — fixed guards before interlocked guards before ' +
                'other devices.',
            acopReference: 'L22 paragraphs 215–308',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 12',
            title: 'Protection Against Specified Hazards',
            summary: 'Employers must take measures to protect against specified hazards from work ' +
                'equipment — articles or substances falling or being ejected from the equipment, ' +
                'rupture or disintegration of parts, equipment catching fire or overheating, ' +
                'unintended or premature discharge of any article, gas, dust, liquid, vapour, ' +
                'or other substance, and unintended or premature explosion.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L22 paragraphs 309–336',
        },
        {
            regulation: 'Reg 14',
            title: 'Controls for Starting or Making a Change in Operating Conditions',
            summary: 'Every employer must ensure that work equipment is provided with one or more ' +
                'controls for starting the equipment (including restarting after a stoppage ' +
                'for any reason). Where starting or changes in operating conditions may ' +
                'present a hazard, the control must be operated intentionally.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L22 paragraphs 353–376',
        },
        {
            regulation: 'Reg 15',
            title: 'Stop Controls',
            summary: 'Every employer must ensure work equipment is provided with one or more ' +
                'readily accessible controls which will bring it to a safe condition in a ' +
                'safe manner. The stop control, when actuated, must take priority over all ' +
                'controls which start or change the operating conditions.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L22 paragraphs 377–387',
        },
        {
            regulation: 'Reg 16',
            title: 'Emergency Stop Controls',
            summary: 'Where appropriate, work equipment must be provided with one or more readily ' +
                'accessible emergency stop controls unless it is not necessary by reason of ' +
                'the nature of the hazards and the time taken to bring the equipment to a ' +
                'standstill by any stop control provided under Reg 15.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Required where emergency stopping is necessary — i.e., where normal stop controls ' +
                'would not be sufficient to prevent injury in an emergency. The assessment of ' +
                'whether emergency stops are needed must consider stopping time and the nature ' +
                'of the hazard.',
            acopReference: 'L22 paragraphs 388–404',
        },
        {
            regulation: 'Reg 22',
            title: 'Isolation from Sources of Energy',
            summary: 'Every employer must ensure that work equipment is provided with appropriate ' +
                'means to isolate it from all sources of energy. Re-connection of the equipment ' +
                'to any energy source must not expose the operator or any other worker to risk ' +
                'to health or safety.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L22 paragraphs 445–467',
        },
    ],
    assessmentMethodology: 'PUWER compliance is assessed against the suitability, maintenance, guarding, ' +
        'and control requirements of the regulations. HSE inspectors typically assess ' +
        'whether: equipment is suitable for the task and environment, maintenance records ' +
        'are up to date, dangerous parts are guarded to the required standard (Reg 11 ' +
        'hierarchy), operators have been trained and have adequate information, and ' +
        'controls (start, stop, emergency stop) function correctly. PUWER assessment ' +
        'is usually integrated with the general risk assessment under MHSWR Reg 3.',
    complianceCriteria: [
        'Work equipment is suitable for its intended purpose and use conditions',
        'Maintenance records are kept up to date',
        'Dangerous parts of machinery are guarded — fixed guards preferred over interlocked guards',
        'Reg 11 guarding hierarchy applied: fixed guard → interlocked guard → protection appliance → information/training',
        'Emergency stop controls are provided where stopping time and hazard nature require them',
        'Isolation from all energy sources is possible before maintenance begins (lockout/tagout capability)',
        'Operators and maintenance personnel have received task-specific training',
        'Written instructions are available for complex or high-risk equipment',
        'Equipment inspections are carried out at suitable intervals and records kept',
        'Specific risks equipment (Reg 7) is restricted to authorised operators',
    ],
    controlHierarchy: [
        'Fixed enclosing guards',
        'Other guards or protection devices (interlocked guards, adjustable guards)',
        'Protection appliances (jigs, holders, push sticks, hand restraints)',
        'Provision of information, instruction, training and supervision',
    ],
    sourceDocuments: [
        {
            id: 'puwer-si',
            docType: 'primary-legislation',
            title: 'Provision and Use of Work Equipment Regulations 1998',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/1998/2306/contents/made',
            year: 1998,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '1998-12-05',
        },
        {
            id: 'l22',
            docType: 'acop',
            title: 'Safe Use of Work Equipment: Approved Code of Practice and guidance (L22)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l22.pdf',
            version: '3rd edition',
            year: 2014,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2014-01-01',
        },
    ],
    validationRules: [
        {
            ruleId: 'PUWER-REG-001',
            description: 'Regulation numbers must be cited accurately against SI 1998/2306',
            severity: 'regulatory',
            check: 'no-invented-regulation',
            failureMessage: 'Generated content contains a PUWER regulation reference that does not match SI 1998/2306. Invented or misattributed regulation numbers are a regulatory-severity finding.',
            reviewerGuidance: 'Cross-check the specific regulation cited against PUWER 1998 at legislation.gov.uk/uksi/1998/2306.',
        },
        {
            ruleId: 'PUWER-REG-002',
            description: 'Guarding hierarchy (Reg 11) must be presented in correct priority order',
            severity: 'high',
            check: 'control-hierarchy-correct',
            failureMessage: 'Content presents the Reg 11 guarding hierarchy in an incorrect order. Fixed guards have priority over interlocked guards; protection appliances have priority over information and training.',
            reviewerGuidance: 'Verify against Reg 11(2)(a)–(d): (a) fixed enclosing guards, (b) other guards/protection devices, (c) protection appliances, (d) information/instruction/training/supervision. Higher-priority measures must be used where practicable.',
        },
        {
            ruleId: 'PUWER-REG-003',
            description: '"Work equipment" definition must not be artificially narrowed — PUWER applies to virtually all equipment used at work',
            severity: 'high',
            check: 'duty-holder-accuracy',
            failureMessage: 'Content implies PUWER applies only to heavy machinery or industrial equipment. The definition in Reg 2(1) is broad — any machinery, appliance, apparatus, tool, or installation used at work.',
            reviewerGuidance: 'PUWER "work equipment" includes hand tools, power tools, access equipment, vehicles (where used as work equipment), and machinery. The scope is deliberately broad.',
        },
        {
            ruleId: 'PUWER-REG-004',
            description: 'LOLER applies in addition to PUWER for lifting equipment — the two regimes are complementary, not alternatives',
            severity: 'medium',
            check: 'regulatory-interaction',
            failureMessage: 'Content implies that LOLER replaces PUWER for lifting equipment. LOLER Reg 3(2) explicitly states that PUWER continues to apply to lifting equipment in addition to LOLER requirements.',
            reviewerGuidance: 'Lifting equipment is subject to both PUWER and LOLER. LOLER sets additional requirements (thorough examination, marking, planning) on top of the general PUWER framework.',
        },
        {
            ruleId: 'PUWER-REG-005',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'PUWER 1998 (SI 1998/2306) applies to Great Britain only. Northern Ireland has equivalent but separate legislation.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'puwer',
            'reg 4.*equipment',
            'reg 5.*maintenance',
            'reg 11.*dangerous parts',
            'dangerous parts of machinery',
            'si 1998/2306',
            'guarding.*machinery',
            'provision and use of work equipment',
        ],
        highPatterns: [
            'fixed guard',
            'interlocked guard',
            'inspection.*equipment',
            'puwer assessment',
            'emergency stop',
            'isolation.*energy',
            'lockout',
            'safe system of work.*equipment',
            'reg 22.*puwer',
            'in-running nip',
            'danger zone',
        ],
        mediumPatterns: [
            'suitable.*equipment',
            'maintenance record',
            'equipment training',
            'work equipment',
            'l22',
            'guards.*machinery',
            'push stick',
        ],
    },
    learningArcStages: [
        'What is PUWER — scope, the broad definition of "work equipment", and duty holders',
        'Suitability requirements — matching equipment to task, environment, and user',
        'Maintenance and inspection obligations — records, frequency, and competence',
        'Dangerous parts of machinery — the Reg 11 guarding hierarchy in priority order',
        'Controls — start, stop, emergency stop, and energy isolation requirements',
        'Information, instruction, and training obligations for users and supervisors',
        'Interaction with LOLER — how both regimes apply to lifting equipment',
        'PUWER compliance in practice — PUWER assessments and integration with MHSWR',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'loler-1998',
        'coshh-2002',
    ],
};
