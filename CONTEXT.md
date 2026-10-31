# ComplianceForge — Project Context Document

> **Purpose:** This file is the single source of truth for all agents, sessions, and contributors working on the ComplianceForge project. Read this first. Update it when decisions change.

---

## What This Product Is

**ComplianceForge** is a B2B SaaS platform for UK Health and Safety professionals.

**Product identity (refined):** ComplianceForge is a **Digital Competency Evidence system** and **Legal-Tech for Industrial Operators**. It is not an LMS. It is the thing an H&S director presents to an HSE inspector, an insurer, or a tribunal to prove that training was compliant, traceable, and professionally certified at time of delivery.

It enables qualified H&S directors to:
1. Describe their workplace (industry, operations, workforce, hazard environment)
2. Generate bespoke compliance training modules backed by UK regulatory source documents
3. Review and certify that content through a structured, non-bypassable review workflow
4. Deploy modules to their workforce with a full, immutable audit trail
5. Issue verifiable learner certificates that trace back to the regulatory source documents

**One-sentence pitch:** ComplianceForge is what an H&S director shows an HSE inspector to prove their training is compliant, traceable, and professionally certified.

**Regulatory fulfilment:** The Reviewer Portal attestation workflow constitutes fulfilment of MHSWR 1999 Reg 7 (competent person appointment and documented involvement). This is the primary legal positioning of the product.

---

## Where We Come From — CurricuSmith v1

The codebase in `/complianceforge/` (formerly `Curricusmith v1/`) is the direct predecessor prototype. It is a client-side React/TypeScript/Vite app that demonstrated the core generation pipeline concept. Key parts we are carrying forward:

### What we keep (adapted)
- **Studio generation pipeline:** staged generation, critique/repair loop, schema contracts, QA gate, deterministic validation. Lives in `src/features/studio/generator/`. This is the Technical Reasoning Engine (TRE).
- **Learner experience architecture:** staged lessons → quizzes → missions → capstone. Lives in `src/features/learning/`.
- **Simulator/fault campaign framework:** `src/features/simulator/`, `src/features/faults/`.
- **Progress/gating logic:** `src/features/progress/`.
- **Tech stack:** React 18, TypeScript, Vite, Tailwind CSS, Zod, @anthropic-ai/sdk, react-router-dom v6.

### What we replace / extend
- Static client-only app → proper backend with auth, persistent storage, org management
- No-auth demo → multi-tenant org accounts with role-based access
- Export-only output → persistent module registry with version tracking
- No review workflow → Competent Person Review Portal (the most critical new surface)
- No certificates → full certificate chain (regulatory sources → module cert → learner certs)
- No audit log → append-only, immutable audit trail
- Domain-agnostic generation → regulatory-schema-injected generation against UK H&S law

---

## Core Capabilities (Target State)

### 1. Workplace Context Intake
User describes workplace. Platform classifies it against a regulatory matrix. Matrix determines which regulatory schemas apply and at what weight.
- Oil rig → MHSWR, COSHH, DSEAR, LOLER, PUWER
- Welding workshop → MHSWR, COSHH, Manual Handling, PUWER
- CDM construction → above + CDM 2015 duty holder framework

### 2. Regulatory Schema Matrix
Each regulation is a structured data object containing:
- Legal duties
- Assessment methodology
- Compliance criteria
- Source documents with version dates
- Validation rules
- Fact-check severity mappings

Initial schemas (priority order):
1. MHSWR 1999 — base layer, universally applicable
2. COSHH 2002 — chemical/biological hazard management
3. PUWER 1998 — work equipment
4. LOLER 1998 — lifting operations
5. Manual Handling Operations Regulations 1992
6. DSEAR 2002 — explosive atmospheres
7. CDM 2015 — construction duty holders

All sourced from legislation.gov.uk and HSE.gov.uk under Open Government Licence.

### 3. Generation Pipeline (extended TRE — Multi-Agent Architecture)

The pipeline is a structured multi-agent system. Every step is deterministic in ordering. Generic mode falls back to legacy single-agent behaviour.

#### Pipeline Steps

**Step 0 — Class Selection (Schema Routing)**
WorkplaceIntakePanel classifies workplace context against regulatory matrix. MHSWR always applies (weight 1.0). Industry weights + hazard keyword boosts determine additional schema weights.

**Step 1 — Legal Agent (Schema Validator — Pre-Pipeline)**
Runs before Blueprint generation. Mandatory terms check against the applicable schemas (e.g. for MHSWR: "Risk Assessment", "Competent Person", "Suitable and Sufficient" must appear in the generated Blueprint). If required terms are absent → **build fails immediately — no soft fallback, no retry.** The Legal Agent is the primary constraint layer for the entire pipeline.
- Model: Claude Sonnet 4.6
- Schema: full `buildRegulatoryContextBlock()` injection (duties, validation rules, guardrails)

**Step 2 — Blueprint Generation (within Legal Agent bounds)**
Standard TRE blueprint step. Generates compliance learning arc: Foundation → Duty Holder Responsibilities → Assessment Methodology → Control Hierarchy → Monitoring & Review → Audit Readiness.

