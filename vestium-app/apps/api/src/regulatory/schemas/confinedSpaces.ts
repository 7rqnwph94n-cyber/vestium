// ─── Confined Spaces Regulations 1997 — Regulatory Schema ─────────────────────
// Confined Spaces Regulations 1997
// SI 1997/1713
//
// Source authorities:
//   legislation.gov.uk/uksi/1997/1713 (Open Government Licence v3.0)
//   HSE L101 — Safe work in confined spaces ACOP (2nd edition, 2014)

import type { RegulatorySchema } from '../types.js';

export const CONFINED_SPACES_1997: RegulatorySchema = {
  id: 'confined-spaces-1997',
  shortTitle: 'Confined Spaces 1997',
  fullTitle: 'Confined Spaces Regulations 1997',
  siNumber: 'SI 1997/1713',
  year: 1997,
  lastAmended: '1997-01-01',
  jurisdiction: 'great-britain',
  inForce: true,
  applicabilityScope:
    'Applies to all workplaces where confined spaces exist or where workers may enter ' +
    'a confined space. A "confined space" is a place which is substantially enclosed ' +
    '(though not necessarily entirely) and where specified risks are present — or are ' +
    'reasonably foreseeable — including: serious injury from hazardous substances or ' +
    'conditions, loss of consciousness from oxygen deficiency or enrichment, ' +
    'drowning from liquid ingress, asphyxiation from free-flowing solid, or loss of ' +
    'consciousness from high temperature. Examples include tanks, vessels, sewers, ' +
    'trenches, silos, boilers, tunnels, and pipe sections. The space being large enough ' +
    'to enter does not make it a confined space — the specified risks determine classification.',
  dutyHolders: [
    'Employer',
    'Self-employed person',
    'Employee (duty to follow safe system of work)',
  ],
  keyDuties: [
    {
      regulation: 'Reg 3',
      title: 'Avoidance of Entry into Confined Spaces',
      summary:
        'Every employer must ensure that no employee enters, or carries out work in, ' +
        'any confined space unless it is not reasonably practicable to achieve the ' +
        'purpose without entering the confined space. Employers must consider whether ' +
        'the task can be accomplished from outside — for example, using CCTV ' +
        'inspection, remotely operated equipment, or extended tools — before authorising ' +
        'any entry.',
      dutyHolders: ['Employer'],
      mandatory: true,
      conditionNote:
        'Avoidance is the primary duty — it takes priority over any operational ' +
        'convenience. The burden is on the employer to demonstrate it is not ' +
        'reasonably practicable to achieve the purpose without entry.',
      acopReference: 'L101 paragraphs 12–28',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 4',
      title: 'Safe System of Work for Entry',
      summary:
        'Where entry into a confined space cannot be avoided, the employer must ensure ' +
        'that a safe system of work is established before any person enters, and that ' +
        'the work is carried out in accordance with that safe system. The safe system ' +
        'must include adequate arrangements for: atmospheric testing and monitoring, ' +
        'ventilation, lighting, communications, entrant equipment (PPE, breathing ' +
        'apparatus if necessary), supervision, and a permit-to-work system.',
      dutyHolders: ['Employer'],
      mandatory: true,
      conditionNote:
        'A permit-to-work system is required for all confined space entry — not just ' +
        'for high-risk spaces. The permit must be signed off by a responsible person ' +
        'before entry begins. Atmospheric testing must be carried out immediately ' +
        'before entry and continuously where conditions can change.',
      acopReference: 'L101 paragraphs 29–105',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Reg 5',
      title: 'Emergency Arrangements',
      summary:
        'Where a confined space entry cannot be avoided, the employer must ensure ' +
        'that adequate arrangements are made before any person enters for rescuing ' +
        'persons in the event of an emergency. Emergency arrangements must specify: ' +
        'what to do in an emergency, the rescue equipment required, who will carry ' +
        'out the rescue, and how the rescue service will be alerted. Arrangements ' +
        'must be tested. Emergency services cannot be relied on as the primary ' +
        'rescue resource — an on-site rescue capability must be in place.',
      dutyHolders: ['Employer'],
      mandatory: true,
      conditionNote:
        'Rescue arrangements must be in place BEFORE entry — not as an afterthought. ' +
        'An entrant must never enter a confined space unless rescue arrangements are ' +
        'already operational. Rescue personnel must be trained and equipped. ' +
        'Non-entry rescue (retrieval by lifeline) is preferred where practicable.',
      acopReference: 'L101 paragraphs 106–145',
      penaltyOnBreach: 'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
  ],
  assessmentMethodology:
    'Confined space assessment must first classify the space (is it a confined space ' +
    'under the Regulations?) and then assess the specific risks present (atmospheric ' +
    'hazards, liquid/solid ingress, temperature). The assessment drives the safe ' +
    'system of work — what atmospheric testing is required, whether breathing ' +
    'apparatus is needed, what PPE is required, what rescue method is appropriate. ' +
    'L101 Appendix 1 provides a risk classification framework: low risk (predictable ' +
    'atmosphere, no liquid, good access) through to high risk (toxic/flammable ' +
    'atmosphere, liquid ingress risk, restricted access).',
  complianceCriteria: [
    'Every confined space has been assessed and classified before any entry is planned',
    'Avoidance of entry has been genuinely considered before a safe system of work is developed',
    'A permit-to-work system is in operation for all confined space entries',
    'Atmospheric testing is carried out immediately before entry and monitored continuously where conditions can change',
    'Rescue arrangements are in place and tested before any entry begins — not after',
    'Emergency services are not the primary rescue resource — on-site rescue capability exists',
    'Entrants, supervisors, and rescue persons are all trained and competent for confined space work',
    'Lifeline and retrieval system are fitted where non-entry rescue is practicable',
    'Standby persons remain outside the confined space throughout the entry',
    'Content does not imply confined spaces are safe once initially tested — conditions can change',
  ],
  sourceDocuments: [
    {
      id: 'confined-si',
      docType: 'primary-legislation',
      title: 'Confined Spaces Regulations 1997',
      publisher: 'legislation.gov.uk',
      url: 'https://www.legislation.gov.uk/uksi/1997/1713/contents/made',
      year: 1997,
      licence: 'ogl-v3',
      currentVersion: true,
      versionDate: '1997-01-28',
    },
    {
      id: 'l101',
      docType: 'acop',
      title: 'Safe work in confined spaces: Approved Code of Practice, Regulations and guidance (L101)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/l101.pdf',
      version: '2nd edition',
      year: 2014,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '2014-01-01',
    },
  ],
  validationRules: [
    {
      ruleId: 'CS-REG-001',
      description: '"Confined space" is defined by the risks present — not by size or shape',
      severity: 'regulatory',
      check: 'correct-legal-standard',
      failureMessage:
        'Content implies a confined space is defined by its physical dimensions or whether it can be entered. The legal definition requires both substantial enclosure AND the presence of specified risks. A large vessel with an oxygen-deficient atmosphere is a confined space; a small cupboard without the specified risks is not.',
      reviewerGuidance:
        'Verify whether the space meets the full definition: substantially enclosed, and has or may have specified risks (hazardous atmosphere, liquid ingress, solid ingress, extreme temperature). Size alone does not determine whether the Regulations apply.',
    },
    {
      ruleId: 'CS-REG-002',
      description: 'Rescue arrangements must be in place before entry — not as a contingency plan after the event',
      severity: 'regulatory',
      check: 'correct-legal-standard',
      failureMessage:
        'Content presents rescue arrangements as a contingency to be arranged if something goes wrong. Under Reg 5, adequate rescue arrangements must be in place and tested BEFORE any person enters the confined space.',
      reviewerGuidance:
        'Rescue is a precondition of entry, not a response option. If rescue arrangements cannot be put in place, entry must not proceed. Review any content that implies rescue is optional or secondary to the entry operation.',
    },
    {
      ruleId: 'CS-REG-003',
      description: 'Atmospheric testing must be conducted immediately before entry and monitored continuously where conditions can change',
      severity: 'high',
      check: 'no-invented-threshold',
      failureMessage:
        'Content implies that atmospheric testing carried out before entry is sufficient for the duration of the entry. Where atmospheric conditions can change (gas ingress, reaction, ventilation failure), continuous monitoring is required throughout the entry.',
      reviewerGuidance:
        'The standard is: test immediately before entry, and monitor throughout where conditions are not completely predictable. A single pre-entry test is insufficient where gas ingress, chemical reaction, or ventilation changes could alter the atmosphere during work.',
    },
    {
      ruleId: 'CS-REG-004',
      description: 'Emergency services may not be relied upon as the primary rescue resource',
      severity: 'high',
      check: 'duty-holder-accuracy',
      failureMessage:
        'Content implies that calling the emergency services constitutes an adequate rescue arrangement. The Confined Spaces Regulations require on-site rescue capability — the fire service or ambulance service cannot be the primary rescue plan for a confined space entry.',
      reviewerGuidance:
        'Emergency services must be notified as part of emergency arrangements, but the primary rescue must be achievable by on-site trained and equipped rescue persons. The time delay in emergency service response makes them unsuitable as the primary rescue resource.',
    },
    {
      ruleId: 'CS-REG-005',
      description: 'Jurisdiction is Great Britain only — not UK',
      severity: 'medium',
      check: 'uk-jurisdiction-only',
      failureMessage: 'Confined Spaces Regulations 1997 (SI 1997/1713) apply to Great Britain only.',
      reviewerGuidance:
        'If the deploying organisation operates in Northern Ireland, verify against equivalent Northern Ireland provisions.',
    },
  ],
  factCheckSeverityConfig: {
    regulatoryPatterns: [
      'confined space.*regulation',
      'si 1997/1713',
      'reg 3.*confined',
      'reg 4.*confined',
      'reg 5.*confined',
      'confined space.*permit',
    ],
    highPatterns: [
      'permit.*confined space',
      'atmospheric testing',
      'oxygen deficiency',
      'oxygen enrichment',
      'rescue.*confined space',
      'standby person',
      'lifeline.*confined',
      'non-entry rescue',
      'breathing apparatus.*confined',
    ],
    mediumPatterns: [
      'l101',
      'confined space assessment',
      'tank entry',
      'vessel entry',
      'sewer entry',
      'toxic atmosphere',
      'gas monitor',
    ],
  },
  learningArcStages: [
    'What is a confined space — the legal definition (risks, not size) and common examples',
    'The hierarchy — avoid entry first, then establish a safe system, then prepare rescue',
    'Risk assessment for confined spaces — atmospheric hazards, ingress risks, and temperature',
    'Safe systems of work — the permit-to-work, atmospheric testing, and PPE requirements',
    'Emergency and rescue arrangements — what must be in place before the first entrant steps in',
    'Non-entry rescue — retrieval by lifeline and when it is and is not appropriate',
    'Atmospheric monitoring — what gases to test for, gas detectors, and continuous monitoring',
    'Competence — entrant, supervisor, and rescue person training requirements',
  ],
  relatedSchemas: [
    'mhswr-1999',
    'coshh-2002',
    'dsear-2002',
  ],
};
