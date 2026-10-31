import { useState } from 'react';
import type { GenerationTelemetry, ModuleReviewReport, ValidationError } from '../generator/types';

interface Props {
  errors: ValidationError[];
  validityCard: {
    objectiveEvidenceCoveragePct: number;
    criticalCitationDepthPct: number;
    missionGateAlignmentPct: number;
    placementStabilityPct: number;
    overallPct: number;
  } | null;
  assembleError: string | null;
  onProceed: () => void;
  onGoBack: () => void;
  onAutoFix: () => void;
  isAutoFixing: boolean;
  autoFixPass: number;
  autoFixMaxPasses: number;
  strictMode: boolean;
  onToggleStrictMode: () => void;
  onReverifySources: () => void;
  validationInProgress: boolean;
  moduleReview: ModuleReviewReport | null;
  moduleReviewInProgress: boolean;
  onRunModuleReview: () => void;
  telemetry: GenerationTelemetry | null;
  estimatedUsdCost?: number;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

// Human-readable explanations shown in the issue detail modal
const RULE_DESCRIPTIONS: Record<string, string> = {
  STAGE_TEST_APPLICATION_RATIO_LOW:
    'Stage test questions are skewed toward knowledge recall. A higher proportion of decision/scenario questions is recommended to test applied competency.',
  LESSON_QUIZ_APPLICATION_RATIO_HIGH:
    'This quiz has too many scenario/application questions relative to foundational knowledge checks. A balance of recall and application is recommended.',
  MISSING_SCORE_100_BRANCH:
    'Mission branches should include one clearly representing the ideal response (score 100). This anchors learner understanding of the correct approach.',
  MISSING_SCORE_0_BRANCH:
    'Mission branches should include one clearly representing the wrong response (score 0). This reinforces what to avoid and makes the scoring spectrum meaningful.',
  FACT_CHECK_AMBIGUOUS_HIGH:
    'A high-severity claim could not be definitively verified. This may indicate the claim needs rewording or stronger source attribution before deployment.',
  FACT_CHECK_SOURCE_IDS_EMPTY:
    'This fact-check item carries no source references. Every claim in a regulatory module should be attributable to a specific source document.',
  OBJECTIVE_EVIDENCE_MISSION_MISSING:
    'A module objective has no representation in any mission scenario. Missions should operationalise all key learning objectives so learners can practise, not just read.',
  SYNTHETIC_PROFILE_NO_ACCESSIBLE_MISSIONS:
    'A simulated learner profile has no missions it can access at its recommended stage. Check that missions do not have prerequisites that exclude novice or developing learners.',
  SYNTHETIC_PLACEMENT_PROFILE_MISMATCH:
    'The placement assessment is routing a simulated learner to an unexpected stage. Review the recommendation threshold settings for consistency.',
  EXTERNAL_CLAIM_CHECK_NOT_CONFIGURED:
    'No external claim-verification providers are configured for this regulatory domain. Claims have not been cross-checked against external knowledge bases.',
  SOURCE_YEAR_OUTDATED:
    'Source appears older than 12 years. While legislation in force is always current, guidance documents and ACoPs may have revised editions. Verify manually.',
  EXTERNAL_SOURCE_FRESHNESS_LOW:
    'Source age exceeds the freshness policy for this domain. Confirm the document is still current and has not been superseded.',
  SOURCE_URL_STATUS_UNKNOWN:
    'The URL reachability check returned an opaque response (CORS). The URL cannot be confirmed as live from the browser. Verify manually if needed.',
};

function issueKey(e: ValidationError) {
  return `${e.rule}::${e.path}`;
}

// ─── Issue detail modal ───────────────────────────────────────────────────────

function IssueModal({
  issue,
  onAcknowledge,
  onClose,
}: {
  issue: ValidationError;
  onAcknowledge: () => void;
  onClose: () => void;
}) {
  const isError = issue.severity === 'error';
  const description = RULE_DESCRIPTIONS[issue.rule];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-theme-border bg-theme-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between rounded-t-lg px-4 py-3 ${
            isError ? 'bg-red-950/60' : 'bg-amber-950/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-bold ${
                isError
                  ? 'bg-red-900/60 text-red-300'
                  : 'bg-amber-900/50 text-amber-300'
              }`}
            >
              {isError ? 'ERROR' : 'WARNING'}
            </span>
            <span className="font-mono text-xs text-theme-secondary">{issue.rule}</span>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-secondary transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-4 py-4">
          <p className={`text-sm ${isError ? 'text-red-200' : 'text-amber-200'}`}>
            {issue.message}
          </p>

          <div className="rounded border border-theme-border bg-theme-surface/50 px-3 py-2">
            <p className="text-xs text-theme-muted mb-0.5">Path</p>
            <p className="font-mono text-xs text-theme-secondary">{issue.path}</p>
          </div>

          {description && (
            <div className="rounded border border-theme-border/50 bg-theme-surface/30 px-3 py-2">
              <p className="text-xs text-theme-muted mb-1">What is this?</p>
              <p className="text-xs text-theme-secondary leading-relaxed">{description}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-theme-border/60 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded border border-theme-border px-4 py-1.5 text-xs text-theme-secondary hover:border-theme-border transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => { onAcknowledge(); onClose(); }}
            className={`rounded px-4 py-1.5 text-xs font-semibold transition-colors ${
              isError
                ? 'bg-red-700/60 text-red-100 hover:bg-red-700/80'
                : 'bg-amber-700/50 text-amber-100 hover:bg-amber-700/70'
            }`}
          >
            Verify & Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ValidationReport({
  errors,
  validityCard,
  assembleError,
  onProceed,
  onGoBack,
  onAutoFix,
  isAutoFixing,
  autoFixPass,
  autoFixMaxPasses,
  strictMode,
  onToggleStrictMode,
  onReverifySources,
  validationInProgress,
  moduleReview,
  moduleReviewInProgress,
  onRunModuleReview,
  telemetry,
  estimatedUsdCost
}: Props) {
  const [selectedIssue, setSelectedIssue] = useState<ValidationError | null>(null);
  const [acknowledgedKeys, setAcknowledgedKeys] = useState<Set<string>>(new Set());

  const acknowledge = (e: ValidationError) => {
    setAcknowledgedKeys((prev) => new Set([...prev, issueKey(e)]));
  };
  const isAcknowledged = (e: ValidationError) => acknowledgedKeys.has(issueKey(e));

  const syntheticIssues = errors.filter((e) => e.rule.startsWith('SYNTHETIC_'));
  const nonSyntheticIssues = errors.filter((e) => !e.rule.startsWith('SYNTHETIC_'));

  const allHardErrors = errors.filter((e) => e.severity === 'error');
  const warnings = nonSyntheticIssues.filter((e) => e.severity === 'warning');
  const syntheticHardErrors = syntheticIssues.filter((e) => e.severity === 'error');
  const syntheticWarnings = syntheticIssues.filter((e) => e.severity === 'warning');
  const nonSyntheticHardErrors = nonSyntheticIssues.filter((e) => e.severity === 'error');

  // Active = not yet acknowledged; these drive the export gate
  const activeHardErrors = allHardErrors.filter((e) => !isAcknowledged(e));
  const activeWarnings = warnings.filter((e) => !isAcknowledged(e));

  const canExport =
    activeHardErrors.length === 0 && !assembleError && (!strictMode || activeWarnings.length === 0);

  const acknowledgedCount = acknowledgedKeys.size;

  return (
    <>
      {/* Issue detail modal */}
      {selectedIssue && (
        <IssueModal
          issue={selectedIssue}
          onAcknowledge={() => acknowledge(selectedIssue)}
          onClose={() => setSelectedIssue(null)}
        />
      )}

      <div className="mx-auto max-w-2xl space-y-6 py-10 px-4">
        <div>
          <h2 className="text-lg font-bold text-theme-text">Validation Report</h2>
          <p className="mt-1 text-sm text-theme-secondary">
            Errors must be resolved before export. Warnings are advisory unless strict mode is enabled.
            {acknowledgedCount > 0 && (
              <span className="ml-1 text-emerald-400">
                {acknowledgedCount} issue{acknowledgedCount !== 1 ? 's' : ''} verified & dismissed.
              </span>
            )}
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded border border-theme-border bg-theme-panel/60 px-3 py-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-theme-secondary">
              <input
                type="checkbox"
                checked={strictMode}
                onChange={onToggleStrictMode}
              />
              Strict validation (block export on warnings)
            </label>
          </div>
          <div className="mt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onReverifySources}
                disabled={validationInProgress || Boolean(assembleError)}
                className="rounded border border-theme-border px-3 py-1.5 text-xs text-theme-text hover:border-theme-border disabled:cursor-not-allowed disabled:opacity-40"
              >
                {validationInProgress ? 'Re-verifying sources…' : 'Re-verify Sources'}
              </button>
              <button
                type="button"
                onClick={onRunModuleReview}
                disabled={moduleReviewInProgress || Boolean(assembleError)}
                className="rounded border border-violet-600/60 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {moduleReviewInProgress ? 'Generating full module review…' : 'Generate Full Module Review'}
              </button>
            </div>
          </div>
        </div>

        {moduleReview && (
          <div className="rounded border border-theme-border bg-theme-panel/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-theme-text">Full Module Review</p>
              <span className="rounded bg-violet-900/40 px-2 py-0.5 text-xs font-bold text-violet-300">
                Overall {moduleReview.overallScore}%
              </span>
              <span className="rounded bg-theme-surface px-2 py-0.5 text-xs text-theme-secondary">
                Scaffold {moduleReview.scaffoldingScore}%
              </span>
              <span className="rounded bg-theme-surface px-2 py-0.5 text-xs text-theme-secondary">
                Publish-ready {moduleReview.publishReadyScore}%
              </span>
            </div>
            <p className="text-xs text-theme-secondary">{moduleReview.oneSentenceRecommendation}</p>
            <p className="text-xs text-theme-secondary">Verdict: {moduleReview.verdict}</p>
            <div>
              <p className="text-xs font-semibold text-emerald-300">Strengths</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-theme-secondary space-y-0.5">
                {moduleReview.strengths.map((strength, idx) => (
                  <li key={`strength-${idx}`}>{strength}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-red-300">Critical Findings</p>
              <ul className="mt-1 space-y-1.5">
                {moduleReview.criticalFindings.map((finding, idx) => (
                  <li
                    key={`finding-${idx}`}
                    className={`rounded border px-2 py-1.5 ${
                      finding.severity === 'error'
                        ? 'border-red-900 bg-red-950/40'
                        : 'border-amber-900/40 bg-amber-950/20'
                    }`}
                  >
                    <p className="text-xs font-semibold text-theme-text">{finding.title}</p>
                    <p className="text-xs text-theme-secondary">{finding.message}</p>
                    <p className="mt-0.5 font-mono text-xs text-theme-muted">{finding.evidencePath}</p>
                    <p className="mt-0.5 text-xs text-sky-300">Fix: {finding.recommendation}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-theme-text">Priority Fix Plan</p>
              <ol className="mt-1 list-decimal pl-5 text-xs text-theme-secondary space-y-0.5">
                {moduleReview.priorities.map((priority, idx) => (
                  <li key={`priority-${idx}`}>{priority}</li>
                ))}
              </ol>
            </div>
            {moduleReview.notes && <p className="text-xs text-theme-secondary">{moduleReview.notes}</p>}
          </div>
        )}

        {validityCard && (
          <div className="rounded border border-theme-border bg-theme-panel/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-theme-text">Module Validity Card</p>
              <span className="rounded bg-violet-900/40 px-2 py-0.5 text-xs font-bold text-violet-300">
                Overall: {validityCard.overallPct}%
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div className="rounded border border-theme-border bg-theme-surface/40 p-2">
                <p className="text-theme-secondary">Objective Evidence Coverage</p>
                <p className="font-semibold text-theme-text">{validityCard.objectiveEvidenceCoveragePct}%</p>
              </div>
              <div className="rounded border border-theme-border bg-theme-surface/40 p-2">
                <p className="text-theme-secondary">Critical Claim Citation Depth</p>
                <p className="font-semibold text-theme-text">{validityCard.criticalCitationDepthPct}%</p>
              </div>
              <div className="rounded border border-theme-border bg-theme-surface/40 p-2">
                <p className="text-theme-secondary">Mission-Gate Alignment</p>
                <p className="font-semibold text-theme-text">{validityCard.missionGateAlignmentPct}%</p>
              </div>
              <div className="rounded border border-theme-border bg-theme-surface/40 p-2">
                <p className="text-theme-secondary">Placement Stability</p>
                <p className="font-semibold text-theme-text">{validityCard.placementStabilityPct}%</p>
              </div>
            </div>
          </div>
        )}

        {telemetry && (
          <div className="rounded border border-theme-border bg-theme-panel/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-theme-text">Pipeline Telemetry</p>
              <span className="text-xs text-theme-secondary">Failure rate: {telemetry.totals.failureRatePct}%</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              <div className="rounded border border-theme-border bg-theme-surface/40 p-2">
                <p className="text-theme-secondary">Attempts</p>
                <p className="font-semibold text-theme-text">{telemetry.totals.attempts}</p>
              </div>
              <div className="rounded border border-theme-border bg-theme-surface/40 p-2">
                <p className="text-theme-secondary">Failures + Cancels</p>
                <p className="font-semibold text-theme-text">{telemetry.totals.failures + telemetry.totals.cancels}</p>
              </div>
              <div className="rounded border border-theme-border bg-theme-surface/40 p-2">
                <p className="text-theme-secondary">Avg Step Latency</p>
                <p className="font-semibold text-theme-text">{telemetry.totals.avgStepDurationMs} ms</p>
              </div>
              <div className="rounded border border-theme-border bg-theme-surface/40 p-2">
                <p className="text-theme-secondary">Total Tokens</p>
                <p className="font-semibold text-theme-text">{telemetry.totals.totalTokensUsed}</p>
              </div>
              {typeof estimatedUsdCost === 'number' && (
                <div className="rounded border border-theme-border bg-theme-surface/40 p-2">
                  <p className="text-theme-secondary">Estimated Total Cost</p>
                  <p className="font-semibold text-theme-text">{formatUsd(estimatedUsdCost)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {assembleError && (
          <div className="rounded border border-red-800 bg-red-900/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-1">
              Assembly Error
            </p>
            <p className="text-sm text-red-300">{assembleError}</p>
            <p className="mt-2 text-xs text-red-500">
              Go back to the generation panel and check for incomplete steps.
            </p>
          </div>
        )}

        {!assembleError && activeHardErrors.length === 0 && activeWarnings.length === 0 && (
          <div className="rounded border border-emerald-800/50 bg-emerald-900/20 p-4 text-center">
            <p className="text-lg font-semibold text-emerald-400">All checks passed</p>
            <p className="mt-1 text-sm text-emerald-600">Module is ready to export.</p>
          </div>
        )}

        {/* Synthetic learner simulation */}
        {(syntheticHardErrors.length > 0 || syntheticWarnings.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-sky-900/40 px-2 py-0.5 text-xs font-bold text-sky-300">
                Synthetic Learner Simulation
              </span>
              <span className="text-xs text-theme-muted">
                {syntheticHardErrors.length} error{syntheticHardErrors.length !== 1 ? 's' : ''},{' '}
                {syntheticWarnings.length} warning{syntheticWarnings.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ul className="space-y-1.5">
              {syntheticIssues.map((e, i) => {
                const acked = isAcknowledged(e);
                return (
                  <li
                    key={`synthetic-${i}`}
                    onClick={() => setSelectedIssue(e)}
                    className={`cursor-pointer rounded px-3 py-2 transition-opacity ${
                      e.severity === 'error'
                        ? 'border border-red-900 bg-red-950/50 hover:bg-red-950/70'
                        : 'border border-sky-900/40 bg-sky-950/20 hover:bg-sky-950/40'
                    } ${acked ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {acked && <span className="mt-0.5 shrink-0 text-xs text-emerald-400">✓</span>}
                      <span
                        className={`mt-0.5 shrink-0 text-xs font-bold ${
                          e.severity === 'error' ? 'text-red-500' : 'text-sky-400'
                        }`}
                      >
                        [{e.rule}]
                      </span>
                      <div>
                        <p className={`text-xs ${e.severity === 'error' ? 'text-red-300' : 'text-sky-200'}`}>{e.message}</p>
                        <p className="mt-0.5 font-mono text-xs text-theme-muted">{e.path}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Hard errors */}
        {nonSyntheticHardErrors.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-red-900/40 px-2 py-0.5 text-xs font-bold text-red-400">
                {activeHardErrors.filter((e) => !e.rule.startsWith('SYNTHETIC_')).length} ERROR{activeHardErrors.filter((e) => !e.rule.startsWith('SYNTHETIC_')).length !== 1 ? 'S' : ''}
              </span>
              <span className="text-xs text-theme-muted">— must fix before export</span>
              {acknowledgedKeys.size > 0 && (
                <span className="text-xs text-theme-muted">
                  (click an issue to review and verify)
                </span>
              )}
            </div>
            <ul className="space-y-1.5">
              {nonSyntheticHardErrors.map((e, i) => {
                const acked = isAcknowledged(e);
                return (
                  <li
                    key={i}
                    onClick={() => setSelectedIssue(e)}
                    className={`cursor-pointer rounded border border-red-900 bg-red-950/50 px-3 py-2 hover:bg-red-950/70 transition-colors ${acked ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {acked && <span className="mt-0.5 shrink-0 text-xs text-emerald-400">✓</span>}
                      <span className="mt-0.5 shrink-0 text-xs font-bold text-red-500">[{e.rule}]</span>
                      <div>
                        <p className="text-xs text-red-300">{e.message}</p>
                        <p className="mt-0.5 font-mono text-xs text-theme-muted">{e.path}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs font-bold text-amber-400">
                {activeWarnings.length} WARNING{activeWarnings.length !== 1 ? 'S' : ''}
              </span>
              <span className="text-xs text-theme-muted">— review recommended</span>
              <span className="text-xs text-theme-muted">(click to review)</span>
            </div>
            <ul className="space-y-1.5">
              {warnings.map((e, i) => {
                const acked = isAcknowledged(e);
                return (
                  <li
                    key={i}
                    onClick={() => setSelectedIssue(e)}
                    className={`cursor-pointer rounded border border-amber-900/40 bg-amber-950/20 px-3 py-2 hover:bg-amber-950/40 transition-colors ${acked ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {acked && <span className="mt-0.5 shrink-0 text-xs text-emerald-400">✓</span>}
                      <span className="mt-0.5 shrink-0 text-xs font-bold text-amber-500">[{e.rule}]</span>
                      <div>
                        <p className="text-xs text-amber-300">{e.message}</p>
                        <p className="mt-0.5 font-mono text-xs text-theme-muted">{e.path}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onGoBack}
            className="rounded border border-theme-border px-5 py-2.5 text-sm font-medium text-theme-secondary hover:border-theme-border transition-colors"
          >
            ← Back to Review
          </button>
          <button
            onClick={onAutoFix}
            disabled={isAutoFixing || errors.length === 0 || Boolean(assembleError)}
            className="rounded border border-sky-500/40 bg-sky-500/10 px-5 py-2.5 text-sm font-semibold text-sky-200 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            {isAutoFixing
              ? `Running AI second pass… (pass ${autoFixPass}/${autoFixMaxPasses})`
              : `Resolve All Issues (AI second pass, up to ${autoFixMaxPasses} passes)`}
          </button>
          <button
            onClick={onProceed}
            disabled={!canExport}
            className="flex-1 rounded bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            {canExport
              ? 'Export Module →'
              : strictMode && activeHardErrors.length === 0
                ? `Fix or verify ${activeWarnings.length} warning${activeWarnings.length !== 1 ? 's' : ''} first`
                : `Fix or verify ${activeHardErrors.length} error${activeHardErrors.length !== 1 ? 's' : ''} first`}
          </button>
        </div>
      </div>
    </>
  );
}
