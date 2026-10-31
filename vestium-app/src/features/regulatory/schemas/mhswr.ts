// ─── MHSWR 1999 — Regulatory Schema ──────────────────────────────────────────
// Management of Health and Safety at Work Regulations 1999
// SI 1999/3242
//
// Source authorities:
//   legislation.gov.uk/uksi/1999/3242 (Open Government Licence v3.0)
//   HSE L21 — Approved Code of Practice (5th edition, 2013)
//   HSE HSG65 — Managing for Health and Safety (3rd edition, 2013)
//
// This schema is the base layer. All UK employers fall under MHSWR regardless
// of industry. All other regulatory schemas in this registry sit on top of it.

import type { RegulatorySchema } from '../types';

export const MHSWR_1999: RegulatorySchema = {
  id: 'mhswr-1999',
  shortTitle: 'MHSWR 1999',
  fullTitle: 'Management of Health and Safety at Work Regulations 1999',
  siNumber: 'SI 1999/3242',
  year: 1999,
  lastAmended: '2006-04-06',   // SI 2006/438 — amendment relating to young persons
  jurisdiction: 'great-britain',
  inForce: true,

  applicabilityScope:
    'Universal base layer — applies to all employers and self-employed persons in ' +
    'all industries in Great Britain. Implements the EU Framework Directive 89/391/EEC. ' +
    'Any workplace-specific regulations (COSHH, PUWER, LOLER etc.) supplement and ' +
    'do not displace MHSWR duties.',

  dutyHolders: [
    'Employer',
    'Self-employed person',
    'Employee',
    'Person in control of premises (shared workplaces)',
  ],

  keyDuties: [
    {
      regulation: 'Reg 3',
      title: 'Risk Assessment',
      summary:
        'Every employer must make a suitable and sufficient assessment of risks to ' +
        'employees and others who may be affected by their work activities. ' +
        'Where five or more employees are employed, the significant findings must ' +
        'be recorded. The assessment must be reviewed when there is reason to believe ' +
        'it is no longer valid, or when a significant change occurs.',
      dutyHolders: ['Employer', 'Self-employed person'],
      mandatory: true,
      conditionNote:
        'Written record required where 5 or more employees are employed (Reg 3(6)).',
      acopReference: 'L21 paragraphs 15–45',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 4',
      title: 'Principles of Prevention',
      summary:
        'Where preventive and protective measures are implemented, the employer must ' +
        'apply the general principles of prevention set out in Schedule 1 — including ' +
        'avoiding risks, evaluating unavoidable risks, combating risks at source, ' +
        'adapting work to the individual, and giving priority to collective protective ' +
        'measures over individual ones.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L21 paragraphs 46–55',
    },
    {
      regulation: 'Reg 5',
      title: 'Health and Safety Arrangements',
      summary:
        'Every employer must make and give effect to appropriate arrangements for ' +
        'effective planning, organisation, control, monitoring and review of the ' +
        'preventive and protective measures required by these Regulations. ' +
        'Where five or more employees are employed, arrangements must be recorded.',
      dutyHolders: ['Employer'],
      mandatory: true,
      conditionNote: 'Written record required where 5 or more employees are employed.',
      acopReference: 'L21 paragraphs 56–62',
    },
    {
      regulation: 'Reg 6',
      title: 'Health Surveillance',
      summary:
        'Employers must provide appropriate health surveillance for employees where ' +
        'there is an identifiable disease or adverse health condition related to the ' +
        'work concerned, there are valid techniques to detect the condition, ' +
        'surveillance is likely to further protect employee health, and the condition ' +
        'may occur under the particular conditions of work.',
      dutyHolders: ['Employer'],
      mandatory: false,
      conditionNote:
        'Applies where the risk assessment identifies a risk of an identifiable disease ' +
        'or adverse health condition related to work.',
      acopReference: 'L21 paragraphs 63–77',
    },
    {
      regulation: 'Reg 7',
      title: 'Health and Safety Assistance — Appointment of Competent Persons',
      summary:
        'Every employer must appoint one or more competent persons to assist in ' +
        'undertaking the measures needed to comply with the Regulations. A person is ' +
        'competent where they have sufficient training and experience or knowledge ' +
        'and other qualities to properly assist in those measures. ' +
        'Preference must be given to appointing a competent person from within the ' +
        'employer\'s own organisation before seeking external assistance.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L21 paragraphs 78–98',
    },
    {
      regulation: 'Reg 8',
      title: 'Procedures for Serious and Imminent Danger',
      summary:
        'Employers must establish and where necessary give effect to appropriate ' +
        'procedures for workers to follow in the event of serious and imminent danger. ' +
        'Workers must be informed of the danger, able to cease work and proceed to a ' +
        'place of safety, and must not be prevented from taking steps to avoid the danger.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L21 paragraphs 99–109',
    },
    {
      regulation: 'Reg 9',
      title: 'Contacts with External Services',
      summary:
        'Every employer must ensure that any necessary contacts with external services ' +
        'are arranged, particularly as regards first aid, emergency medical care, and ' +
        'rescue work.',
      dutyHolders: ['Employer'],
      mandatory: true,
    },
    {
      regulation: 'Reg 10',
      title: 'Information for Employees',
      summary:
        'Every employer must provide employees with comprehensible and relevant ' +
        'information on the risks to their health and safety identified by the risk ' +
        'assessment, the preventive and protective measures in place, emergency ' +
        'procedures and the names of competent persons responsible.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L21 paragraphs 110–122',
    },
    {
      regulation: 'Reg 11',
      title: 'Cooperation and Coordination (Shared Workplaces)',
      summary:
        'Where two or more employers share a workplace, they must cooperate with each ' +
        'other to comply with health and safety requirements, coordinate their ' +
        'activities, and inform each other of risks arising from their activities.',
      dutyHolders: ['Employer', 'Self-employed person'],
      mandatory: false,
      conditionNote: 'Applies only where two or more employers share a workplace.',
      acopReference: 'L21 paragraphs 123–133',
    },
    {
      regulation: 'Reg 13',
      title: 'Capabilities and Training',
      summary:
        'Employers must take account of employee capabilities when entrusting tasks ' +
        'that carry risks. Adequate health and safety training must be provided ' +
        'on recruitment, on exposure to new or increased risks, and must be repeated ' +
        'periodically where appropriate. Training must be during working hours.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L21 paragraphs 141–151',
    },
    {
      regulation: 'Reg 14',
      title: "Employees' Duties",
      summary:
        'Every employee must use machinery, equipment, dangerous substances, and ' +
        'safety devices in accordance with the training and instructions given. ' +
        'Employees must inform the employer or a competent person of any work situation ' +
        'representing a serious and immediate danger, or of any shortcoming in the ' +
        'employer\'s protection arrangements.',
      dutyHolders: ['Employee'],
      mandatory: true,
      acopReference: 'L21 paragraphs 152–157',
    },
    {
      regulation: 'Reg 16',
      title: 'Risk Assessment — New and Expectant Mothers',
      summary:
        'Where the risk assessment reveals risks to a new or expectant mother, ' +
        'the employer must take action — temporarily adjusting working conditions or ' +
        'hours, offering suitable alternative work if available, or suspending the ' +
        'employee from work on full pay where no alternative is possible.',
      dutyHolders: ['Employer'],
      mandatory: false,
      conditionNote:
        'Applies where the risk assessment identifies a risk to a new or expectant ' +
        'mother or her child, and the employer has been notified in writing of the pregnancy.',
      acopReference: 'L21 paragraphs 158–185',
    },
    {
      regulation: 'Reg 19',
      title: 'Risk Assessment — Young Persons',
      summary:
        'Before employing a young person, employers must carry out a specific risk ' +
        'assessment taking account of the young person\'s inexperience, lack of ' +
        'awareness of risks, and immaturity. Young persons must not be employed for ' +
        'work that is beyond their physical or psychological capacity or exposes them ' +
        'to agents or processes listed in Reg 19(2).',
      dutyHolders: ['Employer'],
      mandatory: false,
      conditionNote: 'Applies where young persons (under 18) are or are to be employed.',
      acopReference: 'L21 paragraphs 186–205',
    },
  ],

  assessmentMethodology:
    'HSE uses the Plan-Do-Check-Act cycle (HSG65) as the primary assessment framework. ' +
    'Inspectors assess whether the employer has: a proportionate risk assessment with ' +
    'recorded significant findings, documented arrangements for planning/organisation/' +
    'control/monitoring/review, appointed competent persons, provided adequate ' +
    'information and training, and maintained evidence of ongoing review.',

  complianceCriteria: [
    'Risk assessment is suitable and sufficient for the workplace activities — not generic',
    'Significant findings are recorded (required where 5+ employees)',
    'Preventive and protective measures reflect the hierarchy of controls (Schedule 1)',
    'At least one competent person has been appointed with appropriate training and experience',
    'Employees have received comprehensible information about risks and control measures',
    'Emergency procedures are documented and employees are trained in them',
    'Training records are maintained and training is periodically reviewed',
    'Review triggers are defined — assessment revisited when materially changed or invalid',
  ],

  controlHierarchy: [
    'Avoid the risk entirely',
    'Evaluate unavoidable risks',
    'Combat risks at source',
    'Adapt work to the individual',
    'Adapt to technical progress',
    'Replace the dangerous with the non-dangerous or less dangerous',
    'Develop a coherent overall prevention policy',
    'Give priority to collective protective measures over individual protective measures',
    'Give appropriate instructions to employees',
  ],

  sourceDocuments: [
    {
      id: 'mhswr-si',
      docType: 'primary-legislation',
      title: 'Management of Health and Safety at Work Regulations 1999',
      publisher: 'legislation.gov.uk',
      url: 'https://www.legislation.gov.uk/uksi/1999/3242/contents/made',
      year: 1999,
      licence: 'ogl-v3',
      currentVersion: true,
      versionDate: '1999-12-29',
    },
    {
      id: 'l21',
      docType: 'acop',
      title: 'Management of health and safety at work: Approved Code of Practice and guidance (L21)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/l21.pdf',
      version: '5th edition',
      year: 2013,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '2013-01-01',
    },
    {
      id: 'hsg65',
      docType: 'hse-guidance',
      title: 'Managing for Health and Safety (HSG65)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/hsg65.pdf',
      version: '3rd edition',
      year: 2013,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '2013-01-01',
    },
    {
      id: 'mhswr-amend-2003',
      docType: 'primary-legislation',
      title: 'Management of Health and Safety at Work (Amendment) Regulations 2003',
      publisher: 'legislation.gov.uk',
      url: 'https://www.legislation.gov.uk/uksi/2003/2457/contents/made',
      year: 2003,
      licence: 'ogl-v3',
      currentVersion: true,
      versionDate: '2003-10-27',
    },
    {
      id: 'mhswr-amend-2006',
      docType: 'primary-legislation',
      title: 'Management of Health and Safety at Work (Amendment) Regulations 2006',
      publisher: 'legislation.gov.uk',
      url: 'https://www.legislation.gov.uk/uksi/2006/438/contents/made',
      year: 2006,
      licence: 'ogl-v3',
      currentVersion: true,
      versionDate: '2006-04-06',
    },
    {
      id: 'hswa-1974',
      docType: 'primary-legislation',
      title: 'Health and Safety at Work etc. Act 1974',
      publisher: 'legislation.gov.uk',
      url: 'https://www.legislation.gov.uk/ukpga/1974/37/contents',
      year: 1974,
      licence: 'ogl-v3',
      currentVersion: true,
      versionDate: '1974-07-31',
    },
  ],

  validationRules: [
    {
      ruleId: 'MHSWR-REG-001',
      description: 'Regulation numbers must be cited accurately — no paraphrase of regulation titles as different numbers',
      severity: 'regulatory',
      check: 'no-invented-regulation',
      failureMessage: 'Generated content contains a regulation reference that does not match MHSWR 1999 (SI 1999/3242). Invented or misattributed regulation numbers are a regulatory-severity finding.',
      reviewerGuidance: 'Cross-check the specific regulation cited against the MHSWR 1999 statutory instrument at legislation.gov.uk/uksi/1999/3242. Do not accept without verification.',
    },
    {
      ruleId: 'MHSWR-REG-002',
      description: 'Numeric thresholds (e.g. "5 or more employees") must be traceable to a specific regulation',
      severity: 'regulatory',
      check: 'no-invented-threshold',
      failureMessage: 'A numeric threshold has been stated without a traceable source. All thresholds must be traced to the specific regulation or ACOP paragraph.',
      reviewerGuidance: 'Verify the specific threshold against the MHSWR SI or L21 ACOP. The "5 or more employees" written record requirement is at Reg 3(6). If the threshold is not in the source documents, the claim must be removed.',
    },
    {
      ruleId: 'MHSWR-REG-003',
      description: 'Duty holders must be accurately identified — Reg 3 duty sits with the employer, not the safety officer or HR manager',
      severity: 'regulatory',
      check: 'duty-holder-accuracy',
      failureMessage: 'Content misidentifies who holds the legal duty. Under MHSWR, the employer bears primary duties — not the health and safety officer, manager, or any other role unless the duty has been explicitly delegated in the source regulation.',
      reviewerGuidance: 'Check the specific regulation. The employer is always the primary duty holder under Reg 3, 5, 7, 8, 10, 13. Employees have specific duties under Reg 14. Self-employed persons have duties equivalent to employers under certain regulations.',
    },
    {
      ruleId: 'MHSWR-REG-004',
      description: 'The legal standard for risk assessment is "suitable and sufficient" — not "adequate", "thorough", or "comprehensive"',
      severity: 'high',
      check: 'correct-legal-standard',
      failureMessage: 'Content uses an incorrect legal standard for risk assessment. The statutory phrase is "suitable and sufficient" (Reg 3(1)). Alternative wording ("adequate", "thorough", "comprehensive") is not the legal test.',
      reviewerGuidance: 'Verify any risk assessment standard language against Reg 3(1) of MHSWR 1999. The phrase "suitable and sufficient" has case law interpretation — do not substitute with casual equivalents.',
    },
    {
      ruleId: 'MHSWR-REG-005',
      description: 'Competent person under Reg 7 is not any qualified person — specific definition applies',
      severity: 'high',
      check: 'correct-legal-standard',
      failureMessage: 'Content mischaracterises the Reg 7 competent person definition. Reg 7(5) defines competence as having "sufficient training and experience or knowledge and other qualities to properly assist" — this is not equivalent to any particular qualification or job title.',
      reviewerGuidance: 'Verify competent person statements against Reg 7(5) and L21 paragraphs 78–98. The test is functional competence, not possession of a specific certificate.',
    },
    {
      ruleId: 'MHSWR-REG-006',
      description: 'ACOP status must be accurately conveyed — an ACOP is not legally binding but failure to follow it is evidential',
      severity: 'medium',
      check: 'acop-status-accurate',
      failureMessage: 'Content either presents the ACOP as legally binding law (it is not) or fails to convey its evidential weight in enforcement proceedings.',
      reviewerGuidance: 'L21 is an Approved Code of Practice. Failure to follow ACOP provisions is not itself an offence, but it is admissible as evidence in criminal proceedings that the employer failed to meet the standard required by the regulation.',
    },
    {
      ruleId: 'MHSWR-REG-007',
      description: 'Jurisdiction is Great Britain only — not UK (excludes Northern Ireland)',
      severity: 'medium',
      check: 'uk-jurisdiction-only',
      failureMessage: 'MHSWR 1999 (SI 1999/3242) applies to Great Britain (England, Wales, Scotland). Northern Ireland has separate legislation. Content must not imply UK-wide application.',
      reviewerGuidance: 'If the deploying organisation operates in Northern Ireland, this content requires specific review against the equivalent Northern Ireland provisions.',
    },
    {
      ruleId: 'MHSWR-REG-008',
      description: 'No fabricated statistical claims about enforcement or prosecution rates',
      severity: 'high',
      check: 'no-numeric-fabrication',
      failureMessage: 'Content contains a statistical or enforcement figure that cannot be traced to an HSE source. Enforcement statistics must trace to official HSE statistics publications.',
      reviewerGuidance: 'Remove or source any prosecution, fine, or enforcement rate figures. HSE publishes annual statistics at hse.gov.uk/statistics — use only figures from those publications with the year cited.',
    },
  ],

  factCheckSeverityConfig: {
    regulatoryPatterns: [
      'regulation \\d+',
      'reg \\d+',
      'si \\d{4}/\\d+',
      'statutory instrument',
      'legal duty',
      'legal obligation',
      'criminal offence',
      'breach of',
      'duty holder',
      'approved code',
      'acop',
      'unlimited fine',
      'imprisonment',
      'schedule 1',
    ],
    highPatterns: [
      'competent person',
      'suitable and sufficient',
      'significant findings',
      'risk assessment',
      'five or more employees',
      '5 or more employees',
      'in writing',
      'enforce',
      'prosecution',
      'inspector',
      'improvement notice',
      'prohibition notice',
    ],
    mediumPatterns: [
      'best practice',
      'recommended',
      'guidance',
      'hsg65',
      'plan-do-check-act',
      'pdca',
      'monitoring',
      'review trigger',
      'health surveillance',
    ],
  },

  learningArcStages: [
    'Legal framework and scope — what MHSWR is and why it exists',
    'Duty holder responsibilities — who is obliged to do what',
    'Risk assessment methodology — how to conduct a suitable and sufficient assessment',
    'Control hierarchy and prevention principles — Schedule 1 framework',
    'Competent person appointment and management arrangements',
    'Information, instruction, and training obligations',
    'Emergency procedures and serious danger response',
    'Monitoring, review, and audit readiness',
  ],

  relatedSchemas: [
    'coshh-2002',
    'puwer-1998',
    'loler-1998',
    'manual-handling-1992',
    'dsear-2002',
    'cdm-2015',
  ],
};
