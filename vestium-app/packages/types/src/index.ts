// ─── @complianceforge/types ───────────────────────────────────────────────────
// Shared TypeScript types for the API contract between frontend and backend.
// These are the data transfer shapes — not the deep domain types.
// Deep domain types (RegulatorySchema internals etc.) stay in their home package.

// ─── Workplace ────────────────────────────────────────────────────────────────

export interface WorkplaceContextDTO {
  industryType: string;
  industryLabel: string;
  operations: string;
  workforceProfile: string;
  hazardKeywords: string[];
  additionalContext: string;
}

export interface ClassificationSummaryDTO {
  primarySchemaId: string;
  primarySchemaTitle: string;
  applicableSchemas: Array<{
    schemaId: string;
    shortTitle: string;
    weight: number;
    mandatory: boolean;
    pending: boolean;
  }>;
  classificationNotes: string;
}

// ─── Modules ──────────────────────────────────────────────────────────────────

export type ModuleStatus = 'draft' | 'in_review' | 'deployed' | 'stale';

export interface GenerationMetadataDTO {
  runId: string;
  modelId: string;
  schemaVersions: Record<string, string>; // schemaId → SI number / version string
  sourceDocumentIds: string[];
  completedAt: string; // ISO 8601
}

export interface ModuleRecord {
  id: string;
  orgId: string;
  title: string;
  status: ModuleStatus;
  workplaceContext: WorkplaceContextDTO;
  regulatoryClassification: ClassificationSummaryDTO;
  generationMetadata: GenerationMetadataDTO;
  contentHash?: string;    // set at deployment
  deployedAt?: string;     // ISO 8601
  createdAt: string;
  updatedAt: string;
}

