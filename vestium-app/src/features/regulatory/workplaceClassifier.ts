// ─── Workplace classifier ─────────────────────────────────────────────────────
// Classifies a workplace description against the regulatory schema matrix.
// Returns an ordered list of applicable schemas with weights and rationale.
//
// MHSWR 1999 is always weight 1.0 — it is the universal base layer.
// All other schemas are conditional weights based on industry and hazard signals.

import type {
  WorkplaceContext,
  ClassifiedSchema,
  WorkplaceClassificationResult,
  RegulatorySchema,
} from './types';

// ─── Lazy schema loader (keeps ~320 kB of schema data out of studio chunk) ───
let _schemasCache: Record<string, RegulatorySchema> | null = null;

async function loadSchemas(): Promise<Record<string, RegulatorySchema>> {
  if (!_schemasCache) {
    const { ALL_SCHEMAS } = await import('./schemas/allSchemas');
    _schemasCache = ALL_SCHEMAS;
  }
  return _schemasCache;
}

// ─── Schema registry ──────────────────────────────────────────────────────────

interface SchemaStub {
  id: string;
  shortTitle: string;
  fullTitle: string;
  available: boolean;
}

const SCHEMA_REGISTRY: SchemaStub[] = [
  { id: 'mhswr-1999',              shortTitle: 'MHSWR 1999',           fullTitle: 'Management of Health and Safety at Work Regulations 1999',            available: true },
  { id: 'coshh-2002',              shortTitle: 'COSHH 2002',            fullTitle: 'Control of Substances Hazardous to Health Regulations 2002',           available: true },
  { id: 'puwer-1998',              shortTitle: 'PUWER 1998',            fullTitle: 'Provision and Use of Work Equipment Regulations 1998',                 available: true },
  { id: 'loler-1998',              shortTitle: 'LOLER 1998',            fullTitle: 'Lifting Operations and Lifting Equipment Regulations 1998',             available: true },
  { id: 'manual-handling-1992',    shortTitle: 'Manual Handling 1992',  fullTitle: 'Manual Handling Operations Regulations 1992',                          available: true },
  { id: 'dsear-2002',              shortTitle: 'DSEAR 2002',            fullTitle: 'Dangerous Substances and Explosive Atmospheres Regulations 2002',       available: true },
  { id: 'cdm-2015',                shortTitle: 'CDM 2015',              fullTitle: 'Construction (Design and Management) Regulations 2015',                available: true },
  { id: 'ppe-1992',                shortTitle: 'PPE at Work 1992',      fullTitle: 'Personal Protective Equipment at Work Regulations 1992',               available: true },
  { id: 'work-at-height-2005',     shortTitle: 'Work at Height 2005',   fullTitle: 'Work at Height Regulations 2005',                                      available: true },
  { id: 'workplace-1992',          shortTitle: 'Workplace Regs 1992',   fullTitle: 'Workplace (Health, Safety and Welfare) Regulations 1992',              available: true },
  { id: 'dse-1992',                shortTitle: 'DSE Regs 1992',         fullTitle: 'Health and Safety (Display Screen Equipment) Regulations 1992',        available: true },
  { id: 'electricity-at-work-1989',shortTitle: 'Electricity at Work 1989', fullTitle: 'Electricity at Work Regulations 1989',                             available: true },
  { id: 'confined-spaces-1997',    shortTitle: 'Confined Spaces 1997',  fullTitle: 'Confined Spaces Regulations 1997',                                     available: true },
  { id: 'asbestos-2012',           shortTitle: 'Asbestos 2012',         fullTitle: 'Control of Asbestos Regulations 2012',                                 available: true },
  { id: 'noise-2005',              shortTitle: 'Noise 2005',            fullTitle: 'Control of Noise at Work Regulations 2005',                            available: true },
  { id: 'vibration-2005',          shortTitle: 'Vibration 2005',        fullTitle: 'Control of Vibration at Work Regulations 2005',                        available: true },
  { id: 'warehousing-storage',     shortTitle: 'Warehousing & Storage', fullTitle: 'Warehousing and Storage — HSG76 / PUWER 1998 / Workplace Regs 1992',     available: true },
];

// ─── Industry type definitions ────────────────────────────────────────────────

export interface IndustryType {
  id: string;
  label: string;
  keywords: RegExp;
}

