// ─── Generation Metadata View Model ──────────────────────────────────────────
// Maps raw GenerationMetadataDTO (modules) or Record<string, unknown> (SOP/RAMS)
// into a typed view model for UI consumption. All boundary uncertainty is handled
// here — pages/components never cast metadata themselves.

import type { GenerationMetadataDTO } from '@complianceforge/types';

// ─── View model ─────────────────────────────────────────────────────────────

export interface GenerationMetadataViewModel {
  failed: boolean;
  error: string | null;
  failedAt: string | null;
  completedAt: string | null;
  totalTokensUsed: number | null;
  stepsCompleted: number | null;
  totalSteps: number | null;
}

// ─── Raw metadata union ─────────────────────────────────────────────────────
// Modules use GenerationMetadataDTO; SOP/RAMS use Record<string, unknown>.
// Both may carry optional failure fields stamped by jobRunner catch blocks.

type RawMetadata = GenerationMetadataDTO | Record<string, unknown> | null | undefined;

function prop(obj: Record<string, unknown>, key: string): unknown {
  return obj[key];
}

function asRecord(raw: RawMetadata): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Record<string, unknown>;
}

// ─── Mapper ─────────────────────────────────────────────────────────────────

export function mapGenerationMetadata(dto: RawMetadata): GenerationMetadataViewModel {
  const r = asRecord(dto);
  if (!r) {
    return {
      failed: false,
      error: null,
      failedAt: null,
      completedAt: null,
      totalTokensUsed: null,
      stepsCompleted: null,
      totalSteps: null,
    };
  }

  return {
    failed: Boolean(prop(r, 'failed')),
    error: typeof prop(r, 'error') === 'string' ? (prop(r, 'error') as string) : null,
    failedAt: typeof prop(r, 'failedAt') === 'string' ? (prop(r, 'failedAt') as string) : null,
    completedAt: typeof prop(r, 'completedAt') === 'string' ? (prop(r, 'completedAt') as string) : null,
    totalTokensUsed: typeof prop(r, 'totalTokensUsed') === 'number' ? (prop(r, 'totalTokensUsed') as number) : null,
    stepsCompleted: typeof prop(r, 'stepsCompleted') === 'number' ? (prop(r, 'stepsCompleted') as number) : null,
    totalSteps: typeof prop(r, 'totalSteps') === 'number' ? (prop(r, 'totalSteps') as number) : null,
  };
}

// ─── Convenience helper ─────────────────────────────────────────────────────
// Single-purpose: replaces `Boolean((meta as unknown as Record<string,unknown>)?.failed)`

export function isGenerationFailed(dto: RawMetadata): boolean {
  const r = asRecord(dto);
  return r ? Boolean(prop(r, 'failed')) : false;
}
