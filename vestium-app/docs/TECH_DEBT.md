# Tech Debt Tracker

## TD-001: Eliminate unsafe UI boundary casts

**Priority:** Medium
**Tagged:** v0.9.0-rc1
**Status:** Resolved (v0.9.0-rc3 → TD-001 PR)

### Problem

15 locations across 8 frontend files used `as Record<string, unknown>` or
`as unknown as Record<string, unknown>` to bridge typed DTOs into untyped
property bags at page/component boundaries.

### Resolution

Introduced explicit view-model mapper layer at `src/lib/mappers/`:

| Mapper | Purpose |
|--------|---------|
| `generationMetadata.mapper.ts` | `mapGenerationMetadata()` + `isGenerationFailed()` — absorbs `GenerationMetadataDTO` / `Record<string, unknown>` boundary |
| `workplaceContext.mapper.ts` | `mapWorkplaceContext()` + `EMPTY_WORKPLACE_CONTEXT` typed default |
| `ramsJobState.mapper.ts` | `mapRamsJobState()` — extracts registryId + draft from raw `unknown` job state |
| `sopDraft.mapper.ts` | `extractSopDraft<T>()` — typed extraction from `generationMetadata` |

Refactored consumers:
- `deriveContentStatus()` now accepts `{ failed: boolean }` instead of `Record<string, unknown>`
- `runSopFlow()` accepts `WorkplaceContext` + `WorkplaceClassificationResult` directly
- `RamsIntakePanel` props typed to `WorkplaceContextDTO` + `ClassificationSummaryDTO`
- `createSop()` / `createRams()` API client params accept typed DTOs + `object`

**Cast count in affected files: 0** (was 15).

### Remaining boundary notes

These are NOT unsafe casts — they are either inside mapper boundaries, test
fixtures, or unrelated code:

- `generationMetadata.mapper.ts` / `ramsJobState.mapper.ts` — casts inside
  mappers are the intended location for boundary uncertainty
- `schemas.ts:335` — recursive object walker, legitimate `Record` use
- `ModulesPage.visibility.test.ts` — test fixture casts (`as unknown as`)
- `registry.ts:80` — theme config cast (separate concern)
- `RolePlaySimulatorPanel.tsx:17` — mission type cast (separate concern)