**Step 3 — Realism Agent (always runs at Base Tier)**
Injects workplace-specific realism: sector slang, RIDDOR incident data, near-miss log patterns, realistic scenario details. **Always bounded by Legal Agent output — cannot override legal constraints.** If Realism Agent output conflicts with Legal Agent output → flagged as **Red conflict** in Reviewer Portal. No creative licence on safety-critical figures.
- Model: Claude Sonnet 4.6
- Compact context injection: `buildRegulatoryContextCompact()`

**Step 4 — Reviewer Portal (with Categorisation Agent pre-processing)**
Before findings reach the human reviewer, Haiku 4.5 pre-categorises every finding:
- **Category A: Legal Error / Hard Stop** — regulatory-severity. Non-dismissable without recorded rationale. Blocks deployment until disposed.
- **Category B: Pedagogical Suggestion / Soft Dismiss** — medium/low severity. Reviewer can dismiss with one click and logged reason.

This pre-categorisation reduces cognitive load on the reviewer and prevents speed-running through regulatory findings.

**Step 5 — Certificate Architecture**
Hash-linked evidence chain. Module cert contains content hash + source document version IDs + reviewer attestation details. Learner cert links to specific module cert ID. If regulation changes, the chain proves exactly what the learner was told and under which version of the law — this is the insurance/legal defence value.

**Step 6 — Gated Window System**
Triggered when the Realism Agent identifies a high-consequence edge case or a live regulatory contradiction (e.g. the NFCC BESS Feb 2026 "controlled burn-out vs suppression" contradiction — the canonical first use case).

When triggered:
- Modal covers full screen (cannot be dismissed or minimised)
- Continue button replaced by countdown timer: **`(word_count / 200) * 60 seconds`**
- After countdown: Cognitive Check (AI-generated prompted question about the edge case)
- Full interaction log: learner ID, case study ID, gate duration, unlock timestamp, cognitive check response

The Gated Window is the platform's primary mechanism for proving meaningful human engagement with safety-critical contradictions.

**Step 7 — Audit Log (WORM Storage)**
Every action is logged. Immutable at DB level — Write Once Read Many, not just application-level append-only. No DB-level editing mechanism for attestation records. Insurance-grade requirement.

#### Pipeline Constraints
- **Hard guardrails:** no invented regulation numbers, no specific numeric thresholds, no jurisdiction claims beyond UK, all regulatory references must trace to a source document in the registry
- **Fact-check elevated:** every legal duty claim, regulation reference, or compliance threshold flagged with regulatory severity — non-dismissable without recorded rationale
- **Fault campaign** generates regulatory violation scenarios (not technical faults) — compound violations reflecting real HSE enforcement patterns, workplace-specific
- **Missions** are duty holder judgement exercises under realistic workplace conditions
- **Phase 1 litmus test:** generated Blueprint for MHSWR context must contain MHSWR duty-based language (Reg 3 risk assessment, Reg 7 competent person, etc.). If the Blueprint reads like generic H&S advice with no regulation-specific language, the pipeline has not correctly ingested the schema.

### 3b. Tiered Product Architecture

**Tier 1 — Base (Legal Agent + Realism Agent)**
- Dual-agent pipeline: Legal Agent + Realism Agent
- Pricing: £1,000–£1,500 per module
- COGS: ~£1.00 (API token cost per full module generation)
- Primary buyer: H&S director needing defensible training documentation

**Tier 2 — Audit-Defense (adds Competency Evidence Report)**
- Third agent generates a **Competency Evidence Report** from learner simulation decision paths
- Report maps each learner's scenario decisions to the relevant regulatory duties they demonstrated competency in (or failed to demonstrate)
- Positioned as an **insurance premium reduction tool** — evidence pack for insurers and HSE inspectors
- Pricing: Subscription + per-certificate fee
- Primary buyer: operations director, insurer-facing H&S manager, risk manager

---

### 4. Competent Person Review Portal
A distinct interface from Studio. Designed for the H&S professional reviewer. Not an editing tool — a structured, mandatory review workflow.
- Findings organised by severity. Regulatory-severity first.
- Every finding requires a recorded disposition: accepted with rationale, amended with change description, or escalated.
- Regulatory-severity findings are **non-dismissable** without rationale on record.
- Cannot reach deployment screen until every finding has a disposition.
- Every action is logged: what was reviewed, what changed, what was accepted, timestamp, user identity.
- **Attestation:** formal structured declaration at end of workflow. Not a checkbox. Captures name, professional role, basis of competence, regulatory frameworks reviewed against, and explicit acceptance of professional responsibility. This is the legal transfer of content responsibility from the platform to the deploying organisation.

**This is the most important UX surface in the entire product.** It must feel serious and institutional, not like a form to click through.

### 5. Certificate Architecture
- **Module creation certificate:** generated at deployment. Contains content hash of module, source document versions used, reviewer attestation details, deployment timestamp. Locked signed PDF, embedded metadata, immutable.
- **Learner certificates:** each references the module creation certificate ID. Contains name, org, module title, completion date, score, pass threshold, module cert ID, QR code resolving to verification page.
- **Certificate chain:** regulatory source documents → generated module → competent person attestation → module certificate → learner certificates. Every link traceable.
- When source documents update, modules built on the previous version are flagged as stale. Organisation notified. Old certificates remain valid and show source version they were issued under.

