# Security Hardening Log — Vestium

## 2026-03-09 — App-Layer Security Audit

Systematic review of authz boundaries, tenant isolation, public endpoints,
file upload handling, rate limits, and WORM tamper resistance.

### HIGH Severity (fixed)

| # | Finding | File | Fix |
|---|---------|------|-----|
| 1 | Learner cert issuance had no role guard — any authenticated user could issue certs | `certs.ts:838` | Added `requireRole('admin', 'hr_manager')` |
| 2 | Verbal response data accessible to learners — GET /, GET /:id/audio, PATCH /:id/disposition unguarded | `verbal.ts:449,512,537` | Role guards: list/audio = `admin/hr_manager/reviewer`; disposition = `admin/hr_manager` |
| 3 | No audio size limit on verbal submissions — unbounded base64 could exhaust memory | `verbal.ts:23` | `.max(10_000_000)` on `audioBase64` (~7.5 MB decoded) |
| 4 | No PDF magic bytes validation on upload endpoints — MIME spoofable | `sops.ts:308`, `rams.ts:225` | `%PDF` header check before pdf-parse |

### MEDIUM Severity (fixed)

| # | Finding | File | Fix |
|---|---------|------|-----|
| 5 | Source docs GET had no role guard | `sourceDocs.ts:56` | `requireRole('admin', 'hr_manager')` |
| 6 | Org-context GET had no role guard | `orgContext.ts:20` | `requireRole('admin', 'hr_manager')` |
| 7 | CORS fallback returned first configured origin for non-matching requests | `cors.ts:26` | Returns empty string in production for non-matching origins |
| 8 | Generation heartbeat SQL lacked org_id scope | `generation.ts:253` | Added `AND org_id = ${dbOrgId}` |
| 9 | jobRunner failure path lacked org_id scope | `jobRunner.ts:428` | Added `AND org_id = ${orgId}` |
| 10 | verifyWorm only checked metadata, not live trigger enforcement | `verifyWorm.ts:206` | Added live UPDATE attempt test |

### Accepted Risks

| # | Finding | Rationale |
|---|---------|-----------|
| 1 | Test token bypass when `NODE_ENV !== 'production'` | By design. Production sets `NODE_ENV=production`. |
| 2 | Role from JWT, not DB — stale after demotion | Clerk JWTs have short TTL (~60s). Acceptable latency. |
| 3 | Public `/verify/:certNumber` discloses cert details | By design — HSE inspector access. Cert numbers are unguessable. |
| 4 | WORM triggers can be disabled by Postgres superuser | Neon managed — no superuser access in production. |
| 5 | pdf-parse has no explicit timeout | 20 MB file size limit + Fastify request timeout mitigate. |

### Regression Tests

10 regression tests added in `security.integration.test.ts` covering all HIGH fixes:
- Learner cert role guard (member rejected, admin accepted)
- Verbal list/audio/disposition role guards (member rejected)
- Audio size limit enforcement
- PDF magic bytes validation (SOP + RAMS)
- CORS production rejection of unknown origins
