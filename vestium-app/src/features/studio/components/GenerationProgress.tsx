// ─── GenerationProgress — step-by-step SSE progress view ─────────────────────

import { cx } from '../../../utils/classNames';

export interface StepProgress {
  key: string;
  status: 'pending' | 'running' | 'done' | 'error';
  error?: string;
}

interface Props {
  steps: StepProgress[];
  error?: string | null;
  title?: string;
}

const STEP_LABELS: Record<string, string> = {
  blueprint: 'Blueprint',
  missions: 'Missions',
  placementAssessment: 'Placement Assessment',
  lessonMissionMap: 'Lesson ↔ Mission Map',
  sourceAttribution: 'Source Attribution',
  coherencePass: 'Coherence Pass',
  factCheckA: 'Fact Check (Anthropic)',
  factCheckG: 'Fact Check (Gemini)',
  factCheckMerge: 'Fact Check Merge',
  simulatorDesign: 'Simulator Design',
  faultAndReference: 'Fault Scenarios & Reference Cards',
  builderAndCapstone: 'Builder & Capstone',
  themeShell: 'Theme Shell',
  repairArtifacts: 'Repair Artifacts',
  // SOP steps
  sop_extract: 'Extract Source Content',
  sop_structure: 'Structure Procedure',
  sop_regulatory: 'Regulatory Mapping',
  sop_assemble: 'Assemble Document',
};

function stepLabel(key: string): string {
  if (STEP_LABELS[key]) return STEP_LABELS[key];
  // stage_1 → "Stage 1 Content", test_1 → "Stage 1 Test"
  const stageMatch = key.match(/^stage_(\d+)$/);
  if (stageMatch) return `Stage ${stageMatch[1]} Content`;
  const testMatch = key.match(/^test_(\d+)$/);
  if (testMatch) return `Stage ${testMatch[1]} Test`;
  return key;
}

export function GenerationProgress({ steps, error, title }: Props) {
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const totalCount = steps.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10 px-4">
      {/* Main progress card */}
      <div className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-theme-text">
            {title ?? 'Generation in progress…'}
          </h2>
          <p className="mt-1 text-sm text-theme-secondary">
            Step {doneCount} of {totalCount} ({pct}%)
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-theme-surface">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Step list */}
        <div className="space-y-1">
          {steps.map((step) => (
            <div
              key={step.key}
              className={cx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                step.status === 'running' && 'bg-violet-500/10 border border-violet-500/30',
                step.status === 'done' && 'text-theme-secondary',
                step.status === 'error' && 'bg-red-500/10 border border-red-500/30',
                step.status === 'pending' && 'text-theme-muted',
              )}
            >
              {/* Status icon */}
              <span className="flex-shrink-0 w-5 text-center">
                {step.status === 'done' && <span className="text-emerald-400">✓</span>}
                {step.status === 'running' && (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                )}
                {step.status === 'error' && <span className="text-red-400">✕</span>}
                {step.status === 'pending' && <span className="text-theme-muted">·</span>}
              </span>

              {/* Label */}
              <span className={cx(
                step.status === 'running' && 'text-violet-300 font-medium',
                step.status === 'done' && 'text-theme-secondary',
                step.status === 'error' && 'text-red-300',
              )}>
                {stepLabel(step.key)}
              </span>

              {/* Error detail */}
              {step.status === 'error' && step.error && (
                <span className="ml-auto text-xs text-red-400 truncate max-w-[200px]" title={step.error}>
                  {step.error}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Global error card */}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-theme-panel px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-400">Generation Failed</p>
          <p className="mt-1 text-sm text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}
