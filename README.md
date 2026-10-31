# Vestium (formerly ComplianceForge / Curricusmith)

A governed AI platform that generates UK health and safety training modules and SOPs. Every output is checked against regulatory schemas, goes through a reviewer portal and attestation, and is sealed into a WORM audit trail.

- `vestium-app/` is a pnpm monorepo:
  - `src/` is the React + Vite + TypeScript + Tailwind front end
  - `apps/api` is the API (Postgres/Neon, Clerk auth, Anthropic/Gemini/OpenAI pipeline)
  - `packages/types` holds the shared types
  - `e2e/` has the Playwright tests
- Top-level docs: `CONTEXT.md` (full project context), `AUDIT-REPORT.md` (independent audit, 9 Mar 2026), `ONE-PAGER.md`, `DEMO-SCRIPT.md` and `MEMORY.md`.
- Setup and deploy: see `vestium-app/README.md`, `DEVELOPMENT.md` and `DEPLOY.md`. Copy the `.env.example` files to `.env` and fill them in.

This snapshot is the latest working copy (last edited 9 Mar 2026). Secrets, dependencies, build output, test auth state and screenshots are excluded.
