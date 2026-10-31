# TRE Case Study: Handling Source Conflicts

## Scope

This is a portfolio case study showing how TRE handles contradictions between generated claims and cited evidence.

## Scenario

A generated claim is too absolute, but source evidence is partial.

Example pattern:
- Claim: a method "always" works
- Evidence: supports common cases, not universal cases

## TRE response flow

1. Attribution binds claims to source IDs.
2. Fact-check classifies each claim: `supported`, `unsupported`, or `ambiguous`.
3. Deterministic validator applies severity rules.
4. High-risk findings are raised as blocking errors.
5. Operator repairs or regenerates only failing sections.
6. Validation re-runs before export.

## Why it matters

- Contradictions are explicit, not hidden in narrative text.
- Publish readiness is separated from model confidence.
- Operator gets a concrete, auditable fix path.

## Key references

- Types: `src/features/studio/generator/types.ts`
- Rules: `src/features/studio/generator/validator.ts`
- UI reporting: `src/features/studio/components/ValidationReport.tsx`

## Portfolio-safe wording

"TRE classifies contradictory or weakly supported claims and routes them through deterministic validation policy before export."
