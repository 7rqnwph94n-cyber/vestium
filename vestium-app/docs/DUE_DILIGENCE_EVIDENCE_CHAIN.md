# Vestium — Evidence Chain & Data Integrity Due Diligence Sheet

> **Version:** 1.0 | **Date:** 2026-03-06 | **Classification:** Pre-Sales / Investor / Insurer Audience
>
> This document describes the technical controls Vestium implements to ensure governed-content traceability, evidentiary record integrity, and audit defensibility under UK Health & Safety enforcement.

---

## 1. What We Claim

Vestium maintains **immutable evidence records** and a **WORM audit trail** for every action in the compliance evidence lifecycle. Every module and SOP carries a **symmetric SHA-256 content hash chain** from generation through attestation to certificate issuance.

### What this means in practice

- Every generated module and SOP is fingerprinted at creation with a SHA-256 hash
- That hash is carried through human review, attestation, and certificate issuance
- If a single character of content changed between generation and attestation, the hash breaks
- The audit trail is write-once — no application code, database user, or admin panel can edit or delete entries
- Attestation records, certificates, and audit entries are locked at the database engine level, not just in application code

### What we do NOT claim

- The entire database is not immutable — operational tables (modules, review findings, SOP records) are intentionally stateful. They have status fields, updated_at timestamps, and lifecycle transitions. This is normal and expected.
- The immutability controls apply specifically to the **evidence chain**: audit log, attestations, and certificates.

---

## 2. Symmetric SHA-256 Content Hash Chain

Both modules and SOPs follow the same cryptographic evidence chain:

```
Generation                  Human Review               Certificate
──────────                  ────────────               ───────────
Content assembled     →     Reviewer attests      →    Certificate issued
SHA-256 computed            Hash carried forward        Hash embedded in cert
Stored on record            Stored on attestation       Stored on certificate
```

### Module chain

| Stage | Hash location | Column |
|-------|--------------|--------|
| Generation complete | `modules.content_hash` | SHA-256 of assembled module content (all pipeline step outputs) |
| Attestation | `attestations.content_hash_at_attestation` | Hash carried from module at time of attestation |
| Module certificate | `module_certificates.content_hash` | Attestation hash preferred; falls back to module hash |
| Learner certificate | Links to `module_certificates.id` | Inherits module cert's hash by reference |

### SOP chain

| Stage | Hash location | Column |
|-------|--------------|--------|
| Generation complete | `sop_records.content_hash` | SHA-256 of assembled SOP draft content |
| Attestation | `sop_attestations.content_hash_at_attestation` | Hash carried from SOP at time of attestation |

### No weak fallbacks

If a module or SOP lacks a content hash (e.g. generated before this feature), the certificate endpoint returns a hard error (`409 Conflict`) and requires regeneration. There is no fallback to a weaker hash. This is a deliberate design choice — a broken chain is worse than no chain.

---

## 3. WORM Audit Trail

The `audit_log` table is Write Once Read Many (WORM) at the database engine level.

### Controls

| Control | Mechanism | Verification |
|---------|-----------|-------------|
| No mutation column | `audit_log` has no `updated_at` — structurally cannot track edits | `verifyWorm.ts` check 1 |
| Trigger lock (UPDATE) | `BEFORE UPDATE` trigger raises exception: *"audit_log is immutable"* | `verifyWorm.ts` check 3 |
| Trigger lock (DELETE) | `BEFORE DELETE` trigger raises exception: *"audit_log is immutable"* | `verifyWorm.ts` check 3 |
| Permission revocation | `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC` | `verifyWorm.ts` check 4 |
| Insert-only application code | `writeAuditLog()` is a single `INSERT` function — no UPDATE path exists | Code review |

### What gets logged

Every platform action that touches a module or SOP: generation start/complete/fail, finding disposition, gated window unlock, attestation, deployment, certificate issuance, learner completion, member invitation, role changes. Each entry captures:

- `org_id`, `module_id` (soft reference — survives module deletion)
- `user_id` (Clerk authentication ID)
- `user_role` (role at time of action — admin, hr_manager, reviewer, learner)
- `action` (typed union — no free-text)
- `payload` (structured JSON — action-specific metadata)
- `created_at` (server timestamp, not client-supplied)

---

## 4. Immutable Evidentiary Records

Beyond the audit log, four tables containing legal artefacts are protected with the same WORM pattern:

| Table | Contents | Controls |
|-------|----------|----------|
| `attestations` | Module reviewer attestation — name, role, basis of competence, regulatory frameworks reviewed, explicit acceptance declaration, content hash at attestation time | Trigger-locked + permission-revoked |
| `sop_attestations` | SOP reviewer attestation — same structure as module attestation | Trigger-locked + permission-revoked |
| `module_certificates` | Module deployment certificate — cert number, content hash, source document versions, regulatory schemas, reviewer identity | Trigger-locked + permission-revoked |
| `learner_certificates` | Individual completion certificate — links to module cert, learner identity, score, pass/fail | Trigger-locked + permission-revoked |

### Controls on each table

- `BEFORE UPDATE` trigger → raises exception: *"[table] is immutable: UPDATE and DELETE are not permitted"*
- `BEFORE DELETE` trigger → same
- `REVOKE UPDATE, DELETE, TRUNCATE FROM PUBLIC`
- No `updated_at` column on attestation tables (certificates use `issued_at` only)

### Shared trigger function

All four tables use `prevent_evidentiary_record_modification()` — a single PostgreSQL function that raises an exception naming the specific table being violated. This is intentional: one function, auditable in one place, referenced by eight triggers.

---

## 5. Non-Bypassable Human Review Gate

The Reviewer Portal attestation workflow constitutes fulfilment of **MHSWR 1999 Regulation 7** (competent person appointment and documented involvement).

### Controls

| Control | Description |
|---------|-------------|
| Finding disposition required | Every auto-seeded finding must have a recorded disposition (accepted/amended/escalated) before deployment is unlocked |
| Category A gated window | Regulatory-severity findings require a **mandatory reading timer** (`word_count / 200 * 60` seconds) + cognitive check question before disposition is allowed |
| Backend gate verification | The disposition API checks the WORM audit trail for a `gated_window_unlocked` entry before accepting Cat A dispositions — cannot be bypassed by API calls |
| Structured attestation | Not a checkbox. Captures: reviewer name, professional role, basis of competence, regulatory frameworks reviewed against, and a verbatim explicit acceptance of professional responsibility |
| Attestation is one-way | Once attested, the attestation record is trigger-locked. Module status moves to `deployed`. No undo mechanism exists. |

---

## 6. Automated Verification

The WORM controls are verified programmatically via `verifyWorm.ts` — a standalone script that checks 28 conditions against the live database:

```
pnpm --filter @complianceforge/api run db:verify-worm
```

### Checks performed

1. `audit_log` has no `updated_at` column
2. `prevent_audit_log_modification()` trigger function exists
3. `audit_log_no_update` and `audit_log_no_delete` triggers exist
4. `PUBLIC` has no UPDATE/DELETE/TRUNCATE on `audit_log`
5. `prevent_evidentiary_record_modification()` trigger function exists
6. UPDATE and DELETE triggers exist on all 4 evidentiary tables (8 checks)
7. `PUBLIC` has no UPDATE/DELETE/TRUNCATE on all 4 evidentiary tables (12 checks)

**Exit code 0** = all 28 checks pass. **Exit code 1** = at least one failure, with specific check named.

This script can be run in CI, on deployment, or on demand by an auditor.

---

## 7. Certificate Chain Traceability

The full evidence chain from regulatory source to learner certificate:

```
UK Statutory Instruments              (legislation.gov.uk — Crown Copyright, OGL v3)
  ↓
Source Document Registry              (source_documents table — versioned, dated)
  ↓
Generated Module / SOP                (SHA-256 content hash computed at generation)
  ↓
Competent Person Review               (all findings disposed, gated window enforced)
  ↓
Attestation Record                    (WORM — trigger-locked, content hash carried)
  ↓
Module Certificate                    (WORM — cert number, hash, source versions, schemas)
  ↓
Learner Certificate                   (WORM — links to module cert ID, score, pass/fail)
```

Every link in this chain is traceable. If a regulation is updated, modules built against the previous version are flagged as **stale**. Old certificates remain valid and show the exact source document versions they were issued under.

---

## 8. Role-Based Access Control

Every API endpoint is gated by role. Every audit log entry captures the user's role at time of action.

| Role | Scope |
|------|-------|
| `admin` | Full access — module creation, review, deployment, member management, audit export |
| `hr_manager` | Module creation, generation, member management, audit export |
| `reviewer` | Review portal — finding disposition, attestation, module content viewing |
| `learner` | Module completion, certificate receipt |

Role is extracted from the Clerk JWT at request time, mapped to local role, and written to `audit_log.user_role` on every logged action. This means the audit trail shows not just *who* acted but *in what capacity* — critical for MHSWR Reg 7 evidence.

---

## 9. What an Auditor Would Check

| Question | Where to look |
|----------|--------------|
| Was the governed content reviewed by a competent person? | `attestations` table — reviewer name, role, basis of competence, explicit acceptance |
| What was the content at time of review? | `attestations.content_hash_at_attestation` — SHA-256 of content at attestation time |
| Has the content changed since review? | Compare `modules.content_hash` to `attestations.content_hash_at_attestation` |
| Were regulatory findings addressed? | `review_findings` — every finding has a disposition, rationale, disposer identity, timestamp |
| Was the reviewer forced to engage with critical findings? | `audit_log` — `gated_window_unlocked` entries with timer duration + cognitive check response |
| Which regulations were in scope? | `module_certificates.regulatory_schemas` — array of schema IDs applied |
| Which source document versions were used? | `module_certificates.source_doc_versions` — JSON mapping of doc ID → version |
| Can the database records be tampered with? | Run `db:verify-worm` — 28 automated checks on trigger locks + permission revocations |
| Who did what, when, and in what role? | `audit_log` — every action with `user_id`, `user_role`, `action`, `payload`, `created_at` |

---

## 10. Technology Stack (Relevant to Evidence Chain)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Database | PostgreSQL (Neon managed) | WORM triggers, permission revocation, ACID guarantees |
| Hashing | Node.js `crypto.createHash('sha256')` | Content fingerprinting at generation time |
| Authentication | Clerk (JWT verification) | User identity, org membership, role extraction |
| Audit writer | Single `INSERT`-only function | No UPDATE path exists in application code |
| WORM verifier | `verifyWorm.ts` (28 checks) | Automated DB-level immutability verification |
| Certificate format | PDF with embedded metadata | Content hash, chain linkage, SHA-256, evidentiary blocks |

---

## 11. Limitations & Honest Boundaries

| Area | Status | Note |
|------|--------|------|
| Database superuser access | Not controlled by application | A Neon/Postgres superuser could bypass triggers. This is true of any database system. Mitigated by access controls on the hosting platform. |
| Content hash covers generation output | Yes | The hash covers the assembled module/SOP content. It does not cover the raw AI model responses (those are in `generation_jobs.job_state`). |
| Regulatory reference validation | Soft only | The system checks that regulation references follow expected patterns but does not verify them against an external API. Source documents are versioned in the registry. |
| Client-side timer | Enforced server-side | The gated window timer runs client-side, but the backend verifies the `gated_window_unlocked` audit entry exists before accepting a Cat A disposition. |
| Encryption at rest | Delegated to Neon | Database encryption is managed by the hosting provider, not by application-level encryption. |

---

*This document is generated from the live codebase and can be verified against the schema at `apps/api/src/db/schema.sql` and the WORM verifier at `apps/api/src/db/verifyWorm.ts`.*
