// ─── Work at Height Regulations 2005 — Regulatory Schema ──────────────────────
// Work at Height Regulations 2005 (as amended)
// SI 2005/735

// IMPORTANT: "Work at height" includes ANY place where a person could fall and
// be injured — including ground level where there is a hole or opening. There is
// NO minimum height threshold in these Regulations.

import type { RegulatorySchema } from '../types.js';

export const WORK_AT_HEIGHT_2005: RegulatorySchema = {
    id: 'work-at-height-2005',
    shortTitle: 'Work at Height 2005',
    fullTitle: 'Work at Height Regulations 2005',
    siNumber: 'SI 2005/735',
    year: 2005,
    lastAmended: '2007-04-06', // SI 2007/114 — amendment relating to inspections
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all work carried out at height — defined as any place, including a ' +
        'place at or below ground level, from which a person could fall a distance liable ' +
        'to cause personal injury. There is no minimum height threshold. The Regulations ' +
        'apply to employers and self-employed persons in all industries where work at ' +
        'height occurs — construction, maintenance, utilities, oil and gas, manufacturing, ' +
        'warehousing, and others. They do not apply to the provision of instruction or ' +
        'leadership in caving or climbing activities.',
    dutyHolders: [
        'Employer',
        'Self-employed person',
        'Any person who controls how work at height is done (Reg 3(3))',
    ],
    keyDuties: [
        {
            regulation: 'Reg 4',
            title: 'Organisation and Planning — the Hierarchy of Measures',
            summary: 'Every employer must ensure that work at height is: (a) properly planned, ' +
                '(b) appropriately supervised, and (c) carried out in a manner which is, so ' +
                'far as is reasonably practicable, safe. Planning must include planning for ' +
                'emergencies and rescue. The employer must apply the hierarchy: first, avoid ' +
                'work at height where reasonably practicable; second, where work at height ' +
                'cannot be avoided, use work equipment or other measures to prevent falls; ' +
                'third, where risk of a fall cannot be eliminated, use work equipment or ' +
                'other measures to minimise the distance and consequences of a fall.',
            dutyHolders: ['Employer', 'Self-employed person'],
            mandatory: true,
            acopReference: 'Reg 4 and Schedule 1',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 5',
            title: 'Competence',
            summary: 'Every employer must ensure that no person engages in any activity, including ' +
                'organising or supervising, in relation to work at height unless they are ' +
                'competent to do so, or, if being trained, is being supervised by a competent ' +
                'person. Competence must be commensurate with the nature of the work and the ' +
                'equipment to be used.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'Reg 5',
        },
        {
            regulation: 'Reg 6',
            title: 'Avoidance of Risks from Work at Height',
            summary: 'Every employer must ensure that work is not carried out at height where it ' +
                'is reasonably practicable to carry out the work safely other than at height. ' +
                'This is the primary obligation — consideration must be given to whether the ' +
                'task can be carried out from ground level, using extended-reach tools, or by ' +
                'reorganising the sequence of work.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'Reg 6',
        },
        {
            regulation: 'Reg 7',
            title: 'Selection of Work Equipment for Work at Height',
            summary: 'Every employer must ensure that the most suitable work equipment is selected ' +
                'for the work at height, taking into account the working conditions and the ' +
                'risk of falling. Work equipment selection must follow the Schedule 1 hierarchy ' +
                '(set out below in controlHierarchy). Ladders may only be used where the risk ' +
                'assessment demonstrates that the use of other, safer work equipment is not ' +
                'justified because of the low risk and short duration of use.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'Ladders are the equipment of last resort — they may only be used where it ' +
                'is not reasonably practicable to use safer equipment AND where the work is ' +
                'of short duration and low risk. The use of ladders for "quick jobs" does not ' +
                'automatically justify their use under the Regulations.',
            acopReference: 'Reg 7 and Schedule 1',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 8',
            title: 'Requirements for Particular Work Equipment',
            summary: 'Schedules 2 to 6 set out specific requirements for: working platforms ' +
                '(Schedule 2), collective fall prevention measures (guard rails etc., ' +
                'Schedule 2), fall arrest equipment (Schedule 5), working positions, ' +
                'leading edges, and fragile surfaces. All equipment must comply with the ' +
                'relevant Schedule requirements.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'Reg 8 and Schedules 2–6',
        },
        {
            regulation: 'Reg 9',
            title: 'Fragile Surfaces',
            summary: 'Every employer must ensure that no person passes across or near, or works ' +
                'on, from, or near, a fragile surface where it is reasonably practicable to ' +
                'carry out the work without doing so. Where this cannot be avoided, suitable ' +
                'platforms, coverings, guard rails, or other similar means of support or ' +
                'protection must be provided.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Applies wherever fragile surfaces exist — includes roofing materials, ' +
                'skylights, corrugated asbestos cement roofing, and any surface that would ' +
                'not safely support a person. Warning notices alone are not sufficient control.',
            acopReference: 'Reg 9',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 10',
            title: 'Falling Objects',
            summary: 'Every employer must ensure that suitable and sufficient steps are taken to ' +
                'prevent any person being struck by a falling object. Where objects cannot be ' +
                'prevented from falling, the exclusion zone below the work must be clearly ' +
                'marked and, where necessary, covered. Objects must not be thrown down from ' +
                'height.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'Reg 10',
        },
        {
            regulation: 'Reg 12',
            title: 'Inspection of Places of Work at Height and Work Equipment',
            summary: 'Work equipment for work at height must be inspected: (a) after assembly or ' +
                'installation in any position at which it is to be used, (b) at suitable ' +
                'intervals, and (c) after any event liable to have affected its stability or ' +
                'structural integrity. A working platform from which a person could fall 2 ' +
                'metres or more must not be used unless it has been inspected in the preceding ' +
                '7 days. Records of inspection must be kept until the next inspection.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'The 7-day pre-use inspection requirement applies to working platforms ' +
                '(including scaffolding) from which a fall of 2 metres or more is possible. ' +
                'Inspections must be carried out by a competent person. Records must be kept.',
            acopReference: 'Reg 12 and Schedule 7',
        },
    ],
    assessmentMethodology: 'Work at height risk assessments must address the task, the height involved, ' +
        'the duration and frequency of work, the physical capabilities of the persons ' +
        'involved, the environmental conditions (weather, lighting, surface conditions), ' +
        'and the emergency/rescue arrangements. The assessment drives equipment selection ' +
        'through the Schedule 1 hierarchy. HSE INDG401 provides a brief practical guide; ' +
        'HSG33 provides detailed guidance for roof work specifically.',
    complianceCriteria: [
        'Work at height is avoided where reasonably practicable — ground-level alternatives have been considered',
        'The Schedule 1 equipment hierarchy is followed — ladders are a last resort, not a default',
        'For working platforms from which a fall of 2m+ is possible: a 7-day pre-use inspection record exists',
        'Fragile surfaces are identified, marked, and covered/boarded where any person could cross them',
        'Exclusion zones are marked below work at height to protect against falling objects',
        'All persons working at height (and supervisors) are competent for the specific task and equipment',
        'Emergency and rescue arrangements are in place before work at height begins',
        'Weather conditions that could make the work unsafe are monitored and work suspended accordingly',
        '"Work at height" is correctly understood to include any height where injury could result from a fall',
    ],
    controlHierarchy: [
        'Avoid work at height where reasonably practicable',
        'Prevent falls — use collective measures (guard rails, barriers, working platforms)',
        'Mitigate falls — use fall arrest/restraint systems, safety nets, soft landing systems',
        '(Ladder use only where safer equipment is not justified — short duration, low risk)',
    ],
    sourceDocuments: [
        {
            id: 'wah-si',
            docType: 'primary-legislation',
            title: 'Work at Height Regulations 2005',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/2005/735/contents/made',
            year: 2005,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '2005-04-06',
        },
        {
            id: 'indg401',
            docType: 'hse-guidance',
            title: 'Working at height: A brief guide (INDG401)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/indg401.pdf',
            year: 2014,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2014-01-01',
        },
        {
            id: 'hsg33',
            docType: 'hse-guidance',
            title: 'Health and Safety in Roof Work (HSG33)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/hsg33.pdf',
            version: '4th edition',
            year: 2012,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2012-01-01',
        },
    ],
    validationRules: [
        {
            ruleId: 'WAH-REG-001',
            description: 'No minimum height threshold exists — "work at height" includes any height where a fall could cause injury',
            severity: 'regulatory',
            check: 'correct-legal-standard',
            failureMessage: 'Content implies a minimum height (e.g., "above 2 metres") below which the Work at Height Regulations do not apply. There is no minimum height threshold. The Regulations apply to any place from which a person could fall and be injured.',
            reviewerGuidance: 'The 2-metre threshold in the Regulations is only a trigger for the 7-day pre-use inspection of working platforms (Reg 12(7)) — it does not determine whether the Regulations apply. Content that states or implies the Regulations only apply above a certain height is factually incorrect.',
        },
        {
            ruleId: 'WAH-REG-002',
            description: 'Ladders must be presented as a last resort — not as a default access method',
            severity: 'high',
            check: 'control-hierarchy-correct',
            failureMessage: 'Content presents ladders as a standard or acceptable work at height method without demonstrating that safer alternatives were considered and rejected. Under Reg 7, ladders may only be used where the use of other equipment is not justified by the low risk and short duration of the work.',
            reviewerGuidance: 'The Schedule 1 hierarchy places ladders at the bottom — they are the last resort, not the first choice. Content recommending ladders for work must first establish that collective protection (platforms, guard rails) and then fall arrest have been considered and are not practicable.',
        },
        {
            ruleId: 'WAH-REG-003',
            description: 'Fragile surfaces — warning notices alone are not adequate control',
            severity: 'high',
            check: 'control-hierarchy-correct',
            failureMessage: 'Content suggests that warning notices on fragile surfaces constitute adequate control. Under Reg 9, where work near or across fragile surfaces cannot be avoided, suitable platforms, coverings, or guard rails must be provided. Notices are not a substitute for physical protection.',
            reviewerGuidance: 'Reg 9 requires physical protective measures (boarding, netting, platforms) in addition to, not instead of, warning notices where persons must cross or work near fragile surfaces.',
        },
        {
            ruleId: 'WAH-REG-004',
            description: 'The 7-day inspection requirement applies to working platforms with a 2m+ fall risk — not to all work at height equipment',
            severity: 'medium',
            check: 'no-invented-threshold',
            failureMessage: 'Content mis-states the scope of the 7-day inspection requirement. Under Reg 12(7), the 7-day pre-use inspection applies to working platforms (e.g., scaffold, MEWPs used as platforms) from which a fall of 2 metres or more could occur. It does not apply universally to all work at height equipment.',
            reviewerGuidance: 'Verify the 7-day inspection requirement against Reg 12(7). Ladders, rope access systems, and fall arrest equipment have different inspection requirements. The 7-day rule is specifically for working platforms with a 2m+ fall potential.',
        },
        {
            ruleId: 'WAH-REG-005',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'Work at Height Regulations 2005 (SI 2005/735) apply to Great Britain only. Northern Ireland has equivalent but separate legislation.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'work at height.*regulation',
            'wahr',
            'si 2005/735',
            'reg 4.*height',
            'reg 7.*height',
            'reg 9.*fragile',
            'work at height.*hierarchy',
        ],
        highPatterns: [
            'ladder.*last resort',
            'fragile.*surface',
            'fall arrest',
            'collective protection.*height',
            'guard rail.*height',
            '7.day.*inspect',
            'scaffold.*inspect',
            'competent.*height',
            'no minimum height',
            'mewp.*height',
        ],
        mediumPatterns: [
            'scaffold',
            'ladder.*use',
            'harness.*height',
            'safety net',
            'indg401',
            'hsg33',
            'roof.*work',
            'fall.*distance',
        ],
    },
    learningArcStages: [
        'What is "work at height" — the no-minimum-height definition and common misconceptions',
        'The Reg 4 hierarchy — avoid, prevent falls, minimise fall consequences',
        'Equipment selection — the Schedule 1 hierarchy and why ladders are a last resort',
        'Working platforms — scaffold, MEWPs, and the 7-day inspection requirement',
        'Fragile surfaces — identifying, marking, and providing physical protection',
        'Fall arrest and restraint systems — harnesses, lanyards, anchor points, and rescue',
        'Competence requirements — who can supervise, plan, and carry out work at height',
        'Falling objects — exclusion zones, toe boards, and debris netting',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'puwer-1998',
        'loler-1998',
        'cdm-2015',
        'ppe-1992',
    ],
};
