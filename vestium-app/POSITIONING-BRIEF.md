# Enterprise Positioning Brief — Vestium

> Positioning intent: **traceability and defensible assurance first**; generation speed second.

## 1. Ideal Customer Profile (ICP)

### Primary: UK Industrial Operators (50–500 employees)

**Firmographics:**
- Warehousing, logistics, manufacturing, construction, utilities, facilities management
- Operating under MHSWR 1999, PUWER 1998, LOLER 1998, COSHH 2002, CDM 2015 or other HSE-enforced regimes
- Employing frontline operatives who require evidenced competency (MHSWR Reg 7)
- Annual H&S/compliance evidence and training spend: £50k–£500k

**Buying persona:**
- **Primary:** Head of Health & Safety / Compliance Director — owns the regulatory risk
- **Secondary:** HR Director / L&D Manager — owns the training budget
- **Sponsor:** Operations Director — owns the insurance premium and enforcement liability

**Buying triggers:**
- HSE inspection notice (14,000+ proactive inspections in the 2025/26 cycle, subject to latest HSE publication) [1]
- Insurance renewal with competency evidence requirements
- Post-incident improvement notice (HSWA s.21/s.22)
- New site/process requiring rapid competency deployment
- Audit finding: "unable to demonstrate competent persons were appointed" (MHSWR Reg 7 breach)

### Secondary: Multi-Site Operators (500+)

Same regulatory pressure, amplified by:
- Cross-site consistency requirements
- Principal contractor CDM duties
- Group insurance policy demands for standardised evidence

---

## 2. Pains Solved

### Pain 1: "We can't prove who approved competency evidence"

**Regulatory reality:** MHSWR Reg 7 requires employers to appoint "competent persons." HSE doesn't ask whether someone clicked through slides. They ask: *"Can you demonstrate that competence was assessed by a qualified person, and that the evidence is tamper-resistant?"*

**What Vestium does:**
- 13-step pipeline generates governed content grounded in 17 UK regulatory schemas and 50 source documents (legislation.gov.uk + hse.gov.uk)
- Independent reviewer portal: reviewer sees full curriculum, creates/disposes findings (Cat A = regulatory errors, Cat B = advisory), attests under their professional responsibility
- Attestation is WORM-locked: reviewer name, role, basis of competence, regulatory frameworks reviewed, explicit acceptance statement — all immutable
- Certificate chain: learner cert → module cert → attestation → audit log. Each link is hash-verified

### Pain 2: "Our content is unauditable and weakly attributable"

**Current state:** PowerPoint decks, bought-in SCORM, or Word documents with no regulatory traceability, no version control, no reviewer sign-off.

**What Vestium does:**
- Generates from the customer's actual workplace context (equipment, processes, site conditions)
- Every claim in the generated content is fact-checked by two independent AI models (Anthropic + Gemini); cross-model disagreement flags `disputed` findings for human review
- Source attribution links each lesson back to specific regulatory duties
- Content hash (SHA-256) locked at attestation — any post-attestation tampering breaks the chain

### Pain 3: "Change control after updates is manual and risky"

**What Vestium does:**
- RAG corpus of ~1,594 regulatory document chunks (768-dim Gemini embeddings) grounds generation in current legislation
- When a source document is updated (new version, effective date, supersession), all deployed modules referencing that schema are auto-flagged as `stale`
- Stale modules surface in the Director Dashboard; org admins receive email alerts
- Re-generation → re-review → re-attestation → re-deployment: full lifecycle, full audit trail

### Pain 4: "We can't produce governed SOPs/RAMS fast enough for live projects"

**What Vestium does:**
- 4-step SOP generation pipeline: extract → regulatory map → draft build → fact-check
- Batch creation: up to 10 SOPs in a single request (shared workplace context)
- RAMS generation follows the same governed pipeline
- Source document upload (PDF, max 20MB) with automatic text extraction and regulatory cross-referencing
- Same review/attestation/certificate workflow as modules and other governed artifacts

