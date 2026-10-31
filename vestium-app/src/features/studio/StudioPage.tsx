import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { StudioLayout } from '../../app/StudioLayout';
import { ApiKeyGate } from './components/ApiKeyGate';
import { DomainSetupPanel } from './components/DomainSetupPanel';
import { WorkplaceIntakePanel } from './components/WorkplaceIntakePanel';
import type { SopMode, SopConfig } from './components/WorkplaceIntakePanel';
import { CostEstimatePanel } from './components/CostEstimatePanel';
import { StepProgressRail } from './components/StepProgressRail';
import { StepCard } from './components/StepCard';
import { ValidationReport } from './components/ValidationReport';
import { ExportPanel } from './components/ExportPanel';
import { useApiKey } from './hooks/useApiKey';
import { useGeneratorState } from './hooks/useGeneratorState';
import { useStreamedStep } from './hooks/useStreamedStep';
import { anyStepErrored, assembleModule, allStepsDone } from './generator/orchestrator';
import { runStepWithRetry } from './generator/stepRunners';
import { createAIClient } from './api/clientFactory';
import { buildRuntimeThemeConfig } from './generator/runtimeAssembler';
import type { ValidationError } from './generator/types';
import { validateCurriculum } from './generator/validator';
import { useBackendGeneration } from './hooks/useBackendGeneration';
import { batchCreateSops, createSop, isBackendMode, startSopGenerationStream, uploadSopSourceDocument } from '../../lib/api/client';
import type { WorkplaceContext, WorkplaceClassificationResult } from './generator/types';
import { computeActualCost, formatUsd } from './api/tokenEstimator';
import { FEATURES } from '../../lib/features';

interface SopGenState {
  phase: 'idle' | 'preparing' | 'generating' | 'done' | 'error';
  sopId: string | null;
  stepKey: string | null;
  message: string | null;
  error: string | null;
}

const INITIAL_SOP_GEN_STATE: SopGenState = {
  phase: 'idle', sopId: null, stepKey: null, message: null, error: null,
};

