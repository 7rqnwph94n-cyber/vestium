# Development Guide

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm`)
- A Neon Postgres database (or local Postgres with pgvector extension)
- Clerk account (dev instance is sufficient for local work)
- Anthropic API key
- Gemini API key (for domain survey, coherence pass, and embedding)

---

## Setup

```bash
pnpm install
```

Copy the environment variable templates and fill in your values:

```bash
cp apps/api/.env.example apps/api/.env
cp .env.example .env.local   # frontend
```

Run database migrations before the first start:

```bash
pnpm --filter @complianceforge/api run db:migrate
```

---

## Dev Workflow

```bash
# Frontend (Vite — 127.0.0.1:5173)
pnpm dev --host 127.0.0.1

# API (Fastify — port 3001) — separate terminal
pnpm --filter @complianceforge/api run dev:clean

# Both together (if concurrently is configured in root package.json)
pnpm dev
```

> Use `127.0.0.1` not `localhost` for the frontend dev server — CORS is configured for both
> but the Clerk redirect URLs must match what you register in the Clerk dashboard.

---

## Build

```bash
# Build all packages (API + frontend)
pnpm build

# Build API only
pnpm --filter @complianceforge/api run build

# Build frontend only
pnpm --filter complianceforge build
```

Both should produce zero TypeScript errors. The API build output is `apps/api/dist/`.

---

## Testing

```bash
pnpm test                # run Vitest (frontend unit tests)
pnpm --filter complianceforge run test:watch
```

---

## Database

```bash
# Apply migrations (idempotent — safe to re-run)
pnpm --filter @complianceforge/api run db:migrate

# Verify WORM constraints
pnpm --filter @complianceforge/api run db:verify-worm

# Seed proxy asset library (ISO 7010 + IEC 60417 symbols — 65 records, idempotent)
pnpm --filter @complianceforge/api run db:seed-assets

# Embed regulatory source documents into document_chunks (RAG corpus, idempotent)
pnpm --filter @complianceforge/api run db:embed-docs
```

---

## Feature Flags

Runtime flags are evaluated at Vite build time from environment variables. To enable a hidden feature locally, add the flag to `.env.local` (never committed):

| Flag | Env var | Description |
|------|---------|-------------|
| `FEATURES.BATCH_SOPS` | `VITE_FEATURE_BATCH_SOPS=true` | Batch SOP generation mode in Studio — generates SOPs for multiple pieces of equipment sharing the same workplace context. Backend endpoint (`POST /api/sops/batch`) is always active regardless of this flag. |

Feature flags are defined in `src/lib/features.ts`. Add new flags there with a JSDoc comment describing the backend/frontend gate status and the enable instruction.

---

## Branch Hygiene

- Keep `main` deployable at all times
- Run `pnpm build` before every commit — zero TypeScript errors required
- Prefer small commits tied to a single change objective
- Do not commit `.env`, `.env.local`, or any file containing secrets

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/lib/features.ts` | Runtime feature flags |
| `src/lib/api/client.ts` | Authenticated API fetch wrapper (all backend calls) |
| `src/app/router.tsx` | Route definitions |
| `src/features/studio/StudioPage.tsx` | Generation Studio orchestration |
| `src/features/studio/components/WorkplaceIntakePanel.tsx` | Workplace context + SOP intake form |
| `src/features/sop/SopIntakePanel.tsx` | SOP-specific intake (procedure, equipment, file upload) |
| `apps/api/src/index.ts` | Fastify server entry point — route registration |
| `apps/api/src/routes/sops.ts` | SOP CRUD + batch create |
| `apps/api/src/routes/sopGeneration.ts` | SOP SSE generation pipeline |
| `apps/api/src/routes/sopReview.ts` | SOP findings + attestation |
| `apps/api/src/pipeline/sopJobRunner.ts` | 4-step SOP pipeline runner |
| `apps/api/src/db/schema.sql` | Full Postgres schema (authoritative) |