### 6. Learner Delivery
Same as CurricuSmith learner path. Staged lessons, quizzes, scenario missions, simulator. Progress per learner. Completion triggers certificate generation.
H&S director sees cohort analytics. Persistent failure patterns at specific points trigger review recommendation for that module section.

### 7. Audit Trail
Every platform action touching a module is logged: generation run, finding disposition, attestation, deployment, learner completion, certificate issuance. Timestamp + user identity on every entry. Exportable as structured report. Immutable — entries cannot be edited or deleted.

---

## Build Phases

| Phase | Focus | Target |
|-------|-------|--------|
| 1 | Regulatory Foundation | MHSWR schema + pipeline adaptation. Proves regulatory generation works. |
| 2 | Backend + Auth | Org accounts, module registry, audit log infrastructure, source document registry. Overlaps Phase 1. |
| 3 | Reviewer Portal | Competent Person Review workflow — the most important UX work. |
| 4 | Certificate Infrastructure | Module cert generation, learner cert chain, QR verification, stale flagging. |
| 5 | Additional Regulatory Schemas | COSHH, PUWER, LOLER, Manual Handling, DSEAR, CDM. Ongoing from Phase 5. |
| 6 | Pilot | 3 customers: manufacturing SME, construction contractor, process industry site. |

**Phase success criteria:**
- Phase 1: Pipeline generates coherent MHSWR-based induction module for two different workplace contexts with accurate regulatory refs and no hallucinated legal claims.
- Phase 2: Org can create account, run studio pipeline, module stored with full generation metadata in persistent backend.
- Phase 3: H&S professional works through findings report, disposes every item, completes attestation, deploys module in a workflow that feels rigorous.
- Phase 4: Learner completing a module receives a PDF cert traceable to module cert and regulatory sources.
- Phase 5: Each new schema meaningfully expands range of workplace contexts served confidently.
- Phase 6: Three paying pilot customers, one usable case study.

---

## Technical Stack

### Existing (carry forward)
- React 18 + TypeScript + Vite
- Tailwind CSS
- React Router DOM v6
- Zod (schema validation)
- @anthropic-ai/sdk (Claude API)
- Vitest (testing)

### Confirmed additions (Phase 2 onwards)

- **Backend:** Fastify 5 (TypeScript) on Railway → Hetzner VPS at scale. Port 3001 in development.
- **Auth:** Clerk — multi-tenant org management, JWT verification via Fastify decorator pattern.
- **Database:** Neon (managed Postgres). pgvector extension for RAG corpus (768-dim, `gemini-embedding-001`). WORM audit log via insert-only permissions + Postgres triggers.
- **PDF generation:** pdf-lib (certificate PDFs), pdf-parse (source document text extraction for SOP pipeline).
- **Certificate delivery:** CDN/edge static reads — the one serverless exception in the architecture.
- **AI routing:** Anthropic Claude (default generation) + Google Gemini (domain survey, coherence pass, search grounding, embeddings). Controlled via `PIPELINE_AI_PROVIDER` and related env vars.

### Monorepo structure (pnpm workspaces)

```
complianceforge/
├── apps/
│   └── api/                   # Fastify backend
├── packages/
│   └── types/                 # Shared TypeScript types (@complianceforge/types)
└── src/                       # Frontend (React + Vite)
    ├── lib/
    │   ├── api/client.ts      # Authenticated API fetch wrapper
    │   └── features.ts        # Runtime feature flags
    └── features/sop/          # SOP viewer + review pages
```

---

## Key File Locations (CurricuSmith v1 — the starting point)

```
Curricusmith v1/
├── src/
│   ├── app/                          # Routing + layout
│   │   ├── AppLayout.tsx
│   │   └── router.tsx
│   ├── features/
│   │   ├── studio/
│   │   │   ├── generator/
│   │   │   │   ├── orchestrator.ts   # Pipeline orchestration — primary extension point
│   │   │   │   ├── stepRunners.ts    # Individual pipeline step logic
│   │   │   │   ├── prompts.ts        # Prompt construction — regulatory injection goes here
│   │   │   │   ├── schemas.ts        # Zod schemas for generated output
│   │   │   │   ├── validator.ts      # Deterministic validation — regulatory severity goes here
│   │   │   │   ├── types.ts          # TypeScript types for pipeline
│   │   │   │   ├── exporter.ts       # Export logic
│   │   │   │   └── runtimeAssembler.ts
│   │   │   ├── api/
│   │   │   │   ├── anthropicClient.ts # Claude API client
│   │   │   │   └── streamText.ts
│   │   │   ├── validation/
│   │   │   │   ├── evidenceProviders.ts
│   │   │   │   ├── externalEvidenceValidator.ts
│   │   │   │   └── policyMatrix.ts
│   │   │   └── storage/
│   │   │       └── persistedStateStore.ts # localStorage + IndexedDB persistence
│   │   ├── learning/                 # Learner UI (carry forward, adapt)
│   │   ├── simulator/                # Simulator engine (adapt for regulatory scenarios)
│   │   ├── faults/                   # Fault campaign (adapt → regulatory violation scenarios)
│   │   └── progress/                 # Progress gating + persistence
│   ├── data/                         # Theme/module data (to be replaced by backend)
│   └── types/
├── docs/
│   ├── UNIVERSAL_MODULE_PROMPT_ARCHITECTURE.md  # Prompt contract spec
│   ├── TRE_TECHNICAL_README.md                  # Pipeline architecture
│   └── TRE_SYSTEM_DIAGRAM_SPEC.md
└── CONTEXT.md                                   # This file
```

