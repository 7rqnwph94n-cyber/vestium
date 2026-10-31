# ComplianceForge — Working Memory

Purpose: short-lived operational memory for active implementation details and immediate next actions. Canonical product/architecture context remains in `CONTEXT.md`.

## Current Snapshot (2026-03-02)

- Repo root: `/Users/richbrotherton/Desktop/conformityforge`
- Main app repo: `/Users/richbrotherton/Desktop/conformityforge/complianceforge`
- Active backend package: `apps/api`
- Phase status: Phase 1 complete, Phase 2 in progress.

## Recently Completed

- API env wiring fixed:
  - `apps/api/package.json` `dev` uses Node `--env-file=.env` + `--watch` + `tsx/esm`
  - `db:migrate` uses `tsx --env-file=.env`
- Migration runner fixed (`apps/api/src/db/migrate.ts`):
  - Handles `$$...$$` blocks (PL/pgSQL) when splitting SQL statements.
  - Strips comment-only lines so section headers do not drop adjacent DDL.
- Fastify 5 auth decorator fixed (`apps/api/src/plugins/clerk.ts`):
  - `request.auth` now uses getter/setter + `WeakMap` storage.
  - Avoids forbidden reference-type request decorators.
- API run/test scripts added (`apps/api/package.json`):
  - `dev:clean`: stops current `:3001` listener(s) before watch startup.
  - `dev:once`: single-run local server startup (no watch mode).
  - `smoke:auth`: token-based authenticated smoke test.
- Frontend Clerk package and wiring aligned to current React+Vite pattern:
  - Root dependency moved to `@clerk/clerk-react`.
  - `src/main.tsx` enforces `VITE_CLERK_PUBLISHABLE_KEY` and wraps app in root `ClerkProvider` with `afterSignOutUrl=\"/\"`.
  - `src/components/Header.tsx` now renders `SignedOut/SignInButton/SignUpButton` and `SignedIn/OrganizationSwitcher/UserButton`.
  - `OrganizationSwitcher` trigger text styled to light gray for dark-theme readability.
  - Removed stale assumption that ClerkProvider may be missing from tree.
- Frontend authenticated API wiring added:
  - `src/lib/api/client.ts`: `getOrgMe(token)` for `/api/orgs/me`.
  - `src/features/studio/hooks/useBackendGeneration.ts`: token sourced via `useAuth().getToken()` for generation + cancel endpoints.
  - `src/features/learning/ModulesPage.tsx`: in backend mode, calls `/api/orgs/me` then `/api/modules`, and renders explicit states (signed out, token missing, API error, success counts).
- Studio generation flow fix:
  - `src/features/studio/hooks/useBackendGeneration.ts` now creates module records before starting backend generation stream.
  - Stream now uses backend module UUID instead of local slug id.
  - Backend failures are surfaced to UI via step error marking in `src/features/studio/StudioPage.tsx`.
- Stage-test validation hardening:
  - `apps/api/src/pipeline/schemas.ts` now preprocesses stage test output to accept alternate model keys (`questions`, `quiz`, nested `stageTest`) and raw arrays, mapping all to `{ test: [...] }`.
  - Mitigates `Structured output validation failed ... test: Required` loops.
- Runner retry hardening:
  - `apps/api/src/pipeline/jobRunner.ts` now executes steps via `runStepWithRetry`.
  - Improves resilience against transient step failures during long generation runs.
- Gemini provider integration (backend) added:
  - New client: `apps/api/src/pipeline/geminiClient.ts`.
  - `clientFactory` now supports `anthropic|gemini`.
  - Job runner now supports per-step provider routing by env.
  - Env vars added to API env files: `GEMINI_API_KEY`, `GEMINI_MODEL`, `PIPELINE_AI_PROVIDER`, `PIPELINE_PROVIDER_FACTCHECK`, `PIPELINE_PROVIDER_SOURCE_ATTRIBUTION`.
- Frontend runtime operational caveat:
  - Detached `pnpm dev` sessions in this automation environment may die after startup.
  - Keep frontend running in user terminal (`pnpm dev --host 127.0.0.1`) for stable local access.
- Local browser fetch issue resolved:
  - `apps/api/src/index.ts` now handles CORS + `OPTIONS` preflight before auth.
  - Verified: `OPTIONS /api/orgs/me` returns `204` with expected allow-origin/headers for `http://localhost:5173`.
  - `apps/api/src/routes/generation.ts` now sets CORS headers on SSE `POST /api/generation/:moduleId/start` response, fixing browser `Failed to fetch` during streamed generation.
