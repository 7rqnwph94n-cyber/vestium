// ─── Proxy Asset Mapper ────────────────────────────────────────────────────────
// Static, version-controlled mappings from UK H&S regulatory schema IDs and
// hazard keywords to ISO 7010 / IEC 60417 symbol codes.
//
// These mappings are the "legally tied" layer of the Proxy Asset Library:
// they encode which internationally-mandated safety symbols are canonically
// required to be understood by duty-holders under each UK Statutory Instrument.
//
// ISO 7010 symbols: Crown Copyright, Open Government Licence v3.0.
//   OGL attribution: "Contains public sector information licensed under the
//   Open Government Licence v3.0 (Health & Safety Executive / legislation.gov.uk)"
//
// IEC 60417 symbols: commercial licence — metadata and symbol codes only.
//   No SVG content is embedded; codes reference the IEC 60417 database directly.
//
// Scoring (used by assetFetcher.ts):
//   Schema-canonical match:  +3 per schema that canonically references the code
//   Hazard-tag match:        +2 per hazard tag that references the code

// ─── Schema → canonical symbol codes ─────────────────────────────────────────
//
// Each entry lists the ISO 7010 / IEC 60417 codes that a duty-holder working
// under that Statutory Instrument must be able to recognise as part of their
// competency under MHSWR Reg 7.

export const SCHEMA_CANONICAL_ASSETS: Record<string, string[]> = {
  // MHSWR 1999 — overarching management framework
  // General safety management, competent persons, risk assessment
  'mhswr-1999': [
    'M001',   // General mandatory action (follow safe system of work)
    'E001',   // First aid (Reg 7 competent person + first-aider provision)
    'E009',   // Assembly point
  ],

  // COSHH 2002 — chemical hazards
  'coshh-2002': [
    'W011',   // Harmful / irritant material
    'W012',   // Corrosive substance
    'W005',   // Oxidizing substance (fire/explosion risk from oxidisers)
    'M006',   // Wear protective gloves
    'M010',   // Wear respiratory protective equipment
    'E007',   // Emergency eyewash
    'E008',   // Emergency shower
  ],

  // PUWER 1998 — work equipment safety
  'puwer-1998': [
    'W010',   // Automatic start-up (machinery may restart without warning)
    'P007',   // Do not touch (dangerous moving parts)
    'M002',   // Read instructions / consult operator manual
    '5007',   // IEC 60417: ON (power)
    '5008',   // IEC 60417: OFF (power)
  ],

  // LOLER 1998 — lifting equipment
  'loler-1998': [
    'W007',   // Overhead load (danger from suspended loads)
    'W008',   // Suspended load (do not pass under)
  ],

  // Manual Handling Operations Regulations 1992
  'manual-handling-1992': [
    'W007',   // Overhead load / awkward load warning
    'M006',   // Wear protective gloves (sharp edges, thermal)
  ],

  // DSEAR 2002 — dangerous substances, explosive atmospheres
  'dsear-2002': [
    'W001',   // Flammable material / fire hazard
    'W002',   // Explosive material
    'P001',   // No smoking
    'P002',   // No naked flame / no open fire
    'F001',   // Fire extinguisher (general)
  ],

  // CDM 2015 — construction design and management
  'cdm-2015': [
    'W009',   // Industrial vehicles / forklift trucks on site
    'W019',   // Falling hazard (unprotected edges, excavations)
    'M005',   // Wear safety helmet / hard hat
    'M020',   // Wear high-visibility vest
    'P006',   // No access for pedestrians (plant operating area)
  ],

  // PPE at Work Regulations 1992
  'ppe-1992': [
    'M003',   // Wear eye protection
    'M004',   // Wear foot protection (safety boots/shoes)
    'M005',   // Wear head protection
    'M006',   // Wear protective gloves
    'M007',   // Wear body protection (coverall)
    'M008',   // Wear face protection (full-face shield)
    'M009',   // Wear hearing protection
    'M010',   // Wear respiratory protection
  ],

  // Work at Height Regulations 2005
  'work-at-height-2005': [
    'W019',   // Falling hazard
    'M011',   // Wear safety harness / safety belt
    'M017',   // Use handrail
    'M018',   // Wear safety harness / fall-arrest equipment
  ],

  // Workplace (Health, Safety and Welfare) Regulations 1992
  'workplace-1992': [
    'W018',   // Slipping hazard
    'W013',   // Extreme temperature hazard (hot/cold surfaces)
    'E001',   // First aid
    'E009',   // Assembly point
  ],

  // Display Screen Equipment Regulations 1992
  // Limited ISO 7010 coverage — DSE is primarily an ergonomic/assessment regulation
  'dse-1992': [
    'M001',   // Follow safe system of work / follow workstation setup procedure
    'M002',   // Read instructions (workstation adjustment guidance)
  ],

  // Electricity at Work Regulations 1989
  'electricity-at-work-1989': [
    'W017',   // Electrical hazard (lightning bolt in triangle) — the most critical
    'W021',   // High voltage (skull and crossbones under voltage arc)
    'W042',   // Electric arc flash hazard
    'M012',   // Disconnect before servicing (isolate power supply)
    'M025',   // Isolate from ALL power sources (lockout/tagout)
    'M013',   // Earth / ground connection required
    '5021',   // IEC 60417: Dangerous voltage symbol
    '5172',   // IEC 60417: Caution, risk of electric shock
  ],

  // Confined Spaces Regulations 1997
  'confined-spaces-1997': [
    'W022',   // Compressed gas / pressurised vessel (asphyxiation risk)
    'W011',   // Harmful / toxic atmosphere
    'M010',   // Wear respiratory protective equipment
    'M011',   // Wear safety harness (rescue retrieval system)
    'P003',   // No access for unauthorised persons
  ],

  // Control of Asbestos Regulations 2012
  'asbestos-2012': [
    'W011',   // Harmful / toxic material (asbestos fibres are carcinogenic)
    'W014',   // Biohazard / carcinogen warning
    'M010',   // Wear respiratory protective equipment (mandatory for asbestos work)
    'M007',   // Wear protective clothing (disposable coverall)
    'P003',   // No access for unauthorised persons (exclusion zone)
  ],

  // Control of Noise at Work Regulations 2005
  'noise-2005': [
    'W087',   // Noise hazard — high sound levels risk hearing damage (ISO 7010 W087)
    'M009',   // Wear hearing protection (mandatory at upper action value)
  ],

  // Control of Vibration at Work Regulations 2005
  'vibration-2005': [
    'M006',   // Wear protective gloves (anti-vibration gloves for HAV)
    // No dedicated ISO 7010 vibration warning symbol exists in BS EN ISO 7010:2020
  ],

  // Warehousing and Storage (HSG76 / PUWER / Workplace Regs / LOLER)
  'warehousing-storage': [
    'W009',   // Industrial vehicles / forklift trucks
    'W007',   // Overhead / suspended load (racking collapse, FLT lifting)
    'W019',   // Falling hazard (mezzanine floors, loading bays)
    'P008',   // Do not enter — vehicles operating
    'M004',   // Wear safety footwear (mandatory in FLT operating areas)
    'M020',   // Wear high-visibility vest (pedestrians in FLT aisles)
  ],
};