export const INDUSTRY_TYPES: IndustryType[] = [
  {
    id: 'oil-gas-offshore',
    label: 'Oil & Gas / Offshore',
    keywords: /oil|gas|offshore|platform|rig|petroleum|refinery|petrochemical|lng|fpso|subsea/i,
  },
  {
    id: 'chemical-process',
    label: 'Chemical / Process Industry',
    keywords: /chemical|process|plant|reactor|solvent|hazardous substance|biohazard|laboratory|pharma|manufacture.*chemical/i,
  },
  {
    id: 'construction',
    label: 'Construction',
    keywords: /construct|demolition|civil engineering|groundwork|building site|scaffolding|excavation|cdm|contractor/i,
  },
  {
    id: 'manufacturing-general',
    label: 'Manufacturing',
    keywords: /manufactur|fabricat|production|assembly|machine shop|factory|plant.*production/i,
  },
  {
    id: 'welding-metal',
    label: 'Welding / Metal Fabrication',
    keywords: /weld|metal fabricat|machining|cutting|grinding|plasma|oxy.*fuel|arc weld|mig|tig|brazing/i,
  },
  {
    id: 'warehouse-logistics',
    label: 'Warehouse / Logistics',
    keywords: /warehouse|distribution|logistics|storage|packing|despatch|forklift|racking|loading dock/i,
  },
  {
    id: 'construction-cdm',
    label: 'Construction (CDM Notifiable)',
    keywords: /notifiable.*project|cdm.*coordinator|principal.*designer|principal.*contractor|f10/i,
  },
  {
    id: 'utilities',
    label: 'Utilities / Energy',
    keywords: /utility|electricity|water treatment|sewage|waste treatment|power station|substation|grid/i,
  },
  {
    id: 'mining-quarrying',
    label: 'Mining / Quarrying',
    keywords: /mine|mining|quarry|quarrying|extraction|coal|minerals|underground/i,
  },
  {
    id: 'healthcare',
    label: 'Healthcare / Social Care',
    keywords: /hospital|clinic|care home|healthcare|social care|medical|nursing|patient|laboratory.*clinical/i,
  },
  {
    id: 'food-production',
    label: 'Food Production',
    keywords: /food.*production|food.*processing|abattoir|bakery|dairy|brewery|food.*manufactur/i,
  },
  {
    id: 'general-office',
    label: 'Office / Professional Services',
    keywords: /office|desk.*work|professional services|finance|legal|insurance|administration/i,
  },
];

// ─── Regulatory weight matrix ─────────────────────────────────────────────────
// Maps industry type IDs and hazard keywords to regulatory schema weights.
// MHSWR is always 1.0. Everything else is conditional.

interface WeightEntry {
  schemaId: string;
  weight: number;
  reason: string;
  mandatory: boolean;
}

