import type { GenerationJob } from '../generator/types';

interface Props {
  job: GenerationJob;
  currentKeys: string[];
  onStepClick?: (key: string) => void;
}

function stepLabel(key: string): string {
  if (key === 'blueprint') return 'Blueprint';
  if (key === 'missions') return 'Missions';
  if (key === 'placementAssessment') return 'Placement';
  if (key === 'lessonMissionMap') return 'Lesson gating map';
  if (key === 'sourceAttribution') return 'Source attribution';
  if (key === 'coherencePass') return 'Coherence';
  if (key === 'factCheckA') return 'Fact check A';
  if (key === 'factCheckG') return 'Fact check G';
  if (key === 'factCheckMerge') return 'Fact check';
  if (key === 'factCheck') return 'Fact check';  // legacy
  if (key === 'repairArtifacts') return 'Repair';
  if (key === 'simulatorDesign') return 'Simulator design';
  if (key === 'faultAndReference') return 'Fault & reference';
  if (key === 'builderAndCapstone') return 'Builder & capstone';
  if (key === 'themeShell') return 'Theme shell';
  const stageMatch = key.match(/^stage_(\d+)$/);
  if (stageMatch) return `Stage ${stageMatch[1]} lessons`;
  const testMatch = key.match(/^test_(\d+)$/);
  if (testMatch) return `Stage ${testMatch[1]} test`;
  return key;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
        ✓
      </span>
    );
  }
  if (status === 'running' || status === 'streaming') {
    return (
      <span className="flex h-5 w-5 items-center justify-center">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-xs">
        ✗
      </span>
    );
  }
  // pending
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-theme-border text-slate-700 text-xs">
      ○
    </span>
  );
}

export function StepProgressRail({ job, currentKeys, onStepClick }: Props) {
  return (
    <nav className="w-52 shrink-0 border-r border-theme-border-subtle bg-theme-panel/60 py-6 px-3">
      <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-theme-muted">
        Steps
      </p>
      <ul className="space-y-1">
        {job.stepSequence.map((key) => {
          const step = job.steps[key];
          const status = step?.status ?? 'pending';
          const isActive = currentKeys.includes(key);

          return (
            <li
              key={key}
              onClick={() => onStepClick?.(key)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                onStepClick && status !== 'pending' ? 'cursor-pointer hover:bg-theme-surface/60' : ''
              } ${
                isActive
                  ? 'bg-violet-900/30 text-violet-300'
                  : status === 'done'
                  ? 'text-theme-secondary'
                  : status === 'error'
                  ? 'text-red-400'
                  : 'text-theme-muted'
              }`}
            >
              <StatusIcon status={isActive ? 'running' : status} />
              <span className="truncate">{stepLabel(key)}</span>
              {step?.tokensUsed > 0 && (
                <span className="ml-auto shrink-0 text-slate-700 font-mono">
                  {step.tokensUsed.toLocaleString()}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
