# Vestium

> B2B SaaS — Compliance Evidence and Assurance Platform for UK Industrial Operators

Vestium enables qualified Health and Safety professionals to create, review, attest, deploy, and verify regulated operational content with a tamper-resistant evidence trail.

Content generation (modules, SOPs, RAMS) is a productivity accelerator; traceability and defensible assurance are the core product value.

---

## What It Is

Vestium is what an H&S director shows an HSE inspector, insurer, or auditor to demonstrate who approved what, when, and why.

It is **not an LMS.** It is a **Compliance Evidence and Assurance system** that produces inspection-ready records.

**Regulatory fulfilment:** The Reviewer Portal attestation workflow constitutes fulfilment of MHSWR 1999 Reg 7 (competent person documented involvement). This is the primary legal positioning of the product.

---

## Core Capabilities (Evidence-First)

- **Governed Lifecycle** — Draft -> Review -> Attest -> Deploy -> Verify
- **Competent Person Review Portal** — non-bypassable structured review workflow; Cat A findings block deployment; attestation is a formal professional declaration
- **Certificate Chain** — module certificate (content hash + source document versions + attestation) -> learner certificates (QR-verifiable, PDF, hash-linked)
- **WORM Audit Log** — write-once audit records with database-level controls
- **Stale Content Governance** — modules can be flagged as stale when source regulatory context changes
- **Generation Accelerator** — AI-assisted creation of modules, SOPs, and RAMS grounded in workplace context and regulatory schemas

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zod, react-router-dom v6 |
| Backend | Fastify 5 (TypeScript), Railway → Hetzner VPS at scale |
| Database | Neon (managed Postgres), pgvector for RAG corpus |
| Auth | Clerk (multi-tenant org management, JWT verification) |
| AI | Anthropic Claude (primary) + Google Gemini (domain survey, coherence pass, search grounding) |
| PDF | pdf-lib (certificate generation), pdf-parse (source document extraction) |

Monorepo structure (pnpm workspaces):

```
complianceforge/
├── apps/
│   └── api/                   # Fastify backend (port 3001)
├── packages/
│   └── types/                 # Shared TypeScript types (@complianceforge/types)
└── src/                       # Frontend (React + Vite)
    ├── app/                   # Routing + AppLayout
    ├── features/
    │   ├── studio/            # Studio generation pipeline
    │   ├── learning/          # Learner experience
    │   ├── review/            # Reviewer Portal
    │   └── sop/               # SOP viewer + review pages
    ├── lib/
    │   ├── api/client.ts      # Authenticated API fetch wrapper
    │   ├── features.ts        # Runtime feature flags
    │   └── training-core/     # Shared training types + theme registry
    └── regulatory/            # Regulatory schemas + workplace classifier
```

---

## Routes (Current IA)

| Path | Purpose |
|------|---------|
| `/` | Landing page |
| `/create` | Creation hub |
| `/create/module` | Module generation workflow |
| `/create/sop` | SOP generation workflow |
| `/create/rams` | RAMS creation workflow |
| `/learn` | Learner hub |
| `/audit` | Governance/audit hub |
| `/audit/reviewer` | Reviewer Portal |
| `/audit/director` | Director dashboard |
| `/learn/:moduleId` | Learner entry for AI-generated modules |
| `/sops/:id` | SOP viewer |
| `/sops/:id/review` | SOP review workflow |
| `/verify/:certNumber` | Public certificate verification (no auth) |

---

## Environment Variables

### Frontend (`.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend base URL. Leave empty to run in static-only mode. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (required for auth) |
| `VITE_FEATURE_BATCH_SOPS` | `true` to enable the Batch SOP generation mode (hidden feature; backend is always active) |

### Backend (`.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon Postgres connection string |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `ANTHROPIC_API_KEY` | Claude API key (server-side only) |
| `GEMINI_API_KEY` | Gemini API key |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `PIPELINE_AI_PROVIDER` | `anthropic` or `gemini` (default: anthropic) |
| `PIPELINE_PROVIDER_CRITIQUE` | Provider for critique pass (default: gemini) |

See `.env.example` in `apps/api/` for a full reference.

---

## Local Development

Requires: Node.js ≥20, pnpm ≥9

```bash
# Install dependencies
pnpm install

# Run frontend (127.0.0.1:5173)
pnpm dev --host 127.0.0.1

# Run API (port 3001) — separate terminal
pnpm --filter @complianceforge/api run dev:clean

# Run DB migrations
pnpm --filter @complianceforge/api run db:migrate

# Build all packages
pnpm build

# Pipeline smoke harness (no model tokens; mock provider)
pnpm --filter @complianceforge/api run smoke:generation

# Repeat 10 runs to catch orchestration regressions/flakiness
pnpm --filter @complianceforge/api run smoke:generation:loop
```

---

## Key Design Constraints

1. No invented legal claims — regulatory references trace to source documents in the registry
2. Nothing deploys without completed review + attestation
3. Audit records are designed to be tamper-resistant at DB level
4. Certificates are locked at issuance and hash-linked to approved content state
5. SOP source attribution is enforced; missing attribution escalates review severity
6. AI assists generation; accountable human review controls release

---

## Further Reading

| Document | Contents |
|----------|----------|
| `CONTEXT.md` | Full product context, pipeline architecture, regulatory environment |
| `DEVELOPMENT.md` | Development workflow and conventions |
| `DEPLOY.md` | Deployment procedures |
| `LAUNCH_CHECKLIST.md` | Go-live readiness checklist |