const INDUSTRY_WEIGHTS: Record<string, WeightEntry[]> = {
  'oil-gas-offshore': [
    { schemaId: 'dsear-2002',              weight: 0.95, reason: 'Explosive atmosphere hazards are inherent to oil and gas extraction and processing operations', mandatory: true },
    { schemaId: 'coshh-2002',              weight: 0.90, reason: 'Hydrocarbon exposure, H₂S, and process chemicals create significant COSHH obligations', mandatory: true },
    { schemaId: 'loler-1998',              weight: 0.85, reason: 'Lifting operations are extensive in offshore environments — crane operations, personnel transfer', mandatory: true },
    { schemaId: 'puwer-1998',              weight: 0.80, reason: 'Work equipment in oil and gas is safety-critical — pressure systems, rotating machinery, drilling equipment', mandatory: true },
    { schemaId: 'manual-handling-1992',    weight: 0.60, reason: 'Manual handling of equipment and materials in confined or offshore conditions', mandatory: false },
    { schemaId: 'work-at-height-2005',     weight: 0.85, reason: 'Work at height on platforms, masts, derricks, and during maintenance operations on offshore installations', mandatory: true },
    { schemaId: 'ppe-1992',               weight: 0.80, reason: 'Extensive PPE requirements — RPE, chemical suits, hearing protection, and specialist PPE for offshore environments', mandatory: true },
    { schemaId: 'electricity-at-work-1989', weight: 0.85, reason: 'High-voltage and hazardous area electrical systems are safety-critical in oil and gas operations', mandatory: true },
    { schemaId: 'confined-spaces-1997',   weight: 0.90, reason: 'Tanks, vessels, drains, and process equipment — confined space entry is a frequent high-risk activity offshore', mandatory: true },
    { schemaId: 'noise-2005',             weight: 0.75, reason: 'High noise environments from drilling, compressors, and generators on offshore installations', mandatory: false },
    { schemaId: 'workplace-1992',         weight: 0.30, reason: 'Welfare provisions for shore-based facilities — Workplace Regulations do not apply to offshore installations directly', mandatory: false },
  ],
  'chemical-process': [
    { schemaId: 'coshh-2002',             weight: 0.95, reason: 'Chemical exposure is the primary hazard — COSHH applies to all hazardous substances used or generated', mandatory: true },
    { schemaId: 'dsear-2002',             weight: 0.75, reason: 'Many chemical processes involve flammable or explosive substances — DSEAR applies where explosive atmospheres may form', mandatory: false },
    { schemaId: 'puwer-1998',             weight: 0.80, reason: 'Process plant and equipment falls under PUWER — reactors, pipework, pumps, pressure systems', mandatory: true },
    { schemaId: 'loler-1998',             weight: 0.55, reason: 'Lifting equipment in process plants for maintenance and materials handling', mandatory: false },
    { schemaId: 'manual-handling-1992',   weight: 0.65, reason: 'Manual handling of drums, containers, and equipment in chemical environments', mandatory: false },
    { schemaId: 'ppe-1992',              weight: 0.85, reason: 'Chemical PPE — respirators, chemical suits, gloves, eye protection — is extensively used in chemical process environments', mandatory: true },
    { schemaId: 'confined-spaces-1997',  weight: 0.85, reason: 'Reactors, storage tanks, vessels, and pipework — confined space entry is common in chemical plant maintenance', mandatory: true },
    { schemaId: 'noise-2005',            weight: 0.65, reason: 'Pumps, compressors, and process plant generate significant noise in chemical environments', mandatory: false },
    { schemaId: 'workplace-1992',        weight: 0.60, reason: 'Welfare provisions for process plant site offices, control rooms, and amenity buildings', mandatory: false },
  ],
  'construction': [
    { schemaId: 'cdm-2015',              weight: 0.95, reason: 'CDM 2015 applies to all construction projects — duty holders include client, principal designer, principal contractor', mandatory: true },
    { schemaId: 'manual-handling-1992',  weight: 0.85, reason: 'Manual handling is a leading cause of injury in construction — heavy materials, awkward lifts', mandatory: true },
    { schemaId: 'puwer-1998',            weight: 0.80, reason: 'Power tools, access equipment, and plant used in construction are subject to PUWER', mandatory: true },
    { schemaId: 'loler-1998',            weight: 0.70, reason: 'Crane operations, scaffolding, MEWPs, and lifting accessories on construction sites', mandatory: false },
    { schemaId: 'coshh-2002',            weight: 0.65, reason: 'Dust (silica, wood), adhesives, solvents, and cement are COSHH substances commonly found on construction sites', mandatory: false },
    { schemaId: 'work-at-height-2005',   weight: 0.95, reason: 'Work at height is ubiquitous in construction — scaffolding, roof work, MEWPs, ladder use', mandatory: true },
    { schemaId: 'ppe-1992',             weight: 0.75, reason: 'Hard hats, safety boots, high-visibility clothing, and specialist PPE are routinely required on construction sites', mandatory: false },
    { schemaId: 'noise-2005',           weight: 0.80, reason: 'Construction plant, tools, and equipment generate significant noise exposure for workers on site', mandatory: true },
    { schemaId: 'vibration-2005',       weight: 0.85, reason: 'Breakers, compactors, scabblers, and groundwork equipment generate significant HAV and WBV on construction sites', mandatory: true },
    { schemaId: 'asbestos-2012',        weight: 0.85, reason: 'Refurbishment and demolition work commonly disturbs asbestos-containing materials in pre-2000 buildings', mandatory: false },
    { schemaId: 'confined-spaces-1997', weight: 0.65, reason: 'Excavations, trenches, basements, and drainage chambers may constitute confined spaces on construction sites', mandatory: false },
    { schemaId: 'electricity-at-work-1989', weight: 0.70, reason: 'Temporary electrical installations, buried services, and overhead cables present electrical hazards on construction sites', mandatory: false },
    { schemaId: 'workplace-1992',       weight: 0.55, reason: 'Welfare facilities on construction sites — note CDM 2015 Schedule 2 applies to sites; Workplace Regulations apply to site offices', mandatory: false },
  ],
  'construction-cdm': [
    { schemaId: 'cdm-2015',             weight: 1.00, reason: 'CDM notifiable project — duty holder framework fully engaged: client, principal designer, principal contractor', mandatory: true },
    { schemaId: 'manual-handling-1992', weight: 0.85, reason: 'Manual handling obligations as above for construction', mandatory: true },
    { schemaId: 'puwer-1998',           weight: 0.80, reason: 'PUWER obligations as above for construction', mandatory: true },
    { schemaId: 'loler-1998',           weight: 0.75, reason: 'Lifting obligations elevated on large notifiable projects with crane operations', mandatory: false },
    { schemaId: 'coshh-2002',           weight: 0.65, reason: 'COSHH obligations as above for construction', mandatory: false },
    { schemaId: 'work-at-height-2005',  weight: 0.95, reason: 'Work at height obligations elevated on large notifiable projects', mandatory: true },
    { schemaId: 'ppe-1992',            weight: 0.75, reason: 'PPE obligations as above for construction', mandatory: false },
    { schemaId: 'noise-2005',          weight: 0.80, reason: 'Noise obligations as above for construction', mandatory: true },
    { schemaId: 'vibration-2005',      weight: 0.85, reason: 'Vibration obligations elevated on notifiable projects with heavy plant operations', mandatory: true },
    { schemaId: 'asbestos-2012',       weight: 0.90, reason: 'Refurbishment/demolition of existing structures — asbestos survey mandatory as part of pre-construction information', mandatory: true },
    { schemaId: 'confined-spaces-1997', weight: 0.70, reason: 'Confined space obligations as above for construction', mandatory: false },
    { schemaId: 'electricity-at-work-1989', weight: 0.70, reason: 'Electrical obligations as above for construction', mandatory: false },
  ],
  'manufacturing-general': [
    { schemaId: 'puwer-1998',           weight: 0.90, reason: 'Manufacturing relies on machinery and work equipment — PUWER applies to all work equipment', mandatory: true },
    { schemaId: 'manual-handling-1992', weight: 0.80, reason: 'Manual handling of materials, components, and products is a significant hazard in manufacturing', mandatory: true },
    { schemaId: 'loler-1998',           weight: 0.65, reason: 'Overhead cranes, forklifts, and lifting accessories are common in manufacturing environments', mandatory: false },
    { schemaId: 'coshh-2002',           weight: 0.60, reason: 'Lubricants, cutting fluids, dusts, and cleaning chemicals create COSHH obligations', mandatory: false },
    { schemaId: 'noise-2005',           weight: 0.85, reason: 'Manufacturing machinery, presses, and production equipment generate significant noise exposure', mandatory: true },
    { schemaId: 'vibration-2005',       weight: 0.70, reason: 'Power tools and hand-held equipment in manufacturing can cause significant HAV exposure', mandatory: false },
    { schemaId: 'ppe-1992',            weight: 0.70, reason: 'PPE is required for machine operation, chemical handling, and maintenance activities in manufacturing', mandatory: false },
    { schemaId: 'work-at-height-2005',  weight: 0.65, reason: 'Maintenance of plant and equipment in manufacturing frequently involves work at height', mandatory: false },
    { schemaId: 'electricity-at-work-1989', weight: 0.75, reason: 'Industrial electrical systems, control panels, and maintenance of electrical machinery', mandatory: true },
    { schemaId: 'workplace-1992',       weight: 0.65, reason: 'Workplace welfare standards apply to factory offices, canteens, and amenity areas', mandatory: false },
  ],
  'welding-metal': [
    { schemaId: 'coshh-2002',           weight: 0.95, reason: 'Welding fume is a Group 1 carcinogen — COSHH applies directly to all welding and metal cutting operations', mandatory: true },
    { schemaId: 'puwer-1998',           weight: 0.85, reason: 'Welding equipment, grinders, and machine tools are subject to PUWER', mandatory: true },
    { schemaId: 'dsear-2002',           weight: 0.60, reason: 'Flammable gases (acetylene, propane) and solvents in metal fabrication environments may create explosive atmospheres', mandatory: false },
    { schemaId: 'manual-handling-1992', weight: 0.70, reason: 'Handling of heavy metal sections, plate, and fabricated assemblies', mandatory: false },
    { schemaId: 'loler-1998',           weight: 0.55, reason: 'Overhead lifting of heavy fabricated components', mandatory: false },
    { schemaId: 'noise-2005',           weight: 0.85, reason: 'Welding, grinding, and cutting operations generate high noise levels — CNAWR applies directly', mandatory: true },
    { schemaId: 'vibration-2005',       weight: 0.80, reason: 'Angle grinders, disc cutters, and needle guns are high-HAV tools routinely used in metal fabrication', mandatory: true },
    { schemaId: 'ppe-1992',            weight: 0.90, reason: 'Face shields, RPE, hearing protection, and chemical gloves are standard PPE requirements in welding environments', mandatory: true },
  ],
  'warehouse-logistics': [
    { schemaId: 'warehousing-storage',  weight: 0.95, reason: 'Sector-specific compilation schema covering racking inspection, FLT operations, pedestrian segregation, and loading bay safety — directly applicable', mandatory: true },
    { schemaId: 'manual-handling-1992', weight: 0.95, reason: 'Manual handling of goods is the primary activity — the regulation is directly and extensively applicable', mandatory: true },
    { schemaId: 'loler-1998',           weight: 0.85, reason: 'Forklift trucks, pallet trucks, and storage racking lifting operations fall under LOLER', mandatory: true },
    { schemaId: 'puwer-1998',           weight: 0.70, reason: 'Forklifts, conveyor systems, and powered pallet trucks are work equipment under PUWER', mandatory: false },
    { schemaId: 'coshh-2002',           weight: 0.40, reason: 'Battery charging fumes, cleaning chemicals, and potentially hazardous stored goods', mandatory: false },
    { schemaId: 'work-at-height-2005',  weight: 0.55, reason: 'Racking systems, mezzanine floors, and loading bays involve work at height risks in warehousing', mandatory: false },
    { schemaId: 'workplace-1992',       weight: 0.65, reason: 'Welfare provisions for warehouse amenity areas, offices, and rest rooms', mandatory: false },
    { schemaId: 'noise-2005',           weight: 0.55, reason: 'Forklift trucks, conveyor systems, and automated handling equipment generate noise in warehouse environments', mandatory: false },
  ],
  'utilities': [
    { schemaId: 'puwer-1998',           weight: 0.85, reason: 'High-voltage equipment, plant, and process machinery in utilities are subject to PUWER', mandatory: true },
    { schemaId: 'loler-1998',           weight: 0.70, reason: 'Lifting operations in utilities for maintenance and installation of heavy plant', mandatory: false },
    { schemaId: 'coshh-2002',           weight: 0.60, reason: 'Treatment chemicals (chlorine, coagulants), lubricants, and process substances', mandatory: false },
    { schemaId: 'dsear-2002',           weight: 0.55, reason: 'Some utilities processes involve explosive atmosphere risks — gas distribution, certain water treatment', mandatory: false },
    { schemaId: 'electricity-at-work-1989', weight: 0.95, reason: 'Utilities (especially electrical distribution and generation) have high-voltage electrical systems as a core hazard', mandatory: true },
    { schemaId: 'confined-spaces-1997', weight: 0.80, reason: 'Sewage treatment, water mains, cable ducts, and valve chambers present frequent confined space scenarios in utilities', mandatory: true },
    { schemaId: 'work-at-height-2005',  weight: 0.80, reason: 'Tower, pylon, substation, and plant maintenance work involves significant work at height in utilities', mandatory: true },
    { schemaId: 'asbestos-2012',        weight: 0.65, reason: 'Legacy plant rooms, cable insulation, and older equipment in utilities may contain asbestos', mandatory: false },
  ],
  'mining-quarrying': [
    { schemaId: 'manual-handling-1992', weight: 0.75, reason: 'Manual handling of materials in extraction environments', mandatory: false },
    { schemaId: 'puwer-1998',           weight: 0.80, reason: 'Extraction equipment, conveyors, and processing plant', mandatory: true },
    { schemaId: 'loler-1998',           weight: 0.70, reason: 'Winding gear, cranes, and lifting equipment in mining operations', mandatory: false },
    { schemaId: 'coshh-2002',           weight: 0.65, reason: 'Dust exposure (silica, coal dust), lubricants, and explosives handling', mandatory: false },
    { schemaId: 'dsear-2002',           weight: 0.60, reason: 'Flammable and explosive atmospheres are significant hazards in certain mining environments', mandatory: false },
    { schemaId: 'noise-2005',           weight: 0.90, reason: 'Drilling, blasting, crushing, and screening operations in mining and quarrying generate very high noise exposures', mandatory: true },
    { schemaId: 'vibration-2005',       weight: 0.90, reason: 'Drill rigs, jack hammers, and extraction equipment generate high HAV; heavy vehicles generate significant WBV', mandatory: true },
    { schemaId: 'confined-spaces-1997', weight: 0.85, reason: 'Underground workings, mine shafts, and processing vessels create confined space risks in mining', mandatory: true },
    { schemaId: 'ppe-1992',            weight: 0.80, reason: 'Specialist PPE requirements — dust masks, hearing protection, protective footwear, and eye protection in mining environments', mandatory: true },
    { schemaId: 'asbestos-2012',        weight: 0.40, reason: 'Asbestos-bearing minerals and legacy plant in mining — risk varies significantly by mineral type', mandatory: false },
  ],
  'healthcare': [
    { schemaId: 'coshh-2002',           weight: 0.85, reason: 'Biological agents, cytotoxic drugs, disinfectants, and anaesthetic gases create COSHH obligations in healthcare', mandatory: true },
    { schemaId: 'manual-handling-1992', weight: 0.85, reason: 'Patient handling is a major source of musculoskeletal injury in healthcare — regulations apply directly', mandatory: true },
    { schemaId: 'puwer-1998',           weight: 0.60, reason: 'Medical equipment, hoists, and patient handling equipment fall under PUWER', mandatory: false },
    { schemaId: 'loler-1998',           weight: 0.55, reason: 'Patient hoists and lifting equipment used in care settings', mandatory: false },
    { schemaId: 'ppe-1992',            weight: 0.75, reason: 'Clinical PPE — gloves, aprons, respiratory protection — is extensively used in healthcare environments', mandatory: true },
    { schemaId: 'workplace-1992',       weight: 0.65, reason: 'Welfare provisions for hospital staff rooms, rest areas, and office spaces', mandatory: false },
    { schemaId: 'dse-1992',            weight: 0.50, reason: 'Administrative and clinical staff using DSE for patient records and clinical systems', mandatory: false },
    { schemaId: 'asbestos-2012',        weight: 0.50, reason: 'NHS estates and older healthcare buildings frequently contain asbestos — duty to manage applies', mandatory: false },
  ],
  'food-production': [
    { schemaId: 'coshh-2002',           weight: 0.80, reason: 'Cleaning chemicals, disinfectants, food dusts, and refrigerants in food production', mandatory: true },
    { schemaId: 'manual-handling-1992', weight: 0.80, reason: 'Handling of ingredients, products, and packaging in food production environments', mandatory: true },
    { schemaId: 'puwer-1998',           weight: 0.75, reason: 'Food processing machinery — slicers, mixers, conveyors, and packaging equipment', mandatory: true },
    { schemaId: 'loler-1998',           weight: 0.45, reason: 'Lifting equipment for delivery and production operations', mandatory: false },
    { schemaId: 'noise-2005',           weight: 0.75, reason: 'Food processing machinery — slicers, mixers, and packaging lines — generates significant noise exposure', mandatory: true },
    { schemaId: 'ppe-1992',            weight: 0.65, reason: 'Hygiene and safety PPE requirements — ear defenders, cut-resistant gloves, safety footwear — in food production', mandatory: false },
    { schemaId: 'workplace-1992',       weight: 0.65, reason: 'Welfare and temperature provisions for food production facilities and ancillary areas', mandatory: false },
  ],
  'general-office': [
    { schemaId: 'manual-handling-1992', weight: 0.30, reason: 'Manual handling risks are generally low in office environments but may apply for deliveries or facilities work', mandatory: false },
    { schemaId: 'puwer-1998',           weight: 0.25, reason: 'Limited PUWER scope in offices — may apply to specialist equipment', mandatory: false },
    { schemaId: 'dse-1992',            weight: 0.90, reason: 'Office workers using computers as a significant part of their work are DSE users — Regulations fully apply', mandatory: true },
    { schemaId: 'workplace-1992',       weight: 0.85, reason: 'Workplace (Health, Safety and Welfare) Regulations fully apply to office environments', mandatory: true },
  ],
};

