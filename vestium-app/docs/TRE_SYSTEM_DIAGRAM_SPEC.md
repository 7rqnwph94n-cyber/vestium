# TRE System Diagram Spec

Use this to create one architecture diagram for portfolio/review use.

## Diagram objective

Show how a domain prompt is transformed into a validated, exportable module through deterministic gates.

## Required layers

1. Input/Control
- Operator config (`moduleId`, domain, counts, objectives)
- Job state (`pending/running/done/error`)

2. Generation pipeline
- Blueprint
- Lessons xN
- Tests xN
- Missions
- Placement
- Attribution
- Fact-check
- Theme shell

3. Validation/assembly
- Assembler
- Rule validator
- Hard errors/warnings
- Validity summary card

4. Output/integration
- Runtime preview
- Export artifacts
- Deploy integration

5. Persistence (cross-cut)
- localStorage
- IndexedDB fallback/hydration

## Mandatory callouts

- Blueprint integrity gate
- Critique + targeted repair
- Deterministic validation blocks high-risk failures
- Typed export for app integration
- AST-safe registry patching

## Mermaid starter

```mermaid
flowchart LR
  A[Operator Input] --> B[Job State]
  B --> C1[Blueprint]
  C1 --> C2[Lessons xN]
  C2 --> C3[Tests xN]
  C3 --> C4[Missions]
  C4 --> C5[Placement]
  C5 --> C6[Attribution]
  C6 --> C7[Fact Check]
  C7 --> C8[Theme Shell]

  C8 --> D1[Assembler]
  D1 --> D2[Deterministic Validator]
  D2 --> D3[Errors / Warnings]
  D2 --> D4[Validity Summary]

  D4 --> E1[Preview]
  D4 --> E2[Export]
  E2 --> E3[Deploy Integration]

  P1[localStorage] -.hydrate/persist.- B
  P2[IndexedDB] -.fallback/hydrate.- B
