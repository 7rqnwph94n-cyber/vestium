# Universal Module Prompt Architecture

This document defines the canonical prompt contract used by Studio to generate domain-specific modules with consistent structure.

## 1) Guardrails (always on)

- Domain-native language only
- No cross-domain leakage terminology
- Scored questions limited to `mcq` and `tf`
- Every lesson includes `youTry`
- Module includes simulator + missions + fault scenarios + capstone
- Evidence-first diagnostic pedagogy is preserved across stages

## 2) Required generated sections

1. `moduleOverview`
2. `placementAssessment`
3. `curriculumStages`
4. `lessonDefinitions`
5. `simulatorDesign`
6. `missions`
7. `faultScenarioCampaign`
8. `fieldReferenceCards`
9. `builderExercises`
10. `capstoneChallenge`
11. `progressionScoringRules`
12. `implementationNotes`

IDs must be deterministic (for example: `s1-l1`, `m1`, `fc1`, `scn01`).

## 3) Prompt stack

### Layer A: System guardrails
Defines universal behavior and hard constraints.

### Layer B: Run spec
Provides domain/audience/count parameters for each run.

### Layer C: Schema contract
Defines exact keys, shape, and quantitative constraints.

### Layer D: QA gate
Returns:
- `pass`
- `score`
- `errors[]`
- `warnings[]`
- `repairPrompt`

## 4) Orchestration sequence

1. Generate overview + placement + stage skeleton
2. Generate lessons by stage
3. Generate simulator design
4. Generate missions + prerequisites
5. Generate fault campaign
6. Generate field reference + builder exercises
7. Generate capstone + scoring
8. Run QA gate
9. Run targeted repairs until pass

Rule: patch failing sections only; avoid full regeneration when unnecessary.

## 5) Rejection rubric

Reject output if it is generic, structurally incomplete, non-deterministic, or missing operational simulator/fault detail.

## 6) App-facing type alignment

Generated artifacts must map to existing TypeScript shapes used by the app (questions, lessons, diagrams, assessments, etc.) and be export-safe.

## 7) Definition of done

A run is complete when:
- QA gate returns `pass=true`
- count constraints are exact
- no domain leakage is present
- output is directly transformable to app data structures