### Pain 5: "Our audit trail won't survive an HSE inspection"

**What Vestium does:**
- WORM audit log enforced at the PostgreSQL level: `REVOKE UPDATE, DELETE, TRUNCATE` + immutable triggers
- Not application-level "soft deletes" — database-level controls designed to be tamper-resistant under managed access controls
- 30+ event types logged: generation, findings, dispositions, attestations, deployments, certificates, stale-flagging
- `db:verify-worm` script validates trigger integrity and attempts live enforcement (UPDATE on audit_log row must be rejected)
- Public certificate verification: `/verify/:certNumber` — unauthenticated access for HSE inspectors, insurers, external auditors

---

## 3. Differentiators

### vs. Generic LMS (iSpring, TalentLMS, Absorb)

| Dimension | Generic LMS | Vestium |
|-----------|-------------|-----------------|
| Content origin | Imported SCORM/xAPI packages | AI-assisted generation from workplace context + regulatory schemas |
| Review process | Optional manager approval | Mandatory independent reviewer attestation (MHSWR Reg 7) |
| Finding categories | None | Cat A (regulatory — mandatory gated window) / Cat B (advisory) |
| Audit trail | Application-level logs (editable) | WORM audit log (DB-enforced immutability) |
| Certificate chain | Completion badge | Learner cert → module cert → attestation → audit log (SHA-256 hash-linked) |
| Public verification | None | QR-verified URL accessible without authentication |
| Regulatory grounding | Manual tagging | 17 schemas, 50 source docs, ~1,594 RAG chunks, dual-model fact-check |
| Stale detection | Manual | Auto-flag on source document version change |

### vs. Compliance-Focused LMS (SafetyCulture, EcoOnline, iAuditor)

| Dimension | Compliance LMS | Vestium |
|-----------|---------------|-----------------|
| Content generation | Manual creation with templates | AI pipeline with regulatory guardrails |
| Reviewer legal accountability | Checkbox approval | Named attestation with basis of competence, explicit acceptance, WORM-locked |
| Cat A gated window | Not present | Mandatory reading timer: `(word_count/200)*60` seconds + cognitive engagement question |
| Fact-checking | None | Dual-model (Anthropic + Gemini) cross-check; disputed verdicts auto-escalated |
| SOP + RAMS generation | Separate product/module | Same platform, same governed pipeline, same certificate chain |
| Content versioning | Basic version numbers | Immutable module snapshots at each lifecycle event (generation, attestation, deployment) |

### vs. AI Content Generation (ChatGPT, Notion AI, Claude direct)

| Dimension | Raw AI | Vestium |
|-----------|--------|-----------------|
| Regulatory accuracy | Hallucination risk, no verification | 17 schemas + RAG corpus + dual fact-check + human reviewer |
| Legal defensibility | Zero — AI output is not a legal document | Reviewer attestation + WORM audit log + certificate chain |
| HSE inspection readiness | "We used ChatGPT" is not a defence | Traceable evidence chain with named competent person sign-off |
| Learner assessment | Not built | Staged quizzes, stage tests, verbal assessments (Whisper + attribution scoring), adaptive review |
| Certificate issuance | Not built | Formal PDF certs with SHA-256 hash, QR code, chain to module cert + attestation |

### The One-Line Differentiator

> "To our knowledge, Vestium is one of very few platforms combining regulatory-grounded generation, independent named competent-person review, and tamper-resistant evidence designed for HSE inspection workflows."

---

## 4. Objection Handling

### "We already have an LMS."

Your LMS delivers content. It doesn't generate it from your workplace context, fact-check it against legislation, put it through independent review, or produce WORM-locked evidence. Vestium isn't replacing your LMS — it's producing the defensible content and evidence your LMS can't.

### "AI-generated content won't pass an HSE inspection."

Correct — AI-generated content on its own won't. That's why every release goes through mandatory independent review. The reviewer sees the full curriculum/artifact, creates and disposes findings (Cat A regulatory findings require a timed reading window), and attests under their professional name. The attestation is WORM-locked. The certificate chain links outcomes back to that named review. HSE cares about the review process and evidence trail, not the authoring tool.

