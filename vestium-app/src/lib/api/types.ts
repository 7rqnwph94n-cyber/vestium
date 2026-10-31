// ─── Re-export jobRunner SSE event type for frontend use ─────────────────────
// The frontend needs JobStepEvent to type the SSE stream. We define it here
// (mirroring apps/api/src/pipeline/jobRunner.ts) rather than importing from
// the API package directly, to keep the frontend independent of the API package.

export interface JobStepEvent {
  event: 'step_started' | 'step_done' | 'step_error' | 'job_complete' | 'job_failed';
  stepKey?: string;
  parsedJson?: unknown;
  rawOutput?: string;
  tokensUsed?: number;
  error?: string;
  totalTokensUsed?: number;
}
