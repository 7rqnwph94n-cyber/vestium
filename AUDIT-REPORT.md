

# ComplianceForge -- Independent Project Audit

**Audit date:** 2026-03-09
**Auditor:** Claude Opus 4.6 (independent review, not the session that built this code)
**Codebase examined:** `/Users/richbrotherton/Desktop/conformityforge/complianceforge/`
**Documents reviewed:** CONTEXT.md, MEMORY.md, DEMO-SCRIPT.md, ONE-PAGER.md, plus direct exploration of ~421 TypeScript files across frontend, API, and shared types packages.

---

## A. Product Identity

### What this claims to be

ComplianceForge positions itself as a "Digital Competency Evidence system and Legal-Tech for Industrial Operators." It explicitly and repeatedly states it is not an LMS. The positioning is that it is the thing an H&S director hands to an HSE inspector to prove training was compliant, traceable, and professionally certified at time of delivery. The marketing materials describe a governed compliance evidence platform that generates bespoke training from regulatory source documents, enforces structured human review and attestation before deployment, and locks the full evidence chain in an immutable audit trail.

The one-pager claims: multi-agent generation pipeline (shipped), reviewer portal with non-bypassable attestation (shipped), certificate chain with SHA-256 hash linkage (shipped), WORM audit log with DB-level immutability (shipped), snapshot version history with diff (shipped), and audit evidence pack PDF (shipped). Pricing is stated as GBP 1,000-1,500 per module with COGS of approximately GBP 1.

### What it actually is

A genuinely ambitious and largely realised B2B SaaS product with a functioning multi-agent AI generation pipeline, a structured review workflow with non-bypassable attestation, a WORM audit log enforced at the database level, a certificate chain with SHA-256 content hashing, and a multi-page PDF audit evidence pack. The codebase is a real monorepo (pnpm workspaces) with approximately 421 TypeScript source files across a React 18 frontend, a Fastify API backend, and a shared types package. The database schema spans 787 lines and 25+ tables with WORM triggers on 6 evidentiary tables.

This is not a prototype or a weekend hack. It has the structural depth and hardening of a pre-revenue product in late development. The governance layer in particular -- the attestation workflow, gated window enforcement, WORM audit log, certificate chain, and audit evidence pack -- is built to a standard that exceeds what most Series A products ship with.

### Is the positioning credible?

Mostly yes, with specific caveats.

The positioning as "compliance evidence" rather than "AI training tool" is sharp, defensible, and genuinely differentiated. The architecture backs up the core marketing claims:

- The WORM audit log is real. Database triggers raise exceptions on UPDATE/DELETE. Privileges are revoked from PUBLIC. A verification script checks 7+ conditions. There is no `updated_at` column on the audit_log table.
- The attestation is non-bypassable. Status gates require `in_review` before attestation. Undisposed findings block attestation. Deployed modules cannot be re-attested. Category A findings require WORM-logged gated window completion before disposition.
- The certificate chain is hash-linked. SHA-256 at generation, at attestation, at certification. Match/mismatch indicator appears in the audit pack PDF.

The gap between positioning and reality is narrow but present. The learner delivery experience is adapted from a prior prototype (CurricuSmith v1) and has not been rebuilt to the same standard as the governance layer. The evidence chain is strongest from generation through attestation, and weakest at the learner completion end where progress persistence and certificate issuance are not fully wired up end-to-end.

Two marketing claims are not yet backed by code:
1. ~~"When source documents update, modules built on the previous version are flagged as stale."~~ **CORRECTION:** This IS implemented. `PATCH /api/source-documents/:id` in `sourceDocs.ts:69-167` auto-stales dependent modules via JSONB regex match on `regulatory_classification`, writes `module_stale_flagged` WORM audit entries, and fires email alerts via `sendStaleModuleAlert()`. The original audit missed this.
2. "Certificate delivery via CDN/edge." Certificates are served from the API process, not a CDN.
3. "Fault campaign generates regulatory violation scenarios." The fault campaign infrastructure exists from CurricuSmith but has not been verified to generate regulation-specific scenarios in the current pipeline.

---

## B. Shipped Capabilities -- Honest Assessment

### Multi-agent generation pipeline: SOLID

This is the centrepiece engineering achievement. The pipeline runs 21 steps with dependency-aware parallel execution organised into waves. The `jobRunner.ts` (515 lines) implements a `getStepDeps()` function that maps the full dependency graph: domainSurvey has no deps, blueprint waits for domainSurvey, stage lessons wait for blueprint, stage tests wait for their corresponding stage lesson, missions wait for all stages, and so on through coherence pass, dual fact-check, and repair.

The execution model uses `Promise.allSettled` with bounded concurrency (`PIPELINE_WAVE_CONCURRENCY` env var, defaulting to 2 for stage/test waves, unbounded for other waves). This prevents provider throttling while still parallelising where the dependency graph allows.

Key engineering details:
- `stepRunners.ts` is 2,182 lines covering every step with typed inputs/outputs, Zod schema validation, and regulatory context injection
- `prompts.ts` is 1,976 lines with structured prompt pairs (system + user) for every step, including 98 fix-hint rules for the repair loop
- Dual-provider routing: Anthropic for creative generation, Gemini for search-grounded intelligence (domainSurvey, coherencePass), dual fact-check (factCheckA on Anthropic, factCheckG on Gemini, factCheckMerge to reconcile)
- Cost-optimised model routing: blueprint, lessonMissionMap, and themeShell route to Haiku for ~70% cost reduction
- Resume from last completed step: on job restart, completed steps are loaded from the DB and re-emitted via SSE so the frontend re-syncs
- Per-wave DB persistence: single write after `Promise.allSettled` instead of per-step, reducing DB load ~4x
- Per-step metrics recording to `module_generation_metrics` table (best-effort, non-blocking)
- Cross-model critique: Gemini can critique Anthropic-generated content to eliminate same-family bias
- RAG corpus integration: 1,594 chunks from 39 source documents, embedded with `gemini-embedding-001` at 768 dimensions, retrieved via pgvector cosine similarity for domainSurvey and factCheck steps

