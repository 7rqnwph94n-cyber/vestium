// ─── Control of Noise at Work Regulations 2005 — Regulatory Schema ────────────
// Control of Noise at Work Regulations 2005
// SI 2005/1643
//
// Source authorities:
//   legislation.gov.uk/uksi/2005/1643 (Open Government Licence v3.0)
//   HSE L108 — Controlling noise at work ACOP (2nd edition, 2005)
//
// Implements EU Physical Agents (Noise) Directive 2003/10/EC.
// Note: L108 is classified as guidance rather than a formal ACOP.

import type { RegulatorySchema } from '../types';

export const NOISE_2005: RegulatorySchema = {
  id: 'noise-2005',
  shortTitle: 'Noise 2005',
  fullTitle: 'Control of Noise at Work Regulations 2005',
  siNumber: 'SI 2005/1643',
  year: 2005,
  lastAmended: '2005-04-06',
  jurisdiction: 'great-britain',
  inForce: true,
  applicabilityScope:
    'Applies to all employers where employees may be exposed to noise at work. ' +
    '"Noise" means any audible sound. The Regulations set three threshold levels — ' +
    'lower exposure action values, upper exposure action values, and exposure limit ' +
    'values — which trigger different employer duties. The Regulations apply across all ' +
    'industries but are particularly significant in manufacturing, construction, mining, ' +
    'food production, and entertainment. The music and entertainment sector has a ' +
    'deferred application date with specific provisions.',
  dutyHolders: [
    'Employer',
    'Self-employed person',
  ],
  keyDuties: [
    {
      regulation: 'Reg 4',
      title: 'Assessment of Noise Exposure',
      summary:
        'Every employer must make a suitable and sufficient assessment of the noise ' +
        'exposure of employees. The assessment must identify who is exposed, at what ' +
        'levels, and for how long. Where it is not possible to conclude with confidence ' +
        'that the lower exposure action values are not exceeded, noise measurements ' +
        'must be taken. The assessment must be reviewed when circumstances change.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L108 paragraphs 28–65',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 5',
      title: 'Elimination or Control of Noise Exposure',
      summary:
        'Every employer must reduce the risk of hearing damage from noise to as low ' +
        'a level as reasonably practicable by: (a) applying technical and organisational ' +
        'noise control measures other than hearing protection, and (b) reducing ' +
        'exposure duration and intensity. Control measures must be applied in the ' +
        'hierarchy: eliminate at source → redesign → enclosure → sound damping → ' +
        'maintenance → work organisation → reduced exposure time. Hearing protection ' +
        'is a last resort and must not be used as a substitute for noise control.',
      dutyHolders: ['Employer'],
      mandatory: true,
      conditionNote:
        'At and above the upper exposure action value (LEP,d 85 dB(A)), technical and ' +
        'organisational noise control measures are mandatory — hearing protection alone ' +
        'is not sufficient compliance at these levels. A noise action plan must be in ' +
        'place where the upper action value is exceeded.',
      acopReference: 'L108 paragraphs 66–115',
    },
    {
      regulation: 'Reg 6',
      title: 'Hearing Protection',
      summary:
        'At and above the lower exposure action value (LEP,d 80 dB(A)), suitable ' +
        'hearing protection must be made available to any employee who requests it. ' +
        'At and above the upper exposure action value (LEP,d 85 dB(A)), employers ' +
        'must provide hearing protection and ensure it is used. Hearing protection ' +
        'zones must be designated and marked where the upper action value is exceeded. ' +
        'Hearing protection must be suitable for the frequency and level of noise and ' +
        'for the work being done.',
      dutyHolders: ['Employer'],
      mandatory: true,
      conditionNote:
        'Provision at lower action value: hearing protection on request. ' +
        'Provision at upper action value: mandatory provision and mandatory use. ' +
        'Hearing protection zones must be physically demarcated and signposted.',
      acopReference: 'L108 paragraphs 116–165',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 7',
      title: 'Health Surveillance',
      summary:
        'Where there is a risk to health from noise exposure at work — for example, ' +
        'where employees are regularly exposed at or above the lower exposure action ' +
        'value — the employer must ensure that appropriate health surveillance is ' +
        'provided. Health surveillance must include audiometric testing. Records must ' +
        'be kept and individual records made available to the employee on request.',
      dutyHolders: ['Employer'],
      mandatory: false,
      conditionNote:
        'Health surveillance (audiometry) is required where employees are regularly ' +
        'exposed at or above the lower exposure action value (LEP,d 80 dB(A)). ' +
        'Audiometric tests must be carried out by a competent person.',
      acopReference: 'L108 paragraphs 166–205',
    },
    {
      regulation: 'Reg 8',
      title: 'Information, Instruction and Training',
      summary:
        'Every employer must provide adequate information, instruction, and training ' +
        'to employees who are exposed to noise at work. This must include: the nature ' +
        'of the risk, the measures to eliminate or reduce noise at source, the ' +
        'exposure limit and action values, results of the noise assessment, the ' +
        'availability of hearing protection, the employees\' entitlement to health ' +
        'surveillance, and the safe use of hearing protection.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L108 paragraphs 206–225',
    },
  ],
  assessmentMethodology:
    'Noise exposure assessment requires measurement of employees\' daily personal ' +
    'noise exposure (LEP,d in dB(A)) and peak sound pressure levels (LCpeak in dB(C)). ' +
    'Measurements must be made by a competent person using a sound level meter or ' +
    'personal noise dosemeter. The assessment identifies whether employees\' exposure ' +
    'falls below the lower action values, between the two action values, or at or ' +
    'above the upper action values — each triggering different obligations. ' +
    'Octave band analysis may be needed to select appropriate hearing protection ' +
    'with sufficient attenuation at the frequencies present.',
  complianceCriteria: [
    'A noise assessment has been carried out identifying exposure levels for all noise-exposed employees',
    'Where exposures may exceed lower action values, noise measurements have been taken',
    'Technical and organisational noise controls are in place before reliance on hearing protection',
    'At lower action value (LEP,d ≥80 dB(A)): hearing protection available on request',
    'At upper action value (LEP,d ≥85 dB(A)): hearing protection provided and use enforced',
    'Hearing protection zones are physically demarcated and signposted where upper action values are exceeded',
    'Health surveillance (audiometry) is provided where exposure regularly meets or exceeds the lower action value',
    'Hearing protection is suitable for the noise type, frequency, and work conditions',
    'Content does not present hearing protection as a substitute for engineering noise controls',
    'Exposure limit values (LEP,d 87 dB(A) accounting for hearing protection attenuation) are not exceeded',
  ],
  sourceDocuments: [
    {
      id: 'noise-si',
      docType: 'primary-legislation',
      title: 'Control of Noise at Work Regulations 2005',
      publisher: 'legislation.gov.uk',
      url: 'https://www.legislation.gov.uk/uksi/2005/1643/contents/made',
      year: 2005,
      licence: 'ogl-v3',
      currentVersion: true,
      versionDate: '2005-04-06',
    },
    {
      id: 'l108',
      docType: 'hse-guidance',
      title: 'Controlling noise at work: The Control of Noise at Work Regulations 2005 (L108)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/l108.pdf',
      version: '2nd edition',
      year: 2005,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '2005-04-06',
    },
  ],
  validationRules: [
    {
      ruleId: 'NOISE-REG-001',
      description: 'Action values and limit values must be correctly stated — three thresholds with different obligations',
      severity: 'regulatory',
      check: 'no-invented-threshold',
      failureMessage:
        'Content mis-states a noise exposure action value or limit value. The correct values are: lower exposure action values LEP,d 80 dB(A) and LCpeak 135 dB(C); upper exposure action values LEP,d 85 dB(A) and LCpeak 137 dB(C); exposure limit values LEP,d 87 dB(A) and LCpeak 140 dB(C).',
      reviewerGuidance:
        'Verify all noise threshold values against Reg 2. The lower action value triggers the right to hearing protection on request; the upper action value triggers mandatory provision and use; the limit value must not be exceeded. Peak sound pressures use the dB(C) scale; daily personal exposure uses dB(A).',
    },
    {
      ruleId: 'NOISE-REG-002',
      description: 'Hearing protection is a last resort — not the primary noise control',
      severity: 'high',
      check: 'control-hierarchy-correct',
      failureMessage:
        'Content presents hearing protection as the primary or acceptable noise control measure. Under Reg 5, employers must first apply technical and organisational noise control measures to reduce exposure. At and above the upper action value, noise controls are mandatory in addition to hearing protection.',
      reviewerGuidance:
        'Hearing protection supplements noise controls — it does not replace them. Content that presents hearing protection as the first or only response to a high-noise environment is factually and legally incorrect under Reg 5.',
    },
    {
      ruleId: 'NOISE-REG-003',
      description: 'LEP,d is a daily personal exposure — not an instantaneous reading',
      severity: 'medium',
      check: 'correct-legal-standard',
      failureMessage:
        'Content implies that a momentary noise reading exceeding 85 dB(A) triggers the upper action value obligation. LEP,d is the A-weighted daily personal noise exposure, averaged over an 8-hour working day — it accounts for duration of exposure as well as noise level.',
      reviewerGuidance:
        'A brief exposure to very high noise levels may or may not trigger the action value obligations — it depends on the daily personal exposure calculation (LEP,d). An instantaneous SPL reading of 85 dB(A) is not the same as a LEP,d of 85 dB(A). Peak sound pressure limits (LCpeak) are separate from LEP,d.',
    },
    {
      ruleId: 'NOISE-REG-004',
      description: 'Jurisdiction is Great Britain only — not UK',
      severity: 'medium',
      check: 'uk-jurisdiction-only',
      failureMessage: 'Control of Noise at Work Regulations 2005 (SI 2005/1643) apply to Great Britain only.',
      reviewerGuidance:
        'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
    },
  ],
  factCheckSeverityConfig: {
    regulatoryPatterns: [
      'noise.*regulation',
      'si 2005/1643',
      'exposure action value.*noise',
      'lep,d',
      'lcpeak',
      'noise.*limit value',
      'control of noise',
    ],
    highPatterns: [
      '80.*db',
      '85.*db',
      '87.*db',
      '135.*db',
      '137.*db',
      '140.*db',
      'hearing protection zone',
      'audiometry',
      'audiometric test',
      'noise.*hearing damage',
      'noise.*control.*measure',
    ],
    mediumPatterns: [
      'l108',
      'noise assessment',
      'sound level meter',
      'dosemeter',
      'ear defender',
      'ear plug',
      'snr.*hearing',
      'attenuation.*hearing',
    ],
  },
  learningArcStages: [
    'What the Noise Regulations cover — scope, why noise damages hearing, and the three thresholds',
    'The three exposure values — lower action, upper action, and limit values: dB(A) and dB(C)',
    'Noise assessment — how to measure LEP,d, who can do it, and when to review',
    'Noise control hierarchy — eliminating noise at source before relying on hearing protection',
    'Hearing protection — selection, attenuation, fit, use zones, and mandatory provision',
    'Health surveillance — audiometry, when it is required, and record keeping',
    'Noise in specific sectors — construction, manufacturing, mining, and food production',
    'Training obligations — what noise-exposed workers must know',
  ],
  relatedSchemas: [
    'mhswr-1999',
    'coshh-2002',
    'ppe-1992',
  ],
};