---

## Regulatory Reference Authorities

All regulatory content must trace to official sources:
- **legislation.gov.uk** — primary legislation and statutory instruments
- **HSE.gov.uk** — ACOPs, guidance documents, enforcement records
- **Open Government Licence** — both sources are OGL licensed

No regulation numbers, thresholds, or legal duties may be stated without a traceable source in the registry.

---

## UK Regulatory Context — 2026

This is the live enforcement environment the product operates in. Keep updated as regulation evolves.

- **HSE 2022–2032 Strategy** is operational. 14,000 proactive inspections targeted for 2025/26. MHSWR Reg 7 (competent person) is the primary enforcement focus.
- **NFCC BESS Guidance (Feb 2026):** Updated Battery Energy Storage System guidance recommends "controlled burn-out" rather than suppression in certain scenarios — directly contradicts previous guidance in many existing training modules. This is the **canonical first Gated Window use case**. Any BESS or energy storage module must trigger the Gated Window on this contradiction.
- **HSE/ICO 2026 joint guidance** requires "meaningful human involvement" in AI-assisted compliance tools. The Reviewer Portal is the technical fulfilment of this requirement. This is the regulatory basis for the Reviewer Portal's non-bypassable design.
- All regulatory content traces to **legislation.gov.uk** and **HSE.gov.uk** (Open Government Licence).

---

## SOP Generation

Standard Operating Procedures are generated as a distinct output type from training modules. The architecture is:

**Source-document attribution is mandatory.** The SOP pipeline cannot invent procedural steps from general AI knowledge. Every step must trace to an uploaded source document (operator manual, maintenance schedule, COSHH datasheet, risk assessment). Steps without a traceable citation become automatic Category A review findings — they surface as gaps, not filled content.

### SOP Pipeline (4 sequential steps)

| Step | Agent | Purpose |
|------|-------|---------|
| `sopExtract` | Legal Agent | Injects full source document text; extracts raw procedure, equipment specs, manufacturer-specified values |
| `sopRegulatoryMap` | Legal Agent | Maps each extracted step to applicable regulatory controls (PUWER, COSHH, LOLER, PTW, etc.) |
| `sopDraftBuild` | Legal Agent | Assembles final SOP document — each step has action, safetyControls, regulatoryBasis, sourceRef, criticalValues |
| `sopFactCheck` | Legal Agent | Verifies every step's sourceRef against uploaded source content; unattributed steps → auto-seeded Cat A findings |

### SOP Modes (Studio output mode toggle)

- **Module Only** — generates training module, no SOP
- **Module + SOP** — generates module first (SSE), then SOP (second SSE stream) using the module's ground truth
- **SOP Only** — bypasses module generation; workplace context is used for regulatory mapping only
- **Batch SOPs** — hidden feature (see Feature Flags below); generates SOPs for multiple equipment items sharing a workplace context

### SOP Review Workflow

Mirrors the module Reviewer Portal but scoped to SOP content. Attestation declaration: "I confirm this standard operating procedure accurately reflects the manufacturer's instructions and incorporates all applicable regulatory controls for this task and equipment." Deployment is blocked until all findings are disposed.

---

## Feature Flags

Runtime feature flags are evaluated at Vite build time from environment variables. The canonical source is `src/lib/features.ts`.

**Principle:** A flag gates frontend UI visibility only. The corresponding backend endpoint is always active and fully implemented. This allows internal testing via `VITE_FEATURE_X=true` in `.env.local` without backend changes, and a clean UI toggle for production rollout.

| Flag | Env var | Backend status | Description |
|------|---------|----------------|-------------|
| `FEATURES.BATCH_SOPS` | `VITE_FEATURE_BATCH_SOPS=true` | Active (`POST /api/sops/batch`) | Batch SOP generation: create SOPs for a workshop's full equipment library in a single Studio session. Each SOP is an independent record; generation is triggered per-SOP via the standard SSE pipeline. UI entry point is a 4th mode in the Studio output toggle. |

**To enable locally:** add `VITE_FEATURE_BATCH_SOPS=true` to `.env.local`. Never commit `.env.local`.

---

## Known Risk Flags

These are the failure modes to design against explicitly — not just in code but in UX and prompt design.

