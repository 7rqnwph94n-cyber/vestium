# Pilot Demo Checklist — Vestium

Execution-ready checklist for running a live pilot demo with a prospect.
Covers environment setup, seed data, user roles, golden path flows, known caveats, and rollback.

---

## 1. Environment Setup

### 1a. Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| Node.js | 22+ (24 preferred) | `NODE_OPTIONS='--use-system-ca'` required on Node 24 for Gemini TLS |
| pnpm | 9+ | Workspace monorepo |
| Neon Postgres | — | Managed DB — pooled connection string |
| Clerk account | — | Multi-tenant auth — org + 3 user accounts minimum |
| Anthropic API key | — | Server-side only — never exposed to frontend |
| Gemini API key | — | Embeddings + domain survey |

### 1b. API Environment (`apps/api/.env`)

```env
# Required
DATABASE_URL=postgresql://...@ep-xxx.eu-central-1.aws.neon.tech/complianceforge?sslmode=require
CLERK_SECRET_KEY=sk_live_...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...

# Demo identity binding (real Clerk IDs — required for login)
DEMO_CLERK_ORG_ID=org_2x...
DEMO_CLERK_ADMIN_ID=user_...
DEMO_CLERK_REVIEWER_ID=user_...
DEMO_CLERK_LEARNER_ID=user_...           # optional

# Optional
GEMINI_MODEL=gemini-2.0-flash            # default
CORS_ORIGIN=https://your-frontend.com    # leave unset for local dev
RESEND_API_KEY=re_...                     # stale alerts (silent no-op if absent)
PORT=3001                                 # Railway injects; local default 3001
```

### 1c. Frontend Environment (`.env.local`)

```env
VITE_API_URL=http://127.0.0.1:3001       # or Railway URL for remote
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_ENABLE_STUDIO=false                  # hide Studio for client-facing demo
```

### 1d. Database Bootstrap (run once, idempotent)

```bash
pnpm install
pnpm --filter @complianceforge/api run db:migrate
pnpm --filter @complianceforge/api run db:seed-assets
NODE_OPTIONS='--use-system-ca' pnpm --filter @complianceforge/api run db:embed-docs
pnpm --filter @complianceforge/api run db:seed-demo
```

### 1e. Start Dev Servers

```bash
# Terminal 1 — Frontend (Vite on 127.0.0.1:5173, NOT localhost)
pnpm dev --host 127.0.0.1

# Terminal 2 — API (Fastify on 127.0.0.1:3001)
pnpm --filter @complianceforge/api run dev:clean
```

### 1f. Verify Health

```bash
curl http://127.0.0.1:3001/health          # → {"ok":true,"ts":"..."}
open http://127.0.0.1:5173                  # → Landing page
```

---

## 2. Seed Data

The `db:seed-demo` script creates a complete evidence lifecycle for the **"Archival Roller Racking: Design and Installation"** module:

| Record | ID | Details |
|--------|----|---------|
| Org | `11111111-...` | Northgate Archives demo org |
| Module | `22222222-...` | Roller racking module, status=`deployed` |
| Admin member | `33333333-...` | Bound to `DEMO_CLERK_ADMIN_ID` |
| Reviewer member | `44444444-...` | Bound to `DEMO_CLERK_REVIEWER_ID` |
| Learner member | `55555555-...` | Bound to `DEMO_CLERK_LEARNER_ID` |
| 3 findings | auto-generated | 1 Cat A (regulatory), 1 Cat B (high), 1 Cat B (medium) — all disposed |
| Attestation | `66666666-...` | Reviewer sign-off (WORM-locked) |
| Module cert | `77777777-...` | Cert number `CF-MOD-DEMO-...` (WORM-locked) |
| Learner cert | `88888888-...` | Cert number `CF-LRN-DEMO-...` (WORM-locked) |
| Audit trail | auto-generated | Full lifecycle from creation → deployment |

**Idempotent:** Safe to re-run. Mutable rows use `ON CONFLICT DO UPDATE`; WORM rows use `ON CONFLICT DO NOTHING`.

---

## 3. User Roles

Set up 3 Clerk users in the demo org before the demo:

| Role | Clerk Org Role | Demo Persona | Capabilities |
|------|----------------|--------------|-------------|
| **Admin** | `org:admin` | "Director of Compliance" | Create modules, start generation, view director dashboard, issue learner certs |
| **Reviewer** | `org:reviewer` | "SME / Independent Reviewer" | Seed/create findings, dispose findings, attest modules, deploy (issue module cert) |
| **Learner** | `org:member` | "Warehouse Operative" | Access deployed modules, complete lessons/quizzes, simulator, receive cert |

### Role-Gated Routes (audience context)

| Route | Who sees it | Notes |
|-------|------------|-------|
| `/modules` | Admin, HR | Module registry + generation status |
| `/modules/:id/review` | Admin, Reviewer | Reviewer portal — two-panel layout |
| `/director` | Admin, HR | Director dashboard — attestation pipeline overview |
| `/learn` | All authenticated | Learner hub — deployed module access |
| `/learn/:moduleId/stage/:stageId` | All authenticated | Stage lessons, quizzes, simulator |
| `/learn/:moduleId/complete` | All authenticated | Certificate issuance page |
| `/audit` | Admin | WORM audit log viewer |
| `/studio` | Admin (dev only) | Module generation UI (hidden via `VITE_ENABLE_STUDIO=false`) |
| `/verify/:certNumber` | Public (no auth) | Certificate verification — HSE inspector access |

