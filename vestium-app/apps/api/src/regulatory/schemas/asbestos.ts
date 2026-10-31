// ─── Control of Asbestos Regulations 2012 — Regulatory Schema ─────────────────
// Control of Asbestos Regulations 2012
// SI 2012/632
//
// Source authorities:
//   legislation.gov.uk/uksi/2012/632 (Open Government Licence v3.0)
//   HSE L143 — Managing and working with asbestos ACOP (2nd edition, 2013)
//   HSE EH10 — Asbestos: The Licensed Contractors' Guide (various editions)

import type { RegulatorySchema } from '../types.js';

export const ASBESTOS_2012: RegulatorySchema = {
  id: 'asbestos-2012',
  shortTitle: 'Asbestos 2012',
  fullTitle: 'Control of Asbestos Regulations 2012',
  siNumber: 'SI 2012/632',
  year: 2012,
  lastAmended: '2012-04-06',
  jurisdiction: 'great-britain',
  inForce: true,
  applicabilityScope:
    'Applies to all work with asbestos-containing materials (ACMs) in Great Britain. ' +
    'Three categories of work exist: (1) Licensed work — highest risk asbestos types ' +
    '(asbestos insulation, asbestos insulation board (AIB), asbestos sprayed coatings) — ' +
    'requires a licence from HSE; (2) Notifiable non-licensed work (NNLW) — lower risk ' +
    'but must be notified to the enforcing authority; (3) Non-licensed work — lowest risk, ' +
    'for materials like asbestos cement, asbestos-containing floor tiles, textured ' +
    'decorative coatings, and rope and gaskets where fibres are well-bonded. ' +
    'Additionally, Reg 4 imposes a "duty to manage" asbestos on owners and occupiers ' +
    'of non-domestic premises built before 2000.',
  dutyHolders: [
    'Employer (work with ACMs)',
    'Dutyholder — person in control of non-domestic premises (Reg 4 duty to manage)',
    'Licensed asbestos contractor (HSE licensed — for licensed work)',
    'Self-employed person',
    'Employee',
  ],
  keyDuties: [
    {
      regulation: 'Reg 4',
      title: 'Duty to Manage Asbestos in Non-Domestic Premises',
      summary:
        'Every person who has an obligation by virtue of a contract or tenancy, or ' +
        'who has control, to any extent, of a non-domestic premises must manage the ' +
        'risk from asbestos. This "duty to manage" requires: (a) identifying whether ' +
        'ACMs are present and recording their location, condition, and type; ' +
        '(b) assessing the risk of the likelihood of fibre release from those ACMs; ' +
        '(c) preparing and implementing a plan to manage that risk; and (d) providing ' +
        'information about the ACMs to anyone likely to disturb them.',
      dutyHolders: ['Dutyholder — person in control of non-domestic premises'],
      mandatory: true,
      conditionNote:
        'The duty to manage applies to ALL non-domestic premises built before 2000 — ' +
        'regardless of whether any work with asbestos is planned. Dutyholders may be ' +
        'landlords, building owners, or occupiers — depending on who has the ' +
        'contractual or practical control of the premises.',
      acopReference: 'L143 paragraphs 14–90',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 5',
      title: 'Identification of the Presence of Asbestos',
      summary:
        'An employer must not carry out work on the fabric of any non-domestic building ' +
        'which may disturb ACMs unless an assessment has been made whether asbestos ' +
        'is or is liable to be present, and if so, what types, in what quantities, and ' +
        'in what condition. This assessment may require an asbestos survey.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L143 paragraphs 91–130',
    },
    {
      regulation: 'Reg 6',
      title: 'Assessment of Work',
      summary:
        'Before work which may disturb asbestos is carried out, the employer must ' +
        'ensure a suitable and sufficient assessment is made of the risks to health. ' +
        'The assessment must determine: the type of asbestos involved, the likely ' +
        'exposure (with and without controls), and the action to be taken to prevent ' +
        'or reduce exposure to the lowest level reasonably practicable.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L143 paragraphs 131–162',
    },
    {
      regulation: 'Reg 7',
      title: 'Plan of Work',
      summary:
        'Before any work with asbestos is carried out, the employer must prepare, and ' +
        'keep updated, a written plan of work. The plan must be specific to each ' +
        'location where the work is to be carried out and must set out: the nature and ' +
        'probable duration of work, the methods applied, the control measures and ' +
        'protective equipment to be used, and procedures for emergency situations.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L143 paragraphs 163–188',
    },
    {
      regulation: 'Reg 8',
      title: 'Licensing of Asbestos Work',
      summary:
        'No employer may carry out licensed asbestos work unless they hold a licence ' +
        'granted by HSE. Licensed work includes: work with asbestos insulation (pipe ' +
        'lagging, boiler insulation), asbestos insulation board (AIB), and asbestos ' +
        'sprayed coatings. Non-licensed work (NNLW) and non-licensed work do not ' +
        'require a licence but have other specific requirements.',
      dutyHolders: ['Employer'],
      mandatory: false,
      conditionNote:
        'The requirement for a licence is triggered by the type of ACM and the nature ' +
        'of the work — not simply by the presence of asbestos. An asbestos survey ' +
        'and risk assessment will determine whether the work requires a licence. ' +
        'Unlicensed work with ACMs that require a licence is a serious criminal offence.',
      acopReference: 'L143 paragraphs 189–220',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 10',
      title: 'Information, Instruction and Training',
      summary:
        'Every employer must ensure that adequate information, instruction and training ' +
        'is given to employees who are or are liable to be exposed to asbestos. ' +
        'Training must cover: the properties of asbestos and its effect on health, ' +
        'the types of work likely to result in significant asbestos exposure, the ' +
        'safe methods of work, the importance of control measures and PPE, and ' +
        'emergency procedures. Training records must be maintained.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L143 paragraphs 249–275',
    },
    {
      regulation: 'Reg 11',
      title: 'Prevention or Reduction of Exposure to Asbestos',
      summary:
        'Exposure to asbestos must be prevented so far as reasonably practicable. ' +
        'Where prevention is not reasonably practicable, exposure must be reduced to ' +
        'the lowest level reasonably practicable. The control hierarchy for asbestos: ' +
        '(1) substitution (not applicable — ACMs cannot be substituted), so ' +
        '(2) enclose the work area, (3) use local exhaust ventilation (LEV), ' +
        '(4) use appropriate respiratory protective equipment. The WEL for asbestos ' +
        'is 0.1 fibres/cm³ (8-hour TWA).',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L143 paragraphs 276–355',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 18',
      title: 'Health Records and Medical Surveillance',
      summary:
        'Employers must ensure that health records are maintained for all employees ' +
        'who are or are liable to be exposed to asbestos. Medical surveillance must ' +
        'be provided. Health records must be kept for at least 40 years from the ' +
        'date of the last entry.',
      dutyHolders: ['Employer'],
      mandatory: true,
      conditionNote:
        'The 40-year record retention requirement reflects the long latency period ' +
        'of asbestos-related diseases — mesothelioma, lung cancer, and asbestosis can ' +
        'develop 20–40 years after exposure.',
      acopReference: 'L143 paragraphs 380–410',
    },
  ],
  assessmentMethodology:
    'Asbestos compliance begins with the asbestos survey (management survey for ' +
    'routine maintenance; refurbishment/demolition survey where intrusive work is ' +
    'planned). Survey results feed the asbestos register. Before any work is planned, ' +
    'the register is checked and a Reg 5/6 assessment determines whether ACMs are ' +
    'present and what category of work applies. For licensed work, the licensed ' +
    'contractor develops the plan of work. For NNLW, employer notification and ' +
    'medical surveillance requirements apply. HSE guidance on asbestos surveys ' +
    '(HSG264) provides the survey methodology.',
  complianceCriteria: [
    'An asbestos register exists for all non-domestic buildings built before 2000 and is kept up to date',
    'A management survey has been completed before any maintenance or modification work is planned',
    'A refurbishment/demolition survey has been completed before intrusive or demolition work begins',
    'The type of asbestos work has been correctly categorised: licensed, NNLW, or non-licensed',
    'Licensed asbestos work is only carried out by a contractor holding an HSE licence',
    'A written plan of work exists for all asbestos work before it begins',
    'Workers exposed to asbestos have received appropriate asbestos awareness training',
    'Health records and medical surveillance records are kept for 40 years',
    'Exposure to asbestos fibres is controlled to below the WEL of 0.1 f/cm³',
    'Content does not imply that any ACM is safe to disturb without a prior assessment',
  ],
  sourceDocuments: [
    {
      id: 'asbestos-si',
      docType: 'primary-legislation',
      title: 'Control of Asbestos Regulations 2012',
      publisher: 'legislation.gov.uk',
      url: 'https://www.legislation.gov.uk/uksi/2012/632/contents/made',
      year: 2012,
      licence: 'ogl-v3',
      currentVersion: true,
      versionDate: '2012-04-06',
    },
    {
      id: 'l143',
      docType: 'acop',
      title: 'Managing and working with asbestos: Control of Asbestos Regulations 2012 (L143)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/l143.pdf',
      version: '2nd edition',
      year: 2013,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '2013-01-01',
    },
  ],
  validationRules: [
    {
      ruleId: 'ASB-REG-001',
      description: 'Licensed, NNLW, and non-licensed work must not be conflated — the three categories have different requirements',
      severity: 'regulatory',
      check: 'correct-legal-standard',
      failureMessage:
        'Content conflates different categories of asbestos work. Licensed work (asbestos insulation, AIB, sprayed coatings) requires an HSE licence; NNLW requires notification to the enforcing authority and medical surveillance; non-licensed work (asbestos cement, bonded floor tiles) has different control requirements.',
      reviewerGuidance:
        'The category of asbestos work determines the legal obligations. L143 Chapter 3 sets out the categorisation criteria. Content must not apply licensed-work requirements to non-licensed work, or understate the controls required for licensed work.',
    },
    {
      ruleId: 'ASB-REG-002',
      description: 'The Reg 4 duty to manage is a separate ongoing obligation — not a one-time survey',
      severity: 'high',
      check: 'duty-holder-accuracy',
      failureMessage:
        'Content presents the duty to manage asbestos as equivalent to carrying out an asbestos survey. Reg 4 is an ongoing management duty: the dutyholder must maintain an up-to-date register, assess risk, manage and control risk, and provide information. The survey is just the first step.',
      reviewerGuidance:
        'The duty to manage (Reg 4) is continuous. The asbestos register must be kept up to date, ACMs must be re-assessed when their condition changes, and the management plan must be reviewed annually.',
    },
    {
      ruleId: 'ASB-REG-003',
      description: 'Health records for asbestos-exposed workers must be kept for 40 years',
      severity: 'regulatory',
      check: 'no-invented-threshold',
      failureMessage:
        'Content states an incorrect record retention period for asbestos health records. Under Reg 18, health records must be kept for at least 40 years from the date of the last entry — reflecting the long latency of asbestos-related diseases.',
      reviewerGuidance:
        'Verify the 40-year retention period against Reg 18. This is distinct from the COSHH health surveillance record retention period (also 40 years) and the LEV examination record period (5 years under COSHH Reg 9).',
    },
    {
      ruleId: 'ASB-REG-004',
      description: 'WEL for asbestos is 0.1 fibres/cm³ (8-hour TWA) — not a different figure',
      severity: 'regulatory',
      check: 'no-invented-threshold',
      failureMessage:
        'Content states an incorrect asbestos WEL. The WEL for all types of asbestos is 0.1 fibres per cubic centimetre of air (f/cm³) measured as an 8-hour TWA. Previous higher WELs (0.3 f/cm³ for chrysotile) were withdrawn — the single 0.1 f/cm³ limit now applies to all fibre types.',
      reviewerGuidance:
        'Verify the asbestos WEL against the current version of EH40. The 0.1 f/cm³ limit applies to all asbestos types. There is no separate higher limit for chrysotile (white asbestos).',
    },
    {
      ruleId: 'ASB-REG-005',
      description: 'Jurisdiction is Great Britain only — not UK',
      severity: 'medium',
      check: 'uk-jurisdiction-only',
      failureMessage: 'Control of Asbestos Regulations 2012 (SI 2012/632) apply to Great Britain only.',
      reviewerGuidance:
        'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
    },
  ],
  factCheckSeverityConfig: {
    regulatoryPatterns: [
      'asbestos.*regulation',
      'si 2012/632',
      'reg 4.*asbestos',
      'duty to manage.*asbestos',
      'licensed.*asbestos',
      'asbestos licence',
      'nnlw',
      'notifiable non-licensed',
      'control of asbestos',
    ],
    highPatterns: [
      'asbestos survey',
      'asbestos register',
      'management survey',
      'refurbishment.*survey',
      'demolition.*survey',
      'hsg264',
      'asbestos insulation board',
      'aib.*asbestos',
      '0.1.*asbestos',
      '0.1 f/cm',
      '40.*year.*asbestos',
      'plan of work.*asbestos',
    ],
    mediumPatterns: [
      'l143',
      'asbestos awareness',
      'asbestos training',
      'mesothelioma',
      'asbestosis',
      'asbestos cement',
      'acm',
      'fibre.*release',
    ],
  },
  learningArcStages: [
    'What is asbestos — types, where it is found in buildings, and why it is dangerous',
    'The duty to manage (Reg 4) — who has it, what it requires, and the asbestos register',
    'Asbestos surveys — management surveys vs refurbishment/demolition surveys',
    'Three categories of work — licensed, NNLW, and non-licensed: how to tell the difference',
    'Control measures for asbestos work — enclosure, LEV, RPE, and the WEL of 0.1 f/cm³',
    'Asbestos awareness training — what workers who might disturb ACMs must know',
    'Health surveillance and record keeping — medical surveillance and 40-year retention',
    'Asbestos in construction — integration with CDM 2015 and pre-construction information',
  ],
  relatedSchemas: [
    'mhswr-1999',
    'coshh-2002',
    'cdm-2015',
  ],
};
