// ─── CDM 2015 — Regulatory Schema ─────────────────────────────────────────────
// Construction (Design and Management) Regulations 2015
// SI 2015/51

// Note: CDM applies to ALL construction work without minimum size threshold.
// Notification and PD/PC appointment are only required for notifiable projects.

import type { RegulatorySchema } from '../types.js';

export const CDM_2015: RegulatorySchema = {
    id: 'cdm-2015',
    shortTitle: 'CDM 2015',
    fullTitle: 'Construction (Design and Management) Regulations 2015',
    siNumber: 'SI 2015/51',
    year: 2015,
    lastAmended: '2015-04-06', // came into force 6 April 2015, replacing CDM 2007
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all construction work in Great Britain — there is no minimum project ' +
        'size below which CDM does not apply. "Construction work" is defined broadly to ' +
        'include building, alteration, conversion, fitting-out, commissioning, renovation, ' +
        'repair, upkeep, redecoration, demolition, and dismantling. CDM 2015 replaced ' +
        'CDM 2007 and abolished the separate CDM co-ordinator role, replacing it with ' +
        'the Principal Designer. Notification of the HSE (F10) and appointment of a ' +
        'Principal Designer and Principal Contractor are only required for notifiable ' +
        'projects — but all other CDM duties apply to every construction project.',
    dutyHolders: [
        'Client',
        'Principal Designer (notifiable projects)',
        'Designer',
        'Principal Contractor (notifiable projects)',
        'Contractor',
        'Worker',
    ],
    keyDuties: [
        {
            regulation: 'Reg 4',
            title: 'Client Duties — Suitable Management Arrangements',
            summary: 'A client must make suitable arrangements for managing a project, including ' +
                'the allocation of sufficient time and other resources. For notifiable projects, ' +
                'the client must appoint a Principal Designer and a Principal Contractor in ' +
                'writing before the construction phase begins. Where the client fails to make ' +
                'such appointments, the client is deemed to have taken on those duties themselves.',
            dutyHolders: ['Client'],
            mandatory: true,
            conditionNote: 'The appointment of Principal Designer and Principal Contractor is only required ' +
                'for notifiable projects (Reg 6(2) threshold: >30 working days with >20 ' +
                'simultaneous workers, OR >500 person-days). On all other projects, the client ' +
                'still has duties under Reg 4 and Reg 9 to ensure suitable management arrangements ' +
                'and pre-construction information are in place.',
            acopReference: 'L153 paragraphs 32–78',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 5',
            title: 'Appointments Must Be in Writing Before Construction Phase',
            summary: 'Appointments of the Principal Designer and Principal Contractor must be made ' +
                'in writing. They must be made before the construction phase begins. If a ' +
                'Principal Designer or Principal Contractor is not appointed, the client takes ' +
                'on those duties. Appointments must be reviewed as the project develops.',
            dutyHolders: ['Client'],
            mandatory: false,
            conditionNote: 'Applies only to notifiable projects requiring Principal Designer and Principal Contractor appointments.',
            acopReference: 'L153 paragraphs 79–94',
        },
        {
            regulation: 'Reg 6',
            title: 'Notification (F10) to HSE',
            summary: 'The client must ensure that HSE is notified before the construction phase ' +
                'begins where the project is notifiable. A project is notifiable where the ' +
                'construction phase will: (a) last longer than 30 working days with more than ' +
                '20 workers simultaneously, OR (b) exceed 500 person-days. The F10 notification ' +
                'must be submitted before the construction phase begins and a copy displayed ' +
                'at the site.',
            dutyHolders: ['Client'],
            mandatory: false,
            conditionNote: 'Only required for notifiable projects. Both conditions have alternative triggers — ' +
                '30 working days with 20+ simultaneous workers, OR 500+ person-days total. ' +
                'Person-days = number of workers × number of days worked. The F10 can be ' +
                'submitted electronically via the HSE notification portal.',
            acopReference: 'L153 paragraphs 95–112',
        },
        {
            regulation: 'Reg 9',
            title: 'Client — Organisation and Management',
            summary: 'The client must ensure that, before the construction phase begins, a ' +
                'construction phase plan has been drawn up by the Principal Contractor (or ' +
                'where there is no Principal Contractor, by the contractor). The client must ' +
                'also ensure that the principal designer has prepared a health and safety file ' +
                'for the project, and that throughout the project, welfare facilities are provided.',
            dutyHolders: ['Client'],
            mandatory: true,
            acopReference: 'L153 paragraphs 113–145',
        },
        {
            regulation: 'Reg 10',
            title: 'Client — Pre-Construction Information',
            summary: 'As soon as practicable before the construction phase begins, the client must ' +
                'provide pre-construction information to every designer and contractor. ' +
                'Pre-construction information includes: the project description and programme, ' +
                'known or foreseeable design and construction hazards, information about the ' +
                'existing site (structures, services, ground conditions, asbestos surveys), ' +
                'and the client\'s management structure and resources.',
            dutyHolders: ['Client'],
            mandatory: true,
            acopReference: 'L153 paragraphs 146–178',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 11',
            title: 'Client — Construction Phase Plan and Health and Safety File',
            summary: 'Before the construction phase begins, the client must ensure that a ' +
                'construction phase plan has been prepared. The client must also ensure ' +
                'the health and safety file is updated, reviewed, revised, and, on ' +
                'completion, delivered to the client. The client must keep the health and ' +
                'safety file and make it available to anyone who needs it to comply with ' +
                'their legal duties.',
            dutyHolders: ['Client'],
            mandatory: true,
            acopReference: 'L153 paragraphs 179–215',
        },
        {
            regulation: 'Reg 12',
            title: 'Principal Designer — Plan, Manage, Monitor and Co-ordinate Pre-Construction',
            summary: 'The Principal Designer must plan, manage, monitor, and co-ordinate the ' +
                'pre-construction phase of a project. This includes: identifying, eliminating, ' +
                'or controlling foreseeable risks in the design, ensuring designers comply ' +
                'with their duties, liaising with the Principal Contractor to share information ' +
                'affecting planning, management, monitoring, or co-ordination of the ' +
                'construction phase, and preparing and updating the health and safety file.',
            dutyHolders: ['Principal Designer (notifiable projects)'],
            mandatory: false,
            conditionNote: 'The Principal Designer role only exists on notifiable projects. On non-notifiable projects, designers have direct duties under Reg 9 MHSWR and Reg 15 CDM without the co-ordination layer.',
            acopReference: 'L153 paragraphs 216–285',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 13',
            title: 'Principal Contractor — Plan, Manage, Monitor and Co-ordinate Construction Phase',
            summary: 'The Principal Contractor must plan, manage, monitor, and co-ordinate the ' +
                'construction phase of a project. This includes: organising co-operation ' +
                'between contractors, enabling workers to raise health and safety concerns, ' +
                'establishing and operating site rules, ensuring suitable welfare facilities ' +
                'are provided, and liaising with the Principal Designer throughout the project.',
            dutyHolders: ['Principal Contractor (notifiable projects)'],
            mandatory: false,
            conditionNote: 'The Principal Contractor role only exists on notifiable projects.',
            acopReference: 'L153 paragraphs 286–380',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 14',
            title: 'Principal Contractor — Construction Phase Plan',
            summary: 'Before the construction phase begins, the Principal Contractor must draw ' +
                'up a construction phase plan. The plan must describe how the project will ' +
                'be managed during the construction phase, including the health and safety ' +
                'arrangements, site rules, and specific measures for the listed risks in ' +
                'Schedule 3. The plan must be updated as the project progresses.',
            dutyHolders: ['Principal Contractor (notifiable projects)'],
            mandatory: false,
            conditionNote: 'On non-notifiable projects, the contractor (not a Principal Contractor) must still ensure a construction phase plan exists before work begins.',
            acopReference: 'L153 paragraphs 381–430',
        },
        {
            regulation: 'Reg 15',
            title: 'Designer Duties',
            summary: 'When preparing or modifying a design, each designer must take account of the ' +
                'general principles of prevention and the content of any pre-construction ' +
                'information. Designers must eliminate foreseeable risks so far as reasonably ' +
                'practicable, and, where not possible, reduce or control them through design. ' +
                'Designers must provide information about any remaining risks that cannot be ' +
                'eliminated. These duties apply to all designers on all construction projects.',
            dutyHolders: ['Designer'],
            mandatory: true,
            conditionNote: 'Reg 15 applies to all designers on all construction projects — there is no ' +
                'minimum size threshold. "Designer" includes architects, structural engineers, ' +
                'building services engineers, quantity surveyors (where they influence design), ' +
                'and clients who specify aspects of the design.',
            acopReference: 'L153 paragraphs 431–495',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 16',
            title: 'Contractor Duties',
            summary: 'Each contractor must plan, manage, and monitor construction work carried ' +
                'out by them or under their control to ensure it is carried out without ' +
                'risks so far as reasonably practicable. Contractors must not begin work ' +
                'unless satisfied that a construction phase plan has been prepared. They ' +
                'must comply with directions given by the Principal Contractor and Principal ' +
                'Designer and must provide information to those parties.',
            dutyHolders: ['Contractor'],
            mandatory: true,
            acopReference: 'L153 paragraphs 496–550',
        },
    ],
    assessmentMethodology: 'CDM compliance is assessed against each duty holder\'s specific obligations. ' +
        'HSE inspectors use a project-stage approach: pre-construction (has the client ' +
        'provided pre-construction information? has the construction phase plan been ' +
        'prepared?), construction phase (is the CPP being followed? are site rules in ' +
        'place? is the Principal Contractor co-ordinating?), and handover (has the ' +
        'H&S file been prepared and handed to the client?). For notifiable projects, ' +
        'the F10 notification and written appointment letters are primary documentary ' +
        'checks.',
    complianceCriteria: [
        'Pre-construction information has been assembled and provided to designers and contractors before work begins',
        'A construction phase plan exists before the construction phase starts',
        'For notifiable projects: Principal Designer and Principal Contractor are appointed in writing',
        'For notifiable projects: F10 notification has been submitted to HSE and displayed on site',
        'The Principal Designer has planned and co-ordinated the pre-construction phase health and safety',
        'The Principal Contractor has planned and co-ordinated the construction phase health and safety',
        'All designers have eliminated, reduced, or controlled foreseeable risks through design (Reg 15)',
        'Welfare facilities meeting Schedule 2 requirements are provided on site',
        'The health and safety file is maintained and will be handed to the client on completion',
        'CDM applies to ALL construction work — no minimum project size threshold exists',
    ],
    sourceDocuments: [
        {
            id: 'cdm-si',
            docType: 'primary-legislation',
            title: 'Construction (Design and Management) Regulations 2015',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/2015/51/contents/made',
            year: 2015,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '2015-04-06',
        },
        {
            id: 'l153',
            docType: 'acop',
            title: 'Managing health and safety in construction: Construction (Design and Management) Regulations 2015 (L153)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l153.pdf',
            version: '1st edition',
            year: 2015,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2015-04-06',
        },
    ],
    validationRules: [
        {
            ruleId: 'CDM-REG-001',
            description: 'Regulation numbers must be cited accurately against SI 2015/51',
            severity: 'regulatory',
            check: 'no-invented-regulation',
            failureMessage: 'Generated content contains a CDM regulation reference that does not match SI 2015/51. CDM 2007 regulation numbers differ from CDM 2015 — do not confuse them.',
            reviewerGuidance: 'Cross-check the specific regulation cited against CDM 2015 at legislation.gov.uk/uksi/2015/51. CDM 2007 (revoked) had different regulation numbers — content must not reference CDM 2007 as if current.',
        },
        {
            ruleId: 'CDM-REG-002',
            description: 'Notifiable project thresholds must be stated correctly — >30 working days with >20 simultaneous workers, OR >500 person-days',
            severity: 'regulatory',
            check: 'no-invented-threshold',
            failureMessage: 'Content states incorrect notifiable project thresholds. Under Reg 6(2), notification is required where the construction phase will last longer than 30 working days with more than 20 simultaneous workers, OR will involve more than 500 person-days. Both triggers must be correctly stated.',
            reviewerGuidance: 'Verify thresholds against Reg 6(2). The triggers are EITHER (a) >30 working days AND >20 simultaneous workers, OR (b) >500 person-days. Both conditions must apply for the first trigger — exceeding 30 working days is not alone sufficient.',
        },
        {
            ruleId: 'CDM-REG-003',
            description: 'CDM applies to all construction work — there is no minimum project size',
            severity: 'high',
            check: 'correct-legal-standard',
            failureMessage: 'Content implies CDM only applies to notifiable or large projects. CDM 2015 applies to all construction work. Notification, Principal Designer, and Principal Contractor requirements are only triggered by notifiable thresholds, but all other duties (Reg 8, 9, 10, 15, 16) apply to every project.',
            reviewerGuidance: 'Clarify that notification thresholds determine when F10, PD, and PC are required — they do not determine whether CDM applies. CDM duties (particularly Reg 15 for designers and Reg 16 for contractors) apply to all construction work.',
        },
        {
            ruleId: 'CDM-REG-004',
            description: 'The CDM co-ordinator role (CDM 2007) no longer exists — it was replaced by the Principal Designer in CDM 2015',
            severity: 'regulatory',
            check: 'duty-holder-accuracy',
            failureMessage: 'Content references the "CDM co-ordinator" role. This role was abolished by CDM 2015 — it existed under CDM 2007 only. CDM 2015 replaced it with the Principal Designer. Content must use current CDM 2015 duty holder terminology.',
            reviewerGuidance: 'CDM 2015 duty holders are: Client, Principal Designer, Designer, Principal Contractor, Contractor, Worker. "CDM co-ordinator" is a CDM 2007 concept and must not be used in CDM 2015 contexts.',
        },
        {
            ruleId: 'CDM-REG-005',
            description: 'The health and safety file must be distinguished from the construction phase plan — they are separate documents with different purposes',
            severity: 'high',
            check: 'correct-legal-standard',
            failureMessage: 'Content conflates the health and safety file with the construction phase plan. These are distinct documents: the CPP is prepared before and updated during construction; the H&S file is prepared during and handed to the client at completion for future reference.',
            reviewerGuidance: 'Construction Phase Plan: prepared by Principal Contractor (notifiable) or contractor (non-notifiable) before work starts; addresses how construction will be managed. Health and Safety File: compiled by Principal Designer; records information for future use during maintenance, alteration, and demolition.',
        },
        {
            ruleId: 'CDM-REG-006',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'CDM 2015 (SI 2015/51) applies to Great Britain only. Northern Ireland has equivalent but separate construction safety legislation.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'cdm 2015',
            'cdm regulation',
            'principal designer',
            'principal contractor',
            'construction phase plan',
            'f10',
            'notifiable.*project',
            'notifiable.*construction',
            'si 2015/51',
            'reg 4.*cdm',
            'reg 12.*cdm',
            'reg 13.*cdm',
            'construction.*design.*management',
        ],
        highPatterns: [
            'pre-construction information',
            'health and safety file',
            'cdm co-ordinator',
            '30.*working day',
            '500.*person.*day',
            'design risk',
            'principal designer.*appoint',
            'principal contractor.*appoint',
            'l153',
            'schedule 2.*welfare',
            'schedule 3.*cdm',
        ],
        mediumPatterns: [
            'cdm.*training',
            'site induction',
            'construction phase',
            'cdm.*small project',
            'cdm.*domestic',
            'f10.*notification',
            'duty holder.*cdm',
        ],
    },
    learningArcStages: [
        'What is CDM 2015 — scope, how it replaced CDM 2007, and the duty holder framework',
        'Client duties — pre-construction information, appointing duty holders, and the H&S file',
        'Notifiable projects — the two triggers (30 days/20 workers, 500 person-days) and F10 notification',
        'Principal Designer — role, responsibilities, and how it differs from the old CDM co-ordinator',
        'Principal Contractor — construction phase planning, co-ordination, and site management',
        'Designer duties under Reg 15 — eliminating, reducing, and controlling risks through design',
        'Contractor and worker duties — CPP compliance, site induction, and raising concerns',
        'Key documents — construction phase plan, pre-construction information pack, and health and safety file',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'puwer-1998',
        'manual-handling-1992',
        'loler-1998',
    ],
};