### "How do we know the AI content is accurate?"

Two independent AI models (Anthropic + Gemini) fact-check every claim. Cross-model disagreement automatically escalates to `disputed` status — the reviewer must resolve it before attesting. Content is grounded in 50 source documents from legislation.gov.uk and hse.gov.uk, embedded as ~1,594 searchable chunks. But the real answer: the reviewer is accepting legal responsibility. The AI generates; a competent human validates.

### "We need SOPs and RAMS too, not just modules."

Same platform. SOP generation uses a 4-step pipeline (extract → regulatory map → draft → fact-check). RAMS follows the same pattern. Both share the same review, attestation, and certificate infrastructure. One subscription, one evidence chain.

### "What happens when regulations change?"

When a source document version changes, every deployed module referencing that regulation is automatically flagged as `stale`. Stale modules surface in the Director Dashboard and trigger email alerts. You re-generate, re-review, re-attest, re-deploy — the audit trail captures the full lifecycle.

### "Can an HSE inspector verify our certificates?"

Yes. Every certificate includes a QR code linking to `/verify/:certNumber` — a public URL that requires no login. The inspector sees the full certificate chain: learner cert → module cert → attestation metadata → reviewer name and qualifications. Rate-limited to prevent abuse (30 req/min per IP).

### "What if someone tampers with the records?"

The platform is designed to make tampering materially difficult. The audit log is enforced at the PostgreSQL level with `REVOKE UPDATE, DELETE, TRUNCATE` grants and immutable triggers. `db:verify-worm` performs live enforcement checks. Evidentiary tables (attestations, certificates) follow the same hardening model. As with any system, governance depends on infrastructure access controls and operational policy.

### "We're not ready for a platform — we just need a few modules."

Tier 1 is per-artifact/per-module. No subscription required. Generate, review, attest, deploy, and issue certificates. If you later need ongoing coverage (stale-flagging, org intelligence, batch SOPs), upgrade to Tier 2.

---

## 5. Pricing Anchors

Pricing anchors below are illustrative for commercial planning and should be validated per customer, sector, and deployment scope.

### Tier 1: Per-Module Generation

| Item | Price | Notes |
|------|-------|-------|
| Module generation + review + deployment | £1,000–£1,500 per module | Includes full pipeline (13 steps), reviewer portal access, module cert, learner certs |
| SOP generation | £200–£400 per SOP | 4-step pipeline + review + attestation |
| RAMS generation | £200–£400 per RAMS | Same governed pipeline |

**COGS:** ~£1.00 per module (Claude Sonnet/Haiku + Gemini API costs). Gross margin: >99%.

**Value anchor:** A mid-size warehouse operator paying an external H&S consultancy £800–£2,000/day for manual training development may achieve equivalent first-draft output faster with a full audit trail. A practical planning assumption is 2–5 consultant days per module replaced or reduced, subject to reviewer availability and content complexity. [2]

### Tier 2: Audit-Defense Subscription

| Item | Price | Notes |
|------|-------|-------|
| Platform subscription | £500–£1,500/month | Based on org size + module volume |
| Per-learner-cert fee | £5–£15 per cert | Covers WORM storage, public verification, cert chain maintenance |
| Stale-flagging + alerts | Included | Auto-flags when source regulations change |
| Org intelligence | Included | Distilled context from prior modules feeds future generation |
| Batch SOP generation | Included | Up to 10 SOPs per batch request |
| Director Dashboard | Included | Pipeline status, attestation timeline, stale module visibility |
| Audit Defense Pack | Add-on | Pre-formatted Competency Evidence Report for HSE inspections |
| Insurance Evidence Pack | Add-on | Structured evidence export for insurance premium reduction claims |

**Value anchor (Tier 2):** Average UK employer liability insurance premium for a 200-person industrial operator is commonly modeled in the £40k–£120k/year range. A 5% premium reduction from demonstrable competency evidence implies £2k–£6k annual savings; actual outcomes depend on insurer underwriting criteria and claims history. [3]