// ─── Hazard keyword weights ───────────────────────────────────────────────────
// Additive — boosts weight of relevant schemas based on free-text hazard signals

const HAZARD_WEIGHTS: Array<{
  pattern: RegExp;
  schemaId: string;
  boost: number;
  reason: string;
}> = [
  { pattern: /chemical|substance|solvent|acid|alkali|biohazard|fume/i,                        schemaId: 'coshh-2002',              boost: 0.15, reason: 'Chemical or biological substance hazards identified in workplace description' },
  { pattern: /explosive|flammable|dsear|atex|zone.*\d|zona/i,                                 schemaId: 'dsear-2002',              boost: 0.20, reason: 'Explosive or flammable atmosphere hazards identified' },
  { pattern: /lifting|crane|hoist|sling|shackle|chain.*block|forklift/i,                      schemaId: 'loler-1998',              boost: 0.15, reason: 'Lifting operations or lifting equipment identified' },
  { pattern: /machine|equipment|power tool|plant|conveyor|press|lathe/i,                      schemaId: 'puwer-1998',              boost: 0.10, reason: 'Work equipment or machinery identified' },
  { pattern: /manual handling|heavy lift|carrying|pushing|pulling|musculo/i,                  schemaId: 'manual-handling-1992',    boost: 0.15, reason: 'Manual handling activities identified' },
  { pattern: /construct|demolish|scaffold|excavate|groundwork/i,                              schemaId: 'cdm-2015',                boost: 0.20, reason: 'Construction or demolition activities identified' },
  { pattern: /weld|fume|welding/i,                                                            schemaId: 'coshh-2002',              boost: 0.20, reason: 'Welding operations — COSHH applies to welding fume (Group 1 carcinogen)' },
  { pattern: /work.*at.*height|at.*height.*work|scaffold|roof.*work|fall.*arrest|mewp|elevated.*work.*platform/i, schemaId: 'work-at-height-2005', boost: 0.20, reason: 'Work at height activities identified — Work at Height Regulations apply' },
  { pattern: /ppe|personal protective equipment|respirator.*use|chemical.*gloves|face.*shield|hard.*hat/i,        schemaId: 'ppe-1992',           boost: 0.10, reason: 'PPE identified as a control measure — PPE at Work Regulations obligations apply' },
  { pattern: /electric.*work|live.*working|high.*voltage|switchgear|isolation.*electrical|earth.*bonding/i,       schemaId: 'electricity-at-work-1989', boost: 0.20, reason: 'Electrical work or hazardous electrical environments identified' },
  { pattern: /confined.*space|tank.*entry|vessel.*entry|sewer.*entry|manhole|permit.*to.*work.*entry/i,           schemaId: 'confined-spaces-1997', boost: 0.25, reason: 'Confined space entry identified — Confined Spaces Regulations apply' },
  { pattern: /asbestos|asbestos.*contain|aib|asbestos.*insul|refurb.*asbestos|demolition.*asbestos/i,             schemaId: 'asbestos-2012',       boost: 0.25, reason: 'Asbestos identified as a hazard or concern' },
  { pattern: /noise|hearing.*damage|decibel|dB\(A\)|noisy.*environment/i,                    schemaId: 'noise-2005',              boost: 0.15, reason: 'Noise hazard identified — Noise at Work Regulations apply' },
  { pattern: /vibration|hav|havs|vwf|hand.arm.*vibration|whole.body.*vibration/i,            schemaId: 'vibration-2005',         boost: 0.20, reason: 'Vibration hazard identified — Vibration at Work Regulations apply' },
  { pattern: /display screen|computer.*work|dse|vdu|workstation.*computer/i,                 schemaId: 'dse-1992',               boost: 0.15, reason: 'Display screen equipment use identified' },
  { pattern: /welfare|canteen|rest.*room|changing.*room|washroom/i,                           schemaId: 'workplace-1992',         boost: 0.10, reason: 'Welfare facilities identified — Workplace Regulations apply' },
];

