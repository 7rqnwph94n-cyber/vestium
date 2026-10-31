# ComplianceForge — 10-Minute Demo Script

> **Audience:** HSE inspector, insurer, operations director, partner, investor
> **Tenant:** Northgate Archive Solutions Ltd (seeded demo)
> **Module:** Archival Roller Racking: Design and Installation
> **Prerequisites:** Both dev servers running. Logged in as admin (James Whitfield).

---

## Opening (30 seconds)

> "Let me show you what happens when an HSE inspector asks your client for proof that their roller racking training was compliant, traceable, and signed off by a competent person."

Do not start with the product. Start with the problem.

> "Right now, most H&S directors answer that question with a PowerPoint and a sign-in sheet. That's not evidence. ComplianceForge produces the evidence — from generation through to a single PDF an inspector can verify."

---

## Act 1 — The Workplace (1 minute)

**Route:** `/audit/reviewer` — select "Archival Roller Racking: Design and Installation" from the module dropdown.

**What the buyer sees:** The two-panel reviewer portal loads. Left panel shows full module content. Right panel shows the findings sidebar.

> "This is Northgate Archive Solutions — a 45-person archive facility in [city]. Two warehouse bays, each 1,200 square metres, fitted with Dexion P90 mobile roller racking. Six levels, 2.4 tonnes per bay. Concrete slab floor with embedded rail tracks."

Point at the module title. Do not click into content yet.

> "The platform generated this training module directly from their workplace description. Not a template. Not an off-the-shelf course. Bespoke to their equipment, their operations, their hazard environment."

**What to notice:** The module title is specific — "Archival Roller Racking: Design and Installation" — not "Manual Handling Awareness" or "Health and Safety Basics."

---

## Act 2 — Regulatory Backbone (1.5 minutes)

Stay on `/audit/reviewer`. Scroll to show the stage structure in the left panel.

> "The platform classified this workplace against five regulatory schemas: PUWER 1998, LOLER 1998, Manual Handling 1992, MHSWR 1999, and Workplace Regulations 1992. Those aren't suggestions — they're the legal framework this content was generated against."

Expand **Stage 1: Regulatory Framework & Risk Assessment**. Click into **Lesson 1.1**.

> "Look at the content. This isn't generic awareness training. Lesson 1.1 covers PUWER Regulation 5 — employer duty to maintain work equipment — and LOLER Regulation 9 — thorough examination intervals for lifting equipment subject to deterioration. Six-monthly, not twelve."

Pause. Let that land.

> "That six-month interval matters. The platform's own fact-check flagged the original content for stating twelve months. The reviewer corrected it. I'll show you that finding in a moment."

Expand **Stage 2: Safe Systems of Work**. Point at Lesson 2.1.

> "Installation procedures reference BS EN 15635:2008. Rail alignment tolerances — plus or minus 2mm over a 10-metre run. That's the manufacturer specification embedded in the training, not a generic 'follow the manual' statement."

**What to notice:** Real regulation numbers, real tolerance figures, real standards. Not invented.

---

## Act 3 — The Review That Proves Human Involvement (2.5 minutes)

This is the centrepiece. Switch attention to the **right panel** (findings sidebar).

> "This is where ComplianceForge diverges from every other AI training tool. The content doesn't go to learners until a competent person has reviewed it, disposed every finding, and signed their name to it."

**Finding 1 — Regulatory (Category A, red)**

> "Finding one. Category A — regulatory severity. The platform flagged that PUWER Reg 6 thorough examination was stated as 12 months. LOLER Reg 9 requires six months for equipment subject to deterioration. The reviewer amended the content and recorded the rationale: corrected to six-month interval with explicit reference to LOLER Reg 9(3)(a)(ii)."

Point at the disposition: **Amended**. Point at the regulatory reference.

> "That's not a checkbox. That's a recorded professional judgement with a regulation citation. If an inspector asks why this content says six months, the answer is in the audit trail — not in someone's memory."

**Finding 2 — High (Category B)**

> "Finding two. BS EN 15635 Clause 9 — seismic rack loading. The reviewer accepted it as informational because seismic provisions aren't enforced in mainland UK, but noted the clause for completeness. Professional judgement, recorded."

