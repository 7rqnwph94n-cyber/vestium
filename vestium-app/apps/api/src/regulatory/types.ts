// ─── Regulatory schema type system ───────────────────────────────────────────
// All content in this module traces to legislation.gov.uk and HSE.gov.uk
// under the Open Government Licence v3.0.

// ─── Source document ─────────────────────────────────────────────────────────

export type DocType =
  | 'primary-legislation'   // The statutory instrument or Act itself
  | 'acop'                  // Approved Code of Practice (has quasi-legal status)
  | 'hse-guidance'          // HSE guidance document (not legally binding but evidential)
  | 'bsi-standard';         // British Standard (referenced in regulation or ACOP)

export type DocumentLicence = 'ogl-v3' | 'crown-copyright' | 'commercial';

export interface RegulatorySourceDocument {
  id: string;                   // e.g. 'mhswr-si', 'l21', 'hsg65'
  docType: DocType;
  title: string;
  publisher: 'legislation.gov.uk' | 'hse.gov.uk' | 'bsigroup.com' | string;
  url: string;                  // canonical URL to source
  version?: string;             // e.g. '5th edition', '3rd edition'
  year: number;                 // publication/last revision year
  licence: DocumentLicence;
  currentVersion: boolean;      // false when superseded — triggers stale flagging
  versionDate: string;          // ISO date of this version, e.g. '2013-01-01'
}

// ─── Regulatory duty ─────────────────────────────────────────────────────────

export interface RegulatoryDuty {
  regulation: string;           // e.g. 'Reg 3', 'Reg 7(1)'
  title: string;                // e.g. 'Risk Assessment'
  summary: string;              // Plain-English summary of the legal duty
  dutyHolders: string[];        // ['Employer', 'Self-employed person']
  mandatory: boolean;           // false = conditional duty
  conditionNote?: string;       // e.g. 'Applies where 5+ employees — must be recorded'
  acopReference?: string;       // e.g. 'L21 paragraphs 15–24'
  penaltyOnBreach?: string;     // e.g. 'Section 33 HSWA 1974 — unlimited fine / imprisonment'
}

// ─── Validation rules ────────────────────────────────────────────────────────

export type RegulatoryFindingSeverity = 'regulatory' | 'high' | 'medium' | 'low';

export interface RegulatoryValidationRule {
  ruleId: string;
  description: string;
  severity: RegulatoryFindingSeverity;
  // 'regulatory' = non-dismissable without recorded rationale in reviewer portal
  check: 'no-invented-regulation' | 'no-invented-threshold' | 'duty-holder-accuracy'
       | 'correct-legal-standard' | 'source-traceable' | 'uk-jurisdiction-only'
       | 'acop-status-accurate' | 'no-numeric-fabrication'
       | 'control-hierarchy-correct' | 'regulatory-interaction';
  failureMessage: string;
  reviewerGuidance: string;     // shown to reviewer in the portal when flagged
}

// ─── Fact-check severity configuration ───────────────────────────────────────

export interface FactCheckSeverityConfig {
  // Claim patterns that must always be flagged at 'regulatory' severity
  // (non-dismissable in reviewer portal without recorded rationale)
  regulatoryPatterns: string[];
  // Patterns that should be flagged 'high' — source verification required
  highPatterns: string[];
  // Patterns that can be flagged 'medium' — reviewable with bulk rationale
  mediumPatterns: string[];
}

// ─── Regulatory schema ───────────────────────────────────────────────────────

export type Jurisdiction =
  | 'great-britain'         // England, Wales, Scotland (most SI instruments)
  | 'england-wales'
  | 'scotland'
  | 'northern-ireland'
  | 'uk';                   // Rare — applies to all four nations

export interface RegulatorySchema {
  id: string;               // e.g. 'mhswr-1999'
  shortTitle: string;       // e.g. 'MHSWR 1999'
  fullTitle: string;        // e.g. 'Management of Health and Safety at Work Regulations 1999'
  siNumber: string;         // e.g. 'SI 1999/3242'
  year: number;
  lastAmended: string;      // ISO date of most recent amendment
  jurisdiction: Jurisdiction;
  inForce: boolean;

  applicabilityScope: string;   // Plain-English scope statement
  dutyHolders: string[];        // Top-level duty holder categories

  keyDuties: RegulatoryDuty[];
  assessmentMethodology: string;    // How compliance is assessed under this regulation
  complianceCriteria: string[];     // Key criteria the training must cover
  controlHierarchy?: string[];      // e.g. for COSHH: elimination, substitution, engineering controls...

  sourceDocuments: RegulatorySourceDocument[];

  validationRules: RegulatoryValidationRule[];
  factCheckSeverityConfig: FactCheckSeverityConfig;

  // Standard learning arc for modules built against this regulation
  learningArcStages: string[];      // e.g. ['Legal framework', 'Duty holder responsibilities', ...]

  relatedSchemas: string[];         // IDs of schemas commonly applied alongside
  incompatibleWith?: string[];      // Schemas that should not be weighted simultaneously
}

// ─── Workplace context ───────────────────────────────────────────────────────

export interface WorkplaceContext {
  industryType: string;         // e.g. 'oil-gas-offshore', 'construction', 'manufacturing'
  industryLabel: string;        // Human-readable label
  operations: string;           // Free text: description of specific operations
  workforceProfile: string;     // Free text: workforce description
  hazardKeywords: string[];     // Selected from checklist: ['chemicals', 'lifting', 'hot-work', ...]
  additionalContext: string;    // Anything else the user adds
}

// ─── Classification result ───────────────────────────────────────────────────

export interface ClassifiedSchema {
  schema: RegulatorySchema;
  weight: number;               // 0–1.0 (1.0 = universally applicable base layer)
  applicabilityReason: string;  // Why this schema applies to this workplace
  mandatoryForContext: boolean; // false = applicable but not definitively required
}

export interface WorkplaceClassificationResult {
  workplaceContext: WorkplaceContext;
  applicableSchemas: ClassifiedSchema[];
  classificationNotes: string;
  primarySchema: ClassifiedSchema;   // highest-weighted schema (always MHSWR for UK)
}