1. **Hallucinated numeric claims** — AI may invent specific thresholds (e.g. "5 employees", "2 metres", "50mg/m³"). Pre-Reviewer fact-check checklist must catch these. All numeric thresholds require explicit regulation + paragraph citation.
2. **Anecdotal drift** — Realism Agent may introduce plausible-sounding but unsourced incident statistics or workplace anecdotes. Any claimed statistic (incident rates, injury frequency, enforcement figures) must trace to HSE published data or RIDDOR records.
3. **Reviewer speed-running** — Categorisation Agent (Haiku 4.5) pre-processing is the primary mitigation: Cat A findings cannot be soft-dismissed. Secondary mitigation: attestation form is a structured declaration (name, role, basis of competence, frameworks reviewed against, explicit acceptance of professional responsibility) — not a single checkbox.
4. **Source attribution gaps** — Every lesson must contain in-context regulatory citations. `buildRegulatorySourceList()` injects the approved source document list into attribution prompts. Any claim without a source ID is flagged as a finding.

---

## Critical Design Constraints

1. **No invented legal claims.** Every regulatory reference traces to a source document. This is non-negotiable.
2. **Reviewer portal is not optional.** Nothing can be deployed without a completed review workflow + attestation on record.
3. **Audit log is WORM.** Write Once Read Many at DB level — not just application-level append-only. No DB-level editing of attestation records. Insurance-grade requirement.
4. **Certificates are locked at issuance.** Module cert cannot be modified after generation. Hash-linked to source document versions.
5. **Stale flagging is mandatory.** When source docs update, dependent modules must be flagged automatically.
6. **Review workflow must feel serious.** Invest disproportionate design attention here. If it feels like a checkbox, the liability model collapses.
7. **Legal Agent is the primary constraint layer.** Realism Agent is always bounded by Legal Agent output. Conflicts between agents are Red findings — not auto-resolved.
8. **Gated Window is mandatory for high-consequence contradictions.** Cannot be skipped. Timer formula must be enforced: `(word_count / 200) * 60` seconds minimum engagement.
9. **HSE/ICO meaningful human involvement requirement.** Every architectural decision touching AI-generated content must preserve the human reviewer as the accountable decision-maker. The platform assists — it never decides.

---

## What This Is Not

- Not a legal compliance service (platform assists qualified professionals — it does not replace them)
- Not a zero-hallucination system (high-integrity + mandatory human review is the positioning)
- Not a generic LMS (it is purpose-built for UK regulatory H&S compliance training)
- Not a portfolio piece (unlike CurricuSmith v1, this is a real commercial product)

---

## Current Status

- Date started: 2026-03-02
- Phase: 1 COMPLETE — Regulatory Foundation
- Repo: `/Users/richbrotherton/Desktop/conformityforge/complianceforge/` → `https://github.com/richbrotherton87-svg/complianceforge.git`

### Phase 1 completed (2026-03-02)
New module: `src/features/regulatory/`
- `types.ts` — full regulatory type system (RegulatorySchema, SourceDocument, RegulatoryDuty, WorkplaceContext, ClassifiedSchema, WorkplaceClassificationResult)
- `schemas/mhswr.ts` — MHSWR 1999 schema: all key duties (Reg 3–19), source documents (SI, L21, HSG65, amendments), validation rules with regulatory/high/medium severity, fact-check severity config, learning arc template
- `workplaceClassifier.ts` — classifies workplace context against regulatory matrix; MHSWR always 1.0; industry weights + hazard keyword boosts for COSHH, PUWER, LOLER, Manual Handling, DSEAR, CDM; schema stubs for pending Phase 5 schemas
- `promptInjector.ts` — formats regulatory context as structured injection block for blueprint, lesson, and fact-check prompts; includes compact variant for per-lesson injection
- `index.ts` — clean re-exports

Modified:
- `src/features/studio/generator/types.ts` — DomainConfig extended with `workplaceContext?` and `regulatoryClassification?`
- `src/features/studio/generator/prompts.ts` — blueprint, stage lesson, and fact-check prompt builders extended with `regulatoryContextBlock?` parameter; regulatory constraints injected into system and user prompts; fact-check severity extended with `'regulatory'` level
- `src/features/studio/validation/policyMatrix.ts` — `regulatory-compliance` domain added with correct policy (no academic citation providers, no source age limit, 15 claims to verify)
- `src/features/studio/components/WorkplaceIntakePanel.tsx` — new compliance-mode intake panel: industry classifier, operations/workforce/hazard inputs, live regulatory classification display, auto-generates DomainConfig with regulatory context

### Phase 1 wiring complete (2026-03-02)
- `stepRunners.ts` — regulatory context helpers wired into `runBlueprint` (full context block), `runStageLesson` (compact block per stage), `runFactCheck` (severity config). No-ops in generic mode.
- `StudioPage.tsx` — `WorkplaceIntakePanel` is primary intake. `DomainSetupPanel` accessible via dev toggle.

**Phase 1 is complete.** Next action: run a test generation against a welding workshop and a construction site context to validate the pipeline.

---

## Phase 2 — Backend + Auth

### Stack Decision (recorded 2026-03-02)

| Layer | Decision | Rationale |
|-------|----------|-----------|
| Backend framework | **Fastify** (TypeScript) | Fast, well-typed, active ecosystem. Better than Express for new builds. |
| Hosting | **Railway** (initially → Hetzner at scale) | Zero-ops git-push deploys. Migrate to Hetzner VPS at 50+ customers. |
| Database | **Neon** (managed Postgres) | True Postgres, managed connection pooling, no ops burden pre-revenue. |
| Auth | **Clerk** | Best-in-class multi-tenant org management. Works with Node backends via JWT. |
| PDF (Phase 4) | **pdf-lib** | Pure JS, no headless browser overhead, works in Node. |
| Certificate delivery | **Edge/CDN** | Stateless read traffic — the one deliberate serverless exception. |

