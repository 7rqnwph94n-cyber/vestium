# Data Protection Impact Assessment (DPIA)

**System:** Vestium — Compliance Evidence and Assurance Platform
**Version:** 1.0
**Date:** 2026-03-07
**Data Controller:** Organisation using Vestium (per-tenant)
**Data Processor:** Vestium platform operator

---

## 1. Processing Overview

Vestium generates, reviews, and evidences UK health & safety governed artifacts (modules, SOPs, RAMS). The system processes personal data as part of its core function: evidencing that individual workers have received and understood role-relevant regulatory controls and instructions.

### 1.1 Data Subjects

- **Learners** — employees completing assigned modules and assessments
- **Reviewers** — competent persons attesting module content (MHSWR 1999 Reg 7)
- **Administrators** — org admins managing modules, users, and policies

### 1.2 Personal Data Inventory

| Data Type | Source | Storage | Retention | Lawful Basis |
|-----------|--------|---------|-----------|-------------|
| Learner name | Clerk auth (SSO) | Neon Postgres | Until deletion request | Legitimate interest (competency evidence) |
| Learner email | Clerk auth | Clerk-managed | Clerk retention policy | Contract performance |
| Audio recordings (verbal assessments) | Browser MediaRecorder API | Neon Postgres (`verbal_responses.audio_data`) | Org-configurable (default 365 days) | **Explicit consent** |
| Transcripts (Whisper STT output) | OpenAI Whisper API | Neon Postgres (`verbal_responses.transcript`) | Org-configurable (default 730 days) | **Explicit consent** |
| AI attribution scores | Claude Haiku analysis | Neon Postgres | Follows transcript retention | Legitimate interest |
| Quiz scores & completion records | Platform-generated | Neon Postgres | Duration of employment + 6 years (limitation period) | Legitimate interest |
| Certificates (learner + module) | Platform-generated | Neon Postgres (WORM) | Indefinite (legal compliance record) | Legal obligation (MHSWR 1999) |
| Reviewer attestation records | Reviewer input | Neon Postgres (WORM) | Indefinite (legal compliance record) | Legal obligation |
| Audit log entries | System-generated | Neon Postgres (WORM) | Indefinite (evidentiary chain) | Legal obligation |
| IP address (consent records) | HTTP request | Neon Postgres | With consent record | Consent verification |

### 1.3 Data Flows

```
Learner Browser
  → Audio capture (explicit consent required)
  → Vestium API (Fastify, Railway/Hetzner)
    → OpenAI Whisper API (transcription) — data transits to US
    → Anthropic Claude API (attribution) — data transits to US
  → Neon Postgres (data at rest, EU region available)
  → Manager/Reviewer review portal (org-scoped access)
```

---

## 2. Necessity and Proportionality

### 2.1 Why Audio Capture?

Verbal assessment is a UK HSE-recognised method for evidencing competency beyond written tests. MHSWR 1999 Regulation 13(2) requires employers to assess competency through means appropriate to the risk level. For high-hazard environments, verbal articulation of regulatory duties provides stronger evidence than multiple-choice alone.

### 2.2 Why AI Processing?

- **Transcription (Whisper):** Converts audio to searchable text for reviewer assessment. Without transcription, reviewers would need to listen to every recording.
- **Attribution (Claude Haiku):** Provides a preliminary confidence score. This is advisory only — final disposition is always by a human manager. This satisfies ICO/HSE 2026 guidance on "meaningful human involvement" in AI-assisted compliance tools.
- **Keyword scoring:** Deterministic rubric matching provides an objective, auditable second signal alongside AI assessment.

### 2.3 Data Minimisation

- Audio data is automatically purged after the org-configured retention period (default 365 days)
- Transcripts are redacted after their retention period (default 730 days)
- Only the minimum audio needed for assessment is captured (capped by `timerSeconds`)
- Audio is not used for any purpose beyond competency assessment
- No biometric profiling or voice identification is performed

---

## 3. Risk Assessment

### 3.1 Identified Risks

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| Unauthorised access to audio recordings | Low | High | Org-scoped access, Clerk JWT auth, role-based access control |
| Data breach exposing learner recordings | Low | High | Neon encryption at rest, TLS in transit, minimal retention |
| AI bias in attribution scoring | Medium | Medium | Human reviewer mandatory, AI score is advisory only, deterministic keyword scoring as second signal |
| Cross-tenant data leakage | Low | Critical | All queries scoped by `org_id`, no cross-org joins, Clerk org isolation |
| Learner coercion to consent | Medium | Medium | Consent is per-learner (not org-wide), revocable, declining prevents verbal submission but doesn't affect other assessment types |
| Transcript inaccuracy (Whisper errors) | Medium | Low | Reviewer sees transcript + audio, can listen directly, keyword scoring provides independent verification |
| Indefinite retention of WORM records | N/A | Low | Legal requirement under MHSWR; records contain minimal PII (name, role, attestation text); pseudonymisation available via deletion request |