---

## 4. Golden Path Flows

### Flow A: Create (Admin persona — 8 min)

1. **Login as Admin** → Clerk sign-in
2. **Navigate to `/modules`** → See existing deployed "Roller Racking" module
3. **Create new module** → Click "New Module" → enter title, workplace context, select regulatory classification
4. **Start generation** → Click "Generate" → SSE stream shows 13-step pipeline progress
5. **Watch pipeline** → Domain survey → blueprint → stages → tests → missions → fact-check → assembly
6. **Module appears** as `in_review` → Navigate to Reviewer Portal
7. **Demo point:** Show Director Dashboard (`/director`) — module pipeline status, attestation timeline

### Flow B: Review + Deploy (Reviewer persona — 10 min)

1. **Login as Reviewer** → Clerk sign-in
2. **Navigate to `/modules/:id/review`** → Two-panel Reviewer Portal
3. **Left panel:** Expand stages → lessons → concept text, worked examples, quiz items
4. **Right panel:** Findings sidebar — show seeded findings (1 Cat A regulatory, 1 Cat B high)
5. **Disposition flow:** Click finding → enter disposition (accepted/amended/escalated) + rationale
6. **Gated Window:** Cat A findings require timed review window (`word_count/200 * 60` seconds) — mandatory, cannot skip
7. **Attest module:** All findings disposed → "Attest Module" button appears → enter basis of competence, regulatory frameworks reviewed → sign
8. **Deploy module:** "Issue Module Certificate" → generates PDF cert with SHA-256 hash, QR code → module status → `deployed`
9. **Demo point:** Open `/verify/CF-MOD-...` in incognito → public cert verification (HSE inspector scenario)

### Flow C: Learn + Certify (Learner persona — 12 min)

1. **Login as Learner** → Clerk sign-in
2. **Navigate to `/learn`** → Learner hub → see deployed "Roller Racking" module
3. **Enter module** → Dashboard with stage progress
4. **Stage 1:** Complete a lesson → concept → worked example → quiz (multi-choice with regulatory refs)
5. **Simulator:** Navigate to simulator panel → inject a fault → diagnose → check evidence workflow
6. **Stage test:** Complete stage test → score recorded
7. **Progress persistence:** Refresh page → progress retained (localStorage + server sync)
8. **Complete all stages** → "Complete Module" CTA appears
9. **Certificate issuance:** Navigate to completion page → "Issue Certificate" → PDF with learner name, score, chain to module cert
10. **Demo point:** Show certificate chain: learner cert → module cert → attestation → audit log → WORM entries

### Flow D: Audit Trail (Admin persona — 3 min)

1. **Navigate to `/audit`** → WORM audit log viewer
2. **Filter by module** → See full lifecycle: created → generation_started → generation_complete → finding_created → finding_disposed → attestation_created → module_deployed → learner_certified
3. **Demo point:** "This is your HSE inspection readiness evidence. Every event is immutable — no one can retroactively alter the record, not even a superuser."
4. **WORM verification:** `pnpm --filter @complianceforge/api run db:verify-worm` → confirms trigger integrity

---

## 5. Known Caveats

### Must-Acknowledge Before Demo

| # | Caveat | Mitigation |
|---|--------|------------|
| 1 | **Generation takes 3-6 min** per module (13-step Claude pipeline) | Pre-generate before demo OR use seeded module; show SSE stream briefly then skip to result |
| 2 | **SimulatorPanel (ladder logic) not wired to routing** | The 2,755-line ladder logic simulator is exported but not imported in `StagePage.tsx` — only `RolePlaySimulatorPanel` (branching scenarios) is active. Demo the role-play simulator |
| 3 | **Learner progress server sync** is localStorage-first | If learner clears browser, progress resets. Server persistence exists but falls back gracefully |
| 4 | **Batch SOP generation** hidden behind feature flag | Set `VITE_FEATURE_BATCH_SOPS=true` in `.env.local` if demoing batch SOP flow |
| 5 | **Email alerts (stale modules)** require `RESEND_API_KEY` | If absent, stale alerts silently suppressed — no error shown |
| 6 | **Node 24 TLS** requires `NODE_OPTIONS='--use-system-ca'` for Gemini | Add to shell profile or prefix commands; otherwise embedding scripts fail silently |
| 7 | **Dev server must use 127.0.0.1** (not `localhost`) | CORS configured for `127.0.0.1:5173` — `localhost` will get CORS errors |
| 8 | **PDF cert previews** render in-browser; no "Save as" button | Certs served as application/pdf — browser handles save/print |