**Architecture split:** Pipeline orchestration, reviewer portal session state, and audit log writes all run in the Fastify process. The Claude API key never touches the client. Learner module playback is served statically/via CDN.

**WORM audit log implementation:** PostgreSQL `audit_log` table with insert-only permissions for the application DB user. No `UPDATE` or `DELETE` grants on that table. Postgres triggers enforce this at DB level — not just application code.

### Phase 2 Scope
1. Fastify backend project setup (TypeScript, Zod, Clerk JWT verification middleware)
2. PostgreSQL schema: `orgs`, `users`, `modules`, `audit_log`, `source_documents`, `regulatory_schemas`
3. Move Claude API calls server-side — orchestrator runs in Fastify, not the browser
4. Module registry: store generated modules with full generation metadata (workplace context, regulatory classification, generation run ID, timestamps)
5. Audit log: append-only writes for every platform action (generation, finding disposition, attestation, deployment, cert issuance)
6. API routes for frontend: module CRUD, org management, audit log reads
7. Frontend: Clerk auth state, replace client-side API calls with backend API calls
8. Source document registry: structured storage of regulatory source documents with version tracking and stale-flagging

---

### Phase 2 progress update (2026-03-02)

- Backend API is live under `complianceforge/apps/api` with Fastify + Clerk JWT plugin + Neon DB connectivity.
- Environment loading issue resolved: API scripts now explicitly load `.env` for local runs.
  - `apps/api/package.json`:
    - `dev`: `node --env-file=.env --watch --import tsx/esm src/index.ts`
    - `db:migrate`: `tsx --env-file=.env src/db/migrate.ts`
- Migration runner fixed for real-world SQL:
  - Previous splitter executed statements out of order when section comments were present.
  - Previous splitter also broke PL/pgSQL bodies on internal semicolons.
  - `apps/api/src/db/migrate.ts` now uses a dollar-quote-aware splitter and strips comment-only lines safely.
- Fastify 5 compatibility fix:
  - `apps/api/src/plugins/clerk.ts` no longer decorates `request.auth` with an object reference (disallowed in Fastify 5).
  - Request auth context now uses getter/setter decorator storage (`WeakMap`) per request.
- Validation completed:
  - DB migration rerun successfully (`20 SQL statements`, complete).
  - TypeScript build passes for `@complianceforge/api`.
  - Runtime behavior confirmed:
    - `GET /health` returns `{ ok: true, ts }`
    - Protected routes reject unauthenticated access with `401`.
  - `pnpm --filter @complianceforge/api run dev:clean` successfully starts server after clearing stale `:3001` listener(s).
  - Requests to `/` and `/favicon.ico` return `401` by design (auth hook protects all routes except `/health`).
- Developer workflow hardening added:
  - `apps/api/package.json` now includes `dev:once` for non-watch startup checks.
  - `apps/api/package.json` now includes `dev:clean` to stop stale `:3001` listeners before watch startup.
  - `apps/api/package.json` now includes `smoke:auth` for token-based auth smoke testing.
  - `apps/api/src/scripts/smoke-auth.ts` checks `/health` and then validates authenticated access to `/api/orgs/me` using `CLERK_TEST_TOKEN`.
  - `smoke-auth.ts` now provides explicit failure guidance when API is not running (`ECONNREFUSED`) and rejects placeholder token value `your_real_token`.
- Frontend Clerk integration standardized for React + Vite:
  - Dependency switched to `@clerk/clerk-react` (from `@clerk/react`) in root `package.json`.
  - `src/main.tsx` now throws on missing `VITE_CLERK_PUBLISHABLE_KEY`, mounts `<ClerkProvider publishableKey={...} afterSignOutUrl=\"/\">` at root, and no longer has a no-Clerk fallback path.
  - `src/components/Header.tsx` now uses `<SignedOut><SignInButton/><SignUpButton/></SignedOut>` and `<SignedIn><OrganizationSwitcher/><UserButton/></SignedIn>` to support in-app org selection.
  - `OrganizationSwitcher` trigger text is styled light gray for readability on dark UI.
  - `src/features/studio/hooks/useBackendGeneration.ts` comment updated to reflect root ClerkProvider assumption.
- Frontend backend-auth wiring extended:
  - `src/lib/api/client.ts` now includes `getOrgMe()` for `GET /api/orgs/me`.
  - `src/features/studio/hooks/useBackendGeneration.ts` now uses Clerk `useAuth().getToken()` instead of `window.Clerk` globals.
  - `src/features/learning/ModulesPage.tsx` now fetches authenticated backend state in backend mode:
    - Calls `GET /api/orgs/me` then `GET /api/modules`.
    - Shows explicit UI states for signed-out, missing token, API errors, and successful org/module counts.
    - Uses bearer token from Clerk session for both requests.