### 3.2 Sub-Processor Risk

| Sub-Processor | Data Shared | Transfer Mechanism | Risk |
|--------------|-------------|-------------------|------|
| **OpenAI** (Whisper) | Audio bytes | API call, US-based | Medium — audio transits to US. Mitigated by OpenAI's zero-retention API policy for business accounts |
| **Anthropic** (Claude) | Transcript text + question text | API call, US-based | Low — text only, no audio. Anthropic does not train on API inputs |
| **Clerk** | Email, name, org membership | SaaS auth platform | Low — standard auth data, SOC 2 Type II certified |
| **Neon** | All application data | Managed Postgres, EU region available | Low — standard managed database, SOC 2 compliant |

---

## 4. Safeguards

### 4.1 Consent Mechanism

- **Granular consent:** Separate consent records for `audio_capture` and `transcript_storage`
- **Versioned:** Each consent record includes a `consent_version` field for tracking policy changes
- **Revocable:** Learners can revoke consent at any time via API
- **Enforced at submission:** Verbal response POST endpoint checks for active consent; returns 403 without it
- **Audited:** Consent grants and revocations are written to the WORM audit log

### 4.2 Data Retention

- **Configurable per-org:** Administrators set audio and transcript retention periods (min 30 days, max 10 years)
- **Automated cleanup:** Server-side job runs every 24 hours, purging expired audio data and redacting expired transcripts
- **Defaults:** Audio = 365 days, Transcripts = 730 days

### 4.3 GDPR Article 17 — Right to Erasure

- **Admin-initiated deletion requests:** Target specific learners, scoped to `audio`, `transcripts`, `verbal_responses`, `certificates`
- **Processing:** Audio data nullified, transcripts replaced with `[REDACTED]`, certificate learner names replaced with `Redacted User`
- **WORM exception:** Audit log entries cannot be deleted (legal retention obligation). The deletion request record + completion audit entry together satisfy GDPR's documentation requirement under Article 17(3)(b) — legal obligation exemption
- **Audit trail:** All deletion actions are logged with request ID, target user, scope, and completion status

### 4.4 Meaningful Human Involvement (ICO/HSE 2026)

Vestium is designed around the principle that AI assists but does not decide:

1. **Generation:** AI assists artifact drafting, but nothing is deployed without human review
2. **Review:** A named competent person (MHSWR Reg 7) must attest every module before deployment
3. **Verbal assessment:** AI provides a confidence score, but manager disposition (confirmed/flagged) is the binding decision
4. **Findings:** AI-generated review findings must be individually disposed by a human reviewer
5. **Certificates:** Issued only after human attestation; linked to attestation record via immutable hash chain

### 4.5 Access Controls

- **Authentication:** Clerk JWT verification on every API request
- **Role-based access:** `admin`, `hr_manager`, `reviewer`, `learner` roles with endpoint-level enforcement
- **Org isolation:** Every database query is scoped by `org_id`
- **Rate limiting:** Global (100/15min) + per-route limits on expensive operations (5/15min)
- **Security headers:** Helmet CSP, CORS origin validation (no wildcards)
- **WORM enforcement:** Database triggers prevent UPDATE/DELETE on evidentiary tables; REVOKE blocks direct SQL access

---

## 5. Data Subject Rights

| Right | Implementation |
|-------|---------------|
| **Access (Art. 15)** | Privacy report endpoint provides per-learner data inventory |
| **Rectification (Art. 16)** | Contact org administrator; non-WORM fields can be updated |
| **Erasure (Art. 17)** | Admin deletion request; audio nullified, transcripts redacted, cert names anonymised |
| **Restriction (Art. 18)** | Consent revocation prevents further verbal submissions |
| **Portability (Art. 20)** | Audit export (CSV/JSON) available to org administrators |
| **Object (Art. 21)** | Consent revocation + deletion request |
| **Automated decision-making (Art. 22)** | No solely automated decisions — all AI outputs are advisory; human reviewer/manager makes binding decisions |

---

## 6. Data Processor Agreements Required

The following DPAs should be in place before production deployment:

1. **OpenAI** — Audio transcription processing (Whisper API)
2. **Anthropic** — Text analysis processing (Claude API)
3. **Clerk** — Authentication and user management
4. **Neon** — Database hosting and management
5. **Railway / Hetzner** — Application hosting

---

## 7. Review Schedule

This DPIA should be reviewed:

- **Annually** as part of the organisation's data protection review cycle
- **When new data types are collected** (e.g., video, biometric data)
- **When new sub-processors are added** (e.g., changing AI providers)
- **When regulatory guidance changes** (e.g., new ICO AI guidance, HSE enforcement updates)
- **After any data breach or near-miss**

---

## 8. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Data Protection Officer | | | |
| System Owner | | | |
| Technical Lead | | | |
