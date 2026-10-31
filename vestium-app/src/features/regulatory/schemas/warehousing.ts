// ─── Warehousing and Storage — Regulatory Schema ─────────────────────────────
// Sector-specific compilation schema for warehousing, distribution, and storage.
// Statutory foundation: HSWA 1974 s.2 + PUWER 1998 + Workplace Regs 1992.
// Primary sector guidance: HSG76 Warehousing and Storage (2nd edition, 2007).
//
// This schema covers:
//   - Storage racking and shelving inspection duties (PUWER Reg 6 / HSG76)
//   - Person Responsible for Racking Safety (PRRS) appointment (HSG76)
//   - Rack load notices and safe working load posting
//   - Rack damage identification and reporting (green/amber/red system)
//   - Forklift truck (FLT) and powered industrial truck operations
//   - Pedestrian/vehicle traffic segregation (Workplace Regs Reg 17)
//   - Loading bays and dock levellers
//   - Mobile racking systems (PUWER as work equipment)
//
// Source authorities:
//   legislation.gov.uk/uksi/1998/2306 — PUWER 1998 (OGL v3.0)
//   legislation.gov.uk/uksi/1992/3004 — Workplace Regs 1992 (OGL v3.0)
//   HSE HSG76 — Warehousing and Storage (2nd edition, 2007)
//   HSE L22   — Safe Use of Work Equipment ACOP (3rd edition, 2014)

import type { RegulatorySchema } from '../types';