**Finding 3 — Medium (Category B)**

> "Finding three. Emergency procedure referenced 'nearest fire exit' without specifying the 800mm minimum aisle clearance from Workplace Regulations ACOP paragraph 73. Accepted — the specific dimension was added."

> "Three findings. One content amendment. Two accepted with rationale. All regulatory references traceable. All timestamped. All attributed to the reviewer by name."

**What to notice:** Category A findings cannot be dismissed without rationale. The system enforces the review workflow — it cannot be bypassed.

**Handling the objection — "But it's still AI-generated content":**

> "Yes. And the HSE's own 2026 guidance requires 'meaningful human involvement' in AI-assisted compliance tools. This is what meaningful human involvement looks like — structured review, named sign-off, recorded rationale, non-bypassable workflow. The platform generates. The competent person certifies."

---

## Act 4 — The Attestation (1.5 minutes)

Still on `/audit/reviewer`. Scroll the right panel to the attestation section.

> "Once every finding is disposed, the reviewer signs a formal attestation. Not a tick box — a structured legal declaration."

Point at each field:

> "Sarah Thompson. Health & Safety Manager. NEBOSH National General Certificate, 2019. Eight years in warehousing and logistics H&S. IOSH Chartered Member."

> "She reviewed against five regulatory frameworks: PUWER, LOLER, Manual Handling, MHSWR, Workplace Regulations."

Point at the explicit acceptance statement:

> "Read the declaration: 'I confirm that I have reviewed all content, findings and regulatory references in this training module. The content accurately reflects current UK health and safety legislation and approved codes of practice for roller racking operations. All Category A findings have been addressed. I accept professional responsibility for this attestation under MHSWR 1999 Regulation 7.'"

Pause.

> "That's the legal transfer of responsibility. MHSWR Regulation 7 requires employers to appoint competent persons. This attestation is the documented proof that a competent person was involved — not just present, but actively reviewing, amending, and certifying."

**What to notice:** The attestation captures basis of competence (not just a name), frameworks reviewed (not just "H&S"), and explicit acceptance of professional responsibility. This is what distinguishes ComplianceForge from a content generator.

---

## Act 5 — The Certificate Chain (1 minute)

**Route:** Stay on reviewer portal — scroll to version history section. Or navigate to `/audit` for the audit hub.

> "When the attestation is signed, the platform issues a module certificate. CF-MOD-DEMO-001. It contains the content hash — a SHA-256 fingerprint of the exact training content at the moment of certification."

> "If anyone changes a single character after certification, the hash won't match. The certificate proves what the content was, not just that it existed."

> "Mark Davies completed the module. Scored 85 out of 100, against a 70% pass threshold. His learner certificate — CF-LRN-DEMO-001 — links back to the module certificate. The module certificate links to the attestation. The attestation links to the regulatory source documents."

> "That's the chain: legislation.gov.uk source documents, to generated content, to competent person attestation, to module certificate, to learner certificate. Every link traceable. Every link timestamped."

---

## Act 6 — The Audit Pack (1.5 minutes)

> "Everything I've just shown you lives in separate screens. When an inspector or insurer needs the evidence, they don't need a login. They need a document."

**Action:** Download the audit pack PDF. Either:
- Call `GET /api/audit-pack/{moduleId}/pdf` from the API (if demoing backend), or
- Open the pre-generated `/tmp/audit-pack-test.pdf`

Open the PDF. Page through it.

> "Seven pages. One document."

**Page 1 — Cover:** "Module title, organisation, certificate number, compliance status chain, content hash match indicator."

**Page 2 — Classification:** "Workplace context, regulatory schemas, generation record."

**Page 3 — Findings:** "Every finding, every disposition, every rationale, every regulatory reference. The reviewer's professional judgement — on paper."

**Page 4 — Attestation:** "Sarah Thompson's full attestation. Basis of competence. Frameworks reviewed. The explicit acceptance declaration."

**Page 5 — Certificate chain:** "Module certificate, snapshot version history, learner certificates issued."

**Page 6 — Audit trail:** "Eight WORM events. Module created, generation started, generation completed, findings seeded, attestation submitted, snapshot created, module deployed, certificate issued. Every action timestamped and attributed."

