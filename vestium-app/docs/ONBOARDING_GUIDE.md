# Onboarding Guide

This guide is for reviewers, operators, and demo recording.

## 1) Local setup

```bash
npm install
echo "VITE_ENABLE_STUDIO=true" > .env.local
npm run dev
```

Open the local URL shown in terminal (usually `http://localhost:5173`).

## 2) 10-minute product walkthrough

1. Open `/` and show landing + disclaimer.
2. Open `/modules` and select one module.
3. Open one lesson and complete a quiz.
4. Run one simulator mission/fault scenario.
5. Return home and open `/studio`.
6. Configure a small module generation run.
7. Show validation report and explain blocking vs warning findings.
8. Show export output.

## 3) Studio operator SOP

1. Use a clean, lowercase `moduleId`.
2. Keep stage/lesson counts modest on first pass.
3. Let all generation steps finish before manual edits.
4. Treat `error` findings as blockers.
5. Re-run validation after fixes.
6. Run `npm run build` before commit.

## 4) Demo script (3-5 minutes)

- `00:00-00:30`: Problem framing and portfolio scope
- `00:30-01:30`: Learner flow (module, lesson, simulator)
- `01:30-03:30`: Studio flow (generate, validate, export)
- `03:30-05:00`: Reliability model + close

Suggested line:

"CurricuSmith is a personal development project focused on reliability-first AI curriculum generation. The learner side trains diagnostic reasoning. The creator side generates structured modules, validates them with deterministic checks, and exports app-ready artifacts."

## 5) Common issues

- Studio disabled: set `VITE_ENABLE_STUDIO=true`
- Stale Studio state: clear localStorage keys beginning with `studio-`
- Missing generated route: verify export/deploy step completed and rebuild
