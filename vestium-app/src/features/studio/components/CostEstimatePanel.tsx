import { estimateCost, formatUsd } from '../api/tokenEstimator';
import type { DomainConfig } from '../generator/types';

interface Props {
  config: DomainConfig;
  onBack: () => void;
  onStart: () => void;
}

export function CostEstimatePanel({ config, onBack, onStart }: Props) {
  const estimate = estimateCost(
    config.stageCount,
    config.lessonsPerStage,
    config.missionCount,
    config.sourceReferences.length,
    config.objectives.length
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10 px-4">
      <div>
        <h2 className="text-lg font-bold text-theme-text">Estimated Generation Cost</h2>
        <p className="mt-1 text-sm text-theme-secondary">
          Review before any API calls are made. Actual cost may vary ±30%.
        </p>
      </div>

      {/* Config summary */}
      <div className="rounded border border-theme-border bg-theme-surface/50 p-3 text-xs text-theme-secondary space-y-0.5">
        <div><span className="text-theme-muted">Module:</span> {config.moduleId}</div>
        <div><span className="text-theme-muted">Domain:</span> {config.domainPrompt.slice(0, 80)}{config.domainPrompt.length > 80 ? '…' : ''}</div>
        <div>
          <span className="text-theme-muted">Structure:</span>{' '}
          {config.stageCount} stages × {config.lessonsPerStage} lessons · {config.missionCount} missions
        </div>
        <div>
          <span className="text-theme-muted">Objectives:</span> {config.objectives.length}
        </div>
        <div>
          <span className="text-theme-muted">Source refs:</span> {config.sourceReferences.length}
        </div>
      </div>

      {/* Token table */}
      <div className="overflow-hidden rounded border border-theme-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-theme-border bg-theme-surface">
              <th className="py-2 pl-4 pr-2 text-left font-semibold text-theme-secondary">Step</th>
              <th className="py-2 px-2 text-right font-semibold text-theme-secondary">Input</th>
              <th className="py-2 px-2 text-right font-semibold text-theme-secondary">Output</th>
              <th className="py-2 pr-4 pl-2 text-right font-semibold text-theme-secondary">Provider</th>
            </tr>
          </thead>
          <tbody>
            {estimate.steps.map((step) => (
              <tr key={step.stepKey} className="border-b border-theme-border-subtle last:border-0">
                <td className="py-1.5 pl-4 pr-2 text-theme-secondary">{step.label}</td>
                <td className="py-1.5 px-2 text-right font-mono text-theme-secondary">
                  ~{step.inputTokens.toLocaleString()}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-theme-secondary">
                  ~{step.outputTokens.toLocaleString()}
                </td>
                <td className="py-1.5 pr-4 pl-2 text-right text-theme-muted">
                  {step.provider === 'gemini' ? 'Gemini' : 'Claude'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-theme-border bg-theme-surface/60">
              <td className="py-2 pl-4 pr-2 font-semibold text-theme-secondary">TOTAL</td>
              <td className="py-2 px-2 text-right font-mono font-semibold text-theme-secondary">
                ~{estimate.totalInputTokens.toLocaleString()}
              </td>
              <td className="py-2 pr-4 pl-2 text-right font-mono font-semibold text-theme-secondary" colSpan={2}>
                ~{estimate.totalOutputTokens.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Cost breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded border border-violet-800/40 bg-violet-900/20 px-4 py-3">
          <span className="text-sm text-theme-secondary">
            Estimated cost
          </span>
          <span className="font-mono text-lg font-bold text-violet-300">
            {formatUsd(estimate.estimatedUsdCost)}
          </span>
        </div>
        <div className="flex gap-4 text-xs text-theme-muted px-1">
          <span>Claude: ~{(estimate.anthropicInputTokens + estimate.anthropicOutputTokens).toLocaleString()} tokens</span>
          <span>Gemini: ~{(estimate.geminiInputTokens + estimate.geminiOutputTokens).toLocaleString()} tokens</span>
        </div>
      </div>

      <p className="text-xs text-theme-muted">
        Pricing: Anthropic Sonnet 4.6 ($3/MTok in, $15/MTok out) + Gemini 2.5 Flash ($0.15/MTok in, $0.60/MTok out).
        Includes critique cycles. Excludes conditional repair calls.
      </p>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="rounded border border-theme-border px-5 py-2.5 text-sm font-medium text-theme-secondary hover:border-theme-border hover:text-theme-text transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onStart}
          className="flex-1 rounded bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
        >
          Start Generation →
        </button>
      </div>
    </div>
  );
}