**Page 7 — Integrity verification:** "SHA-256 pack content hash. QR code linking to the verification page. WORM immutability statement. Legal disclaimer."

> "This is what the H&S director hands to the HSE inspector. Not a PowerPoint. Not a sign-in sheet. A cryptographically verifiable evidence pack proving the full chain from source legislation to learner certificate."

---

## Act 7 — The WORM Guarantee (30 seconds)

> "One more thing. The audit log is not application-level append-only. It's database-level WORM — Write Once, Read Many. The application doesn't have UPDATE or DELETE permissions on audit records. Neither does an admin. Neither do we. A Postgres trigger enforces immutability at the database engine level."

> "If this ever goes to tribunal, the evidence hasn't been curated after the fact. It's physically incapable of being edited."

---

## Close (30 seconds)

> "ComplianceForge generates the training. A competent person certifies it. The platform locks the evidence chain. And when the inspector arrives, the proof is already assembled."

> "This isn't an AI training tool. It's a compliance evidence system that happens to use AI for content generation. The value isn't the content — it's the proof."

---

## Objection Handling

**"We already have an LMS."**
> "An LMS tracks completion. It doesn't prove the training content was reviewed by a competent person against specific regulations, or that the content hasn't been modified since certification. ComplianceForge isn't a replacement for your LMS — it's the evidence layer your LMS can't provide."

**"How do we know the AI content is accurate?"**
> "You don't trust the AI. You trust the reviewer. The platform generates a draft. The fact-check layer flags every regulatory claim. A named competent person reviews, amends, and certifies. The AI is the first draft — the reviewer is the authority. That's the same model as every professional service: the junior drafts, the senior signs."

**"What if the regulations change?"**
> "Modules are flagged as stale when source documents update. Old certificates remain valid — they show exactly which version of the law they were issued under. New learners get retrained on the updated content. The chain proves what was true at the time, not what's true now."

**"What about GDPR / data protection?"**
> "Audit records are WORM — they can't be deleted. But personal data in learner certificates can be anonymised on request while preserving the audit chain integrity. The certificate hash remains valid even after anonymisation."

**"Is this just for H&S training?"**
> "The architecture is regulation-agnostic. We started with UK H&S because the enforcement regime is the most immediate — HSE is running 14,000 proactive inspections in 2025/26. But the same pattern applies to any domain where you need to prove that content was generated from authoritative sources, reviewed by a qualified person, and delivered with a locked audit trail."

**"What does it cost?"**
> "Tier 1 is GBP 1,000 to 1,500 per module. Our cost of goods is about one pound in API tokens. The value isn't measured against training production costs — it's measured against the cost of failing an HSE inspection, losing an insurance claim, or defending a tribunal without evidence."

---

## Demo Checklist (pre-flight)

- [ ] API server running on :3001
- [ ] Frontend running on :5173 or :5174
- [ ] Logged in as admin (James Whitfield's Clerk account)
- [ ] Seeded demo data present (module, findings, attestation, certs, audit log)
- [ ] Audit pack PDF pre-generated at `/tmp/audit-pack-test.pdf` (backup)
- [ ] Module appears in reviewer portal dropdown
- [ ] All 3 findings visible with dispositions
- [ ] Attestation section shows Sarah Thompson's full record
- [ ] PDF viewer ready (Preview or browser)

---

## Key Numbers to Have Ready

| Metric | Value |
|--------|-------|
| Module generation time | ~17 minutes |
| Pipeline steps | 21 |
| Regulatory schemas applied | 5 |
| Findings flagged | 3 (1 Category A, 2 Category B) |
| Content amendments | 1 (LOLER examination interval) |
| Attestation reviewer | Sarah Thompson, NEBOSH, IOSH Chartered |
| Learner score | 85/100 (70% threshold) |
| Audit trail events | 8 (WORM-protected) |
| Audit pack pages | 7 |
| Certificate chain depth | 5 links (source docs > content > attestation > module cert > learner cert) |
| HSE proactive inspections 2025/26 | 14,000 |
| Module price point | GBP 1,000–1,500 |
| COGS per module | ~GBP 1.00 |