export function StudioPage() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const apiKey = useApiKey();
  const gs = useGeneratorState();
  const streamed = useStreamedStep();
  // Ref guard prevents StrictMode's double-effect from launching two API calls
  const isRunningRef = useRef(false);
  // Tracks which step the backend most recently started — always fresh (ref, not closure).
  // Used in onJobFailed to avoid blaming the wrong step via a stale job snapshot.
  const latestRunningStepRef = useRef<string | null>(null);
  const backendMode = isBackendMode();
  const bg = useBackendGeneration();
  // Compliance mode is the primary mode for Vestium.
  // Generic mode (DomainSetupPanel) is available for dev/testing only.
  const [useGenericMode, setUseGenericMode] = useState(false);
  // Abort controllers for each in-flight parallel step (key → controller)
  const parallelAbortMapRef = useRef<Map<string, AbortController>>(new Map());
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixPass, setAutoFixPass] = useState(0);
  const [strictValidationMode, setStrictValidationMode] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationArmed, setGenerationArmed] = useState(false);
  // Incremented when user clicks Regenerate in backend mode — triggers the SSE useEffect to re-fire
  const [rerunTrigger, setRerunTrigger] = useState(0);
  const AUTO_FIX_MAX_PASSES = 3;

  // ── SOP mode state ────────────────────────────────────────────────────────
  // Allow URL to pre-select mode: /create/sop → ?mode=sop
  const [searchParams] = useSearchParams();
  const initialMode = (searchParams.get('mode') as SopMode | null) ?? 'module';
  const [sopMode, setSopMode] = useState<SopMode>(
    ['module', 'module+sop', 'sop', 'batch-sop'].includes(initialMode) ? initialMode as SopMode : 'module'
  );
  const [sopConfig, setSopConfig] = useState<SopConfig | null>(null);
  const [sopGenState, setSopGenState] = useState<SopGenState>(INITIAL_SOP_GEN_STATE);
  // For SOP-only mode: controls a dedicated generating view separate from gs.panel
  const [sopOnlyView, setSopOnlyView] = useState<'none' | 'generating'>('none');

  // Safety latch: if user is not on the generating panel, do not keep generation
  // "armed" from previous actions or restored state.
  useEffect(() => {
    if (gs.panel !== 'generating') setGenerationArmed(false);
  }, [gs.panel]);

  // ── SOP generation flow ────────────────────────────────────────────────────
  const runSopFlow = useCallback(async (
    workplaceContext: WorkplaceContext,
    regulatoryClassification: WorkplaceClassificationResult,
    moduleId: string | null,
    currentSopConfig: SopConfig,
  ) => {
    const token = await getToken();
    if (!token) {
      setSopGenState({ phase: 'error', sopId: null, stepKey: null, message: null, error: 'No auth token — sign in and retry' });
      return;
    }

    setSopGenState({ phase: 'preparing', sopId: null, stepKey: null, message: 'Creating SOP record…', error: null });

    const createRes = await createSop(token, {
      title: currentSopConfig.procedureName,
      procedureName: currentSopConfig.procedureName,
      equipment: currentSopConfig.equipment,
      moduleId: moduleId ?? undefined,
      workplaceContext,
      regulatoryClassification,
    });

    if (!createRes.ok) {
      setSopGenState({ phase: 'error', sopId: null, stepKey: null, message: null, error: `Create failed: ${createRes.error}` });
      return;
    }

    const sopId = createRes.data.id;
    setSopGenState((prev) => ({ ...prev, sopId, message: `Uploading ${currentSopConfig.files.length} source document(s)…` }));

    for (const entry of currentSopConfig.files) {
      const uploadRes = await uploadSopSourceDocument(token, sopId, entry.file, entry.docType);
      if (!uploadRes.ok) {
        setSopGenState({ phase: 'error', sopId, stepKey: null, message: null, error: `Upload failed: ${uploadRes.error}` });
        return;
      }
    }

    setSopGenState((prev) => ({ ...prev, phase: 'generating', message: 'Starting SOP generation pipeline…' }));

    const abortCtrl = new AbortController();
    try {
      await startSopGenerationStream(token, sopId, (event) => {
        if (event.event === 'step_started' && event.stepKey) {
          setSopGenState((prev) => ({ ...prev, stepKey: event.stepKey ?? null, message: `Step: ${event.stepKey ?? ''}` }));
        } else if (event.event === 'step_done' && event.stepKey) {
          setSopGenState((prev) => ({ ...prev, message: `Completed: ${event.stepKey ?? ''}` }));
        }
      }, abortCtrl.signal);

      setSopGenState({ phase: 'done', sopId, stepKey: null, message: null, error: null });
      navigate(`/sops/${sopId}`);
    } catch (err) {
      if (!abortCtrl.signal.aborted) {
        setSopGenState({ phase: 'error', sopId, stepKey: null, message: null, error: err instanceof Error ? err.message : 'SOP generation failed' });
      }
    }
  }, [getToken, navigate]);

  const inferFixTarget = (path: string): { stepKey: string; sectionType: string } | null => {
    if (path.startsWith('stages[')) {
      const match = path.match(/^stages\[(\d+)\]/);
      const stageId = match ? Number(match[1]) : NaN;
      if (!Number.isFinite(stageId)) return null;
      if (path.includes('.test')) {
        return { stepKey: `test_${stageId}`, sectionType: 'stageTest' };
      }
      return { stepKey: `stage_${stageId}`, sectionType: 'stageLessons' };
    }
    if (path.startsWith('missions')) return { stepKey: 'missions', sectionType: 'missions' };
    if (path.startsWith('placementAssessment')) return { stepKey: 'placementAssessment', sectionType: 'placementAssessment' };
    if (path.startsWith('lessonMissionMap')) return { stepKey: 'lessonMissionMap', sectionType: 'lessonMissionMap' };
    if (path.startsWith('sourceCatalog') || path.startsWith('citationMap')) {
      return { stepKey: 'sourceAttribution', sectionType: 'sourceAttribution' };
    }
    if (path.startsWith('factCheck')) return { stepKey: 'factCheck', sectionType: 'factCheck' };
    if (path.startsWith('advancedArtifacts.simulatorDesign')) return { stepKey: 'simulatorDesign', sectionType: 'simulatorDesign' };
    if (path.startsWith('advancedArtifacts.faultScenarioCampaign') || path.startsWith('advancedArtifacts.fieldReferenceCards')) {
      return { stepKey: 'faultAndReference', sectionType: 'faultAndReference' };
    }
    if (path.startsWith('advancedArtifacts')) return { stepKey: 'builderAndCapstone', sectionType: 'builderAndCapstone' };
    if (path.startsWith('themeShell')) return { stepKey: 'themeShell', sectionType: 'themeShell' };
    return null;
  };

  const NON_FIXABLE_RULES = new Set([
    'SOURCE_URL_STATUS_UNKNOWN',
    'EXTERNAL_PROVIDER_SOURCE_DISCOVERY_FAILED',
    'EXTERNAL_CLAIM_CHECK_NOT_CONFIGURED',
    'EXTERNAL_CLAIM_CHECK_UNAVAILABLE',
    'EXTERNAL_AUTHORITATIVE_SOURCES_NOT_INCLUDED'
  ]);

  const inferRuleTargets = (error: ValidationError, job: NonNullable<typeof gs.job>) => {
    if (error.rule.startsWith('OBJECTIVE_EVIDENCE_LESSON_') || error.rule === 'OBJECTIVE_COVERAGE_LESSON_GAP') {
      return job.stepSequence
        .filter((stepKey) => /^stage_\d+$/.test(stepKey))
        .map((stepKey) => ({ stepKey, sectionType: 'stageLessons' as const }));
    }
    if (error.rule.startsWith('OBJECTIVE_EVIDENCE_STAGE_TEST_')) {
      return job.stepSequence
        .filter((stepKey) => /^test_\d+$/.test(stepKey))
        .map((stepKey) => ({ stepKey, sectionType: 'stageTest' as const }));
    }
    if (error.rule.startsWith('OBJECTIVE_EVIDENCE_MISSION_') || error.rule === 'OBJECTIVE_COVERAGE_MISSION_GAP') {
      return [{ stepKey: 'missions', sectionType: 'missions' as const }];
    }
    if (error.rule.startsWith('OBJECTIVE_EVIDENCE_PLACEMENT_')) {
      return [{ stepKey: 'placementAssessment', sectionType: 'placementAssessment' as const }];
    }
    if (error.rule.startsWith('PLACEMENT_')) {
      return [{ stepKey: 'placementAssessment', sectionType: 'placementAssessment' as const }];
    }
    if (error.rule.startsWith('LESSON_MISSION_MAP_')) {
      return [{ stepKey: 'lessonMissionMap', sectionType: 'lessonMissionMap' as const }];
    }
    if (error.rule.startsWith('FACT_CHECK_')) {
      return [{ stepKey: 'factCheck', sectionType: 'factCheck' as const }];
    }
    return [];
  };

  const inferPriorityBoostFromText = (text: string): number => {
    const value = text.toLowerCase();
    if (value.includes('gate') || value.includes('mission')) return 6;
    if (value.includes('placement') || value.includes('threshold')) return 5;
    if (value.includes('test') || value.includes('assessment')) return 4;
    if (value.includes('fact') || value.includes('source') || value.includes('citation')) return 3;
    if (value.includes('lesson') || value.includes('objective')) return 2;
    return 1;
  };

  const handleAutoFixAll = async () => {
    if (!gs.job || gs.validationErrors.length === 0 || isAutoFixing) return;
    setIsAutoFixing(true);
    setAutoFixPass(1);
    try {
      let workingJob = gs.job;
      let currentErrors = gs.validationErrors;

      const computeErrors = (jobForValidation: typeof workingJob): ValidationError[] => {
        const assembled = assembleModule(jobForValidation);
        return validateCurriculum(
          assembled.curriculum,
          assembled.missions,
          jobForValidation.stageCount,
          jobForValidation.lessonsPerStage,
          jobForValidation.missionCount,
          {
            placementAssessment: assembled.placementAssessment,
            lessonMissionMap: assembled.lessonMissionMap,
            sourceCatalog: assembled.sourceCatalog,
            citationMap: assembled.citationMap,
            factCheck: assembled.factCheck,
            advancedArtifacts: assembled.advancedArtifacts,
            sourceReferenceCount: jobForValidation.sourceReferences.length,
            objectives: jobForValidation.objectives
          }
        );
      };

      for (let pass = 1; pass <= AUTO_FIX_MAX_PASSES; pass++) {
        setAutoFixPass(pass);
        if (currentErrors.length === 0) break;

        const grouped = new Map<string, { sectionType: string; errors: ValidationError[] }>();
        const stepPriorityBoost = new Map<string, number>();
        const fixableErrors = currentErrors.filter((error) => !NON_FIXABLE_RULES.has(error.rule));

        // Fold full module review findings into fix planning so severe publish-readiness issues are addressed first.
        const reviewDerivedErrors: ValidationError[] = (gs.moduleReview?.criticalFindings ?? []).map((finding) => ({
          severity: finding.severity,
          path: finding.evidencePath,
          rule: 'MODULE_REVIEW_FINDING',
          message: `${finding.title}: ${finding.message} Fix: ${finding.recommendation}`
        }));

        for (const finding of gs.moduleReview?.criticalFindings ?? []) {
          const target = inferFixTarget(finding.evidencePath);
          if (!target) continue;
          const current = stepPriorityBoost.get(target.stepKey) ?? 0;
          const severityWeight = finding.severity === 'error' ? 8 : 4;
          stepPriorityBoost.set(target.stepKey, current + severityWeight);
        }

        for (const priority of gs.moduleReview?.priorities ?? []) {
          const boost = inferPriorityBoostFromText(priority);
          const text = priority.toLowerCase();
          if (text.includes('mission') || text.includes('gate')) {
            stepPriorityBoost.set('lessonMissionMap', (stepPriorityBoost.get('lessonMissionMap') ?? 0) + boost);
            stepPriorityBoost.set('missions', (stepPriorityBoost.get('missions') ?? 0) + boost);
          }
          if (text.includes('placement') || text.includes('threshold')) {
            stepPriorityBoost.set(
              'placementAssessment',
              (stepPriorityBoost.get('placementAssessment') ?? 0) + boost
            );
          }
          if (text.includes('test') || text.includes('assessment')) {
            for (const stepKey of workingJob.stepSequence.filter((key) => /^test_\d+$/.test(key))) {
              stepPriorityBoost.set(stepKey, (stepPriorityBoost.get(stepKey) ?? 0) + boost);
            }
          }
          if (text.includes('fact') || text.includes('source') || text.includes('citation')) {
            stepPriorityBoost.set('factCheck', (stepPriorityBoost.get('factCheck') ?? 0) + boost);
            stepPriorityBoost.set('sourceAttribution', (stepPriorityBoost.get('sourceAttribution') ?? 0) + boost);
          }
        }

        const allFixSignals = [...fixableErrors, ...reviewDerivedErrors];
        for (const error of allFixSignals) {
          const targets = [];
          const pathTarget = inferFixTarget(error.path);
          if (pathTarget) targets.push(pathTarget);
          targets.push(...inferRuleTargets(error, workingJob));
          for (const target of targets) {
            const bucket = grouped.get(target.stepKey) ?? { sectionType: target.sectionType, errors: [] };
            bucket.errors.push(error);
            grouped.set(target.stepKey, bucket);
          }
        }

        const orderedStepKeys = [...workingJob.stepSequence]
          .filter((stepKey) => grouped.has(stepKey))
          .sort((a, b) => {
            const aBoost = stepPriorityBoost.get(a) ?? 0;
            const bBoost = stepPriorityBoost.get(b) ?? 0;
            if (aBoost !== bBoost) return bBoost - aBoost;
            return workingJob.stepSequence.indexOf(a) - workingJob.stepSequence.indexOf(b);
          });
        if (orderedStepKeys.length === 0) break;

        let fixesApplied = 0;
        for (const stepKey of orderedStepKeys) {
          const bucket = grouped.get(stepKey);
          if (!bucket) continue;
          bucket.errors = bucket.errors.filter(
            (error, idx, arr) => arr.findIndex((candidate) => candidate.path === error.path && candidate.rule === error.rule) === idx
          );
          const offendingJson = workingJob.steps[stepKey]?.parsedJson;
          if (!offendingJson) continue;
          const fixResult = await streamed.runFixNow(
            {
              sectionType: bucket.sectionType,
              sectionId: stepKey,
              offendingJson,
              errors: bucket.errors
            },
            workingJob,
            apiKey.apiKey
          );
          fixesApplied += 1;
          workingJob = {
            ...workingJob,
            steps: {
              ...workingJob.steps,
              [stepKey]: {
                ...workingJob.steps[stepKey],
                status: 'done',
                rawOutput: fixResult.rawOutput,
                parsedJson: fixResult.parsedJson
              }
            },
            actualTokensUsed: workingJob.actualTokensUsed + (fixResult.tokensUsed ?? 0)
          };
          gs.applyStepPatch(stepKey, {
            rawOutput: fixResult.rawOutput,
            parsedJson: fixResult.parsedJson,
            tokensUsed: fixResult.tokensUsed
          });
        }

        if (fixesApplied === 0) break;

        const nextErrors = computeErrors(workingJob);
        gs.runValidation(workingJob);
        if (nextErrors.length === 0) break;
        const currentFixableCount = currentErrors.filter((error) => !NON_FIXABLE_RULES.has(error.rule)).length;
        const nextFixableCount = nextErrors.filter((error) => !NON_FIXABLE_RULES.has(error.rule)).length;
        if (nextFixableCount >= currentFixableCount) break;
        currentErrors = nextErrors;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Studio] Auto-fix failed:', msg);
    } finally {
      setIsAutoFixing(false);
      setAutoFixPass(0);
    }
  };

  // ── Parallel batch launcher ─────────────────────────────────────────────────
  // Fires all given step keys concurrently using independent AbortControllers.
  // If any step errors, all siblings are aborted. isRunningRef gates re-entry
  // the same way as the sequential path.
  const launchParallelBatch = useCallback(
    (keys: string[], jobSnapshot: NonNullable<typeof gs.job>) => {
      gs.markMultipleStepsRunning(keys);
      gs.setParallelRunningKeys([...keys]);

      const client = createAIClient(apiKey.apiKey);

      void (async () => {
        const promises = keys.map(async (key) => {
          const ctrl = new AbortController();
          parallelAbortMapRef.current.set(key, ctrl);
          try {
            const result = await runStepWithRetry(key, client, jobSnapshot, ctrl.signal);
            if (!ctrl.signal.aborted) {
              gs.updateStep(result.stepKey, result);
            }
          } catch (err) {
            if (!ctrl.signal.aborted) {
              // Abort all sibling steps before marking this one as errored
              for (const [, sibling] of parallelAbortMapRef.current) sibling.abort();
              parallelAbortMapRef.current.clear();
              gs.markStepError(key, err instanceof Error ? err.message : String(err));
            }
          } finally {
            parallelAbortMapRef.current.delete(key);
          }
        });

        await Promise.allSettled(promises);
        isRunningRef.current = false;
        gs.setParallelRunningKeys([]);
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiKey.apiKey]
  );

  // ── Generation loop ─────────────────────────────────────────────────────────
  // Fires whenever panel/currentlyRunningKey/parallelRunningKeys/job changes.
  // After blueprint: launches all pending stage steps in parallel.
  // After all stages done: launches all pending test steps in parallel.
  // Everything else: sequential via useStreamedStep.
  useEffect(() => {
    if (backendMode) return; // Backend mode uses its own SSE-driven useEffect below
    if (gs.panel !== 'generating') return;
    if (!generationArmed) return;
    if (!gs.job) return;
    if (gs.currentlyRunningKey !== null) return;
    if (gs.parallelRunningKeys.length > 0) return;  // parallel batch in progress
    if (isRunningRef.current) return;
    // Halt if any step has errored — user must manually regenerate before continuing
    if (anyStepErrored(gs.job)) return;

    const nextKey = gs.getNextPendingKey();
    if (!nextKey) {
      // All steps done — run validation and move to review
      setGenerationArmed(false);
      gs.runValidation();
      gs.setPanel('review');
      return;
    }

    const job = gs.job;

    // ── Parallel stage lessons: blueprint done, ≥2 stages pending ─────────────
    if (/^stage_\d+$/.test(nextKey) && job.steps['blueprint']?.status === 'done') {
      const stageKeys = job.stepSequence.filter((k) => /^stage_\d+$/.test(k));
      const pendingStageKeys = stageKeys.filter((k) => job.steps[k]?.status === 'pending');
      if (pendingStageKeys.length > 1) {
        isRunningRef.current = true;
        launchParallelBatch(pendingStageKeys, job);
        return;
      }
    }

    // ── Parallel stage tests: all stages done, ≥2 tests pending ──────────────
    if (/^test_\d+$/.test(nextKey)) {
      const stageKeys = job.stepSequence.filter((k) => /^stage_\d+$/.test(k));
      const allStagesDone = stageKeys.every((k) => job.steps[k]?.status === 'done');
      if (allStagesDone) {
        const testKeys = job.stepSequence.filter((k) => /^test_\d+$/.test(k));
        const pendingTestKeys = testKeys.filter((k) => job.steps[k]?.status === 'pending');
        if (pendingTestKeys.length > 1) {
          isRunningRef.current = true;
          launchParallelBatch(pendingTestKeys, job);
          return;
        }
      }
    }

    // ── Sequential fallback ────────────────────────────────────────────────────
    isRunningRef.current = true;
    gs.markStepRunning(nextKey);
    gs.setCurrentlyRunningKey(nextKey);

    streamed.runStepNow(nextKey, gs.job, apiKey.apiKey, (result) => {
      isRunningRef.current = false;
      gs.updateStep(result.stepKey, result);
      gs.setCurrentlyRunningKey(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.panel, gs.currentlyRunningKey, gs.parallelRunningKeys, gs.job, generationArmed]);

  // Handle step error: pause generation (local pipeline only)
  useEffect(() => {
    if (backendMode) return;
    if (streamed.error && gs.currentlyRunningKey) {
      console.error('[Studio] Step failed:', gs.currentlyRunningKey, streamed.error);
      isRunningRef.current = false;
      setGenerationArmed(false);
      gs.markStepError(gs.currentlyRunningKey, streamed.error);
      gs.setCurrentlyRunningKey(null);
      // Generation pauses — user can manually regenerate the failed step
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamed.error]);

  // ── Backend generation ───────────────────────────────────────────────────────
  // Fires once when panel transitions to 'generating' in backend mode.
  // SSE events from the API drive all gs state updates.
  useEffect(() => {
    if (!backendMode) return;
    if (gs.panel !== 'generating') return;
    if (!generationArmed) return;
    if (!gs.job) return;
    if (isRunningRef.current) return;

    isRunningRef.current = true;
    setGenerationError(null);
    const job = gs.job;

    void bg.startGeneration(job, {
      onStepStarted: (stepKey) => {
        setGenerationError(null);
        latestRunningStepRef.current = stepKey;
        gs.markStepRunning(stepKey);
        gs.setCurrentlyRunningKey(stepKey);
      },
      onStepDone: (_stepKey, result) => {
        latestRunningStepRef.current = null;
        gs.updateStep(result.stepKey, result);
        gs.setCurrentlyRunningKey(null);
      },
      onStepError: (stepKey, error) => {
        latestRunningStepRef.current = null; // step already handled below
        gs.markStepError(stepKey, error);
        gs.setCurrentlyRunningKey(null);
      },
      onJobComplete: () => {
        isRunningRef.current = false;
        latestRunningStepRef.current = null;
        setGenerationError(null);
        setGenerationArmed(false);
        gs.runValidation();
        gs.setPanel('review');
      },
      onJobFailed: (error) => {
        isRunningRef.current = false;
        console.error('[Studio] Backend generation failed:', error);
        setGenerationError(error);
        setGenerationArmed(false);
        // Individual step failures are already handled by onStepError (which clears
        // latestRunningStepRef). Only mark a step here for non-step failures (network /
        // auth errors) where no step_error event was emitted and a step is still
        // considered "running" by this ref.
        const stepKey = latestRunningStepRef.current;
        if (stepKey) {
          gs.markStepError(stepKey, error);
          latestRunningStepRef.current = null;
        }
        gs.setCurrentlyRunningKey(null);
      },
    }, { isRerun: rerunTrigger > 0 || bg.lastCreatedModuleId !== null }).catch(() => {
      isRunningRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendMode, gs.panel, rerunTrigger, generationArmed]);

  // ── Trigger SOP flow after module completes (module+sop mode) ────────────
  const sopFlowStartedRef = useRef(false);
  useEffect(() => {
    if (sopMode !== 'module+sop') return;
    if (!bg.completedModuleId) return;
    if (!sopConfig) return;
    if (sopGenState.phase !== 'idle') return;
    if (sopFlowStartedRef.current) return;
    if (!gs.job) return;
    if (!gs.job.workplaceContext || !gs.job.regulatoryClassification) return;
    sopFlowStartedRef.current = true;
    void runSopFlow(
      gs.job.workplaceContext,
      gs.job.regulatoryClassification,
      bg.completedModuleId,
      sopConfig,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg.completedModuleId]);

  // ── API key gate ───────────────────────────────────────────────────────────
  if (!backendMode && !apiKey.hasKey) {
    return (
      <ApiKeyGate
        apiKey={apiKey}
        onReady={() => {
          // Key saved — stay on page, gate will unmount
        }}
      />
    );
  }

  // ── SOP-only generating view ───────────────────────────────────────────────
  if (sopOnlyView === 'generating') {
    return (
      <StudioLayout>
        <div className="mx-auto max-w-2xl space-y-4 p-6">
          {sopGenState.phase === 'error' ? (
            <div className="rounded-xl border border-red-700/50 bg-red-900/20 px-5 py-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-400">SOP Generation Failed</p>
              <p className="text-sm text-theme-secondary">{sopGenState.error}</p>
              <button
                type="button"
                onClick={() => { setSopOnlyView('none'); setSopGenState(INITIAL_SOP_GEN_STATE); }}
                className="rounded border border-theme-border px-3 py-1.5 text-xs text-theme-secondary hover:border-theme-border"
              >
                ← Back to setup
              </button>
            </div>
          ) : sopGenState.phase === 'done' && sopGenState.sopId ? (
            <div className="rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-5 py-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">SOP Generation Complete</p>
              <button
                type="button"
                onClick={() => navigate(`/sops/${sopGenState.sopId}`)}
                className="rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
              >
                View SOP →
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-violet-700/50 bg-violet-900/20 px-5 py-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">SOP Generation Running</p>
              <p className="text-sm text-theme-secondary">{sopGenState.message ?? 'Initialising…'}</p>
              {sopGenState.stepKey ? (
                <p className="font-mono text-xs text-theme-muted">Current step: {sopGenState.stepKey}</p>
              ) : null}
              <div className="flex gap-2 pt-1">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500" />
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500" style={{ animationDelay: '0.2s' }} />
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
        </div>
      </StudioLayout>
    );
  }

  // ── Setup panel ────────────────────────────────────────────────────────────
  if (gs.panel === 'setup') {
    return (
      <StudioLayout>
        {useGenericMode ? (
          <div>
            <div className="flex justify-end px-4 pt-4">
              <button
                onClick={() => setUseGenericMode(false)}
                className="text-xs text-theme-muted hover:text-amber-400 transition-colors"
              >
                ← Back to Compliance Mode
              </button>
            </div>
            <DomainSetupPanel onSubmit={(config) => gs.initJob(config)} apiKey={apiKey.apiKey} />
          </div>
        ) : (
          <div>
            {/* ── Output mode toggle ─────────────────────────────────────────── */}
            <div className="mx-auto max-w-2xl px-4 pt-8 pb-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-theme-muted">Output mode</p>
              <div className="flex items-center gap-1 rounded-lg border border-theme-border bg-theme-panel p-1">
                {([
                  'module',
                  'module+sop',
                  'sop',
                  // FEATURES.BATCH_SOPS gates the UI; backend is always active.
                  // Enable locally: VITE_FEATURE_BATCH_SOPS=true in .env.local
                  ...(FEATURES.BATCH_SOPS ? ['batch-sop' as const] : []),
                ] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSopMode(mode)}
                    className={
                      sopMode === mode
                        ? 'flex-1 rounded px-3 py-1.5 text-xs font-semibold bg-theme-raised text-theme-text transition-colors'
                        : 'flex-1 rounded px-3 py-1.5 text-xs text-theme-secondary hover:text-theme-text transition-colors'
                    }
                  >
                    {mode === 'module' ? 'Module Only'
                      : mode === 'module+sop' ? 'Module + SOP'
                      : mode === 'sop' ? 'SOP Only'
                      : 'Batch SOPs'}
                  </button>
                ))}
              </div>
              {sopMode === 'sop' && (
                <p className="mt-2 text-xs text-theme-muted">
                  SOP Only: generates a source-document-attributed Standard Operating Procedure without a training module.
                </p>
              )}
              {sopMode === 'batch-sop' && (
                <p className="mt-2 text-xs text-theme-muted">
                  Batch SOPs: generate SOPs for multiple pieces of equipment sharing the same workplace context. Each SOP is created as an independent record and generated separately.
                </p>
              )}
              {sopMode === 'module+sop' && (
                <p className="mt-2 text-xs text-theme-muted">
                  Module + SOP: generates the H&S training module first, then the SOP with source-document attribution.
                </p>
              )}
            </div>

            <WorkplaceIntakePanel
              onSubmit={(config) => {
                // Reset SOP state for fresh run
                sopFlowStartedRef.current = false;
                setSopGenState(INITIAL_SOP_GEN_STATE);

                if (sopMode === 'sop' && sopConfig && config.workplaceContext && config.regulatoryClassification) {
                  // SOP-only mode: bypass module generation
                  setSopOnlyView('generating');
                  void runSopFlow(
                    config.workplaceContext,
                    config.regulatoryClassification,
                    null,
                    sopConfig,
                  );
                } else if (sopMode === 'batch-sop') {
                  // Batch SOP mode — hidden feature (FEATURES.BATCH_SOPS).
                  // Uses batchCreateSops() to create multiple SOP records; generation
                  // is triggered per-SOP via the standard SSE pipeline.
                  // TODO: implement BatchSopIntakePanel + parallel progress cards UI.
                  // For now this branch is unreachable as the mode toggle is hidden.
                  void batchCreateSops;
                } else {
                  gs.initJob(config);
                }
              }}
              apiKey={apiKey.apiKey}
              sopMode={sopMode}
              onSopConfigChange={setSopConfig}
            />
            {import.meta.env.DEV && (
              <div className="pb-6 text-center">
                <button
                  onClick={() => setUseGenericMode(true)}
                  className="text-xs text-theme-muted hover:text-theme-muted transition-colors"
                >
                  Switch to generic training mode (dev only)
                </button>
              </div>
            )}
          </div>
        )}
      </StudioLayout>
    );
  }

  // ── Cost estimate panel ────────────────────────────────────────────────────
  if (gs.panel === 'estimate') {
    return (
      <StudioLayout>
        <CostEstimatePanel
          config={gs.job!}
          onBack={() => gs.setPanel('setup')}
          onStart={() => {
            setGenerationArmed(true);
            gs.setPanel('generating');
          }}
        />
      </StudioLayout>
    );
  }

  // ── Generation panel ───────────────────────────────────────────────────────
  if (gs.panel === 'generating' && gs.job) {
    const job = gs.job;

    return (
      <StudioLayout>
        <div className="flex flex-1 overflow-hidden">
          <StepProgressRail
            job={job}
            currentKeys={
              gs.parallelRunningKeys.length > 0
                ? gs.parallelRunningKeys
                : gs.currentlyRunningKey
                ? [gs.currentlyRunningKey]
                : []
            }
          />

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between rounded border border-theme-border bg-theme-panel/60 px-4 py-2">
              <span className="font-mono text-sm font-semibold text-theme-text">
                Curriculum Studio — Generating
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-theme-muted">
                  Module: <span className="font-mono text-theme-secondary">{job.moduleId}</span>
                </span>
                {job.fastMode ? (
                  <span className="rounded border border-amber-700/60 bg-amber-900/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                    Fast mode
                  </span>
                ) : null}
                {(backendMode ? bg.isRunning : (gs.currentlyRunningKey || gs.parallelRunningKeys.length > 0)) ? (
                  <button
                    onClick={() => {
                      isRunningRef.current = false;
                      if (backendMode) {
                        bg.cancelGeneration();
                        setGenerationArmed(false);
                        gs.setCurrentlyRunningKey(null);
                        gs.setPanel('review');
                        return;
                      }
                      // Cancel sequential step (if any)
                      if (gs.currentlyRunningKey) {
                        streamed.cancel();
                        gs.markStepError(gs.currentlyRunningKey, 'Cancelled by user');
                        gs.setCurrentlyRunningKey(null);
                      }
                      // Cancel parallel batch (if any)
                      if (gs.parallelRunningKeys.length > 0) {
                        for (const [, ctrl] of parallelAbortMapRef.current) ctrl.abort();
                        parallelAbortMapRef.current.clear();
                        for (const key of gs.parallelRunningKeys) {
                          gs.markStepError(key, 'Cancelled by user');
                        }
                        gs.setParallelRunningKeys([]);
                      }
                      setGenerationArmed(false);
                      gs.setPanel('review');
                    }}
                    className="text-xs text-theme-secondary hover:text-red-400 transition-colors"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>

            {!backendMode && streamed.error && gs.currentlyRunningKey === null && (
              <div className="rounded border border-red-800/60 bg-red-900/20 px-4 py-3">
                <p className="text-xs font-semibold text-red-400">Step failed — generation paused</p>
                <p className="mt-1 font-mono text-xs text-red-300 break-all">{streamed.error}</p>
                <p className="mt-1 text-xs text-theme-muted">Regenerate the failed step below, or edit its JSON manually.</p>
                <div className="mt-3">
                  <button
                    onClick={() => gs.setPanel('review')}
                    className="rounded border border-theme-border px-3 py-1.5 text-xs text-theme-text hover:border-theme-border"
                  >
                    Go to Review
                  </button>
                </div>
              </div>
            )}
            {backendMode && generationError && (
              <div className="rounded border border-red-800/60 bg-red-900/20 px-4 py-3">
                <p className="text-xs font-semibold text-red-400">Generation failed to start</p>
                <p className="mt-1 font-mono text-xs text-red-300 break-all">{generationError}</p>
                <div className="mt-3">
                  <button
                    onClick={() => gs.setPanel('estimate')}
                    className="rounded border border-theme-border px-3 py-1.5 text-xs text-theme-text hover:border-theme-border"
                  >
                    Back to Estimate
                  </button>
                </div>
              </div>
            )}

            {/* SOP queued notice — visible throughout module generation in module+sop mode */}
            {sopMode === 'module+sop' && sopConfig ? (
              <div className="rounded border border-violet-800/40 bg-violet-900/10 px-4 py-2.5 flex items-center gap-3">
                <span className="text-xs text-violet-400 font-semibold uppercase tracking-wide shrink-0">SOP Queued</span>
                <span className="text-xs text-theme-secondary truncate">{sopConfig.procedureName} · {sopConfig.equipment} · {sopConfig.files.length} source doc{sopConfig.files.length !== 1 ? 's' : ''}</span>
              </div>
            ) : null}

            {job.stepSequence.map((key) => {
              const result = job.steps[key];
              const isActive =
                key === gs.currentlyRunningKey || gs.parallelRunningKeys.includes(key);

              if (!result || result.status === 'pending') return null;

              return (
                <StepCard
                  key={key}
                  stepKey={key}
                  result={result}
                  isActive={isActive}
                  streamedText={isActive && !backendMode ? streamed.streamedText : ''}
                  onRegenerate={(k) => {
                    gs.rerunStep(k);
                    setGenerationArmed(true);
                    if (backendMode) {
                      isRunningRef.current = false;
                      setRerunTrigger((t) => t + 1);
                    }
                  }}
                  onManualEdit={(k, json) => gs.overwriteStepJson(k, json)}
                />
              );
            })}

            {!backendMode && gs.currentlyRunningKey === null && !gs.getNextPendingKey() && (
              <div className="rounded border border-emerald-800/50 bg-emerald-900/20 p-4 text-center">
                <p className="text-sm font-medium text-emerald-400">Generation complete</p>
                <button
                  onClick={() => {
                    setGenerationArmed(false);
                    gs.runValidation();
                    gs.setPanel('review');
                  }}
                  className="mt-2 rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
                >
                  Review &amp; Validate →
                </button>
              </div>
            )}
          </div>
        </div>
      </StudioLayout>
    );
  }

  // ── Review panel ───────────────────────────────────────────────────────────
  if (gs.panel === 'review' && gs.job) {
    const job = gs.job;
    const actualCost = computeActualCost(job.steps);
    const generationComplete = allStepsDone(job);

    return (
      <StudioLayout>
        <div className="flex flex-1 overflow-hidden">
          <StepProgressRail
            job={job}
            currentKeys={[]}
            onStepClick={(key) => {
              document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-theme-text">Generated Content Review</h2>
              {generationComplete ? (
                <button
                  onClick={() => {
                    gs.runValidation();
                    gs.setPanel('validation');
                  }}
                  className="rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
                >
                  Validate &amp; Export →
                </button>
              ) : (
                <button
                  onClick={() => {
                    setGenerationArmed(true);
                    gs.setPanel('generating');
                  }}
                  className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition-colors"
                >
                  Resume generation →
                </button>
              )}
            </div>

            {!generationComplete && (
              <div className="rounded border border-amber-800/60 bg-amber-900/20 px-4 py-3">
                <p className="text-xs font-semibold text-amber-400">Generation paused</p>
                <p className="mt-1 text-xs text-theme-secondary">
                  Studio restored your previous run without auto-starting. Click
                  {' '}<span className="font-semibold text-theme-secondary">Resume generation</span>{' '}
                  when you want to continue.
                </p>
              </div>
            )}

            {/* Actual cost banner */}
            {actualCost.totalTokens > 0 && (
              <div className="flex items-center justify-between rounded border border-theme-border bg-theme-surface/50 px-4 py-2.5 text-xs text-theme-secondary">
                <span>
                  Actual tokens used:{' '}
                  <span className="font-mono text-theme-secondary">{actualCost.totalTokens.toLocaleString()}</span>
                  <span className="ml-3 text-theme-muted">
                    Anthropic {actualCost.anthropicTokens.toLocaleString()} · Gemini {actualCost.geminiTokens.toLocaleString()}
                  </span>
                </span>
                <span className="font-mono font-semibold text-violet-300">{formatUsd(actualCost.estimatedUsdCost)}</span>
              </div>
            )}

            {job.stepSequence.map((key) => {
              const result = job.steps[key];
              if (!result || result.status === 'pending') return null;

              return (
                <StepCard
                  key={key}
                  stepKey={key}
                  result={result}
                  isActive={false}
                  streamedText=""
                  onRegenerate={(k) => {
                    gs.rerunStep(k);
                    setGenerationArmed(true);
                    if (backendMode) {
                      isRunningRef.current = false;
                      setRerunTrigger((t) => t + 1);
                    }
                    gs.setPanel('generating');
                  }}
                  onManualEdit={(k, json) => gs.overwriteStepJson(k, json)}
                />
              );
            })}
          </div>
        </div>
      </StudioLayout>
    );
  }

  // ── Validation panel ───────────────────────────────────────────────────────
  if (gs.panel === 'validation') {
    return (
      <StudioLayout>
        <ValidationReport
          errors={gs.validationErrors}
          validityCard={gs.validityCard}
          assembleError={gs.assembleError}
          onAutoFix={handleAutoFixAll}
          isAutoFixing={isAutoFixing}
          autoFixPass={autoFixPass}
          autoFixMaxPasses={AUTO_FIX_MAX_PASSES}
          strictMode={strictValidationMode}
          onToggleStrictMode={() => setStrictValidationMode((prev) => !prev)}
          onReverifySources={() => gs.runValidation()}
          validationInProgress={gs.validationInProgress}
          moduleReview={gs.moduleReview}
          moduleReviewInProgress={gs.moduleReviewInProgress}
          telemetry={gs.telemetry}
          estimatedUsdCost={gs.job ? computeActualCost(gs.job.steps).estimatedUsdCost : undefined}
          onRunModuleReview={() => {
            void gs.runModuleReview();
          }}
          onProceed={() => {
            if (!gs.job) return;
            const totalWarnings = gs.validationErrors.filter((e) => e.severity === 'warning').length;
            const totalErrors = gs.validationErrors.filter((e) => e.severity === 'error').length;
            if (totalErrors > 0) return;
            if (strictValidationMode && totalWarnings > 0) return;
            gs.buildExport(gs.job.domainPrompt);
            gs.setPanel('export');
          }}
          onGoBack={() => gs.setPanel('review')}
        />
      </StudioLayout>
    );
  }

  // ── Export panel ───────────────────────────────────────────────────────────
  if (gs.panel === 'export' && gs.exportResult && gs.job) {
    const job = gs.job;

    const handlePreview = () => {
      if (!gs.assembledModule) return;
      const config = buildRuntimeThemeConfig(job.moduleId, gs.assembledModule);
      try {
        localStorage.setItem(`studio-preview-${job.moduleId}`, JSON.stringify(config));
      } catch {
        // Storage full or unavailable — still open the tab (same-session dynamic registry works)
      }
      window.open(`/${job.moduleId}/dashboard`, '_blank');
    };

    return (
      <StudioLayout>
        {backendMode && bg.completedModuleId ? (
          <div className="mx-auto max-w-2xl space-y-4 p-6">
            {/* SOP generation status banner (module+sop mode) */}
            {sopMode === 'module+sop' && sopConfig ? (
              <div className={`rounded-xl border px-5 py-4 space-y-1 ${
                sopGenState.phase === 'error' ? 'border-red-700/50 bg-red-900/20' :
                sopGenState.phase === 'done' ? 'border-emerald-700/50 bg-emerald-900/20' :
                'border-violet-700/50 bg-violet-900/20'
              }`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${
                  sopGenState.phase === 'error' ? 'text-red-400' :
                  sopGenState.phase === 'done' ? 'text-emerald-400' : 'text-violet-400'
                }`}>
                  SOP Generation {
                    sopGenState.phase === 'idle' ? 'Starting…' :
                    sopGenState.phase === 'done' ? 'Complete' :
                    sopGenState.phase === 'error' ? 'Failed' : 'Running'
                  }
                </p>
                <p className="text-sm text-theme-secondary">
                  {sopConfig.procedureName} · {sopConfig.equipment}
                </p>
                {sopGenState.message ? <p className="text-sm text-theme-secondary">{sopGenState.message}</p> : null}
                {sopGenState.error ? <p className="text-sm text-red-300">{sopGenState.error}</p> : null}
                {sopGenState.phase === 'idle' || (sopGenState.phase !== 'done' && sopGenState.phase !== 'error') ? (
                  <p className="text-xs text-theme-muted">This runs automatically — you can stay on this page or navigate away.</p>
                ) : null}
                {sopGenState.sopId && sopGenState.phase === 'done' ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/sops/${sopGenState.sopId}`)}
                    className="mt-2 rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
                  >
                    View SOP →
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                Generation complete
              </p>
              <h2 className="mt-1 text-lg font-bold text-theme-text">
                Module saved to your organisation
              </h2>
              <p className="mt-2 text-sm text-theme-secondary">
                The module is ready for compliance review. A Competent Person must attest before learners can access it.
              </p>
              <p className="mt-3 font-mono text-xs text-theme-muted">
                ID: {bg.completedModuleId}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate('/reviewer')}
                className="flex-1 rounded bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors"
              >
                Go to Reviewer Portal →
              </button>
              <button
                type="button"
                onClick={() => navigate('/modules')}
                className="flex-1 rounded border border-theme-border px-4 py-2.5 text-sm font-semibold text-theme-text hover:border-theme-border hover:text-theme-text transition-colors"
              >
                Back to Modules
              </button>
              <button
                type="button"
                onClick={() => gs.setPanel('setup')}
                className="rounded border border-theme-border px-4 py-2.5 text-sm text-theme-secondary hover:text-theme-secondary transition-colors"
              >
                Generate another
              </button>
            </div>

            <details className="rounded border border-theme-border bg-theme-panel/40">
              <summary className="cursor-pointer px-4 py-2 text-xs text-theme-muted hover:text-theme-secondary">
                Download JSON backup
              </summary>
              <div className="border-t border-theme-border">
                <ExportPanel
                  result={gs.exportResult}
                  moduleId={job.moduleId}
                  onPreview={handlePreview}
                  onReset={() => gs.setPanel('setup')}
                />
              </div>
            </details>
          </div>
        ) : (
          <ExportPanel
            result={gs.exportResult}
            moduleId={job.moduleId}
            onPreview={handlePreview}
            onReset={() => {
              gs.setPanel('setup');
            }}
          />
        )}
      </StudioLayout>
    );
  }

  // Fallback
  return (
    <StudioLayout>
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-theme-muted">Loading…</p>
      </div>
    </StudioLayout>
  );
}