This is a real multi-agent pipeline, not a thin wrapper around a single API call.

### Regulatory schema system: SOLID

17 regulatory schema files in `/apps/api/src/regulatory/schemas/`:
- mhswr.ts (MHSWR 1999 -- base layer, universally applicable)
- coshh.ts (COSHH 2002)
- puwer.ts (PUWER 1998)
- loler.ts (LOLER 1998)
- manualHandling.ts (Manual Handling 1992)
- dse.ts (DSE 1992)
- dsear.ts (DSEAR 2002)
- cdm.ts (CDM 2015)
- noise.ts (Noise 2005)
- vibration.ts (Vibration 2005)
- electricityAtWork.ts (Electricity at Work 1989)
- confinedSpaces.ts (Confined Spaces 1997)
- asbestos.ts (Asbestos CAW 2012)
- workplace.ts (Workplace Regulations)
- warehousing.ts
- ppe.ts
- workAtHeight.ts

Each schema contains structured data: legal duties, assessment methodology, compliance criteria, source documents with version dates, validation rules with severity levels, fact-check severity configs, and learning arc templates. The `workplaceClassifier.ts` maps industry type and hazard keywords to applicable schemas with weights (MHSWR is always 1.0). The `promptInjector.ts` formats this into full context blocks (for blueprint generation) and compact blocks (for per-lesson injection).

The RAG corpus adds depth: 39 source regulatory documents chunked and embedded in the `document_chunks` table with pgvector IVFFlat indexing for approximate nearest-neighbour search.

### Reviewer portal + attestation workflow: SOLID

The reviewer portal (`ReviewerPortalPage.tsx`) implements a two-panel layout. The left panel displays full module content: stages, collapsible lessons with concept paragraphs, worked examples, and quiz questions (with correct answer highlighted and regulatory reference shown). Stage tests are rendered at the bottom of each stage. Lessons with undisposed findings show warning badges with inline finding summaries.

The right panel is a sticky sidebar containing:
- Contradictions section (from `contradictionDetector.ts` -- surfaces regulatory contradictions from the dual fact-check)
- Findings list with compact disposition controls (Accept/Amend/Escalate per card)
- Add finding form
- Attestation form with all structured fields
- Deploy button

The gated window modal (`GatedWindowModal.tsx`) is the most impressive UX enforcement mechanism. It has three stages:

1. **Counting stage:** Mandatory minimum read time calculated as `(word_count / 200) * 60` seconds, clamped between 30 and 180 seconds. An SVG ring countdown animation is displayed. The reviewer cannot proceed early. The gate-open event is WORM-logged server-side.
2. **Question stage:** A Haiku-generated comprehension question specific to the finding content. The reviewer must type an answer. Not graded -- it tests engagement, not correctness.
3. **Disposing stage:** Standard disposition controls (accepted/amended/escalated) with rationale field.

The gate-unlock event is WORM-logged with the answer length. Critically, the disposition endpoint (`PATCH /api/review/findings/:findingId/disposition`) checks the WORM audit log for a `gated_window_unlocked` record before allowing Category A finding disposition. This prevents API-direct bypass.

Backend enforcement:
- Attestation blocked until all findings disposed (`validateAttestationPreconditions`)
- Attestation blocked if module status is not `in_review`
- Attestation blocked if module is already `deployed`
- Regulatory findings require 10+ character rationale
- Non-regulatory findings require 5+ character rationale
- Upsert with advisory lock prevents duplicate attestations
- Every action writes to WORM audit log

### Certificate chain (module + learner): SOLID

Module certificates contain: cert number (unique), content hash (SHA-256), source document version IDs, regulatory schema list, module title, reviewer name/role, issued timestamp. Learner certificates link to a specific module certificate ID and contain: learner name, user ID, score, pass threshold, pass/fail boolean.

PDF generation uses pdf-lib with a formal legal layout: white background, decorative frame, evidentiary metadata blocks, SHA-256 hash display, chain linkage fields. Both `buildModuleCertPdf` and `buildLearnerCertPdf` are exported from `certs.ts`.

Public verification endpoint at `/verify/:certNumber` -- no authentication required. Looks up both module and learner certificates and returns the full chain for verification.

Database protection: UNIQUE index on `module_certificates(module_id)` with `ON CONFLICT (module_id) DO NOTHING` + fallback SELECT to eliminate TOCTOU race conditions. All certificate tables (module_certificates, learner_certificates, governed_certificates) are WORM-protected with triggers that raise exceptions on UPDATE/DELETE and privilege revocation.

### WORM audit log: SOLID

The WORM implementation is genuine -- not application-level append-only, but database-level immutability:

1. **Trigger-locked:** `prevent_audit_log_modification()` function raises an exception on any UPDATE or DELETE attempt. Separate triggers for UPDATE and DELETE.
2. **Privilege-revoked:** `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC`.
3. **No updated_at column:** The schema explicitly omits it as an intentional design decision.
4. **Soft FK on module_id:** The foreign key was explicitly dropped (`ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_module_id_fkey`) so WORM records survive module deletion.
5. **Verification script:** `verifyWorm.ts` checks: no updated_at column, immutable trigger function exists, update/delete triggers exist, PUBLIC lacks update/delete/truncate privileges.
6. **Extended to all evidentiary tables:** The same WORM pattern (shared `prevent_evidentiary_record_modification()` trigger function + privilege revocation) is applied to: attestations, sop_attestations, module_certificates, learner_certificates, governed_attestations, governed_certificates, module_snapshots.

25+ distinct audit actions are tracked, from `generation_started` through `gated_window_unlocked` to `audit_pack_generated`. Every write function is a pure INSERT, never an UPDATE.

### Snapshot versioning + diff: FUNCTIONAL

The `module_snapshots` table stores full content snapshots (JSONB) at key lifecycle events: `generation_complete`, `attestation`, and `redeployment`. Each snapshot has an auto-incrementing version per module, a content hash, a trigger event, and a created_by user ID. The table is WORM-protected with triggers and privilege revocation.