// ─── Classifier ───────────────────────────────────────────────────────────────

export async function classifyWorkplace(context: WorkplaceContext): Promise<WorkplaceClassificationResult> {
  const BUILT_SCHEMAS = await loadSchemas();

  // Build combined search text from all context fields
  const searchText = [
    context.industryType,
    context.industryLabel,
    context.operations,
    context.workforceProfile,
    context.hazardKeywords.join(' '),
    context.additionalContext,
  ].join(' ');

  // Accumulate weights per schema ID
  const weightMap: Record<string, { weight: number; reasons: string[]; mandatory: boolean }> = {};

  const applyWeight = (schemaId: string, weight: number, reason: string, mandatory: boolean) => {
    if (!weightMap[schemaId]) {
      weightMap[schemaId] = { weight: 0, reasons: [], mandatory: false };
    }
    weightMap[schemaId].weight = Math.min(1.0, weightMap[schemaId].weight + weight);
    weightMap[schemaId].reasons.push(reason);
    if (mandatory) weightMap[schemaId].mandatory = true;
  };

  // 1. MHSWR is always 1.0
  applyWeight('mhswr-1999', 1.0, 'Universal base layer — applies to all employers in Great Britain regardless of industry', true);

  // 2. Industry-based weights
  const industryWeights = INDUSTRY_WEIGHTS[context.industryType];
  if (industryWeights) {
    for (const entry of industryWeights) {
      applyWeight(entry.schemaId, entry.weight, entry.reason, entry.mandatory);
    }
  }

  // 3. Hazard keyword boosts from free text
  for (const hazard of HAZARD_WEIGHTS) {
    if (hazard.pattern.test(searchText)) {
      applyWeight(hazard.schemaId, hazard.boost, hazard.reason, false);
    }
  }

  // 4. Build classified schema list — only include schemas with weight > 0.25
  const classified: ClassifiedSchema[] = [];

  for (const [schemaId, entry] of Object.entries(weightMap)) {
    if (entry.weight < 0.25) continue;

    const stub = SCHEMA_REGISTRY.find((s) => s.id === schemaId);
    if (!stub) continue;

    const builtSchema = BUILT_SCHEMAS[schemaId as keyof typeof BUILT_SCHEMAS];
    if (builtSchema) {
      classified.push({
        schema: builtSchema,
        weight: entry.weight,
        applicabilityReason: entry.reasons.join('. '),
        mandatoryForContext: entry.mandatory,
      });
    } else {
      // Fallback stub for any future schemas not yet implemented
      classified.push({
        schema: {
          id: stub.id,
          shortTitle: stub.shortTitle,
          fullTitle: stub.fullTitle,
          siNumber: '',
          year: 0,
          lastAmended: '',
          jurisdiction: 'great-britain',
          inForce: true,
          applicabilityScope: `Schema pending — ${stub.fullTitle}`,
          dutyHolders: [],
          keyDuties: [],
          assessmentMethodology: '',
          complianceCriteria: [],
          sourceDocuments: [],
          validationRules: [],
          factCheckSeverityConfig: { regulatoryPatterns: [], highPatterns: [], mediumPatterns: [] },
          learningArcStages: [],
          relatedSchemas: [],
        },
        weight: entry.weight,
        applicabilityReason: entry.reasons.join('. '),
        mandatoryForContext: entry.mandatory,
      });
    }
  }

  // Sort by weight descending
  classified.sort((a, b) => b.weight - a.weight);

  const primarySchema = classified[0];

  const classificationNotes = buildClassificationNotes(context, classified);

  return {
    workplaceContext: context,
    applicableSchemas: classified,
    classificationNotes,
    primarySchema,
  };
}