### Things That Can Go Wrong During Demo

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "Unauthorized" on API calls | Clerk JWT expired or wrong org context | Re-login via Clerk; check `CLERK_SECRET_KEY` matches environment |
| Generation stalls at "Running..." | API process crashed or Claude rate-limited | Check API terminal for errors; restart with `dev:clean` |
| Empty reviewer portal | Module status is `draft` (generation failed silently) | Check `/modules` for "Generation Failed" badge; retry generation |
| Theme doesn't load | weldingmetalTheme async import failed | Hard refresh; check browser console for chunk load errors |
| CORS error | Using `localhost` instead of `127.0.0.1` | Use `http://127.0.0.1:5173` |
| Simulator not visible | Learner on wrong stage, or focus mode filtering | Switch focus mode to "Practice"; verify `stageId >= 2` for field checks |

---

## 6. Rollback Plan

### Scenario: Demo Data Corruption

```bash
# Option A: Re-seed (preserves WORM records, resets mutable data)
pnpm --filter @complianceforge/api run db:seed-demo

# Option B: Full reset (nuclear — destroys all data)
# Re-run migrations (DROP + CREATE all tables)
pnpm --filter @complianceforge/api run db:migrate
pnpm --filter @complianceforge/api run db:seed-assets
NODE_OPTIONS='--use-system-ca' pnpm --filter @complianceforge/api run db:embed-docs
pnpm --filter @complianceforge/api run db:seed-demo
```

### Scenario: API Won't Start

```bash
# Kill orphaned listeners
lsof -tiTCP:3001 -sTCP:LISTEN | xargs kill

# Restart clean
pnpm --filter @complianceforge/api run dev:clean
```

### Scenario: Generation Pipeline Stuck

```bash
# Check for stale running jobs (auto-cleaned on server restart)
# Just restart the API — startup cleanup marks running → failed
pnpm --filter @complianceforge/api run dev:clean
```

### Scenario: Frontend Build Broken

```bash
# Verify TypeScript
pnpm run build

# Verify tests
pnpm run test
pnpm --filter @complianceforge/api run test
```

### Scenario: Need to Revert to Known-Good State

```bash
# Find last known-good commit
git log --oneline -10

# Create a safety branch, then reset
git checkout -b demo-backup
git checkout main
git reset --hard <known-good-commit>
```

---

## 7. Pre-Demo Day Checklist

### T-24 Hours

- [ ] Run `pnpm run build` — both TS builds clean
- [ ] Run `pnpm run test` — 37 frontend tests pass
- [ ] Run `pnpm --filter @complianceforge/api run test` — 122 API tests pass
- [ ] Run `db:seed-demo` with real Clerk IDs — all records created
- [ ] Login as each persona (Admin, Reviewer, Learner) — verify Clerk org membership
- [ ] Walk through all 4 golden paths end-to-end — no errors
- [ ] Pre-generate at least 1 fresh module (avoid waiting during demo)
- [ ] Verify `/verify/CF-MOD-DEMO-...` works in incognito (public cert check)
- [ ] Close all unrelated browser tabs and terminal sessions

### T-1 Hour

- [ ] Start API: `pnpm --filter @complianceforge/api run dev:clean`
- [ ] Start frontend: `pnpm dev --host 127.0.0.1`
- [ ] Verify health: `curl http://127.0.0.1:3001/health`
- [ ] Open browser to `http://127.0.0.1:5173` — landing page loads
- [ ] Login as Admin — verify module list loads
- [ ] Run `db:verify-worm` — WORM triggers intact
- [ ] Open notes with golden path scripts + timing

### During Demo

- [ ] Start with Flow D (Audit Trail) — 3 min — establishes credibility
- [ ] Then Flow B (Review) — 10 min — shows the reviewer portal (the differentiator)
- [ ] Then Flow C (Learn) — 12 min — shows the learner experience
- [ ] Finish with Flow A (Create) — 8 min — shows the generation pipeline
- [ ] If generation runs long, narrate the pipeline while SSE streams
- [ ] End with: "Every event you just saw is WORM-locked in the audit log. That's your HSE inspection evidence."

---

## 8. Key Talking Points

| Topic | One-Liner |
|-------|-----------|
| **What is this?** | Compliance Evidence and Assurance system — not an LMS. Legal-grade governed content and traceability for UK H&S compliance. |
| **Why not just use an LMS?** | HSE doesn't ask "did they click through slides?" They ask "can you prove competence was assessed, reviewed by a qualified person, and the evidence is tamper-resistant?" |
| **MHSWR Reg 7** | Employers must appoint competent persons. This system supports governed generation, independent review (Reg 7 fulfilment), and an immutable evidence chain. |
| **WORM audit log** | Insert-only at the database level. No UPDATE, no DELETE — enforced by Postgres triggers, not application code. |
| **Certificate chain** | Learner cert → module cert → attestation → audit log. Each link is immutable. An HSE inspector can verify any certificate via public URL. |
| **Reviewer portal** | The reviewer is accepting legal responsibility (MHSWR Reg 7). The gated review window, Cat A findings, and explicit attestation language reflect that. |
| **Pricing** | Tier 1: per-module generation. Tier 2: subscription + per-cert fee with Audit Defense pack and insurance premium reduction evidence. |
