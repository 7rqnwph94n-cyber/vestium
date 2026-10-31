// ─── Feature flags ────────────────────────────────────────────────────────────
// Runtime flags are evaluated at build time from Vite env vars.
// To enable a hidden feature locally, add the flag to .env.local:
//
//   VITE_FEATURE_BATCH_SOPS=true
//
// Never commit .env.local. Do not set these flags in production without
// corresponding backend readiness and QA sign-off.

export const FEATURES = {
  /**
   * Batch SOP generation.
   *
   * Allows users to generate SOPs for multiple pieces of equipment in a single
   * Studio session, sharing the same workplace context and regulatory classification.
   * Each SOP is created as an independent record and generation is triggered
   * separately per SOP via the standard SSE pipeline.
   *
   * Backend: POST /api/sops/batch — always active.
   * Frontend: gated here. Enable with VITE_FEATURE_BATCH_SOPS=true in .env.local.
   */
  BATCH_SOPS: import.meta.env.VITE_FEATURE_BATCH_SOPS === 'true',
} as const;
