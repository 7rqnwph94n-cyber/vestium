# Technical Reasoning Engine (TRE)

## Scope Statement

This TRE implementation is part of a **personal development/portfolio project**.
It demonstrates a reliability-oriented AI workflow for governed operational content and compliance evidence artifacts.

It is not marketed as a zero-hallucination system.

## Purpose

Traditional one-shot prompting is fast but brittle for technical education.
TRE reduces risk by combining:
- staged generation,
- strict schema contracts,
- critique/repair loops,
- deterministic validation,
- and typed export paths.

## Architecture Overview

High-level Studio flow:
1. Blueprint
2. Stage Lessons (xN)
3. Stage Tests (xN)
4. Missions
5. Placement
6. Lesson-Mission mapping
7. Attribution
8. Fact-check
9. Theme shell + assembly
10. Validation + export

Core references:
- `src/features/studio/generator/types.ts`
- `src/features/studio/generator/stepRunners.ts`
- `src/features/studio/generator/orchestrator.ts`

## Reliability Controls

### 1) Contract-first generation
- Each stage returns structured JSON with required fields and counts.
- Invalid shape/counts are rejected and repaired.

### 2) Critique and targeted repair
- Failed outputs are patched at section level instead of full regeneration.

### 3) Deterministic validator
- Rule-based checks enforce quality constraints (citations, claim status, alignment).
- High-severity unsupported/ambiguous findings can block publish-ready status.

Reference:
- `src/features/studio/generator/validator.ts`

### 4) State resilience
- Studio run state persists in localStorage with IndexedDB fallback/hydration.

Reference:
- `src/features/studio/storage/persistedStateStore.ts`

### 5) Codebase-safe integration
- Registry updates are handled via AST-safe patching, not regex-only mutation.

Reference:
- `vite-studio-api.ts`
- `vite-studio-api.test.ts`

## Output Surface

Studio can produce:
- generated theme/module code,
- validation reports,
- export artifacts for integration.

## Truthfulness Positioning

Use this wording:
- "High-integrity" / "risk-reducing" generation architecture

Avoid this wording:
- "Zero hallucination"
- "No human review needed"

## Related Docs

- Prompt contract details: `docs/UNIVERSAL_MODULE_PROMPT_ARCHITECTURE.md`
- Diagram spec: `docs/TRE_SYSTEM_DIAGRAM_SPEC.md`
- Contradiction handling example: `docs/TRE_CASE_STUDY_CONFLICT_RESOLUTION.md`