The frontend `VersionHistoryPanel.tsx` allows expanding a collapsible section to view all snapshots for a module, with the attested version highlighted. A diff view (`SnapshotDiffView.tsx`) can compare any two versions. The backend `jsonDiff.ts` utility computes structural diffs (added/removed/changed paths).

The attestation stores the `snapshot_version` it signed off on, creating a traceable link between the attestation record and the exact content state.

Downgrade from SOLID to FUNCTIONAL: the diff is available but not automatically surfaced before attestation sign-off. A reviewer can manually expand version history and compare, but the workflow does not force a diff review when content has changed between generation and attestation.

### Audit evidence pack PDF: SOLID

`auditPack.ts` is 835 lines of PDF generation using pdf-lib. The output is a multi-page A4 document with:

- **Page 1 -- Executive Summary/Cover:** Module title, organisation, certificate number, compliance status chain (generation status, findings reviewed/disposed, attestation details, module certificate, learner certs issued), content hash chain (module hash, attestation hash, match/mismatch indicator), legal boilerplate.
- **Page 2 -- Module Classification:** Module ID, status, workplace context (industry, operations, workforce, hazards), applicable regulatory schemas with weights and mandatory flags, generation record (job status, pipeline step count).
- **Page 3+ -- Review Findings:** Summary stats bar (total, by severity, disposition rate), tabular findings with columns for severity, category, location, description, disposition, regulatory reference, date. Alternating row backgrounds, severity-coloured labels, rationale shown in italic green.
- **Page 4 -- Attestation Record:** Full MHSWR Reg 7 declaration, reviewer name/role in large type, attested-at timestamp, snapshot version, content hash at attestation, basis of competence, regulatory frameworks reviewed (bulleted), explicit acceptance declaration in a grey box.
- **Page 5 -- Certificate Chain:** Module certificate details (cert number, issued date, title, reviewer, schemas, content hash, source doc versions), module snapshots table with attested version highlighted, learner certificates issued.
- **Page 6+ -- WORM Audit Trail:** Chronological list of all audit log entries with timestamps, human-readable action labels, user ID, role, and summarised payload.
- **Final Page -- Integrity Verification:** Pack content hash (SHA-256), QR code linking to verification URL, immutability statement, legal disclaimer, generation metadata.

Visual treatment: diagonal watermark, double border with gold accent, corner rosettes, navy header/footer bands, page numbers, generation timestamp. Data is fetched in parallel (8 concurrent SQL queries). A WORM audit entry is written on pack generation.

Route is RBAC-gated to admin or reviewer. Attestation is required before pack generation (HTTP 409 if missing).

### SOP generation: FUNCTIONAL

4-step sequential pipeline in `sopJobRunner.ts` (394 lines):
1. `sopExtract` -- Injects full source document text; extracts raw procedure, equipment specs, manufacturer-specified values
2. `sopRegulatoryMap` -- Maps each extracted step to applicable regulatory controls
3. `sopDraftBuild` -- Assembles final SOP document with action, safety controls, regulatory basis, source reference, critical values per step
4. `sopFactCheck` -- Verifies every step's source reference against uploaded source content; unattributed steps become auto-seeded Cat A findings

Source document upload with PDF text extraction using pdf-parse v2 (class-based API: `new PDFParse({ data })` then `parser.getText()`). Maximum 5 documents, 20MB each. Retry logic with exponential backoff (MAX_RETRIES=2, 1.5s/3s delays).

SOP review workflow mirrors the module review: separate `sop_review_findings` and `sop_attestations` tables, both WORM-protected. The attestation declaration is SOP-specific: "I confirm this standard operating procedure accurately reflects the manufacturer's instructions and incorporates all applicable regulatory controls."

Backend always-on; frontend entry behind `VITE_FEATURE_BATCH_SOPS` feature flag. Batch SOP generation (`POST /api/sops/batch`) allows creating SOPs for a workshop's full equipment library.

Downgrade from SOLID to FUNCTIONAL: the SOP pipeline is simpler (sequential, not parallel), the prompts are shorter (259 lines vs 1,976 for modules), and the SOP viewer/review pages have received less iteration than the module reviewer portal.

### RAMS generation: FUNCTIONAL

4-step sequential pipeline in `ramsJobRunner.ts` (313 lines):
1. `ramsHazardId` -- Identifies hazards from task description and source documents
2. `ramsRiskAssessment` -- 5x5 risk matrix scoring (likelihood x severity) with initial and residual scores
3. `ramsDraftBuild` -- Assembles full RAMS document
4. `ramsFactCheck` -- Verifies regulatory basis and source attribution

Uses the v2 governance layer: content is registered in `content_registry`, findings go to `governed_findings`, attestation to `governed_attestations`, certificates to `governed_certificates`. This demonstrates the governance abstraction working across content types.

The `RamsHazardEntry` type in shared types includes structured fields: hazard, activity, persons at risk, initial/residual likelihood/severity/risk scores, controls, regulatory basis, source reference.

RAMS source documents support types: risk_assessment, method_statement, coshh_datasheet, permit_to_work, equipment_manual, other.

Downgrade from SOLID to FUNCTIONAL: newer than SOPs, less iterated. The RAMS prompts (295 lines) are adequate but not as deeply developed as the module pipeline prompts.

### Learner delivery experience: PARTIAL

The learner path exists and is functional at the component level. `LearnerEntryPage.tsx` loads a module from the backend via `GET /api/learner/modules/:id`, registers it dynamically in the runtime theme system, and navigates to the stage/lesson/test pages. The learning components are comprehensive -- they were the centrepiece of CurricuSmith v1:

- `DashboardPage` -- Module overview with stage progression
- `StagePage` -- Stage content with lesson list
- `LessonPage` -- Concept paragraphs, worked examples, diagrams, quiz questions
- `StageTestPage` -- End-of-stage assessment
- `PlacementAssessmentPage` -- Pre-module placement diagnostic
- `AdaptiveReviewPage` -- Spaced repetition review
- `LadderBuilderPage` -- Knowledge construction exercises
- `FaultCampaignPage` -- Scenario-based fault identification
- `CapstoneChallengePage` -- Final assessment
- `DutyHolderAssessmentPage` -- Role-based competency check
- `FieldReferencePage` -- Quick-reference cards
- `StageCertificatePage` -- Per-stage completion certificate

However, critical gaps prevent this from being rated higher:
1. **No server-side learner progress persistence.** Progress appears to use localStorage via the CurricuSmith persistence layer. If a learner clears their browser or switches devices, progress is lost. For a compliance evidence product, this is a significant gap.
2. **Learner certificate issuance is not visibly wired up end-to-end.** The backend endpoint exists (`POST /api/certs/learner/:moduleId`) but the learner-side UI flow for completing a module and triggering certificate issuance is not connected.
3. **Verbal response system is backend-only.** The `verbal_responses` table and API routes exist (audio recording, Whisper transcription, Claude attribution, manager disposition), but no visible learner-facing recording UI is integrated into the main learning flow.
4. **The learning UI has a different visual language** from the governance surfaces. It was designed for CurricuSmith and has not been restyled.

### Evidence dashboard / analytics: FUNCTIONAL

Backend: 4 dashboard endpoints in `dashboard.ts` (280 lines):
- `GET /api/dashboard/overview` -- Aggregates: modules by status, SOPs total, RAMS total, attestations this month, certs issued, unresolved regulatory findings
- `GET /api/dashboard/completion` -- Per-deployed-module: learners started, completed, average score, pass rate (from learner_certificates)
- `GET /api/dashboard/reviewer-activity` -- Per-reviewer: modules reviewed, average review days, last activity
- `GET /api/dashboard/findings-summary` -- By severity, disposed vs undisposed, overall disposition rate

Plus `GET /api/dashboard/audit-export` with CSV and JSON format options, date range filtering, 10,000 row limit.

Frontend: `EvidenceDashboardPage.tsx` loads all four data sets in parallel and renders overview stat cards, completion table, reviewer activity table, and findings breakdown.

A separate `DirectorDashboardPage` exists as an older analytics view focused on the H&S director persona.

All routes are RBAC-gated to admin or reviewer.

### Landing page / public presence: FUNCTIONAL

`LandingPage.tsx` is a real marketing page with:
- Hero: "Not Artificial Intelligence. Auditable Intelligence." tagline with amber accent
- Three-step evidence chain: Create (generate governed content), Learn (deliver to workforce), Audit (evidence everything)
- 16 regulatory schemas listed by name (MHSWR 1999 through HSWA 1974)
- Three assurance pillars: "Made for compliance teams," "Audit records are locked," "Named reviewer sign-off"
- Clerk sign-in/sign-up buttons
- Navigation to Studio, Learn Hub, Audit Hub

The tone matches the investor one-pager and demo script. The copy avoids overclaiming and focuses on governance rather than AI capabilities. The visual design uses a dark theme with amber, sky, and emerald accent colours.

Not a placeholder -- a functional marketing surface that can be shown to prospects.

### Auth + multi-tenancy: SOLID

`clerk.ts` (104 lines) implements Clerk JWT verification as a Fastify plugin:
- Token verification via `@clerk/backend` `verifyToken()`
- Role mapping: `org:admin` -> admin, `org:hr_manager` -> hr_manager, `org:reviewer` -> reviewer, default -> learner
- Personal workspace fallback: users without an active org get `user_{sub}` as orgId with admin role
- WeakMap-based per-request auth state (Fastify 5 compatible -- no shared object decorators)
- Public routes exempted: `/health`, `/assets/*`, `/verify/*`
- Dev test token: `TEST_API_TOKEN` env var accepted only when `NODE_ENV !== 'production'`

`rbac.ts` (17 lines) provides a clean `requireRole(...allowed)` preHandler used on every route.