export interface CreateModuleRequest {
  title: string;
  workplaceContext: WorkplaceContextDTO;
  regulatoryClassification: ClassificationSummaryDTO;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'generation_started'
  | 'generation_complete'
  | 'generation_failed'
  | 'finding_created'
  | 'finding_disposed'
  | 'findings_seeded'
  | 'attestation_completed'
  | 'module_deployed'
  | 'module_deleted'
  | 'learner_started'
  | 'learner_completed'
  | 'certificate_issued'
  | 'gated_window_opened'
  | 'gated_window_unlocked'
  | 'module_stale_flagged'
  | 'verbal_response_reviewed'
  | 'member_invited'
  | 'member_role_changed'
  | 'member_suspended'
  | 'onboarding_completed'
  | 'content_registered'
  | 'content_status_changed'
  | 'snapshot_created'
  | 'consent_granted'
  | 'consent_revoked'
  | 'data_deletion_requested'
  | 'data_deletion_completed'
  | 'retention_policy_updated'
  | 'retention_cleanup_run'
  | 'audit_pack_generated';

export interface AuditLogEntry {
  id: string;
  orgId: string;
  moduleId?: string;
  userId: string;           // Clerk user ID
  action: AuditAction;
  payload: Record<string, unknown>;
  createdAt: string;        // ISO 8601 — WORM: no updatedAt
}

// ─── Review / Findings ────────────────────────────────────────────────────────

export type FindingSeverity = 'regulatory' | 'high' | 'medium' | 'low';
export type FindingCategory = 'A' | 'B'; // A = Legal Error/Hard Stop, B = Pedagogical/Soft Dismiss
export type FindingDisposition = 'accepted' | 'amended' | 'escalated';

export interface ReviewFinding {
  id: string;
  moduleId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  description: string;
  location: string;        // e.g. "Stage 2, Lesson 1"
  regulatoryRef?: string;  // e.g. "MHSWR 1999 Reg 3(1)"
  disposition?: FindingDisposition;
  dispositionRationale?: string;
  disposedBy?: string;     // Clerk user ID
  disposedAt?: string;
}

// ─── Regulatory Contradictions ────────────────────────────────────────────
// Surfaced when AI assessment conflicts with regulatory reference.
// The reviewer (human-in-the-loop) must resolve these before attestation.

export type ContradictionSource = 'fact-check' | 'semantic-mark' | 'cross-model';

export interface RegulatoryContradiction {
  findingId: string;               // links to ReviewFinding.id
  aiVerdict: string;               // what the AI concluded, e.g. "Pass"
  regulatoryPosition: string;      // what the regulation says
  regulatoryRef: string;           // e.g. "MHSWR 1999 Reg 3(1)"
  confidence: number;              // 0.0–1.0 — AI's confidence in its own verdict
  source: ContradictionSource;     // how the contradiction was detected
  requiresHumanResolution: boolean;
}

// ─── Attestation ──────────────────────────────────────────────────────────────

export interface AttestationRecord {
  id: string;
  moduleId: string;
  reviewerName: string;
  reviewerRole: string;
  basisOfCompetence: string;
  regulatoryFrameworksReviewed: string[];
  explicitAcceptance: string;    // verbatim statement of professional responsibility
  attestedAt: string;
  reviewerUserId: string;        // Clerk user ID
  contentHashAtAttestation: string;
  snapshotVersion?: number;        // links to module_snapshots.version at attestation
}

// ─── Certificates ─────────────────────────────────────────────────────────────

export interface ModuleCertRecord {
  id: string;
  moduleId: string;
  attestationId: string;
  orgId: string;
  certNumber: string;
  contentHash: string;
  sourceDocVersions: Record<string, string>;
  regulatorySchemas: string[];
  moduleTitle: string;
  reviewerName: string;
  reviewerRole: string;
  issuedAt: string;    // ISO 8601
  snapshotVersion?: number;        // links to module_snapshots.version at cert issuance
}

export interface LearnerCertRecord {
  id: string;
  moduleCertId: string;
  moduleId: string;
  orgId: string;
  certNumber: string;
  learnerName: string;
  learnerUserId: string;
  score: number;
  passThreshold: number;
  passed: boolean;
  issuedAt: string;    // ISO 8601
}

export type CertVerificationResult =
  | { type: 'module'; moduleCert: ModuleCertRecord }
  | { type: 'learner'; moduleCert: ModuleCertRecord; learnerCert: LearnerCertRecord };

// ─── Verbal Responses ─────────────────────────────────────────────────────────
// Four-layer evidence chain: audio → transcript (Whisper) → attribution (Claude) → manager disposition.
// audio_data is excluded from API responses (binary, served via GET /:id/audio).

export interface VerbalResponseRecord {
  id: string;
  moduleId: string;
  lessonId: string;
  questionId: string;
  questionPrompt: string;
  regulatoryRef?: string;
  timerSeconds: number;
  learnerUserId: string;
  orgId: string;
  answered: boolean;
  durationMs?: number;
  transcript?: string;
  transcriptModel?: string;
  transcribedAt?: string;
  attributionConfidence?: number;
  attributionReasoning?: string;
  attributionContradictions?: string[];
  attributedAt?: string;
  managerDisposition: 'pending' | 'confirmed' | 'flagged';
  managerUserId?: string;
  managerNote?: string;
  reviewedAt?: string;
  createdAt: string;
}

// ─── Director's View ──────────────────────────────────────────────────────────

export interface DirectorModuleRecord {
  id: string;
  title: string;
  status: 'draft' | 'in_review' | 'deployed' | 'stale';
  deployedAt?: string;
  updatedAt: string;
  createdAt: string;
  primarySchema?: string;
  reviewerName?: string;
  reviewerRole?: string;
  attestedAt?: string;
}

// ─── Org Context ─────────────────────────────────────────────────────────────
// Distilled intelligence from all deployed modules for an org.
// Injected into future generation prompts so each module builds on prior work.

export interface DistilledOrgContextDTO {
  coveredTopics: string[];
  coveredRegulations: string[];
  reviewerCorrections: Array<{
    moduleTitle: string;
    finding: string;
    disposition: 'amended' | 'escalated';
    rationale: string;
    regulatoryRef?: string;
  }>;
  domainInsights: string[];
  moduleSummaries: Array<{
    moduleId: string;
    title: string;
    deployedAt: string;
    stageTopics: string[];
  }>;
}

export interface OrgContextDTO {
  orgId: string;
  workplaceContext: WorkplaceContextDTO;
  distilledContext: DistilledOrgContextDTO;
  modulesDeployed: number;
  lastDistilledAt?: string;
}

// ─── Orgs & Users ─────────────────────────────────────────────────────────────

export type OrgTier = 1 | 2; // 1 = Base, 2 = Audit-Defense

// Clerk role → local role mapping:
//   org:admin       → admin
//   org:hr_manager  → hr_manager
//   org:reviewer    → reviewer
//   org:member / *  → learner
export type OrgRole = 'admin' | 'hr_manager' | 'reviewer' | 'learner';

export interface OrgRecord {
  id: string;
  name: string;
  clerkOrgId: string;
  tier: OrgTier;
  industry?: string;
  workforceSize?: string;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface OrgMemberRecord {
  id: string;
  orgId: string;
  clerkUserId: string;
  email: string;
  name: string;
  role: OrgRole;
  jobTitle?: string;
  department?: string;
  status: 'active' | 'invited' | 'suspended';
  invitedAt?: string;
  joinedAt?: string;
}

// ─── Proxy Asset Library ──────────────────────────────────────────────────────
// ISO 7010 + IEC 60417 safety symbol registry types.

export type AssetStandard = 'iso7010' | 'iec60417';
export type AssetCategory =
  | 'warning'       // W-series — yellow triangle, black symbol
  | 'mandatory'     // M-series — blue circle, white symbol
  | 'prohibition'   // P-series — red circle with diagonal bar
  | 'safe-condition' // E-series — green rectangle
  | 'fire'          // F-series — red rectangle
  | 'equipment';    // IEC 60417 — equipment panel symbols

export interface ProxyAssetRecord {
  id: string;
  symbolCode: string;             // e.g. 'W017', 'M009', '5021'
  standard: AssetStandard;
  category: AssetCategory;
  description: string;            // plain English: 'Electrical hazard'
  tags: string[];                 // for fuzzy matching
  schemaRefs: string[];           // regulatory schema IDs canonically referencing this symbol
  svgUrl: string | null;          // null until OGL SVG file is sourced and hosted
  licence: string;                // 'ogl-v3' | 'commercial'
  attribution: string;            // OGL attribution text — mandatory on display
}

export interface AssetResolveRequest {
  regulatorySchemaIds: string[];   // from regulatoryClassification.applicableSchemas
  hazardTags: string[];            // from workplaceContext.hazardKeywords
  operationType?: string;          // 'isolation', 'inspection', 'emergency', etc.
  limit?: number;                  // max contextual results (default 12)
}

export interface AssetResolveResult {
  canonical: ProxyAssetRecord[];   // schema-canonical symbols — legally tied to the regulation
  contextual: ProxyAssetRecord[];  // hazard-matched symbols — contextually relevant
  attribution: string;             // full OGL attribution text — display with every symbol set
}

// ─── SOPs ─────────────────────────────────────────────────────────────────────

export type SopStatus = 'draft' | 'in_review' | 'deployed' | 'stale';

export type SopDocType =
  | 'operator_manual'
  | 'maintenance_schedule'
  | 'risk_assessment'
  | 'coshh_datasheet'
  | 'other';

export interface SopRecord {
  id: string;
  orgId: string;
  moduleId?: string;          // null for standalone SOP
  title: string;
  procedureName: string;
  equipment: string;
  status: SopStatus;
  workplaceContext: WorkplaceContextDTO;
  regulatoryClassification: ClassificationSummaryDTO;
  generationMetadata: Record<string, unknown>;
  contentHash?: string;
  deployedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SopSourceDocRecord {
  id: string;
  sopId: string;
  filename: string;
  docType: SopDocType;
  pageCount?: number;
  fileSize?: number;
  uploadedAt: string;
}

export interface SopReviewFinding {
  id: string;
  sopId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  description: string;
  location: string;
  regulatoryRef?: string;
  sourceAttribution?: string;    // set when finding is an unattributed procedural claim
  disposition?: FindingDisposition;
  dispositionRationale?: string;
  disposedBy?: string;
  disposedAt?: string;
  createdAt: string;
}

export interface SopAttestationRecord {
  id: string;
  sopId: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerRole: string;
  basisOfCompetence: string;
  regulatoryFrameworksReviewed: string[];
  explicitAcceptance: string;
  contentHashAtAttestation: string;
  attestedAt: string;
}

// ─── Content Registry (v2 Governance Layer) ─────────────────────────────────

export type ContentType = 'module' | 'sop' | 'rams' | 'permit' | 'toolbox_talk' | 'qr_pack';

export interface ContentRegistryDTO {
  id: string;
  contentType: ContentType;
  orgId: string;
  title: string;
  status: 'draft' | 'in_review' | 'deployed' | 'stale';
  contentHash?: string;
  sourceEntityId: string;
  deployedAt?: string;
  createdAt: string;
}

// ─── Governed Findings (generic) ─────────────────────────────────────────────

export interface GovernedFinding {
  id: string;
  registryId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  description: string;
  location: string;
  regulatoryRef?: string;
  sourceAttribution?: string;
  disposition?: FindingDisposition;
  dispositionRationale?: string;
  disposedBy?: string;
  disposedAt?: string;
  createdAt: string;
}

// ─── Governed Attestation (generic) ──────────────────────────────────────────

export interface GovernedAttestation {
  id: string;
  registryId: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerRole: string;
  basisOfCompetence: string;
  regulatoryFrameworksReviewed: string[];
  explicitAcceptance: string;
  contentHashAtAttestation: string;
  attestedAt: string;
}

// ─── Governed Certificate (generic) ──────────────────────────────────────────

export interface GovernedCertificate {
  id: string;
  registryId: string;
  attestationId: string;
  orgId: string;
  certNumber: string;
  contentHash: string;
  sourceDocVersions: Record<string, string>;
  regulatorySchemas: string[];
  contentTitle: string;
  reviewerName: string;
  reviewerRole: string;
  issuedAt: string;
}

// ─── RAMS/SSOW ──────────────────────────────────────────────────────────────

export type RamsStatus = 'draft' | 'in_review' | 'deployed' | 'stale';

export type RamsDocType =
  | 'risk_assessment'
  | 'method_statement'
  | 'coshh_datasheet'
  | 'permit_to_work'
  | 'equipment_manual'
  | 'other';

export interface RamsRecord {
  id: string;
  orgId: string;
  title: string;
  taskDescription: string;
  location: string;
  equipment: string[];
  status: RamsStatus;
  workplaceContext: WorkplaceContextDTO;
  regulatoryClassification: ClassificationSummaryDTO;
  generationMetadata: Record<string, unknown>;
  contentHash?: string;
  deployedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RamsSourceDocRecord {
  id: string;
  ramsId: string;
  filename: string;
  docType: RamsDocType;
  pageCount?: number;
  fileSize?: number;
  uploadedAt: string;
}

/** Single hazard entry in the structured hazard matrix. */
export interface RamsHazardEntry {
  id: string;
  hazard: string;
  activity: string;
  personsAtRisk: string[];
  initialLikelihood: number;   // 1–5
  initialSeverity: number;     // 1–5
  initialRiskScore: number;    // L × S
  controls: string[];
  regulatoryBasis: string[];
  residualLikelihood: number;
  residualSeverity: number;
  residualRiskScore: number;
  sourceRef?: string;          // source doc attribution
}

// ─── API response envelope ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export interface PaginatedApiSuccess<T> {
  ok: true;
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Module Snapshots (Versioning) ───────────────────────────────────────────

export interface ModuleSnapshotSummary {
  id: string;
  moduleId: string;
  version: number;
  contentHash: string;
  triggerEvent: 'generation_complete' | 'attestation' | 'redeployment';
  createdBy: string;
  createdAt: string;
}

export interface ModuleSnapshotFull extends ModuleSnapshotSummary {
  content: unknown;
}

export interface SnapshotDiffEntry {
  path: string;
  op: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

// ─── Privacy & Consent ───────────────────────────────────────────────────────

export type ConsentType = 'audio_capture' | 'transcript_storage' | 'data_processing' | 'certificate_issuance';

export interface ConsentRecord {
  id: string;
  userId: string;
  orgId: string;
  consentType: ConsentType;
  consentVersion: string;
  granted: boolean;
  grantedAt: string;
  revokedAt?: string;
}

export interface DataRetentionPolicy {
  audioRetentionDays: number;
  transcriptRetentionDays: number;
}

export interface DataDeletionRequest {
  id: string;
  targetUserId: string;
  requestedBy: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scope: string[];
  completedAt?: string;
  createdAt: string;
}

export interface PrivacyReportEntry {
  userId: string;
  verbalResponseCount: number;
  audioRecordingsCount: number;
  transcriptCount: number;
  certificateCount: number;
}