// ─── Hazard keyword → contextual symbol codes ─────────────────────────────────
//
// Maps the hazardKeywords from WorkplaceContext to relevant symbol codes.
// These are "contextual" rather than canonical — they enrich the asset set
// based on the specific workplace hazards reported by the user.

export const HAZARD_TAG_ASSETS: Record<string, string[]> = {
  'chemicals':          ['W011', 'W012', 'W005', 'M006', 'M010', 'E007'],
  'fire':               ['W001', 'P001', 'P002', 'F001', 'F002', 'F007', 'E001'],
  'explosion':          ['W002', 'P001', 'P002'],
  'electrical':         ['W017', 'W021', 'W042', 'M012', 'M025', '5021'],
  'high-voltage':       ['W017', 'W021', 'W042', '5021', '5172'],
  'isolation':          ['M012', 'M025', '5007', '5008', '5036'],
  'lifting':            ['W007', 'W008'],
  'hot-work':           ['W001', 'W013', 'P001', 'P002', 'M019', 'M008'],
  'working-at-height':  ['W019', 'M011', 'M018'],
  'noise':              ['W087', 'M009'],
  'vibration':          ['M006'],
  'confined-spaces':    ['W022', 'W011', 'M010', 'P003'],
  'asbestos':           ['W011', 'W014', 'M010', 'M007'],
  'manual-handling':    ['W007', 'M006'],
  'machinery':          ['W010', 'P007', 'M002'],
  'vehicles':           ['W009', 'P008', 'P006'],
  'radiation':          ['W003', 'W004', 'M003'],
  'pressure':           ['W022', 'W026'],
  'ppe':                ['M003', 'M004', 'M005', 'M006', 'M007', 'M008', 'M009', 'M010'],
  'construction':       ['W009', 'W019', 'M005', 'M020'],
  'slipping':           ['W018'],
  'temperature':        ['W013', 'W028'],
  'coshh':              ['W011', 'W012', 'W005', 'M010', 'M006'],
  'dust':               ['W011', 'M010', 'M008'],
  'gas':                ['W001', 'W002', 'W022', 'P001', 'P002'],
  'battery':            ['W001', 'W017', '5001', '5002'],
  'bess':               ['W001', 'W017', 'W021', 'M025', '5021'],
  'welding':            ['W001', 'W003', 'W004', 'M019', 'M008', 'M006', 'M010'],
  'excavation':         ['W019', 'W007', 'M005', 'P006'],
  'forklift':           ['W009', 'P008', 'P006'],
  'ladder':             ['W019', 'M017', 'M011'],
  'roof':               ['W019', 'M011', 'M018', 'M005'],
  'scaffold':           ['W019', 'M011', 'M005', 'M020'],
  'emergency':          ['E001', 'E002', 'E007', 'E008', 'E009'],
};

// ─── OGL attribution text ─────────────────────────────────────────────────────
// Must be displayed wherever ISO 7010 symbols are shown.

export const OGL_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0. ' +
  'ISO 7010 safety symbols: © Crown Copyright (Health & Safety Executive / legislation.gov.uk). ' +
  'IEC 60417 equipment symbols: © IEC, Geneva, Switzerland (commercial licence — metadata reference only).';