Security hardening in `index.ts`:
- `@fastify/rate-limit`: 100 requests per 15 minutes
- `@fastify/helmet`: CSP headers, no cross-origin embedder policy (API-only)
- CORS: explicit origin validation via `resolveCorsOrigin()`, wildcard `*` rejected, credentials require specific origin
- Startup env validation: exits on missing `CLERK_SECRET_KEY` or `DATABASE_URL`, warns on missing `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `CORS_ORIGIN`

Org-scoped queries throughout: every route that touches module/SOP/RAMS data joins through the `orgs` table to verify `clerk_org_id` matches the request auth context.

### Admin / org management: FUNCTIONAL

- `OnboardingPage` -- First-run setup for new organisations
- `MembersPage` -- Member directory with role assignment, invite, suspend
- `org_members` table with role enum (admin, hr_manager, reviewer, learner), status (active, invited, suspended), job title, department
- Member sync from Clerk via `POST /api/members/sync`
- `org_contexts` table storing authoritative workplace context and distilled intelligence from deployed modules
- Org context builder (`orgContextBuilder.ts` with tests) distils: covered topics, covered regulations, reviewer corrections, domain insights, module summaries
- Context is injected into future generation prompts so each module builds on prior work

Privacy and consent infrastructure:
- `consent_records` table tracking grants/revocations per user per type (audio_capture, transcript_storage, data_processing, certificate_issuance)
- `data_retention_policies` table with per-org configurable retention periods
- `data_deletion_requests` table for GDPR Article 17 right to erasure
- Automated retention cleanup runs on boot and every 24 hours (nulls expired audio, redacts expired transcripts)
- Privacy admin routes for data reports and deletion request management

---

## C. Code Quality

### TypeScript Discipline

The project uses strict TypeScript throughout with separate type-checking passes for frontend and API in CI. The shared types package (`@complianceforge/types`, 616 lines) provides a clean API contract layer with well-structured DTOs covering every domain entity: modules, SOPs, RAMS, findings, attestations, certificates, verbal responses, org context, content registry, governance types, privacy/consent types, and paginated API envelope types.

Zod is used consistently for request validation on every API route. The pipeline uses typed outputs with Zod schemas for every generation step (826 lines in `schemas.ts`). Fix-hint rules in `prompts.ts` cover 98 distinct validation error codes, each with a specific corrective instruction.

The frontend uses proper TypeScript throughout with typed props, state, and API responses. Lazy loading with React.lazy and Suspense on every page component.

One structural concern: the route files make heavy use of `as Record<string, unknown>` and `as { field: type }` casting on raw SQL query results. This is the standard pattern for raw SQL in TypeScript (the Neon client returns untyped rows), but it means the database-to-application type boundary is not compile-time safe. A runtime validator or typed query builder (Drizzle, Kysely, Prisma) would give stronger guarantees. This is an acceptable trade-off at this stage but becomes a maintenance risk as the schema evolves.

A known gotcha is documented: `TrainingQuestion.regulatoryRef` exists in both `src/lib/training-core/types.ts` and `apps/api/src/lib/training-core/types.ts`. The MEMORY.md warns "always update both." This is a duplication hazard.

### Test Coverage and Quality

15 test files (excluding node_modules), 110 tests reported passing (37 frontend + 73 API).

**API tests (8 files, 73 tests):**
- `pipeline.test.ts` -- 14 tests covering dependency graph correctness (themeShell/sourceAttribution/simulatorDesign depend on missions only, not testKeys), domainSurvey `.catch()` resilience (5 cases), StartGenerationSchema trust boundary (2 cases)
- `schemas.test.ts` -- 19 tests validating Zod schemas for generation step outputs
- `contradictionDetector.test.ts` -- Tests for the contradiction detection logic that surfaces regulatory conflicts from dual fact-check
- `reviewPolicy.test.ts` -- Tests for severity derivation including the `disputed` verdict edge case, category mapping, attestation precondition validation
- `pagination.test.ts` -- Pagination schema and boundary tests
- `sops.integration.test.ts` -- SOP route integration tests
- `orgContextBuilder.test.ts` -- Tests for distilled org context generation
- `jsonDiff.test.ts` -- Tests for the structural diff utility used in snapshot comparison

**Frontend tests (6 files, 37 tests):**
- `ModulesPage.visibility.test.ts` -- Tests for failed module surfacing (the "invisible draft" fix)
- `gating.test.ts` -- Progress gating logic (prerequisite enforcement)
- `useNextStep.test.ts` -- Navigation step resolution
- `engine.test.ts` -- Simulator engine logic
- `formStyles.test.ts` -- Form styling utilities
- `externalEvidenceValidator.test.ts` -- External evidence validation

**Root-level:**
- `vite-studio-api.test.ts` -- Path traversal guard for the Vite dev server proxy

**Quality assessment:** Tests are focused on business logic correctness rather than broad coverage. The pipeline.test.ts covering dependency graph correctness is particularly valuable -- it prevents regressions where a step dependency change could silently break parallel execution. The reviewPolicy.test.ts tests are meaningful: they verify that a `disputed` verdict gets minimum `high` severity, upgraded to `regulatory` on legal keyword match.

**Gaps:** No integration tests that hit the running API with a real HTTP client. No end-to-end tests. No test for the attestation workflow's precondition cascade (findings undisposed -> attestation blocked -> deploy blocked). No test for certificate issuance idempotency. The 110 count is respectable for the project stage but light for a product that handles legal-liability workflows.

### Security Posture

**Strengths:**
- CORS origin validation with wildcard explicitly rejected (`resolveCorsOrigin` in shared utility, used by both index.ts and generation.ts SSE)
- Rate limiting at 100 req/15min
- Helmet security headers
- Startup environment validation (fail-fast on missing secrets)
- Path traversal guard on Vite dev server proxy (filename regex validation)
- RBAC preHandler on every route (not just auth check -- role check)
- JWT verification via Clerk backend library
- API key server-side only (Claude key never touches the client)
- Deployed module cannot be regenerated (certificate chain integrity)
- Category A finding disposition requires WORM-logged gated window completion (prevents API-direct bypass of the review gate)
- TEST_API_TOKEN explicitly blocked in production (`NODE_ENV !== 'production'`)
- StartGenerationSchema trust boundary: `workplaceContext` and `regulatoryClassification` removed from client payload; DB is sole source of truth

**Concerns:**
- Empty `catch {}` blocks appear in several places (best-effort metrics writes, snapshot creation failures, QR code generation). These are intentional for non-critical paths but could mask real issues in production debugging.
- No Content Security Policy on the frontend (Helmet CSP is API-only).
- No request logging middleware beyond Fastify's default logger. For a compliance product, structured access logs would strengthen the audit posture.
- The `data_retention_policies` cleanup runs as a `setInterval` in the main process. If it errors, the catch logs a warning but the interval continues -- there is no alerting.

### Error Handling

The error handling is deliberately structured with clear patterns:

**Pipeline errors:** Step errors mark the step status as `error`, emit an SSE `step_error` event with the error message, persist the failed state to DB, record a metrics entry, and re-throw. The outer `Promise.allSettled` catches the throw without abandoning sibling steps. After the wave, `anyStepErrored()` checks and the job fails gracefully. The outer try/catch stamps `generation_metadata.failed = true` on the module record so the UI can surface it (previously, failed modules were invisible -- "the invisible draft bug").

**API errors:** Routes use Zod validation with structured error responses. Missing org returns 400. Not found returns 404. Precondition failures return 409 (already deployed, findings undisposed). Auth failures return 401/403.

**Weakness:** Many routes do not have top-level try/catch blocks, relying on Fastify's default error handler. This means unexpected errors (e.g., database connection failure mid-request) return generic 500s without structured error bodies. A custom error handler that wraps all unexpected errors in the `ApiError` envelope would be an improvement.

### Database Schema Design

Exceptionally thoughtful for this stage. The schema demonstrates understanding of what "insurance-grade" means at the database level.

**Structure (25+ tables):**
- Core: orgs, org_members, modules, generation_jobs
- Review: review_findings, attestations, module_snapshots
- Certificates: module_certificates, learner_certificates
- Audit: audit_log (WORM)
- SOP pipeline: sop_records, sop_source_documents, sop_generation_jobs, sop_review_findings, sop_attestations
- RAMS pipeline: rams_records, rams_source_documents
- v2 Governance: content_registry, governed_findings, governed_attestations, governed_certificates, content_generation_jobs
- Assets: proxy_assets (ISO 7010 + IEC 60417 safety symbols)
- RAG: document_chunks (pgvector)
- Verbal: verbal_responses
- Analytics: module_generation_metrics
- Privacy: consent_records, data_retention_policies, data_deletion_requests
- Org context: org_contexts

**Design decisions of note:**
- audit_log.module_id is a soft reference (FK explicitly dropped) so WORM records survive module deletion
- v2 governance layer uses content_registry as a universal FK target, allowing governed_findings/attestations/certificates to apply to any content type without per-type tables
- proxy_assets uses GIN indexes on tags[] and schema_refs[] arrays for efficient tag-based symbol lookup
- document_chunks uses IVFFlat index for approximate nearest-neighbour vector search
- Idempotent schema.sql (all CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN IF NOT EXISTS) -- can be run repeatedly without error

**Risk:** The schema.sql file is a single 787-line file that runs entirely on every migration. This works because everything is idempotent, but it is not a proper migration system. Adding destructive changes (column renames, type changes, constraint modifications) will require either a real migration runner or careful ALTER TABLE scripting.

---

## D. Demo Readiness

### Can the 10-minute demo be delivered as written?

Yes, with the seeded demo data. The seed script (`seedDemo.ts`) creates a complete evidence lifecycle for "Northgate Archive Solutions Ltd" with the "Archival Roller Racking: Design and Installation" module. It seeds:

- Organisation with realistic metadata
- Module with full workplace context and regulatory classification (5 schemas: PUWER, LOLER, Manual Handling, MHSWR, Workplace Regulations)
- Generation job with realistic multi-step pipeline state (all 21 steps marked complete with plausible parsed JSON)
- 3 review findings with dispositions: one regulatory/Cat A (LOLER examination interval corrected from 12 to 6 months), one high/Cat B (seismic rack loading accepted as informational), one medium/Cat B (800mm aisle clearance added)
- Attestation by "Sarah Thompson" (NEBOSH, IOSH Chartered, 8 years warehousing H&S)
- Module certificate (CF-MOD-DEMO-001) with SHA-256 content hash and source document version IDs
- Learner certificate (CF-LRN-DEMO-001) for "Mark Davies" scoring 85/100 against 70% threshold
- 8+ WORM audit trail entries covering the full lifecycle
- Module snapshots at generation_complete and attestation
- Content registry entries for the v2 governance layer

The seed script is idempotent and supports both local synthetic IDs and real Clerk identity binding via env vars.

### What would break or look incomplete?

1. **Learner delivery during demo.** If someone asks "show me a learner completing this module," the experience is functional but rough. The learning UI was designed for CurricuSmith and has a different visual language from the governance surfaces. Lesson pages, quiz interactions, and stage tests all work, but the progression through completion to certificate issuance is not seamlessly wired up.

2. **Live generation.** Generating a new module during the demo takes approximately 17 minutes. The demo script correctly avoids this by using pre-seeded data. If asked to show live generation, you would need to start it before the meeting or have a pre-recorded screen capture.

3. **Verbal responses.** If asked about audio assessment capabilities (the verbal_responses system), the backend exists but there is no visible learner-facing recording UI in the main learning flow to demonstrate.

4. **Multi-user flow.** The demo shows a single reviewer (Sarah Thompson). Demonstrating the full org management flow (inviting a reviewer, them receiving the invitation, logging in, seeing assigned modules) requires real Clerk org setup with multiple user accounts.

5. **Localhost.** The demo currently runs on localhost (frontend :5173, API :3001). A technical evaluator will notice this. Having a deployed staging environment would significantly strengthen credibility.

### What would impress a buyer?

1. **The audit pack PDF.** Opening a 7-page PDF that contains the complete evidence chain -- from workplace classification through findings and attestation to certificate chain and WORM audit trail -- is the single strongest demo moment. This is the product. Every other feature exists to produce this document.

2. **The gated window modal.** Showing a reviewer forced to wait through a timed reading period, answer a comprehension question, and provide rationale before disposing a regulatory finding is tangible proof of "meaningful human involvement." No competing product has this.

3. **The attestation form.** Not a checkbox. Name, role, basis of competence, frameworks reviewed, explicit acceptance declaration. When read aloud during the demo ("I confirm that I have reviewed all content...I accept professional responsibility for this attestation under MHSWR 1999 Regulation 7"), it lands.

4. **Hash chain integrity.** Showing the module content hash, the attestation hash, and the match indicator on the audit pack cover page. Then explaining: "If anyone changes a single character after certification, the hash won't match."

5. **The WORM guarantee.** The line from the demo script: "The application doesn't have UPDATE or DELETE permissions on audit records. Neither does an admin. Neither do we." This is a genuinely differentiating claim that is actually true at the database level, not just application logic.

6. **Regulatory specificity.** The seeded content references real regulation numbers (PUWER Reg 5, LOLER Reg 9, BS EN 15635:2008), real tolerances (plus or minus 2mm over a 10-metre run), and real examination intervals (6-monthly, not 12). This is not generic H&S awareness content.

### What would concern a technical evaluator?

1. **No end-to-end tests.** For a product whose entire value proposition is the integrity of a governance workflow, the absence of integration tests covering the full attestation-to-deployment chain is a legitimate concern.

2. **SQL type safety.** Raw SQL with `as` casts throughout the route layer. A technical evaluator familiar with TypeScript would prefer a typed query builder (Drizzle, Kysely) that provides compile-time safety at the database boundary.

3. **Single-process architecture.** The pipeline runs in the Fastify process. A 17-minute generation consumes server resources (memory for the job state, API client connections, SSE connection to the frontend). There is no message queue, no worker separation, no horizontal scaling strategy. With 5+ concurrent generations, the server will degrade.

4. **LLM reliability.** A technical evaluator would ask: "What happens when Claude returns malformed JSON on step 14 of 21?" The answer is: the step fails, the job fails, the module stays `draft` with `generation_metadata.failed = true`, and the user can retry. The resume logic re-uses completed steps. This is reasonable but the retry surface is limited (step-level, not sub-step-level).

5. **No observability infrastructure.** No structured logging service, no error tracking (Sentry), no metrics dashboard, no alerting. For a compliance product handling legal-liability workflows, production observability is expected.

---

## E. Gaps -- What's Missing for Commercial Viability

### Must-have before first paid pilot

1. **Learner progress persistence to backend.** Currently appears to use localStorage. If a learner clears their browser, switches devices, or uses a different computer, all progress is lost. For a compliance evidence product where learner completion triggers certificate issuance and audit trail entries, progress must be server-persisted and tied to the user's authenticated identity. This is the most critical gap in the evidence chain.

2. **End-to-end learner certificate issuance flow.** The backend endpoint exists. The database tables exist. The PDF generation works. But the learner-side UI flow for completing all stages, passing the threshold, and triggering certificate issuance is not connected. A pilot customer needs to see: learner logs in, completes module, certificate is issued, audit trail records it, certificate appears in the audit pack.

3. **Deploy action from reviewer portal.** The review workflow ends at attestation. The actual "deploy to learners" action -- changing module status to `deployed`, issuing the module certificate, making content available at `/learn/:moduleId` -- needs a clear, visible button in the reviewer portal with confirmation step and success feedback.

4. **Generation completion notification.** A 17-minute generation with no notification or email means the user has to keep the browser tab open and watch the SSE stream. At minimum: poll for status on page revisit and show "Generation complete" if the user navigated away. Ideally: email or in-app notification.

5. **Basic error recovery UX for generation failures.** The resume-from-last-step logic exists in the backend but the frontend "Retry in Studio" button navigates back to the Studio page rather than triggering a targeted resume. A pilot customer hitting a generation failure needs a clear "Resume from step X" action, not a full restart.

### Should-have before investor conversation

1. **Stripe/payment integration.** The pricing is stated (GBP 1,000-1,500/module) but there is no billing infrastructure. For an investor conversation, being able to say "we have processed a payment" is materially different from "here is our pricing."

2. **Production deployment on a real URL.** Railway config exists (`railway.json`) but no production URL is deployed. The demo runs on localhost. Having `app.complianceforge.com` running against a real Neon database with real Clerk auth would transform the investor conversation.

3. ~~**Automated stale-flagging.**~~ **CORRECTION:** Already implemented. `PATCH /api/source-documents/:id` in `sourceDocs.ts:69-167` auto-stales dependent modules, writes WORM audit entries (`module_stale_flagged`), and sends email alerts. This is a complete implementation, not just schema support.

4. **User onboarding wizard improvements.** The onboarding page exists but the first-run experience for a new org (setting up workplace context, understanding Create/Learn/Audit, inviting team members) would benefit from guided steps and contextual help.

5. **Content library search and filtering.** As the number of modules, SOPs, and RAMS grows, the Studio library page needs pagination (it has this), search by title/status, and filtering by content type and regulatory schema.

### Nice-to-have

1. **Tier 2: Competency Evidence Report.** Described in CONTEXT.md as the expansion path -- a third agent that generates a report mapping each learner's scenario decisions to regulatory duties demonstrated. Not started.

2. **Webhook/SSE notification service.** For learner completion events, attestation reminders, stale module alerts, generation completion notifications.

3. **Source document version management UI.** The source_documents table supports versioning, currency tracking, and supersession. But there is no admin UI for viewing, updating, or managing the regulatory source document registry.

4. **Mobile-responsive learner experience.** The current learner UI is desktop-oriented. Field workers accessing training on tablets or phones would need a responsive layout.

5. **Analytics export and reporting.** The dashboard endpoints exist, and there is a CSV/JSON audit export. But a polished reporting UI with date range selection, chart visualisation, and PDF export would strengthen the "evidence dashboard" positioning.

---

## F. Risks

### Technical Debt

1. **CurricuSmith legacy code.** The learning features (`src/features/learning/`, `src/features/simulator/`, `src/features/faults/`, `src/features/progress/`) are adapted from the predecessor prototype. They work, but they carry dead code (e.g., `src/data/lithiumionTheme.ts` -- a lithium-ion battery theme from the original CurricuSmith demo). The router has both old paths (`/modules`, `/reviewer`, `/director`) and new paths (`/studio`, `/audit/reviewer`, `/audit/director`) with redirects. This creates a maintenance burden and occasional confusion about which path is canonical.

2. **Dual type definitions.** `TrainingQuestion.regulatoryRef` exists in both `src/lib/training-core/types.ts` (frontend) and `apps/api/src/lib/training-core/types.ts` (API). `AssembledModule` lives in `src/features/studio/generator/types.ts` (frontend) and `apps/api/src/pipeline/types.ts` (API). The MEMORY.md explicitly warns about this. Each dual-definition is a maintenance hazard -- a change in one location without the other creates a silent type mismatch.

3. **Single-file schema with no migration history.** All 787 lines of `schema.sql` run on every `db:migrate`. This works because everything is idempotent, but there is no migration history, no rollback capability, and no way to run destructive changes safely. Adding a proper migration system (e.g., node-pg-migrate) would de-risk schema evolution.

4. **Empty catch blocks.** Multiple `catch {}` and `catch () {}` blocks in non-critical paths (metrics recording, snapshot creation, QR code generation). Each is documented as intentional, but collectively they create a pattern where production errors could be silently swallowed.

### Scaling Concerns

1. **Single-process pipeline execution.** The generation pipeline runs in the Fastify process alongside all API routes. A 17-minute generation holds an SSE connection open, maintains the full job state in memory, and makes dozens of API calls to Anthropic and Gemini. With 5+ concurrent generations, memory pressure, connection exhaustion, and API rate limiting become real risks. The architecture needs a job queue (Bull, BullMQ) with separate worker processes before supporting more than a handful of concurrent users.

2. **In-memory abort controller registry.** The `activeJobs` Map in generation.ts stores AbortControllers for running generations. This resets on server restart (handled by stale-job cleanup). But in a multi-instance deployment (e.g., Railway with multiple containers), abort requests sent to a different instance than the one running the generation would not work.

3. **Verbal response audio in bytea.** The `verbal_responses` table stores audio as `bytea` columns directly in PostgreSQL. The schema notes "Pilot: audio_data is bytea in DB. Production: migrate to R2/S3 via blob_key." This is fine for pilot but would create significant database bloat and backup issues at scale.

4. **Rate limiting is process-local.** The `@fastify/rate-limit` plugin uses an in-memory store by default. Multi-instance deployments would not share rate limit counters. A Redis-backed store would be needed for horizontal scaling.

5. **RAG corpus IVFFlat index.** The pgvector IVFFlat index requires periodic reindexing as data grows. With 1,594 chunks this is not a concern, but at 50,000+ chunks the index would need attention. The lists parameter (currently 50) would need tuning.

### Marketing Claims Not Backed by Code

1. ~~**"Stale flagging is mandatory."**~~ **CORRECTION:** This IS fully implemented. `PATCH /api/source-documents/:id` in `sourceDocs.ts:69-167` performs automated stale-flagging: when a source document is updated, it queries all modules whose `regulatory_classification` JSONB references the affected schema, sets their status to `stale`, writes `module_stale_flagged` WORM audit entries, and fires email alerts via `sendStaleModuleAlert()`. The original audit missed this implementation.

2. **"Certificate delivery via CDN/edge."** (CONTEXT.md: "Certificate delivery: CDN/edge static reads -- the one serverless exception.") Certificates are served from the API process via `/verify/:certNumber`. There is no CDN, no edge function, and no static hosting for certificate data. This is fine for current scale and is a reasonable deferral, but it contradicts the stated architecture.

3. ~~**"When source documents update, modules built on the previous version are flagged as stale. Organisation notified."**~~ **CORRECTION:** See item 1 above. Both flagging and notification are implemented.

4. **"Fault campaign generates regulatory violation scenarios (not technical faults) -- compound violations reflecting real HSE enforcement patterns."** (CONTEXT.md, Pipeline Constraints.) The fault campaign infrastructure exists from CurricuSmith (`src/features/faults/`, `FaultCampaignPage`), but the generation pipeline steps for fault campaigns (`faultAndReference`, `builderAndCapstone`) produce scenarios based on the module domain without verified enforcement-pattern specificity. Whether the generated fault scenarios genuinely reflect "compound violations reflecting real HSE enforcement patterns" versus plausible-sounding scenarios has not been independently validated.

---

## G. Overall Verdict

ComplianceForge is a genuinely impressive solo/small-team build that has moved well beyond prototype territory into a structurally sound pre-revenue product. The governance layer -- WORM audit log with database-level trigger enforcement, non-bypassable attestation with gated window modals and WORM-verified gate completion, SHA-256 hash-linked certificate chain, dual-provider multi-agent generation pipeline with 21 dependency-managed steps, and a 7-page audit evidence pack PDF -- is architecturally differentiated from every AI training tool in the market. No competing product combines regulatory schema injection, cross-model fact-checking, mandatory timed reading gates, structured competent person attestation, immutable audit trails, and a single-PDF evidence export. The database schema (25+ tables, v2 governance abstraction ready for new content types, WORM triggers on 6 evidentiary tables, pgvector RAG corpus, consent and data retention infrastructure) reflects engineering maturity that exceeds what most early-stage products demonstrate. The SOP and RAMS generation pipelines extend the governance model to additional content types through a clean abstraction layer. The primary gap is the learner delivery experience: progress is not server-persisted, certificate issuance is not wired up end-to-end, and the learning UI carries CurricuSmith visual debt. The test suite (110 tests) is meaningful but thin for a compliance product -- the attestation-to-deployment critical path, which is the legal-liability core of the product, lacks integration test coverage. Three marketing claims about automated stale-flagging are not yet backed by code. This is a credible commercial product in late development, approximately one focused sprint (learner persistence, certificate flow, deploy action, production deployment) away from being demonstrable to a paying pilot customer.

### Recommended Next 3 Actions

1. **Wire up learner progress persistence and certificate issuance end-to-end.** Store learner progress in the backend (not localStorage), tied to the authenticated user identity. When a learner completes all stages and passes the threshold, auto-trigger learner certificate issuance via the existing backend endpoint, write the `learner_completed` and `certificate_issued` audit trail entries, and navigate to a completion page showing the certificate. This closes the evidence chain gap that currently exists between attestation and learner completion. Without this, the "source documents to learner certificate" chain has a broken link.

2. **Add integration tests for the attestation-to-deployment critical path.** Write tests that exercise with real HTTP requests against a test server: (a) attestation returns 400 when findings are undisposed, (b) attestation returns 409 when module is not `in_review`, (c) attestation returns 409 when module is already `deployed`, (d) Category A finding disposition returns 400 when gated window is not unlocked, (e) deploy creates module certificate and writes WORM audit entries, (f) deployed module attestation attempt returns 409, (g) module certificate is idempotent (duplicate deploy does not create duplicate cert). These are the legal-liability paths. They must be regression-tested.

3. **Deploy to a staging environment and run the seeded demo end-to-end.** Get the API on Railway, the frontend on Vercel (or Netlify -- the vercel.json SPA rewrite config exists), Clerk configured for a staging org, the seed script run against a real Neon database, and the full demo script executed from start to finish against the deployed environment. Verify every demo step works without localhost. Then share the URL. The distance between "it works on my machine" and "here is a URL you can visit" is the distance between a project and a product.