- Studio backend generation start fix:
  - Root cause: frontend attempted to call `/api/generation/:moduleId/start` using local `job.moduleId` slug, but API expects an existing DB module UUID.
  - `src/features/studio/hooks/useBackendGeneration.ts` now creates a module first via `POST /api/modules`, then uses returned `module.id` for generation stream start/cancel endpoints.
  - If module creation fails or required compliance context is missing, failure is surfaced immediately.
  - `src/features/studio/StudioPage.tsx` now marks a step error on backend `onJobFailed` so failures are visible in UI (not console-only).
- Stage test schema resilience added:
  - `apps/api/src/pipeline/schemas.ts` now normalizes common model output variants for stage tests before validation (`test`, `questions`, `quiz`, nested `stageTest`, or raw arrays).
  - Prevents repeated hard-fail on `Structured output validation failed ... test: Required` when model returns semantically-correct but differently-keyed payloads.
- Generation reliability hardening:
  - `apps/api/src/pipeline/jobRunner.ts` now uses `runStepWithRetry(...)` for server-side step execution.
  - Transient network/timeout class errors get automatic retry attempts before failing the job.
- Multi-provider pipeline support (Anthropic + Gemini) added:
  - New Gemini adapter: `apps/api/src/pipeline/geminiClient.ts` (REST-based, no extra SDK dependency).
  - Provider factory now supports `anthropic` and `gemini` (`apps/api/src/pipeline/clientFactory.ts`).
  - Per-step provider routing in runner (`apps/api/src/pipeline/jobRunner.ts`) via env:
    - `PIPELINE_AI_PROVIDER` (global default)
    - `PIPELINE_PROVIDER_FACTCHECK`
    - `PIPELINE_PROVIDER_SOURCE_ATTRIBUTION`
  - API env templates updated with:
    - `GEMINI_API_KEY`
    - `GEMINI_MODEL`
    - pipeline provider routing vars
- Local dev runtime note (frontend stability):
  - In this CLI environment, detached `pnpm dev` frontend processes can exit immediately after startup.
  - Reliable local run pattern: start frontend in a user-owned terminal session and keep it open.
  - Example: `pnpm dev --host 127.0.0.1` and browse `http://127.0.0.1:5173`.
- API CORS/preflight fix for local frontend integration:
  - `apps/api/src/index.ts` now sets CORS headers (`Access-Control-Allow-Origin`, methods, headers) for all requests.
  - `OPTIONS` preflight requests return `204` before auth hooks run.
  - Verified with preflight request to `/api/orgs/me` from origin `http://localhost:5173`.
  - `apps/api/src/routes/generation.ts` SSE start endpoint now includes CORS headers in `writeHead` response to avoid browser `Failed to fetch` on streamed generation requests.
- Clerk org fallback behavior added for local progress:
  - `apps/api/src/plugins/clerk.ts` now falls back to a deterministic personal workspace org id (`user_<clerkUserId>`) when token `org_id` is absent.
  - This prevents signed-in users from being blocked on org activation during local development.
- Audit log WORM hardening and verification added:
  - `apps/api/src/db/schema.sql` now explicitly revokes `UPDATE`, `DELETE`, and `TRUNCATE` on `audit_log` from `PUBLIC`.
  - Added `apps/api/src/db/verifyWorm.ts` plus npm script `db:verify-worm` to validate:
    - no `updated_at` column on `audit_log`
    - immutable trigger function exists
    - update/delete triggers exist
    - `PUBLIC` lacks update/delete/truncate privileges
  - Verified on Neon: all WORM checks pass.
- Reviewer workflow API scaffolding added (`apps/api/src/routes/review.ts`):
  - Findings:
    - `GET /api/review/:moduleId/findings`
    - `POST /api/review/:moduleId/findings`
    - `PATCH /api/review/findings/:findingId/disposition`
  - Attestation:
    - `GET /api/review/:moduleId/attestation`
    - `POST /api/review/:moduleId/attestation`
  - Enforcement rules:
    - org-scoped access checks on all review routes
    - disposition requires rationale
    - regulatory findings require stronger rationale (10+ chars)
    - attestation blocked until all findings have dispositions
  - Audit log integration:
    - writes `finding_disposed` and `attestation_completed` events with payload metadata
  - Route registered in `apps/api/src/index.ts` under `/api/review`.
  - Added seeding endpoint:
    - `POST /api/review/:moduleId/seed-findings`
    - imports findings from latest `generation_jobs.job_state.steps.factCheck.parsedJson.factCheck.items`
    - creates findings for non-supported verdicts (`unsupported` / `ambiguous`) with dedupe by `description+location`.
- Reviewer Portal frontend scaffold added:
  - New page: `src/features/review/ReviewerPortalPage.tsx` (route: `/reviewer`)
  - Client wiring in `src/lib/api/client.ts` for:
    - findings list/create/disposition
    - attestation read/create
  - Portal behavior:
    - loads modules for org
    - loads findings + existing attestation for selected module
    - allows adding findings
    - allows setting disposition with rationale
    - blocks attestation button until all findings are disposed
  - Navigation added from landing page (`Open Reviewer Portal`) and router path registration in `src/app/router.tsx`.