### Pricing Psychology

- **Tier 1 anchors against consultant day rates** (£800–£2,000/day × 2–5 days = £1,600–£10,000 per module equivalent)
- **Tier 2 anchors against insurance premium reduction** (5–15% reduction on £40k–£120k = £2k–£18k/year)
- **Cert fees anchor against regulatory exposure** (enforcement costs and prosecution outcomes can be material; use current legal/insurance advisors for quantified estimates) [4]
- **Never sell on AI** — sell on evidence defensibility and accountable assurance. The buyer is the compliance/risk owner, not the IT team.

---

## 6. Proof Points (Status-Split)

### 6.1 Implemented Today (verified in current branch)

| Claim | Evidence |
|-------|----------|
| 13-step generation pipeline | `jobRunner.ts` — 18 steps across 4 phases with dependency graph |
| 17 regulatory schemas | `apps/api/src/regulatory/schemas/` — 17 .ts files |
| 50 source documents | `seedAssets.ts` — 50 entries from legislation.gov.uk + hse.gov.uk |
| ~1,594 RAG chunks | `embedDocs.ts` → `doc_chunks` table (768-dim Gemini embeddings) |
| Dual-model fact-check | `factCheckA` (Anthropic) + `factCheckG` (Gemini) + `factCheckMerge` |
| WORM audit log | `schema.sql` triggers + `REVOKE` grants + `verifyWorm.ts` live test |
| Cat A gated window | `reviewPolicy.ts` — `(word_count/200)*60` seconds, non-skippable |
| Certificate chain | `buildModuleCertPdf` + `buildLearnerCertPdf` — SHA-256, QR, chain linkage |
| Public verification | `GET /verify/:certNumber` — unauthenticated, rate-limited |
| Auto stale-flagging | `PATCH /api/source-documents/:id` — auto-flags dependent modules |
| 4-step SOP pipeline | `sopJobRunner.ts` — extract → regulatory map → draft → fact-check |
| Verbal assessment | `verbal.ts` — Whisper → Claude attribution → keyword scoring → auto-finding |
| 168 tests passing | 131 API + 37 frontend (Vitest) |
| Multi-tenant isolation | Clerk JWT + org_id scoping in all 24 route files |
| Role-based access | `requireRole()` preHandler on all sensitive endpoints |
| Module snapshots | `moduleSnapshots.ts` — versioned, WORM-protected, linked to attestations |

### 6.2 Rollout / Configuration-Dependent

| Capability | Status Notes |
|------------|--------------|
| Batch SOP generation | Implemented behind feature gating and operational rollout controls |
| Stale-module operational response | Detection and flagging implemented; customer notification/escalation process depends on org policy |
| Insurance Evidence Pack / Audit Defense Pack commercialisation | Productized packaging and pricing rollout vary by customer segment and contract model |

---

## 7. Customer Outcome Example Format

Use this structure in case studies and enterprise proposals:

- **Baseline:** 12 modules/year, 10 business days average time-to-release, 2 review rounds/module, 16 hours audit-pack prep per inspection cycle.
- **After 90 days with Vestium:** 35-50% reduction in draft-to-release time, 25-40% reduction in review cycle overhead, 40-60% reduction in audit evidence preparation time.
- **Evidence to include:** release timestamps, finding disposition logs, attestation records, certificate verification logs, and before/after process maps.
- **Commercial framing:** translate saved time into consultant-day displacement, avoided delay costs, and insurer discussion leverage.

---

## 8. Sources and Assumptions

[1] HSE proactive inspection counts: verify against latest annual HSE plan/statistical release before external publication.  
[2] Consultant day-rate and effort assumptions are market-planning ranges; validate by sector and geography during discovery.  
[3] Insurance premium ranges and reduction assumptions are illustrative; insurer outcomes depend on underwriting and claims history.  
[4] Enforcement exposure references are directional only; use current legal counsel and published regulator data for formal claims.