export const WAREHOUSING_STORAGE: RegulatorySchema = {
  id: 'warehousing-storage',
  shortTitle: 'Warehousing & Storage',
  fullTitle: 'Warehousing and Storage — HSG76 / PUWER 1998 / Workplace (Health, Safety and Welfare) Regulations 1992',
  siNumber: 'SI 1998/2306 (PUWER) / SI 1992/3004 (Workplace Regs)',
  year: 1998,
  lastAmended: '2014-01-01',  // L22 (PUWER ACOP) 3rd edition
  jurisdiction: 'great-britain',
  inForce: true,

  applicabilityScope:
    'Applies to all employers and duty holders operating warehouses, distribution centres, ' +
    'storage facilities, goods receiving/despatch areas, and loading bays in Great Britain. ' +
    'The statutory framework is provided by PUWER 1998 (for racking systems used as work ' +
    'equipment, forklifts, conveyor systems, dock levellers, and mobile racking), the ' +
    'Workplace (Health, Safety and Welfare) Regulations 1992 (for traffic routes, ' +
    'pedestrian/vehicle segregation, floors, and welfare), LOLER 1998 (for lifting ' +
    'operations including reach trucks, order pickers, and vehicle hoists), and the ' +
    'Manual Handling Operations Regulations 1992 (for all manual picking, packing, and ' +
    'load-handling operations). HSG76 Warehousing and Storage (2nd edition, 2007) is ' +
    'the primary HSE sector guidance document — its recommendations are taken as the ' +
    'standard of expected practice by HSE inspectors.',

  dutyHolders: [
    'Employer (warehouse operator)',
    'Person Responsible for Racking Safety (PRRS) — appointed by employer',
    'Self-employed person',
    'Person in control of premises (for multi-occupancy DCs)',
  ],

  keyDuties: [
    {
      regulation: 'PUWER Reg 4 / HSG76 §4',
      title: 'Suitability and Installation of Racking Systems',
      summary:
        'Racking and shelving systems used in a warehouse constitute work equipment under ' +
        'PUWER Reg 2(1) and must be suitable for their intended purpose. Employers must ' +
        'ensure that racking is selected for the loads it will carry, installed in ' +
        'accordance with the manufacturer\'s instructions and SEMA Rack Safety code, and ' +
        'that floor loadings are compatible with the racking layout. HSG76 requires that ' +
        'a load notice showing the maximum safe working load (SWL) per bay and per beam ' +
        'level is posted on every racking installation and must not be obscured or removed.',
      dutyHolders: ['Employer', 'Person Responsible for Racking Safety (PRRS)'],
      mandatory: true,
      acopReference: 'L22 paragraphs 69–104; HSG76 Chapter 4',
      penaltyOnBreach:
        'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'PUWER Reg 6 / HSG76 §4.4',
      title: 'Racking Inspection — Competent Person and Frequency',
      summary:
        'Racking systems are subject to PUWER Reg 6 inspection duties because safety ' +
        'depends on installation conditions and deterioration (impact damage) is a ' +
        'foreseeable hazard. HSG76 requires that racking is inspected at suitable intervals ' +
        'by a competent person — HSG76 recommends at least every 12 months for a formal ' +
        'expert inspection, plus regular in-house weekly/monthly visual checks by a ' +
        'person trained to SEMA Rack Inspector or equivalent competence. Inspection records ' +
        'must be kept. Any rack found damaged must be immediately unloaded and either ' +
        'repaired to manufacturer\'s specification or taken out of service.',
      dutyHolders: ['Employer', 'Person Responsible for Racking Safety (PRRS)'],
      mandatory: true,
      conditionNote:
        'The 12-month interval is HSG76 recommendation, not a statutory interval. ' +
        'Risk assessment may require more frequent inspection — e.g., high-traffic ' +
        'warehouses or locations with frequent forklift movements near racking uprights ' +
        'may require monthly formal inspection.',
      acopReference: 'L22 paragraphs 129–160; HSG76 Chapter 4.4',
      penaltyOnBreach:
        'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'HSG76 §4.5',
      title: 'Rack Damage Reporting — Green/Amber/Red System',
      summary:
        'HSG76 recommends a colour-coded rack damage reporting system. Green: rack in ' +
        'good condition — in service. Amber: rack with minor damage within acceptable ' +
        'limits — monitor closely. Red: rack with damage beyond acceptable limits — ' +
        'immediately unload and take out of service, do not reload until repaired and ' +
        'cleared by a competent person. Employers must establish and maintain a written ' +
        'rack damage reporting procedure accessible to all warehouse operatives. Operatives ' +
        'must be trained to identify and report impact damage to uprights, bracing, ' +
        'beams, and beam connectors.',
      dutyHolders: ['Employer', 'Person Responsible for Racking Safety (PRRS)'],
      mandatory: false,
      conditionNote:
        'The green/amber/red system is HSG76 best practice, not a statutory requirement. ' +
        'However, PUWER Reg 5 (maintenance) and Reg 6 (inspection) create a legal ' +
        'obligation to identify and act on deterioration — the colour system is the ' +
        'accepted means of discharging that duty in warehousing.',
      acopReference: 'HSG76 Chapter 4.5',
    },
    {
      regulation: 'Workplace Regs Reg 17 / HSG76 §2',
      title: 'Pedestrian and Vehicle Traffic Segregation',
      summary:
        'Workplace (Health, Safety and Welfare) Regulations 1992 Reg 17 requires that ' +
        'pedestrians and vehicles can circulate in a safe manner — including the ' +
        'organisation of traffic routes so that vehicles and pedestrians can move safely. ' +
        'HSG76 Chapter 2 provides detailed guidance for warehouses: dedicated pedestrian ' +
        'walkways marked by floor markings or physical barriers, separate entrances and ' +
        'exits for pedestrians and forklifts where practicable, speed limits for FLTs ' +
        '(typically 5 mph indoors), and end-of-aisle visibility mirrors or warning systems.',
      dutyHolders: ['Employer', 'Person in control of premises'],
      mandatory: true,
      acopReference: 'L24 paragraphs 101–112; HSG76 Chapter 2',
      penaltyOnBreach:
        'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'PUWER Reg 9 / LOLER Reg 8 / HSG76 §3',
      title: 'Forklift Truck (FLT) Operator Training and Authorisation',
      summary:
        'Forklift trucks are work equipment under PUWER Reg 2(1) and constitute lifting ' +
        'equipment under LOLER Reg 2(1). PUWER Reg 9 requires that FLT operators receive ' +
        'adequate training; HSG76 and the associated L117 guidance require that training ' +
        'is to a nationally recognised standard (e.g., RTITB, ITSSAR, AITT). Operators ' +
        'must hold a valid forklift licence and must be specifically authorised in writing ' +
        'by the employer before operating any FLT. Authorisation must be renewed at ' +
        'intervals determined by the employer\'s risk assessment.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L22 paragraphs 189–200; L117 (Rider-operated lift trucks); HSG76 Chapter 3',
      penaltyOnBreach:
        'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'LOLER Reg 9 / HSG76 §3.4',
      title: 'FLT Thorough Examination — 12-Month Statutory Interval',
      summary:
        'Forklifts used for lifting operations are subject to LOLER Reg 9 thorough ' +
        'examination requirements. All rider-operated FLTs and pedestrian-controlled ' +
        'pallet trucks that lift loads must undergo thorough examination by a competent ' +
        'person at intervals not exceeding 12 months (or 6 months if used to carry persons ' +
        'or where the thorough examination scheme requires it). Examination reports must ' +
        'be retained for at least 2 years. Defects that are immediately dangerous must be ' +
        'reported to the competent authority.',
      dutyHolders: ['Employer'],
      mandatory: true,
      conditionNote:
        'The 12-month interval applies to FLTs not used to carry persons. Where the ' +
        'examination scheme specifies shorter intervals (e.g., 6 months for machines in ' +
        'severe duty cycles), those intervals apply.',
      acopReference: 'L113 paragraphs 110–135; HSG76 Chapter 3.4',
      penaltyOnBreach:
        'Section 33 HSWA 1974 — unlimited fine; imprisonment up to 2 years on indictment',
    },
    {
      regulation: 'Manual Handling Regs / HSG76 §5',
      title: 'Manual Goods Handling — Picking, Packing, and Loading',
      summary:
        'Manual Handling Operations Regulations 1992 require that employers assess the ' +
        'risk from manual handling operations and reduce the risk of injury so far as ' +
        'reasonably practicable. In warehousing, this applies to all picking, packing, ' +
        'palletising, and load-handling operations. HSG76 Chapter 5 provides specific ' +
        'guidance: avoid manual handling of individual units exceeding 25 kg where ' +
        'mechanical handling is available; provide height-adjustable handling equipment ' +
        'at goods-in and despatch; assess repetitive handling tasks against MHOR ' +
        'Assessment Guides.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'L23 paragraphs 1–120; HSG76 Chapter 5',
    },
    {
      regulation: 'HSG76 §2.4 / PUWER Reg 4',
      title: 'Loading Bays and Dock Levellers',
      summary:
        'Loading bays are high-risk areas in warehousing — vehicle restraint or wheel ' +
        'chock systems must prevent vehicle roll-away during loading/unloading. Dock ' +
        'levellers are work equipment under PUWER and must be inspected regularly and ' +
        'maintained in good working order. HSG76 requires edge protection at open loading ' +
        'bays when vehicles are not present, safe means of access for HGV drivers, and ' +
        'clear communication procedures between FLT operators and transport personnel.',
      dutyHolders: ['Employer'],
      mandatory: true,
      acopReference: 'HSG76 Chapter 2.4; L22 paragraphs 69–104',
    },
  ],

  assessmentMethodology:
    'HSE warehousing inspections focus on: (1) racking inspection records, PRRS ' +
    'appointment, and damage reporting procedures; (2) FLT operator authorisation ' +
    'records and LOLER thorough examination certificates; (3) pedestrian/vehicle ' +
    'segregation measures and traffic management arrangements; (4) manual handling ' +
    'assessments for picking and packing operations; (5) rack load notices posted ' +
    'at all bays; (6) dock leveller maintenance records. Inspectors use HSG76 as the ' +
    'benchmark for expected practice. Non-compliance with HSG76 recommendations does ' +
    'not create automatic liability but is treated as evidence of failing to meet the ' +
    'standard of a reasonably practicable employer.',

  complianceCriteria: [
    'A Person Responsible for Racking Safety (PRRS) is appointed in writing',
    'Racking inspected by a competent person at least every 12 months — records kept',
    'Weekly/monthly in-house visual rack inspections conducted and recorded',
    'Rack load notices (SWL per bay and beam level) posted and unobscured on all installations',
    'Rack damage reporting procedure (green/amber/red or equivalent) established and communicated to all operatives',
    'Red-tagged (dangerous) racking is immediately unloaded and isolated from use',
    'FLT operators hold valid nationally recognised licence and written employer authorisation',
    'FLTs and pallet trucks subject to LOLER Reg 9 thorough examination at statutory intervals (≤12 months)',
    'Pedestrian walkways marked and physically separated from FLT aisles where practicable',
    'FLT speed limits (typically 5 mph indoors) established and enforced',
    'Manual handling risk assessment completed for all picking, packing, and goods-handling tasks',
    'Loading bay vehicle restraints or wheel chocks used during all loading/unloading operations',
    'Dock levellers inspected and maintained under PUWER Reg 5 maintenance obligations',
  ],

  controlHierarchy: [
    'Eliminate manual handling — use mechanical handling equipment (FLTs, conveyors, sorters)',
    'Reduce load weights and handling frequencies through layout and task design',
    'Engineering controls — height-adjustable tables, roller conveyors, vacuum lifters',
    'Administrative controls — job rotation, rest periods, picking-quantity limits',
    'PPE — safety footwear, gloves, high-visibility vests for pedestrians in FLT areas',
  ],

  sourceDocuments: [
    {
      id: 'hsg76',
      docType: 'hse-guidance',
      title: 'Warehousing and Storage: A guide to health and safety (HSG76)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/hsg76.pdf',
      version: '2nd edition',
      year: 2007,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '2007-01-01',
    },
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
    {
      id: 'l113',
      docType: 'acop',
      title: 'Safe Use of Lifting Equipment: Approved Code of Practice and guidance (L113)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/l113.pdf',
      version: '1st edition',
      year: 1998,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '1998-01-01',
    },
    {
      id: 'l23',
      docType: 'acop',
      title: 'Manual handling: Manual Handling Operations Regulations 1992 ACOP (L23)',
      publisher: 'hse.gov.uk',
      url: 'https://www.hse.gov.uk/pubns/priced/l23.pdf',
      version: '4th edition',
      year: 2016,
      licence: 'crown-copyright',
      currentVersion: true,
      versionDate: '2016-01-01',
    },
  ],

  validationRules: [
    {
      ruleId: 'WAR-REG-001',
      description: 'Racking inspection intervals must not understate the 12-month benchmark or overstate it as statutory',
      severity: 'high',
      check: 'no-invented-threshold',
      failureMessage:
        'Content states a racking inspection interval that differs from HSG76 guidance. ' +
        'HSG76 recommends formal expert inspection at least every 12 months for static ' +
        'racking, with regular in-house checks (weekly or monthly). The 12-month interval ' +
        'is HSG76 guidance, not a statutory interval — risk assessment may require more ' +
        'frequent inspection.',
      reviewerGuidance:
        'Verify racking inspection intervals against HSG76 Chapter 4.4. The 12-month ' +
        'figure is from HSG76, not PUWER itself — it is the benchmark expected by HSE ' +
        'inspectors. Higher-risk or high-traffic environments may require shorter intervals.',
    },
    {
      ruleId: 'WAR-REG-002',
      description: 'FLT thorough examination under LOLER is statutory at ≤12 months — not merely advisory',
      severity: 'regulatory',
      check: 'no-invented-threshold',
      failureMessage:
        'Content presents the LOLER Reg 9 thorough examination requirement for forklifts ' +
        'as advisory or discretionary. The 12-month maximum interval for FLT thorough ' +
        'examination is a statutory requirement under LOLER 1998 Reg 9 — failure to comply ' +
        'is a criminal offence.',
      reviewerGuidance:
        'LOLER Reg 9 sets a statutory maximum examination interval. For FLTs not carrying ' +
        'persons, this is 12 months. For machines used to carry persons, or where the ' +
        'examination scheme specifies, shorter intervals apply. Verify against L113.',
    },
    {
      ruleId: 'WAR-REG-003',
      description: 'PRRS appointment is HSG76 best practice — not a statutory title',
      severity: 'medium',
      check: 'acop-status-accurate',
      failureMessage:
        'Content implies "Person Responsible for Racking Safety" (PRRS) is a statutory ' +
        'role required by law. PRRS is a role described in HSG76 guidance, not a statutory ' +
        'designation. The legal obligation (PUWER Reg 6, MHSWR Reg 3) requires that racking ' +
        'is inspected by a competent person — the PRRS title is the industry convention for ' +
        'discharging that duty.',
      reviewerGuidance:
        'PRRS is HSG76 terminology for the person the employer nominates to manage racking ' +
        'safety. It is not a legally required title but reflects the PUWER and MHSWR ' +
        'requirement to have a competent person managing the inspection regime.',
    },
    {
      ruleId: 'WAR-REG-004',
      description: 'FLT operators must hold employer written authorisation — not just a licence',
      severity: 'high',
      check: 'duty-holder-accuracy',
      failureMessage:
        'Content implies that holding a forklift licence is sufficient to operate an FLT. ' +
        'Under PUWER Reg 7, use of equipment with specific risks must be restricted to ' +
        'persons given the task of using it. HSG76 and L117 require written employer ' +
        'authorisation in addition to operator training — an untrained operator can hold ' +
        'a licence but must not operate without employer authorisation.',
      reviewerGuidance:
        'Two requirements apply: (1) Operator must have received adequate training ' +
        '(nationally recognised certificate). (2) Employer must have issued written ' +
        'authorisation for that specific type of FLT. Both are required.',
    },
    {
      ruleId: 'WAR-REG-005',
      description: 'Regulation numbers must be accurately attributed — PUWER SI 1998/2306, LOLER SI 1998/2307',
      severity: 'regulatory',
      check: 'no-invented-regulation',
      failureMessage:
        'Generated content contains a PUWER or LOLER regulation citation that does not ' +
        'match SI 1998/2306 (PUWER) or SI 1998/2307 (LOLER). Cross-check all cited ' +
        'regulation numbers against source legislation.',
      reviewerGuidance:
        'PUWER = SI 1998/2306. LOLER = SI 1998/2307. Both are at legislation.gov.uk.',
    },
  ],

  factCheckSeverityConfig: {
    regulatoryPatterns: [
      'loler.*examination',
      'thorough examination.*forklift',
      'puwer.*racking',
      'si 1998/2306',
      'si 1998/2307',
      'workplace.*reg 17',
      'pedestrian.*segregation.*regulation',
    ],
    highPatterns: [
      'rack.*inspection.*12 month',
      'rack.*load.*notice',
      'safe working load.*rack',
      'rack.*out of service',
      'red.*rack',
      'prrs',
      'person responsible.*racking',
      'flt.*authorisation',
      'forklift.*authorisation',
      'dock leveller.*inspection',
      'wheel.*chock.*loading bay',
      'vehicle restraint',
    ],
    mediumPatterns: [
      'warehouse.*hazard',
      'racking.*inspection',
      'forklift.*training',
      'flt.*speed',
      '5 mph.*warehouse',
      'hsg76',
      'sema.*rack',
      'manual.*picking',
      'picking.*task',
      'loading bay',
      'dock leveller',
    ],
  },

  learningArcStages: [
    'The warehousing regulatory framework — HSWA 1974, PUWER, LOLER, Workplace Regs, and HSG76',
    'Storage racking as work equipment — PUWER obligations, suitability, and rack load limits',
    'Racking inspection — PRRS role, competent person requirements, and inspection intervals',
    'Rack damage reporting — the green/amber/red system and out-of-service obligations',
    'Forklift trucks — PUWER training, written authorisation, and LOLER thorough examination',
    'Pedestrian and vehicle segregation — Workplace Regs Reg 17 and HSG76 traffic management',
    'Manual handling in warehousing — picking, packing, and goods-handling risk assessment',
    'Loading bays and dock levellers — vehicle restraints and access safety requirements',
  ],

  relatedSchemas: [
    'mhswr-1999',
    'puwer-1998',
    'loler-1998',
    'manual-handling-1992',
    'workplace-1992',
    'work-at-height-2005',
  ],
};