- Org activation blocker bypassed for dev:
  - `apps/api/src/plugins/clerk.ts` now sets `request.auth.orgId` to `user_<clerkUserId>` when Clerk token has no `org_id`.
  - This allows `/api/orgs/me` + `/api/modules` to work for signed-in users without active Clerk org context.
- WORM controls hardened and checked:
  - `apps/api/src/db/schema.sql`: `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC`.
  - New verifier: `apps/api/src/db/verifyWorm.ts`.
  - New script: `pnpm --filter @complianceforge/api run db:verify-worm`.
  - Verification run result: all checks PASS on Neon.
- Reviewer API scaffold implemented:
  - New route file: `apps/api/src/routes/review.ts`
  - Added endpoints for findings list/create/disposition and attestation read/create.
  - All routes enforce org ownership via Clerk org context and module joins.
  - Disposition + attestation actions emit audit log events.
  - Attestation is gated on zero undisposed findings.
  - New route: `POST /api/review/:moduleId/seed-findings` seeds findings from generation fact-check step.
- Reviewer frontend scaffold implemented:
  - New page: `src/features/review/ReviewerPortalPage.tsx` at `/reviewer`.
  - Added review client methods in `src/lib/api/client.ts`.
  - Landing page now links to reviewer portal.
  - Reviewer page supports module selection, finding CRUD-lite (create + disposition), and attestation submission.
  - Attestation UI is locked until all findings are disposed.
- Reviewer UX hardening pass completed:
  - Findings sorted severity-first with undisposed priority.
  - Disposition buttons enforce rationale length before enable (10 chars regulatory, 5 otherwise).
  - Attestation moved from hardcoded payload to explicit form fields.
  - Attestation submit requires all fields + zero undisposed findings.
  - Reviewer UI now includes "Seed from latest generation fact-check" action.
- Studio cost-control improvement:
  - `WorkplaceIntakePanel` now has a dev-only `Lite run` preset (`2 stages / 2 lessons / 1 mission`).
  - Dev dropdown options now include low-count values for faster, cheaper generation debugging.
- New smoke test script (`apps/api/src/scripts/smoke-auth.ts`):
  - Requires `CLERK_TEST_TOKEN`.
  - Validates `/health`.
  - Calls `/api/orgs/me` with `Bearer` token and fails fast on non-2xx.

## Verified Behavior

- `pnpm --filter @complianceforge/api run db:migrate` succeeds.
- `pnpm --filter @complianceforge/api run build` succeeds.
- API runtime checks:
  - `GET /health` returns success.
  - Auth-protected routes return `401` without `Bearer` token.
  - `dev:clean` run confirmed: stale listener is terminated and server starts cleanly on `:3001`.
  - Browser hits to `/` and `/favicon.ico` return `401` (expected since only `/health` is unauthenticated).
- `smoke:auth` execution behavior:
  - Script wiring is valid.
  - Exits with clear error when `CLERK_TEST_TOKEN` is not set.
  - Exits with clear error if API is not running on `API_BASE_URL`/`localhost:3001`.
  - Exits with clear error when token value is placeholder (`your_real_token`).

## Known Operational Notes

- Port `3001` can be occupied by an existing Node watch process; starting another dev instance then fails with `EADDRINUSE`.
- If needed, identify existing listener with:
  - `lsof -nP -iTCP:3001 -sTCP:LISTEN`
- Sandbox cannot currently reach npm registry (`ENOTFOUND`), so `pnpm install` for dependency updates must be run from user shell with network access.
- Root `pnpm build` currently reports unrelated pre-existing TS issues in non-auth files; backend/auth wiring changes were not the source of those reported errors.

## Next Priority Actions

1. Run `smoke:auth` with a real `CLERK_TEST_TOKEN` to confirm end-to-end auth pass.
2. Run `pnpm install --no-frozen-lockfile` in network-enabled shell to refresh lockfile and install `@clerk/clerk-react`.
3. Re-run Studio generation and verify step events stream + module count increments.
4. Switch `PIPELINE_PROVIDER_FACTCHECK` + `PIPELINE_PROVIDER_SOURCE_ATTRIBUTION` to `gemini`, restart API, and compare output quality/cost.

## Update Rule

- Update this file after each significant implementation step or blocking issue.
- Update `CONTEXT.md` for architecture/product decisions and phase milestones.
