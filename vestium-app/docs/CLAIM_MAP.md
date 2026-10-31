# Vestium — Legal Claim Map

> Last audited: 2026-03-07

## Classification Scheme

| Category | Definition | Standard of Proof |
|----------|-----------|-------------------|
| **law** | References specific legislation accurately, or describes a feature enforced at the database/infrastructure level | DB triggers, REVOKE statements, code implementing the stated mechanism |
| **guidance** | Defensible interpretation of implemented behaviour; accurate but not independently enforced | Code path exists and functions correctly |
| **inference** | Reasonable conclusion from the implementation; not explicitly tested or enforced end-to-end | Feature exists but claim extrapolates beyond what's directly measurable |
| **marketing** | Positioning language with no specific legal, technical, or regulatory weight | N/A |

---

## Landing Page (`src/features/learning/LandingPage.tsx`)

| Line | Claim | Classification | Accurate? | Verification |
|------|-------|---------------|-----------|-------------|
| 59-60 | "Not Artificial Intelligence. Auditable Intelligence." | marketing | N/A | Tagline |
| 63 | "Vestium helps teams create governed operational content — modules, SOPs, and RAMS — faster without compromising governance." | marketing | N/A | Product description |
| 64 | "Everything is human-reviewed, signed off, and hash-locked, with timestamped traceability showing who approved what, when, and why." | guidance | TRUE | Attestation table records reviewer name/role/rationale; audit_log.created_at + user_id on every entry; content_hash set at deployment and attestation |
| 67 | "Reviewer sign-off workflow" | law | TRUE | attestations table: reviewer_name, reviewer_role, basis_of_competence, explicit_acceptance; POST blocked if module not in_review |
| 68 | "Locked audit trail" | law | TRUE | WORM enforcement via DB trigger `prevent_audit_log_modification()` + `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log` (schema.sql) |
| 69 | "QR-verifiable certificates" | marketing | PARTIAL | QR code generated in cert PDF (certs.ts); GET /verify/:certNumber endpoint exists but returns basic JSON, not a user-friendly verification page |
| 8 | "regulatory guardrails active throughout" | inference | TRUE | Legal Agent runs as primary pipeline constraint; dual-model fact-check (Anthropic + Gemini); coherence pass; contradiction detection. "Throughout" is an inference — guardrails run at generation time, not at learner delivery time |
| 20 | "Locked audit trail, SHA-256 certificate chain, and named reviewer sign-off. Every decision is timestamped and attributable — ready for HSE inspection." | guidance | TRUE | audit_log is WORM; SHA-256 via createHash('sha256') in jobRunner + certs; attestations record reviewer identity; "ready for HSE inspection" is guidance — no HSE certification exists |
| 40 | "Audit entries are write-once records, protected against later editing or deletion." | law | TRUE | DB trigger `prevent_audit_log_modification()` raises exception on UPDATE/DELETE; REVOKE on table |
| 43-44 | "Release requires named reviewer sign-off, role accountability, and rationale after all findings are closed." | law | TRUE | Attestation blocked if undisposed findings exist; attestation records reviewer_name, reviewer_role, basis_of_competence, explicit_acceptance |
| 111 | "Modules, SOPs, RAMS — governed from draft to deployment" | guidance | TRUE | Status transitions enforced: draft → in_review → deployed; reviewer portal non-bypassable |
| 112 | "Staged learning with competency certificates" | guidance | TRUE | Learner experience has stages; certificates issued on completion with pass/fail threshold |
| 113 | "Locked audit trail + SHA-256 certificate chain" | law | TRUE | Duplicate of above — both implemented |
| 125-126 | "Most platforms can generate learning content. Far fewer can clearly evidence who reviewed it, what changed, and what was ultimately released." | marketing | N/A | Competitive positioning |
| 126 | "Vestium makes that evidence trail part of the standard workflow." | guidance | TRUE | Attestation is mandatory before deployment; audit log records all actions |
| 35-36 | "Designed for regulated operations that need defensible decisions and reliable assurance outcomes, not just completion metrics." | marketing | N/A | Value proposition |
| 169 | "Classification runs across applicable schemas so generated content maps to workplace obligations, not generic topic templates." | guidance | TRUE | regulatory_classification JSONB drives pipeline; 17 schemas in registry |
| 26-31 | 16 regulatory schema names (MHSWR 1999, COSHH 2002, etc.) | law | TRUE | All are real UK legislation; schemas exist in packages/types/src/regulatory/ |
| 219 | "UK Health & Safety evidence workflow for controlled generation, qualified review, and auditable release." | marketing | N/A | Footer tagline |