function buildClassificationNotes(
  context: WorkplaceContext,
  classified: ClassifiedSchema[]
): string {
  const mandatory  = classified.filter((c) => c.mandatoryForContext && c.schema.id !== 'mhswr-1999');
  const conditional = classified.filter((c) => !c.mandatoryForContext && c.schema.id !== 'mhswr-1999');
  const pending    = classified.filter((c) => !c.schema.siNumber); // No SI number = stub

  const parts: string[] = [
    `Workplace classified as: ${context.industryLabel || context.industryType}.`,
    `MHSWR 1999 applies as the universal base layer.`,
  ];

  if (mandatory.length > 0) {
    parts.push(
      `Mandatory additional schemas: ${mandatory.map((c) => c.schema.shortTitle).join(', ')}.`
    );
  }

  if (conditional.length > 0) {
    parts.push(
      `Conditionally applicable schemas: ${conditional.map((c) => c.schema.shortTitle).join(', ')}.`
    );
  }

  if (pending.length > 0) {
    parts.push(
      `Note: ${pending.map((c) => c.schema.shortTitle).join(', ')} identified as applicable but ` +
      `schema data not yet built.`
    );
  }

  return parts.join(' ');
}

// ─── Detect industry from free text ──────────────────────────────────────────
// Used to help auto-suggest industry type from user-entered operations text.

export function detectIndustryType(text: string): IndustryType | null {
  for (const industry of INDUSTRY_TYPES) {
    if (industry.keywords.test(text)) return industry;
  }
  return null;
}
