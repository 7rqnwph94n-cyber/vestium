// ─── Workplace Context View Model ────────────────────────────────────────────
// Maps WorkplaceContextDTO into a view model with guaranteed non-null defaults.

import type { WorkplaceContextDTO } from '@complianceforge/types';

// ─── View model ─────────────────────────────────────────────────────────────

export interface WorkplaceContextViewModel {
  industryType: string;
  industryLabel: string;
  operations: string;
  workforceProfile: string;
  hazardKeywords: string[];
  additionalContext: string;
}

// ─── Mapper ─────────────────────────────────────────────────────────────────

export function mapWorkplaceContext(
  dto: WorkplaceContextDTO | null | undefined,
): WorkplaceContextViewModel {
  return {
    industryType: dto?.industryType ?? '',
    industryLabel: dto?.industryLabel ?? '',
    operations: dto?.operations ?? '',
    workforceProfile: dto?.workforceProfile ?? '',
    hazardKeywords: Array.isArray(dto?.hazardKeywords) ? dto.hazardKeywords : [],
    additionalContext: dto?.additionalContext ?? '',
  };
}

// ─── Typed default ──────────────────────────────────────────────────────────
// For use when OrgContextDTO is missing — provides a valid WorkplaceContextDTO
// instead of an untyped empty object.

export const EMPTY_WORKPLACE_CONTEXT: WorkplaceContextDTO = {
  industryType: '',
  industryLabel: '',
  operations: '',
  workforceProfile: '',
  hazardKeywords: [],
  additionalContext: '',
};
