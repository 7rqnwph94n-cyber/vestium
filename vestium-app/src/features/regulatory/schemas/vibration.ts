// ─── Control of Vibration at Work Regulations 2005 — Regulatory Schema ────────
// Control of Vibration at Work Regulations 2005
// SI 2005/1093
//
// Source authorities:
//   legislation.gov.uk/uksi/2005/1093 (Open Government Licence v3.0)
//   HSE L140 — Hand-arm vibration ACOP (1st edition, 2005)
//   HSE L141 — Whole-body vibration ACOP (1st edition, 2005)
//
// Implements EU Physical Agents (Vibration) Directive 2002/44/EC.
// Two distinct vibration types — hand-arm vibration (HAV) and whole-body
// vibration (WBV) — with different action and limit values.

import type { RegulatorySchema } from '../types';

export const VIBRATION_2005: RegulatorySchema = {
  id: 'vibration-2005',
  shortTitle: 'Vibration 2005',
  fullTitle: 'Control of Vibration at Work Regulations 2005',
  siNumber: 'SI 2005/1093',
  year: 2005,
  lastAmended: '2005-07-06',
  jurisdiction: 'great-britain',
  inForce: true,
  applicabilityScope:
    'Applies to all employers where employees may be exposed to vibration at work. ' +
    'The Regulations cover two distinct types of vibration: (1) hand-arm vibration ' +
    '(HAV) — vibration transmitted to the hands and arms from hand-held power tools, ' +
    'hand-guided equipment, or held workpieces; and (2) whole-body vibration (WBV) — ' +
    'vibration transmitted to the whole body through the seat or feet, typically from ' +
    'driving vehicles or mobile machinery. HAV is particularly associated with ' +
    'construction, manufacturing, mining, and groundskeeping; WBV is associated with ' +
    'driving forklifts, agricultural machinery, and off-road vehicles.',
  dutyHolders: [
    'Employer',
    'Self-employed person',
  ],
  keyDuties: [
    {
      regulation: 'Reg 4',
      title: 'Determination and Assessment of Vibration Exposure',
      summary:
        'Every employer must make a suitable and sufficient assessment of the daily ' +
        'vibration exposure of employees and the risk to health. The assessment must ' +
        'take into account: the level, type, and duration of exposure, including ' +
        'exposure to intermittent vibration or repeated shocks; the exposure limit ' +
        'values and action values; any information provided by manufacturers of work ' +
        'equipment; temperature and dampness of the work environment; and any effects ' +
        'on health observed in exposed employees.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L140 paragraphs 18–55 (HAV); L141 paragraphs 18–55 (WBV)',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 5',
      title: 'Elimination or Control of Vibration Exposure',
      summary:
        'Every employer must ensure that the risk of vibration-related injury is ' +
        'eliminated or reduced to as low a level as reasonably practicable. Where ' +
        'the exposure action value is exceeded, the employer must put in place a ' +
        'programme of technical and organisational measures to reduce exposure. ' +
        'Control hierarchy: eliminate the vibrating process → substitute less vibrating ' +
        'equipment → engineering controls (vibration-damped equipment, anti-vibration ' +
        'mounts) → work organisation (reduce exposure duration, job rotation) → ' +
        'maintenance of equipment. Anti-vibration gloves alone do not constitute ' +
        'adequate control.',
      dutyHolders: ['Employer'],
      mandatory: true,
      conditionNote:
        'HAV exposure action value: 2.5 m/s² A(8). HAV exposure limit value: 5 m/s² A(8). ' +
        'WBV exposure action value: 0.5 m/s² A(8). WBV exposure limit value: 1.15 m/s² A(8). ' +
        'At and above the action value, a control programme is mandatory. The limit value ' +
        'must not be exceeded under any circumstances.',
      acopReference: 'L140 paragraphs 56–110 (HAV); L141 paragraphs 56–110 (WBV)',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 6',
      title: 'Health Surveillance',
      summary:
        'Where the risk assessment indicates that there is a risk to health from ' +
        'vibration — for example, where the exposure action value may be reached — ' +
        'the employer must ensure that appropriate health surveillance is provided ' +
        'to employees. For HAV, this includes tiered surveillance: initial screening ' +
        '(questionnaire), followed by referral for clinical evaluation if indicated. ' +
        'HAVS (Hand-Arm Vibration Syndrome) including vibration white finger (VWF) ' +
        'is a reportable industrial disease. Health records must be kept.',
      dutyHolders: ['Employer'],
      mandatory: false,
      conditionNote:
        'Health surveillance is required where employees may be exposed at or above ' +
        'the action value. HAV health surveillance follows a tiered system: ' +
        'Tier 1 (basic screening by trained person), Tier 2 (occupational health nurse), ' +
        'Tier 3 (occupational physician). HAVS is an irreversible condition — once ' +
        'diagnosed, the employee may need to be removed from vibration work.',
      acopReference: 'L140 paragraphs 111–165',
    },
    {
      regulation: 'Reg 7',
      title: 'Information, Instruction and Training',
      summary:
        'Employers must provide adequate information, instruction, and training to ' +
        'employees who are exposed to vibration at work. Information must include: ' +
        'the vibration exposure and associated risk, the technical measures to ' +
        'eliminate or reduce risk, the action and limit values, results of the ' +
        'assessment, how to detect and report health effects, entitlement to health ' +
        'surveillance, and safe working practices to minimise exposure.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L140 paragraphs 166–185',
    },
  ],
  assessmentMethodology:
    'Vibration exposure is expressed as a daily exposure value — A(8) in m/s² — ' +
    'calculated from the vibration magnitude of the equipment and the duration of ' +
    'use. HSE\'s HAVS exposure calculator and the HSE HAVS online tool enable ' +
    'employers to calculate A(8) values from equipment vibration data (from ' +
    'manufacturer\'s declarations, published HSE data, or measurement). The ' +
    'readiness to act point calculator (REACH) helps identify when health ' +
    'surveillance and controls are needed based on estimated exposure.',
  complianceCriteria: [
    'A vibration risk assessment has been carried out identifying HAV and/or WBV exposures',
    'Daily exposure values A(8) have been calculated for all vibration-exposed employees',
    'HAV action value (2.5 m/s² A(8)): control programme is in place',
    'HAV limit value (5 m/s² A(8)): must not be exceeded — immediate action required',
    'WBV action value (0.5 m/s² A(8)): control programme in place for WBV-exposed employees',
    'Health surveillance (HAV: tiered HAVS surveillance) is in place where exposures approach or exceed action values',
    'Exposure reduction priorities: eliminate → substitute lower-vibration equipment → engineering controls → reduce exposure time',
    'Anti-vibration gloves are not presented as an adequate primary control for HAV',
    'Employees know how to recognise and report symptoms of HAVS (tingling, numbness, white finger)',
    'Equipment maintenance programmes are in place to prevent deterioration increasing vibration levels',
  ],
  sourceDocuments: [
    {
      id: 'vibration-si',
      docType: 'primary-legislation',
      title: 'Control of Vibration at Work Regulations 2005',
      publisher: 'legislation.gov.uk',
      url: 'https://www.legislation.gov.uk/uksi/2005/1093/contents/made',
      year: 2005,
      licence: 'ogl-v3',
      currentVersion: true,
      versionDate: '2005-07-06',
    },
    {
      id: 'l140',
      docType: 'hse-guidance',
      title: 'Hand-arm vibration: Control of Vibration at Work Regulations 2005 (L140)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/l140.pdf',
      version: '1st edition',
      year: 2005,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '2005-07-06',
    },
    {
      id: 'l141',
      docType: 'hse-guidance',
      title: 'Whole-body vibration: Control of Vibration at Work Regulations 2005 (L141)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/l141.pdf',
      version: '1st edition',
      year: 2005,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '2005-07-06',
    },
  ],
  validationRules: [
    {
      ruleId: 'VIB-REG-001',
      description: 'HAV and WBV action/limit values must be correctly stated — they are different for each type',
      severity: 'regulatory',
      check: 'no-invented-threshold',
      failureMessage:
        'Content mis-states a vibration action value or limit value, or confuses HAV and WBV values. HAV: action value 2.5 m/s² A(8), limit value 5 m/s² A(8). WBV: action value 0.5 m/s² A(8), limit value 1.15 m/s² A(8).',
      reviewerGuidance:
        'Verify values against Reg 4. HAV and WBV have different scales — do not conflate them. HAV is transmitted through hands and arms (power tools); WBV is transmitted through seat/feet (vehicle/machine driving).',
    },
    {
      ruleId: 'VIB-REG-002',
      description: 'Anti-vibration gloves are not an adequate primary control for HAV',
      severity: 'high',
      check: 'control-hierarchy-correct',
      failureMessage:
        'Content presents anti-vibration gloves as an adequate primary control for hand-arm vibration. Anti-vibration gloves provide limited attenuation only at certain frequencies and do not substitute for engineering controls or reduced exposure time. They are a supplementary measure only.',
      reviewerGuidance:
        'L140 is explicit that anti-vibration gloves are not a reliable primary control. The primary hierarchy is: eliminate the vibrating process → lower-vibration equipment → engineering controls → reduced exposure time. Gloves are a supplementary measure where other controls have been applied.',
    },
    {
      ruleId: 'VIB-REG-003',
      description: 'HAVS is irreversible — once diagnosed, the condition does not improve with continued exposure',
      severity: 'high',
      check: 'correct-legal-standard',
      failureMessage:
        'Content implies HAVS or vibration white finger (VWF) is a reversible condition that improves with rest. HAVS is an irreversible progressive condition — early-stage symptoms may not worsen if exposure ceases, but established HAVS does not reverse. Employees diagnosed with HAVS must be assessed for continued vibration work.',
      reviewerGuidance:
        'Health surveillance for HAV is specifically designed to detect early-stage HAVS so that exposure can be controlled before the condition progresses. Stating or implying that HAVS is reversible is medically incorrect and potentially misleading.',
    },
    {
      ruleId: 'VIB-REG-004',
      description: 'A(8) is a daily exposure value — vibration magnitude and duration are both factors',
      severity: 'medium',
      check: 'correct-legal-standard',
      failureMessage:
        'Content implies the action/limit value is based solely on the vibration magnitude of a tool, without accounting for duration of use. A(8) is the daily personal vibration exposure calculated from both the vibration magnitude AND the time of exposure.',
      reviewerGuidance:
        'A tool with a high vibration magnitude used for only a few minutes may produce a lower A(8) than a tool with moderate vibration used for several hours. Both magnitude and duration must be considered in the exposure calculation.',
    },
    {
      ruleId: 'VIB-REG-005',
      description: 'Jurisdiction is Great Britain only — not UK',
      severity: 'medium',
      check: 'uk-jurisdiction-only',
      failureMessage: 'Control of Vibration at Work Regulations 2005 (SI 2005/1093) apply to Great Britain only.',
      reviewerGuidance:
        'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
    },
  ],
  factCheckSeverityConfig: {
    regulatoryPatterns: [
      'vibration.*regulation',
      'si 2005/1093',
      'hand.arm vibration',
      'whole.body vibration',
      'hav.*regulation',
      'wbv.*regulation',
      'control of vibration',
    ],
    highPatterns: [
      'havs',
      'hand.arm vibration syndrome',
      'vibration white finger',
      'vwf',
      '2.5.*m/s',
      '5.*m/s.*vibration',
      '0.5.*m/s.*wbv',
      '1.15.*m/s',
      'a\\(8\\)',
      'anti.vibration.*glove',
      'vibration.*health surveillance',
    ],
    mediumPatterns: [
      'l140',
      'l141',
      'vibration assessment',
      'tingling.*hands',
      'numbness.*fingers',
      'white finger',
      'angle grinder.*vibration',
      'concrete breaker.*vibration',
    ],
  },
  learningArcStages: [
    'What the Vibration Regulations cover — HAV and WBV: what they are and who is at risk',
    'Vibration exposure values — HAV and WBV action values and limit values in m/s² A(8)',
    'Vibration assessment — calculating A(8) from vibration magnitude and duration of use',
    'Control hierarchy for HAV — eliminate, substitute, engineer, organise, limit exposure time',
    'HAVS — what it is, the stages (tingling → white finger → disability), and why it is irreversible',
    'Health surveillance for HAV — the four-tier system, triggers, and record keeping',
    'Whole-body vibration — causes, health effects (back pain, spine damage), and controls',
    'Training obligations — what vibration-exposed workers must know and do',
  ],
  relatedSchemas: [
    'mhswr-1999',
    'puwer-1998',
    'coshh-2002',
  ],
};
