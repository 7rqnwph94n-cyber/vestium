// ─── DSEAR 2002 — Regulatory Schema ───────────────────────────────────────────
// Dangerous Substances and Explosive Atmospheres Regulations 2002
// SI 2002/2776

// Note: DSEAR has no ACOP — HSE guidance publications L134 and L138 apply.

import type { RegulatorySchema } from '../types.js';

export const DSEAR_2002: RegulatorySchema = {
    id: 'dsear-2002',
    shortTitle: 'DSEAR 2002',
    fullTitle: 'Dangerous Substances and Explosive Atmospheres Regulations 2002',
    siNumber: 'SI 2002/2776',
    year: 2002,
    lastAmended: '2016-10-01',
    jurisdiction: 'great-britain',
    inForce: true,
    applicabilityScope: 'Applies to all workplaces where dangerous substances are present or may be ' +
        'present. A "dangerous substance" is one that, because of its properties or ' +
        'its use or presence at the workplace, could cause harm from fire, explosion, ' +
        'or similar energetic event. This includes flammable liquids, gases, dusts, ' +
        'mists, and vapours, as well as explosive substances. DSEAR applies to oil ' +
        'and gas, chemical process, painting operations, pharmaceutical manufacture, ' +
        'grain storage, woodworking, and any process generating flammable vapour or ' +
        'combustible dust. DSEAR works alongside COSHH 2002 — where a substance is ' +
        'both hazardous to health and dangerous (flammable/explosive), both sets of ' +
        'regulations apply.',
    dutyHolders: [
        'Employer',
        'Self-employed person',
        'Any person who controls the design, construction, or modification of the workplace',
    ],
    keyDuties: [
        {
            regulation: 'Reg 5',
            title: 'Risk Assessment',
            summary: 'Every employer must make a suitable and sufficient assessment of the risks ' +
                'to employees from dangerous substances present at the workplace. The ' +
                'assessment must identify the dangerous substances, quantify the risk of ' +
                'fire, explosion, or similar events, and set out the measures needed to ' +
                'comply with DSEAR. Significant findings must be recorded where 5 or more ' +
                'employees are employed.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'The DSEAR risk assessment supplements the general MHSWR risk assessment ' +
                'with specific focus on fire, explosion, and energetic event risks. It must ' +
                'be reviewed when no longer valid or after a significant change.',
            acopReference: 'L134 paragraphs 38–87',
            penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
        },
        {
            regulation: 'Reg 6',
            title: 'Elimination or Reduction of Risks',
            summary: 'Every employer must ensure that the risk from dangerous substances is ' +
                'eliminated or reduced so far as is reasonably practicable. Measures must ' +
                'be applied in the following priority order: (1) substitute the dangerous ' +
                'substance with one that is not dangerous or less dangerous, (2) reduce the ' +
                'quantity of dangerous substance to a minimum, (3) apply appropriate technical ' +
                'measures (including adequate ventilation), (4) avoid ignition sources, ' +
                '(5) avoid adverse conditions which could cause danger, (6) keep incompatible ' +
                'substances apart.',
            dutyHolders: ['Employer'],
            mandatory: true,
            conditionNote: 'Reduction measures must be applied before reliance on the explosion protection ' +
                'document or ATEX equipment. The risk assessment should demonstrate that ' +
                'reduction has been considered at each step before zoning is applied.',
            acopReference: 'L134 paragraphs 88–131',
        },
        {
            regulation: 'Reg 7',
            title: 'Places Where Explosive Atmospheres May Occur',
            summary: 'Where, after applying Reg 6 measures, explosive atmospheres may still occur, ' +
                'employers must apply control measures commensurate with the risk — including ' +
                'ATEX-compliant equipment where required, and a system for managing ignition ' +
                'sources. Control measures must address technical measures (equipment, ' +
                'ventilation) and organisational measures (safe systems of work, permits to ' +
                'work, hot work procedures).',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Applies where explosive atmospheres may still occur after Reg 6 reduction ' +
                'measures have been applied. The extent of control measures required depends ' +
                'on the zone classification established under Reg 9.',
            acopReference: 'L134 paragraphs 132–185',
        },
        {
            regulation: 'Reg 9',
            title: 'Classification of Places Where Explosive Atmospheres May Occur',
            summary: 'Employers must classify places where explosive atmospheres may occur into ' +
                'hazardous zones. For gas/vapour/mist explosive atmospheres: Zone 0 (present ' +
                'continuously or for long periods in normal operation), Zone 1 (likely to ' +
                'occur in normal operation occasionally), Zone 2 (not likely to occur in ' +
                'normal operation but may occur in abnormal conditions). For dust explosive ' +
                'atmospheres: Zone 20, Zone 21, Zone 22 are the equivalent classifications. ' +
                'Areas outside these zones are non-hazardous (safe area).',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Hazardous area classification is required wherever explosive atmospheres ' +
                'may occur. The classification determines which ATEX equipment category is ' +
                'required: Zone 0/20 requires Category 1 equipment; Zone 1/21 requires ' +
                'Category 1 or 2; Zone 2/22 requires Category 1, 2, or 3.',
            acopReference: 'L134 paragraphs 186–247',
        },
        {
            regulation: 'Reg 10',
            title: 'Verification of Overall Explosion Safety (Explosion Protection Document)',
            summary: 'Where an explosive atmosphere may occur, the employer must draw up and keep ' +
                'up to date an explosion protection document (EPD) before work starts. The ' +
                'EPD must demonstrate that explosion risks have been assessed, adequate ' +
                'measures have been taken, the workplace and work equipment is designed, ' +
                'operated, and maintained with due regard for safety, the zone classification ' +
                'has been carried out, and ATEX equipment complies with the Directive.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'The EPD is required wherever an explosive atmosphere may occur — i.e., ' +
                'wherever hazardous zones exist. The EPD is a living document that must be ' +
                'revised when the workplace, work equipment, or organisation of work undergoes ' +
                'significant change.',
            acopReference: 'L134 paragraphs 248–295',
        },
        {
            regulation: 'Reg 11',
            title: 'Co-ordination (Where Persons from Multiple Employers Are Present)',
            summary: 'Where persons from more than one employer are working at the same workplace ' +
                'and one or more of them is engaged in work in places where explosive ' +
                'atmospheres may occur, the employer responsible for the workplace must ' +
                'co-ordinate the implementation of all the measures required by DSEAR and ' +
                'state the aims of the measures and the actions required in the EPD.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Applies to shared workplaces, contractor environments, and sites with multiple ' +
                'employers working in or near hazardous areas.',
            acopReference: 'L134 paragraphs 296–315',
        },
        {
            regulation: 'Reg 13',
            title: 'Arrangements for Dealing with Accidents, Incidents and Emergencies',
            summary: 'Employers must put in place procedures for accidents, incidents, and ' +
                'emergencies involving dangerous substances — including arrangements for ' +
                'warnings, emergency shutdown, evacuation, spill containment, and first ' +
                'aid. Relevant safety information must be provided to the emergency services.',
            dutyHolders: ['Employer'],
            mandatory: false,
            conditionNote: 'Emergency arrangements are required where the risk assessment identifies ' +
                'a credible emergency scenario — e.g., large flammable liquid release, ' +
                'uncontrolled reactive chemical event.',
            acopReference: 'L134 paragraphs 316–345',
        },
        {
            regulation: 'Reg 15',
            title: 'Information, Instruction and Training',
            summary: 'Every employer must provide employees who work in places where an explosive ' +
                'atmosphere may occur with sufficient information, instruction and training ' +
                'in relation to DSEAR. This includes the nature of dangerous substances ' +
                'present, the findings of the risk assessment, the zone classification, ' +
                'and the safety measures and precautions to be taken.',
            dutyHolders: ['Employer'],
            mandatory: true,
            acopReference: 'L134 paragraphs 346–368',
        },
    ],
    assessmentMethodology: 'DSEAR assessment follows the identify → classify → control → document ' +
        'methodology. First, all dangerous substances are identified and their ' +
        'explosive/fire properties established (flash point, LEL, UEL, explosive ' +
        'concentration range for dusts). Second, hazardous zones are classified ' +
        'using the zone system under Reg 9. Third, control measures are applied ' +
        'in the Reg 6 priority order. Fourth, ATEX equipment is selected to match ' +
        'the zone classification. Fifth, the explosion protection document is produced ' +
        'and maintained. HSE L134 provides detailed methodology.',
    complianceCriteria: [
        'All dangerous substances have been identified and their explosive/fire properties established',
        'A DSEAR risk assessment has been completed and significant findings recorded',
        'Risk reduction has been applied in Reg 6 priority order before zoning is established',
        'Hazardous area classification (zones 0, 1, 2 or 20, 21, 22) has been carried out where explosive atmospheres may occur',
        'ATEX equipment used in hazardous zones matches the zone category requirements',
        'An explosion protection document (EPD) exists where explosive atmospheres may occur',
        'Ignition sources are identified and controlled within and adjacent to hazardous zones',
        'Permits to work and hot work procedures are in place for work in or near hazardous areas',
        'Emergency arrangements address dangerous substance spills and releases',
        'Employees working in or near hazardous areas have received DSEAR information and training',
    ],
    sourceDocuments: [
        {
            id: 'dsear-si',
            docType: 'primary-legislation',
            title: 'Dangerous Substances and Explosive Atmospheres Regulations 2002',
            publisher: 'legislation.gov.uk',
            url: 'https://www.legislation.gov.uk/uksi/2002/2776/contents/made',
            year: 2002,
            licence: 'ogl-v3',
            currentVersion: true,
            versionDate: '2002-11-09',
        },
        {
            id: 'l134',
            docType: 'hse-guidance',
            title: 'Dangerous substances and explosive atmospheres (L134)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l134.pdf',
            version: '1st edition',
            year: 2003,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2003-01-01',
        },
        {
            id: 'l138',
            docType: 'hse-guidance',
            title: 'Unloading petrol from road tankers (L138)',
            publisher: 'hse.gov.uk',
            url: 'https://www.hse.gov.uk/pubns/priced/l138.pdf',
            version: '1st edition',
            year: 2003,
            licence: 'crown-copyright',
            currentVersion: true,
            versionDate: '2003-01-01',
        },
    ],
    validationRules: [
        {
            ruleId: 'DSEAR-REG-001',
            description: 'Regulation numbers must be cited accurately against SI 2002/2776',
            severity: 'regulatory',
            check: 'no-invented-regulation',
            failureMessage: 'Generated content contains a DSEAR regulation reference that does not match SI 2002/2776. Invented or misattributed regulation numbers are a regulatory-severity finding.',
            reviewerGuidance: 'Cross-check the specific regulation cited against DSEAR 2002 at legislation.gov.uk/uksi/2002/2776.',
        },
        {
            ruleId: 'DSEAR-REG-002',
            description: 'Zone classifications must be correctly defined — Zone 0/1/2 for gas; Zone 20/21/22 for dust',
            severity: 'regulatory',
            check: 'no-invented-threshold',
            failureMessage: 'Content mis-states the zone classification system. Gas/vapour/mist zones are 0, 1, and 2. Dust zones are 20, 21, and 22. Zone 0 means continuously present; Zone 1 means occasionally present in normal operation; Zone 2 means not likely in normal operation.',
            reviewerGuidance: 'Verify zone definitions against Reg 9 and L134. Zone 0 (continuous), Zone 1 (occasional in normal operation), Zone 2 (abnormal conditions only). Dust equivalent: 20, 21, 22 respectively. Content must not transpose these or invent additional zones.',
        },
        {
            ruleId: 'DSEAR-REG-003',
            description: 'ATEX equipment category must match the zone — Category 1 for Zone 0/20, Category 1 or 2 for Zone 1/21',
            severity: 'high',
            check: 'no-invented-threshold',
            failureMessage: 'Content states an incorrect ATEX equipment category for the zone. Zone 0/20 requires Category 1 equipment; Zone 1/21 requires Category 1 or 2; Zone 2/22 requires Category 1, 2, or 3.',
            reviewerGuidance: 'Verify ATEX equipment category requirements against Reg 7 and L134. Category is a function of zone — higher-numbered zones permit lower category (less protective) equipment. This is a safety-critical factual accuracy requirement.',
        },
        {
            ruleId: 'DSEAR-REG-004',
            description: 'DSEAR has no ACOP — guidance status of L134 must not be misrepresented',
            severity: 'medium',
            check: 'acop-status-accurate',
            failureMessage: 'Content describes L134 as an Approved Code of Practice. DSEAR has no ACOP. L134 is HSE guidance — it does not have the same evidential weight in enforcement proceedings as an ACOP.',
            reviewerGuidance: 'L134 is HSE regulatory guidance, not an ACOP. Failure to follow L134 is not of itself evidential of a breach, unlike an ACOP. The regulatory standard is what the Regulations themselves require.',
        },
        {
            ruleId: 'DSEAR-REG-005',
            description: 'The explosion protection document (EPD) is required wherever explosive atmospheres may occur — not optional',
            severity: 'high',
            check: 'duty-holder-accuracy',
            failureMessage: 'Content implies the explosion protection document (EPD) under Reg 10 is optional or only required in certain circumstances. The EPD is required wherever an explosive atmosphere may occur.',
            reviewerGuidance: 'If hazardous zones exist (any zone 0, 1, 2, 20, 21, or 22), an EPD is mandatory before work starts. The EPD is not the same as the risk assessment — it is a separate document demonstrating overall explosion safety.',
        },
        {
            ruleId: 'DSEAR-REG-006',
            description: 'Jurisdiction is Great Britain only — not UK',
            severity: 'medium',
            check: 'uk-jurisdiction-only',
            failureMessage: 'DSEAR 2002 (SI 2002/2776) applies to Great Britain only. Northern Ireland has equivalent but separate legislation.',
            reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
        },
    ],
    factCheckSeverityConfig: {
        regulatoryPatterns: [
            'dsear',
            'explosive atmosphere',
            'zone 0',
            'zone 1',
            'zone 2',
            'zone 20',
            'zone 21',
            'zone 22',
            'si 2002/2776',
            'explosion protection document',
            'epd.*dsear',
            'atex.*zone',
            'reg 9.*dsear',
            'reg 10.*dsear',
            'dangerous substances.*explosive',
        ],
        highPatterns: [
            'atex equipment',
            'ex-rated',
            'ex.*certification',
            'hazardous area classification',
            'ignition source control',
            'dsear assessment',
            'flash point',
            'lower explosive limit',
            'lel ',
            'uel ',
            'category 1.*equipment',
            'category 2.*equipment',
            'explosive atmosphere.*dust',
        ],
        mediumPatterns: [
            'flammable.*storage',
            'dsear training',
            'explosive.*dust',
            'combustible.*dust',
            'static.*electricity.*zone',
            'bonding.*earthing.*dsear',
            'l134',
            'hot work.*permit',
            'permit.*work.*dsear',
        ],
    },
    learningArcStages: [
        'What is DSEAR — scope, what counts as a dangerous substance, and the dual risk of fire and explosion',
        'DSEAR risk assessment — identifying dangerous substances and their explosive properties',
        'Hazardous area classification — Zone 0/1/2 (gas) and Zone 20/21/22 (dust) in detail',
        'ATEX equipment — categories, selection for each zone, and marking requirements',
        'The explosion protection document — what it must contain and who must produce it',
        'Ignition source control — managing static electricity, hot work, and electrical hazards',
        'Interaction with COSHH — when both regulations apply to the same substance',
        'Emergency arrangements, training obligations, and DSEAR documentation',
    ],
    relatedSchemas: [
        'mhswr-1999',
        'coshh-2002',
        'puwer-1998',
    ],
};