- Reviewer Portal UX refinement (Phase 3 hard-stop behavior):
  - Findings are sorted with undisposed first, then by severity (`regulatory` -> `high` -> `medium` -> `low`).
  - Disposition actions are disabled until rationale meets minimum length:
    - regulatory findings: 10+ chars
    - non-regulatory findings: 5+ chars
  - Attestation now uses explicit reviewer-entered fields (name, role, basis, frameworks, acceptance statement, content hash) rather than hardcoded defaults.
  - Attestation submit remains disabled until all findings are disposed and all attestation fields are complete.
  - Added one-click action to seed findings from generation fact-check output in reviewer UI.
- Studio dev token-saver mode added:
  - `src/features/studio/components/WorkplaceIntakePanel.tsx` now exposes a dev-only quick preset:
    - `2 stages / 2 lessons / 1 mission`
  - In dev, module-structure dropdowns include lower values (`2` stages, `2` lessons/stage, `1` mission).
  - Purpose: cheap iteration during backend generation debugging without high token spend.

Operational note:
- Port `3001` may already be in use from a prior dev process. If `pnpm --filter @complianceforge/api run dev` logs `EADDRINUSE`, stop the existing listener first or keep using the running process.
- Package install note: sandbox environment could not reach npm registry (`ENOTFOUND`), so dependency install/lock refresh for `@clerk/clerk-react` must be run from a network-enabled shell.
- Build verification note: root `pnpm build` currently fails due pre-existing unrelated TypeScript issues outside this change set (e.g. `src/data/lithiumionTheme.ts`, `src/features/studio/StudioPage.tsx`, `src/lib/training-core/registry.ts`).

---

*Last updated: 2026-03-05*
*Update this file whenever an architectural decision is made, a phase is completed, or a critical constraint changes.*

### 2026-03-05 — Reviewer Portal redesign + failed generation visibility

**Reviewer Portal redesigned (two-panel content-first layout):**
- `src/features/review/ReviewerPortalPage.tsx` fully rewritten.
- Left panel: full module content view — stages → lessons (collapsible) → concept paragraphs, worked example, quiz questions (with correct answer highlighted, regulatory ref shown). Stage tests rendered at bottom of each stage. Lessons with undisposed findings show ⚠ badge; inline finding summary appears within the lesson body.
- Right panel: sticky sidebar — contradictions (existing `ContradictionRow`), findings list with compact disposition (Accept/Amend/Escalate buttons per card), add finding form, attestation form + deploy. All existing business logic preserved.
- Module content loaded via existing `GET /api/learner/modules/:id` (accepts `in_review` + `deployed`). No new backend endpoint required.

**Failed generation visibility fix:**
- `apps/api/src/pipeline/jobRunner.ts` — outer catch block now stamps `modules.generation_metadata = { failed: true, error, failedAt }` (best-effort UPDATE, does not mask original error). Matches pattern already used by `sopJobRunner.ts`.
- `src/features/learning/ModulesPage.tsx` — module card filter changed from `status !== 'draft'` to also surface drafts where `generationMetadata.failed === true`. Failed module cards show: red "Generation Failed" badge, "Retry in Studio" button (→ `/studio`), Delete button.
- Root cause identified: when any pipeline step errors or `assembleModule()` throws, `modules.status` stays `'draft'` and `generation_metadata` stayed `{}`. The module was invisible to the user. Reviewer portal correctly excludes failed drafts (no content to review).

**Security hardening (previous session, commit db5df43):**
- Path traversal guard in `vite-studio-api.ts` (filename regex validation)
- CORS wildcard guard in `apps/api/src/index.ts` (filters `'*'` from allowed origins)
- Startup env-var validation (exits if `CLERK_SECRET_KEY` or `DATABASE_URL` missing)
- Stale job cleanup on boot (`running` → `failed` for any jobs interrupted by restart)
- `isActive` in generation status endpoint now uses DB `status === 'running'` (not volatile in-memory map)
- `netlify.toml` removed (duplicate of `vercel.json` SPA fallback)

---

## Architectural Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-02 | Multi-agent pipeline: Legal Agent + Realism Agent + Categorisation Agent (Haiku 4.5) | Legal Agent as primary constraint prevents Realism Agent from overriding safety-critical content; Haiku for categorisation keeps cost low on high-frequency operation |
| 2026-03-02 | WORM storage for audit log (DB-level, not app-level) | Insurance-grade evidence requirement; HSE inspection defence; attestation records must be litigation-proof |
| 2026-03-02 | Gated Window timer formula: `(word_count / 200) * 60` seconds | Enforces proportional engagement time with edge case content; prevents learner click-through on safety-critical contradictions |
| 2026-03-02 | Tiered pricing: Tier 1 per-module (£1k–£1.5k), Tier 2 subscription + per-cert | Tier 1 monetises generation; Tier 2 monetises evidence/insurance value of learner simulation data |
| 2026-03-02 | Backend: Fastify + Neon Postgres + Clerk on Railway | Long-running stateful pipeline rules out serverless (execution time limits, no persistent memory). Predictable cost matters when COGS story is £1/module. Certificate delivery is the one CDN/edge exception (stateless reads). |