## Certificates (`apps/api/src/routes/certs.ts`)

| Line | Claim | Classification | Accurate? | Verification |
|------|-------|---------------|-----------|-------------|
| 271 | "MODULE LEGAL ATTESTATION CERTIFICATE" | law | TRUE | Certificate is generated from a structured attestation record (attestations table) |
| 273 | "MHSWR 1999 REGULATION 7 — COMPETENT PERSON REVIEW RECORD" | law | TRUE | This IS the legal positioning; attestation workflow satisfies Reg 7 competent person requirement |
| 280-281 | "...completed review and attestation of the generated module in accordance with documented reviewer disposition workflow." | law | TRUE | Review findings seeded, dispositioned, gated window enforced, attestation recorded |
| 384 | "Immutable issuance record. Hash-linked to attestation and source-version snapshot." | law | TRUE | module_certificates WORM trigger `module_certs_no_delete`; content_hash links to attestation; source_doc_versions JSONB snapshot |
| 482 | "CERTIFICATE OF COMPETENCY" (if passed) / "CERTIFICATE OF PARTICIPATION" (if not) | guidance | TRUE | Standard naming convention; pass/fail determined by score vs pass_threshold |
| 484 | "UK HEALTH AND SAFETY TRAINING EVIDENCE RECORD" | guidance | TRUE | Accurate description of what the certificate records |
| 601 | "Linked to module certificate chain and immutable audit record." | law | TRUE | learner_certificates.module_cert_id FK; audit_log is WORM |

## README (`README.md`)

| Line | Claim | Classification | Accurate? | Verification |
|------|-------|---------------|-----------|-------------|
| 11-12 | "Vestium is what an H&S director shows an HSE inspector to prove who approved what, when, and why." | marketing | N/A | Aspirational positioning |
| 15 | "Reviewer Portal attestation workflow constitutes fulfilment of MHSWR 1999 Reg 7 (competent person documented involvement)." | law | TRUE | Attestation records competent person identity, competence basis, regulatory frameworks reviewed, explicit acceptance. This claim is the core legal thesis. |
| 26 | "WORM Audit Log — Write Once Read Many at DB level; immutable at the database layer, not just application-level append-only" | law | TRUE | DB trigger + REVOKE; verification script exists (`db:verify-worm`) |
| 137 | "No invented legal claims — every regulatory reference traces to a source document in the registry" | guidance | TRUE | Pipeline constraint; regulatory schemas in packages/types; fact-check verifies references. "Every" is guidance — enforcement is probabilistic (AI-generated content) |
| 139 | "Audit log is WORM at DB level — no editing of attestation records; insurance-grade requirement" | law | TRUE (WORM claim); inference ("insurance-grade") | WORM is DB-enforced; "insurance-grade" is an inference — no insurance certification exists |
| 140 | "Certificates are locked at issuance — hash-linked to source document versions at time of generation" | law | TRUE | WORM trigger on module_certificates; source_doc_versions JSONB snapshot; content_hash chain |

## Due Diligence Evidence Chain (`docs/DUE_DILIGENCE_EVIDENCE_CHAIN.md`)

| Line | Claim | Classification | Accurate? | Verification |
|------|-------|---------------|-----------|-------------|
| 10-12 | "Vestium maintains immutable evidence records and a WORM audit trail for every action in the compliance evidence lifecycle." | law | TRUE | audit_log WORM + attestation/cert immutability triggers |
| 12 | "Every module and SOP carries a symmetric SHA-256 content hash chain from generation through attestation to certificate issuance." | law | TRUE | createHash('sha256') at generation (jobRunner), attestation (review.ts), and cert issuance (certs.ts) |
| 21-24 | "What We Don't Claim" transparency section | guidance | TRUE | Accurate self-limitation: operational tables ARE mutable; only evidence chain is immutable |
| 115-116 | "The Reviewer Portal attestation workflow constitutes fulfilment of MHSWR 1999 Regulation 7" | law | TRUE | Core legal thesis; see README entry above |

## Known Gaps

| Claim | Issue | Resolution |
|-------|-------|-----------|
| ~~"versioned"~~ (was LandingPage.tsx:64) | No module versioning exists | Changed to "hash-locked" (accurate); will revert to "versioned" after immutable versioning ships |
| "QR-verifiable certificates" (LandingPage.tsx:69) | Verification endpoint returns JSON, not a user-friendly page | Classify as marketing until verification UX is built |
| "insurance-grade" (README.md:139) | No insurance certification exists | Classify as inference |
| "ready for HSE inspection" (LandingPage.tsx:20) | No HSE endorsement; audit export not yet implemented | Classify as guidance |
