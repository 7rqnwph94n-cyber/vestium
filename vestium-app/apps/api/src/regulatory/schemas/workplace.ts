// ─── Workplace (H,S&W) Regulations 1992 — Regulatory Schema ───────────────────
// Workplace (Health, Safety and Welfare) Regulations 1992
// SI 1992/3004
//
// Source authorities:
//   legislation.gov.uk/uksi/1992/3004 (Open Government Licence v3.0)
//   HSE L24 — Workplace health, safety and welfare ACOP (2nd edition, 2013)
//
// Note: These Regulations do NOT apply to construction sites (CDM applies),
// to means of transport outside the workplace, or to ships.

import type { RegulatorySchema } from '../types.js';

export const WORKPLACE_1992: RegulatorySchema = {
    id: 'workplace-1992',
    shortTitle: 'Workplace Regs 1992',
    fullTitle: 'Workplace (Health, Safety and Welfare) Regulations 1992',
    siNumber: 'SI 1992/3004',
    year: 1992,
    lastAmended: '2002-09-03',
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all workplaces — including factories, offices, shops, schools, ' +
        'hospitals, hotels, and places of entertainment. "Workplace" means any premises ' +
        'or part of premises which are not domestic premises and where any person works. ' +
        'The Regulations set minimum standards for the physical working environment. ' +
        'They do NOT apply to construction sites (CDM 2015 applies to those), means of ' +
        'transport, or to those working in or on a vessel. They implement the EC Workplace ' +
        'Directive (89/654/EEC).',
    dutyHolders: [
        'Employer',
        'Person who has control of a workplace (or any part of it)',
        'Self-employed person',
    ],
    keyDuties: [
        {
            regulation: 'Reg 5',
            title: 'Maintenance of Workplace, Equipment, Devices and Systems',
            summary: 'The workplace and equipment, devices, and systems used in connection with ' +
                'the workplace must be maintained in efficient working order and in good repair. ' +
                'Where a potentially dangerous defect could cause risk — such as in ventilation, ' +
                'lighting, or traffic routes — the maintenance obligation is absolute. A ' +
                'maintenance system, including regular inspection, must be in place.',
            dutyHolders: ['Employer', 'Person in control of premises'],
            mandatory: true,
            acopReference: 'L24 paragraphs 20–34',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 6',
            title: 'Ventilation',
            summary: 'Every enclosed workplace must be ventilated by a sufficient quantity of ' +
                'fresh or purified air. Any mechanical ventilation system must include an ' +
                'effective device to give a visible or audible warning of any failure of the ' +
                'system. The air in the workplace must not contain levels of impurity that ' +
                'could endanger health.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L24 paragraphs 35–46',
        },
        {
            regulation: 'Reg 7',
            title: 'Temperature in Indoor Workplaces',
            summary: 'During working hours, the temperature in all workplaces inside buildings ' +
                'must be reasonable. The minimum temperature during working hours must be ' +
                'at least 16°C where the work is mainly sedentary, or at least 13°C where ' +
                'the work involves severe physical effort. No upper limit is set in the ' +
                'Regulations, but employers have a duty under MHSWR to assess risk from ' +
                'thermal discomfort. A sufficient number of thermometers must be provided.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'The 16°C and 13°C figures are minimum requirements. There is no statutory ' +
                'maximum temperature, but employers must address thermal discomfort risks ' +
                'under their MHSWR risk assessment where temperatures are excessive.',
            acopReference: 'L24 paragraphs 47–62',
        },
        {
            regulation: 'Reg 8',
            title: 'Lighting',
            summary: 'Every workplace must have suitable and sufficient lighting. Where possible, ' +
                'this should be by natural light. Adequate emergency lighting must be ' +
                'provided in any room in circumstances where persons are exposed to danger ' +
                'in the event of failure of artificial lighting.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L24 paragraphs 63–75',
        },
        {
            regulation: 'Reg 9',
            title: 'Cleanliness and Waste Materials',
            summary: 'Every workplace and the furniture, furnishings, and fittings in it must be ' +
                'kept sufficiently clean. Surfaces of floors, walls, and ceilings must be ' +
                'capable of being kept clean. Waste materials must not accumulate in a ' +
                'workplace except in suitable receptacles.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L24 paragraphs 76–82',
        },
        {
            regulation: 'Reg 12',
            title: 'Condition of Floors and Traffic Routes',
            summary: 'Every floor and traffic route in a workplace must be of a construction ' +
                'suitable for the purpose, and without holes, slopes, uneven or slippery ' +
                'surfaces. Floors must be kept free of obstructions, articles, or substances ' +
                'which may cause persons to slip, trip, or fall. Handrails must be provided ' +
                'for staircases except where they would obstruct the traffic route.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L24 paragraphs 83–100',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 20',
            title: 'Sanitary Conveniences',
            summary: 'Suitable and sufficient sanitary conveniences must be provided at readily ' +
                'accessible places. They must be in sufficient numbers, kept clean and in ' +
                'order, adequately lit and ventilated, and — where reasonably practicable — ' +
                'separate facilities for men and women must be provided. Schedule 1 sets ' +
                'out the minimum numbers of sanitary conveniences required.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L24 paragraphs 134–154',
        },
        {
            regulation: 'Reg 21',
            title: 'Washing Facilities',
            summary: 'Suitable and sufficient washing facilities, including showers where required ' +
                'by the nature of the work or for health reasons, must be provided at readily ' +
                'accessible places. Facilities must include hot and cold (or warm) running ' +
                'water, soap or other means of cleaning, and towels or other means of drying.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L24 paragraphs 155–175',
        },
        {
            regulation: 'Reg 25',
            title: 'Facilities for Rest and Eating Meals',
            summary: 'Suitable and sufficient rest facilities must be provided at readily accessible ' +
                'places. Where employees eat meals at work, suitable and sufficient facilities ' +
                'must be provided for this purpose. Rest facilities must include suitable ' +
                'facilities to eat meals. Seating must be provided for pregnant women and ' +
                'nursing mothers. Facilities must be arranged to protect non-smokers.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L24 paragraphs 220–240',
        },
    ],
    assessmentMethodology: 'Workplace Regulations compliance is assessed by physical inspection against the ' +
        'Schedule requirements and Regulation standards. Key checks: temperature monitoring ' +
        '(thermometers available, minimum temperatures observed), lighting levels adequate ' +
        'for the tasks performed, floors and traffic routes free of slip and trip hazards, ' +
        'welfare facilities (toilets, washing, rest) in the numbers required by Schedule 1, ' +
        'and ventilation systems with functional fault-warning devices.',
    complianceCriteria: [
        'Temperature in indoor workplaces: minimum 16°C sedentary, 13°C physical work',
        'Thermometers available so workers can check workplace temperature',
        'Floors and traffic routes free of slip, trip, and fall hazards',
        'Welfare facilities provided in numbers meeting Schedule 1 requirements',
        'Ventilation mechanical systems have a visible or audible failure warning device',
        'Emergency lighting provided where artificial lighting failure would create danger',
        'Sanitary facilities: separate provision for men and women where reasonably practicable',
        'Rest facilities include facilities for eating meals and seating for pregnant workers',
        'Workplace is kept clean and waste does not accumulate except in suitable receptacles',
        'Content does not state a maximum temperature limit — no statutory maximum exists in these Regulations',
    ],
    sourceDocuments: [
        {
            id: 'workplace-si',
            docType: 'primary-legislation',
            title: 'Workplace (Health, Safety and Welfare) Regulations 1992',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/1992/3004/contents/made',
            year: 1992,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '1992-12-01',
        },
        {
            id: 'l24',
            docType: 'acop',
            title: 'Workplace health, safety and welfare: Approved Code of Practice and guidance (L24)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l24.pdf',
            version: '2nd edition',
            year: 2013,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2013-01-01',
        },
    ],
    validationRules: [
        {
            ruleId: 'WPR-REG-001',
            description: 'Temperature minimums are 16°C (sedentary) and 13°C (physical) — not a higher or different figure',
            severity: 'regulatory',
            check: 'no-invented-threshold',
            failureMessage: 'Content states a minimum workplace temperature that differs from the statutory minimums in Reg 7. The minimum is 16°C for mainly sedentary work and 13°C for work involving severe physical effort. Any other figure is incorrect.',
            reviewerGuidance: 'Verify minimum temperatures against Reg 7(3) and L24 paragraph 47. Some sources cite the "recommended" 18°C from guidance — this is not a statutory minimum. Only the 16°C/13°C figures are legally required.',
        },
        {
            ruleId: 'WPR-REG-002',
            description: 'No maximum temperature exists in these Regulations — thermal discomfort risk is assessed under MHSWR',
            severity: 'medium',
            check: 'correct-legal-standard',
            failureMessage: 'Content states a maximum workplace temperature as if it is a legal limit in the Workplace Regulations. No statutory maximum exists. Employers\' obligations regarding high temperatures derive from the MHSWR risk assessment duty.',
            reviewerGuidance: 'There is no maximum temperature in SI 1992/3004. The HSE position is that temperatures above 24°C may trigger a risk assessment requirement under MHSWR, but this is not a statutory maximum.',
        },
        {
            ruleId: 'WPR-REG-003',
            description: 'The Workplace Regulations do not apply to construction sites — CDM 2015 applies to those',
            severity: 'regulatory',
            check: 'duty-holder-accuracy',
            failureMessage: 'Content applies the Workplace (Health, Safety and Welfare) Regulations to construction sites. Reg 3 of the Workplace Regulations explicitly excludes construction sites — CDM 2015 provides the welfare and site standards for construction.',
            reviewerGuidance: 'The Workplace Regulations apply to permanent workplaces. Construction sites are governed by CDM 2015 Schedule 2 for welfare. Do not conflate the two.',
        },
        {
            ruleId: 'WPR-REG-004',
            description: 'Regulation numbers must be cited accurately against SI 1992/3004',
            severity: 'regulatory',
            check: 'no-invented-regulation',
            failureMessage: 'Generated content contains a Workplace Regulations citation that does not match SI 1992/3004.',
            reviewerGuidance: 'Cross-check the specific regulation cited against the Workplace Regulations at legislation.gov.uk/uksi/1992/3004.',
        },
        {
            ruleId: 'WPR-REG-005',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'Workplace (Health, Safety and Welfare) Regulations 1992 (SI 1992/3004) apply to Great Britain only.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'workplace.*regulation',
            'si 1992/3004',
            'reg 7.*temperature',
            'reg 12.*floor',
            'reg 20.*sanitary',
            'welfare.*regulation',
        ],
        highPatterns: [
            '16.c.*temperature',
            '13.c.*temperature',
            'minimum.*temperature',
            'maximum.*temperature',
            'emergency lighting',
            'slip.*trip.*floor',
            'traffic route',
            'schedule 1.*toilet',
        ],
        mediumPatterns: [
            'welfare facility',
            'rest room',
            'drinking water',
            'washing facility',
            'l24',
            'ventilation.*workplace',
            'thermal comfort',
        ],
    },
    learningArcStages: [
        'What the Workplace Regulations cover — scope, duty holders, and what they do not cover',
        'Maintenance obligations — keeping the workplace and its systems in efficient order',
        'Temperature and ventilation — legal minimums, thermal comfort, and ventilation duties',
        'Lighting — natural light, emergency lighting, and suitability for the task',
        'Floors and traffic routes — the slip, trip, and fall hazard management requirements',
        'Welfare facilities — toilets, washing, drinking water, rest, and eating',
        'Interaction with CDM 2015 — why construction sites are governed differently',
        'ACOP L24 — status, key provisions, and how it supports enforcement',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'dse-1992',
        'cdm-2015',
    ],
};
