import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  DomainConfig,
  GenerationJob,
  GenerationTelemetry,
  StepExecutionTelemetry,
  StepResult,
  AssembledModule,
  ValidationError,
  ModuleReviewReport
} from '../generator/types';
import {
  makeInitialJob,
  makeEmptyStepResult,
  buildStepSequence
} from '../generator/types';
import { assembleModule, allStepsDone, nextPendingStep } from '../generator/orchestrator';
import { generateFullModuleReviewWithAI, validateCurriculum, validateCurriculumWithAI } from '../generator/validator';
import { buildExportResult } from '../generator/exporter';
import { createAIClient, getCredentialsStore } from '../api/clientFactory';
import { runExternalEvidenceValidation } from '../validation/externalEvidenceValidator';
import type { ExportResult } from '../generator/types';
import {
  clearIndexedDbState,
  clearLocalState,
  readIndexedDbState,
  readLocalState,
  writeIndexedDbState,
  writeLocalState
} from '../storage/persistedStateStore';

export type WizardPanel =
  | 'setup'
  | 'estimate'
  | 'generating'
  | 'review'
  | 'validation'
  | 'export';

export interface UseGeneratorStateReturn {
  // Wizard navigation
  panel: WizardPanel;
  setPanel: (panel: WizardPanel) => void;

  // Job state
  job: GenerationJob | null;
  initJob: (config: DomainConfig) => void;

  // Step management
  updateStep: (stepKey: string, result: StepResult) => void;
  markStepRunning: (stepKey: string) => void;
  markStepError: (stepKey: string, errorMsg: string) => void;
  rerunStep: (stepKey: string) => void;
  overwriteStepJson: (stepKey: string, json: unknown) => void;
  applyStepPatch: (stepKey: string, patch: { rawOutput: string; parsedJson: unknown; tokensUsed?: number }) => void;

  // Orchestration helpers
  currentlyRunningKey: string | null;
  setCurrentlyRunningKey: (key: string | null) => void;
  getNextPendingKey: () => string | null;

  // Parallel batch helpers
  parallelRunningKeys: string[];
  setParallelRunningKeys: (keys: string[]) => void;
  markMultipleStepsRunning: (keys: string[]) => void;

  // Assembled module + validation
  assembledModule: AssembledModule | null;
  validationErrors: ValidationError[];
  validityCard: {
    objectiveEvidenceCoveragePct: number;
    criticalCitationDepthPct: number;
    missionGateAlignmentPct: number;
    placementStabilityPct: number;
    overallPct: number;
  } | null;
  runValidation: (jobOverride?: GenerationJob) => void;
  validationInProgress: boolean;
  moduleReview: ModuleReviewReport | null;
  moduleReviewInProgress: boolean;
  runModuleReview: () => Promise<void>;
  assembleError: string | null;

  // Export
  exportResult: ExportResult | null;
  buildExport: (domainPrompt: string) => void;
  telemetry: GenerationTelemetry | null;
}

interface PersistedState {
  panel: WizardPanel;
  job: GenerationJob;
  exportResult: ExportResult | null;
  telemetry?: GenerationTelemetry | null;
  persistedAt?: number;
}

function compactJobForPersistence(job: GenerationJob): GenerationJob {
  const compactSteps = Object.fromEntries(
    Object.entries(job.steps).map(([key, step]) => [
      key,
      {
        ...step,
        // Avoid duplicating large JSON blobs in storage; parsedJson is the source of truth.
        rawOutput: '',
        validationErrors: []
      }
    ])
  );
  return { ...job, steps: compactSteps };
}

function hydrateJobFromPersistence(job: GenerationJob): GenerationJob {
  const hydratedSteps = Object.fromEntries(
    Object.entries(job.steps).map(([key, step]) => {
      const needsRawOutput = !step.rawOutput && step.parsedJson !== null && step.parsedJson !== undefined;
      return [
        key,
        {
          ...step,
          rawOutput: needsRawOutput ? JSON.stringify(step.parsedJson, null, 2) : step.rawOutput ?? '',
          validationErrors: Array.isArray(step.validationErrors) ? step.validationErrors : []
        }
      ];
    })
  );
  return { ...job, steps: hydratedSteps };
}

function makeEmptyStepTelemetry(stepKey: string): StepExecutionTelemetry {
  return {
    stepKey,
    attempts: 0,
    successCount: 0,
    failureCount: 0,
    cancelCount: 0,
    totalDurationMs: 0,
    lastDurationMs: 0,
    totalTokensUsed: 0,
    lastStatus: 'pending'
  };
}

function summarizeTelemetry(steps: Record<string, StepExecutionTelemetry>) {
  const values = Object.values(steps);
  const totals = values.reduce(
    (acc, step) => {
      acc.attempts += step.attempts;
      acc.successes += step.successCount;
      acc.failures += step.failureCount;
      acc.cancels += step.cancelCount;
      acc.totalDurationMs += step.totalDurationMs;
      acc.totalTokensUsed += step.totalTokensUsed;
      return acc;
    },
    {
      attempts: 0,
      successes: 0,
      failures: 0,
      cancels: 0,
      totalDurationMs: 0,
      totalTokensUsed: 0,
      avgStepDurationMs: 0,
      failureRatePct: 0
    }
  );
  totals.avgStepDurationMs = totals.successes > 0 ? Math.round(totals.totalDurationMs / totals.successes) : 0;
  totals.failureRatePct = totals.attempts > 0 ? Math.round(((totals.failures + totals.cancels) / totals.attempts) * 100) : 0;
  return totals;
}

function makeTelemetryForSequence(stepSequence: string[]): GenerationTelemetry {
  const steps: Record<string, StepExecutionTelemetry> = {};
  for (const stepKey of stepSequence) {
    steps[stepKey] = makeEmptyStepTelemetry(stepKey);
  }
  return { steps, totals: summarizeTelemetry(steps) };
}

function mergeTelemetryWithSequence(
  telemetry: GenerationTelemetry | null | undefined,
  stepSequence: string[]
): GenerationTelemetry {
  const base = makeTelemetryForSequence(stepSequence);
  if (!telemetry) return base;
  for (const stepKey of stepSequence) {
    if (!telemetry.steps[stepKey]) continue;
    base.steps[stepKey] = {
      ...base.steps[stepKey],
      ...telemetry.steps[stepKey],
      stepKey
    };
  }
  base.totals = summarizeTelemetry(base.steps);
  return base;
}

function loadPersisted(): PersistedState | null {
  try {
    const s = readLocalState<PersistedState>();
    if (!s) return null;
    s.job = hydrateJobFromPersistence(s.job);
    if (!Array.isArray((s.job as Partial<GenerationJob>).sourceReferences)) {
      (s.job as GenerationJob).sourceReferences = [];
    }
    if (!Array.isArray((s.job as Partial<GenerationJob>).objectives)) {
      (s.job as GenerationJob).objectives = [];
    }
    const expectedSequence = buildStepSequence(s.job.stageCount);
    for (const key of expectedSequence) {
      if (!s.job.steps[key]) {
        s.job.steps[key] = makeEmptyStepResult(key);
      }
    }
    s.job.stepSequence = expectedSequence;
    s.telemetry = mergeTelemetryWithSequence(s.telemetry, expectedSequence);
    // Any step stuck 'running' from a previous session becomes an error
    for (const key of s.job.stepSequence) {
      const step = s.job.steps[key];
      if (step?.status === 'running') {
        s.job.steps[key] = {
          ...step,
          status: 'error',
          rawOutput: 'Session interrupted — click ↺ Regenerate'
        };
      }
    }
    // Never auto-enter generating on a new Studio session. Users must explicitly
    // resume generation from review to avoid surprising background runs.
    if (s.panel === 'generating') {
      s.panel = 'review';
    }
    return s;
  } catch {
    return null;
  }
}

export function useGeneratorState(): UseGeneratorStateReturn {
  const [initial] = useState<PersistedState | null>(loadPersisted);
  const stepStartTimesRef = useRef<Record<string, number>>({});
  const lastPersistedAtRef = useRef<number>(initial?.persistedAt ?? 0);

  const [panel, setPanel] = useState<WizardPanel>(initial?.panel ?? 'setup');
  const [job, setJob] = useState<GenerationJob | null>(initial?.job ?? null);
  const [currentlyRunningKey, setCurrentlyRunningKey] = useState<string | null>(null);
  const [parallelRunningKeys, setParallelRunningKeys] = useState<string[]>([]);
  const [assembledModule, setAssembledModule] = useState<AssembledModule | null>(() => {
    if (initial?.job) {
      try { return assembleModule(initial.job); } catch { return null; }
    }
    return null;
  });
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validityCard, setValidityCard] = useState<{
    objectiveEvidenceCoveragePct: number;
    criticalCitationDepthPct: number;
    missionGateAlignmentPct: number;
    placementStabilityPct: number;
    overallPct: number;
  } | null>(null);
  const [assembleError, setAssembleError] = useState<string | null>(null);
  const [validationInProgress, setValidationInProgress] = useState(false);
  const [moduleReview, setModuleReview] = useState<ModuleReviewReport | null>(null);
  const [moduleReviewInProgress, setModuleReviewInProgress] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(initial?.exportResult ?? null);
  const [telemetry, setTelemetry] = useState<GenerationTelemetry | null>(
    initial?.job ? mergeTelemetryWithSequence(initial.telemetry, initial.job.stepSequence) : null
  );

  // Async hydration from IndexedDB (migration path): prefer newer state than localStorage bootstrap.
  useEffect(() => {
    void (async () => {
      const indexedState = await readIndexedDbState<PersistedState>();
      if (!indexedState?.job) return;
      const persistedAt = indexedState.persistedAt ?? 0;
      if (persistedAt <= lastPersistedAtRef.current) return;
      const hydratedJob = hydrateJobFromPersistence(indexedState.job);
      const expectedSequence = buildStepSequence(hydratedJob.stageCount);
      const mergedJob: GenerationJob = {
        ...hydratedJob,
        stepSequence: expectedSequence,
        steps: {
          ...Object.fromEntries(expectedSequence.map((key) => [key, makeEmptyStepResult(key)])),
          ...hydratedJob.steps
        }
      };
      // Mirror localStorage bootstrap safety rules for IndexedDB hydration:
      // do not auto-enter generating, and convert stale "running" steps.
      for (const key of mergedJob.stepSequence) {
        const step = mergedJob.steps[key];
        if (step?.status === 'running') {
          mergedJob.steps[key] = {
            ...step,
            status: 'error',
            rawOutput: 'Session interrupted — click ↺ Regenerate'
          };
        }
      }
      const restoredPanel = indexedState.panel === 'generating' ? 'review' : (indexedState.panel ?? 'setup');
      setPanel(restoredPanel);
      setJob(mergedJob);
      setExportResult(indexedState.exportResult ?? null);
      setTelemetry(mergeTelemetryWithSequence(indexedState.telemetry, expectedSequence));
      lastPersistedAtRef.current = persistedAt;
    })();
  }, []);

  // Persist job + panel + exportResult whenever they change
  useEffect(() => {
    if (!job) return;
    const persistedAt = Date.now();
    const state: PersistedState = {
      panel,
      job: compactJobForPersistence(job),
      exportResult,
      telemetry,
      persistedAt
    };
    writeLocalState(state);
    void writeIndexedDbState(state);
    lastPersistedAtRef.current = persistedAt;
  }, [panel, job, exportResult, telemetry]);

  const initJob = useCallback((config: DomainConfig) => {
    clearLocalState();
    void clearIndexedDbState();
    lastPersistedAtRef.current = 0;
    const newJob = makeInitialJob(config);
    setJob(newJob);
    setTelemetry(makeTelemetryForSequence(newJob.stepSequence));
    stepStartTimesRef.current = {};
    setAssembledModule(null);
    setValidationErrors([]);
    setValidityCard(null);
    setModuleReview(null);
    setAssembleError(null);
    setExportResult(null);
    setPanel('estimate');
  }, []);

  const updateStep = useCallback((stepKey: string, result: StepResult) => {
    const startedAt = stepStartTimesRef.current[stepKey];
    const durationMs = typeof startedAt === 'number' ? Math.max(0, Date.now() - startedAt) : 0;
    delete stepStartTimesRef.current[stepKey];

    setJob((prev) => {
      if (!prev) return prev;
      const updated: GenerationJob = {
        ...prev,
        steps: {
          ...prev.steps,
          [stepKey]: { ...result, status: 'done' }
        },
        actualTokensUsed: prev.actualTokensUsed + result.tokensUsed
      };
      // Check if all done — advance to review panel
      if (allStepsDone(updated)) {
        // Don't call setPanel here — let the hook consumer handle it
      }
      return updated;
    });
    setTelemetry((prev) => {
      if (!prev) return prev;
      const existing = prev.steps[stepKey] ?? makeEmptyStepTelemetry(stepKey);
      const nextSteps = {
        ...prev.steps,
        [stepKey]: {
          ...existing,
          successCount: existing.successCount + 1,
          totalDurationMs: existing.totalDurationMs + durationMs,
          lastDurationMs: durationMs,
          totalTokensUsed: existing.totalTokensUsed + (result.tokensUsed ?? 0),
          lastStatus: 'done' as const,
          lastFinishedAt: new Date().toISOString(),
          lastError: undefined
        }
      };
      return { steps: nextSteps, totals: summarizeTelemetry(nextSteps) };
    });
  }, []);

  const markStepRunning = useCallback((stepKey: string) => {
    stepStartTimesRef.current[stepKey] = Date.now();
    setJob((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentStepKey: stepKey,
        steps: {
          ...prev.steps,
          [stepKey]: { ...prev.steps[stepKey], status: 'running' }
        }
      };
    });
    setTelemetry((prev) => {
      if (!prev) return prev;
      const existing = prev.steps[stepKey] ?? makeEmptyStepTelemetry(stepKey);
      const nextSteps = {
        ...prev.steps,
        [stepKey]: {
          ...existing,
          attempts: existing.attempts + 1,
          lastStatus: 'running' as const,
          firstStartedAt: existing.firstStartedAt ?? new Date().toISOString()
        }
      };
      return { steps: nextSteps, totals: summarizeTelemetry(nextSteps) };
    });
  }, []);

  const markMultipleStepsRunning = useCallback((keys: string[]) => {
    const now = Date.now();
    for (const key of keys) {
      stepStartTimesRef.current[key] = now;
    }
    setJob((prev) => {
      if (!prev) return prev;
      const updatedSteps = { ...prev.steps };
      for (const key of keys) {
        updatedSteps[key] = { ...prev.steps[key], status: 'running' };
      }
      return { ...prev, steps: updatedSteps };
    });
    setTelemetry((prev) => {
      if (!prev) return prev;
      const nextSteps = { ...prev.steps };
      for (const key of keys) {
        const existing = prev.steps[key] ?? makeEmptyStepTelemetry(key);
        nextSteps[key] = {
          ...existing,
          attempts: existing.attempts + 1,
          lastStatus: 'running' as const,
          firstStartedAt: existing.firstStartedAt ?? new Date().toISOString()
        };
      }
      return { steps: nextSteps, totals: summarizeTelemetry(nextSteps) };
    });
  }, []);

  const markStepError = useCallback((stepKey: string, errorMsg: string) => {
    const startedAt = stepStartTimesRef.current[stepKey];
    const durationMs = typeof startedAt === 'number' ? Math.max(0, Date.now() - startedAt) : 0;
    delete stepStartTimesRef.current[stepKey];
    const isCancelled = /cancelled by user|fix run was cancelled|cancelled/i.test(errorMsg);

    setJob((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: {
          ...prev.steps,
          [stepKey]: {
            ...prev.steps[stepKey],
            status: 'error',
            rawOutput: errorMsg
          }
        }
      };
    });
    setTelemetry((prev) => {
      if (!prev) return prev;
      const existing = prev.steps[stepKey] ?? makeEmptyStepTelemetry(stepKey);
      const nextSteps = {
        ...prev.steps,
        [stepKey]: {
          ...existing,
          failureCount: existing.failureCount + (isCancelled ? 0 : 1),
          cancelCount: existing.cancelCount + (isCancelled ? 1 : 0),
          totalDurationMs: existing.totalDurationMs + durationMs,
          lastDurationMs: durationMs,
          lastStatus: isCancelled ? ('cancelled' as const) : ('error' as const),
          lastError: errorMsg,
          lastFinishedAt: new Date().toISOString()
        }
      };
      return { steps: nextSteps, totals: summarizeTelemetry(nextSteps) };
    });
  }, []);

  // Mark only the target step as queued-for-rerun — downstream steps remain intact.
  // Set to 'running' (not 'pending') so the step card stays visible with a loading
  // indicator rather than disappearing from the UI while the backend picks it up.
  // The backend resume logic skips any step already 'done' in the DB so downstream
  // completed steps are preserved server-side.
  const rerunStep = useCallback((stepKey: string) => {
    setJob((prev) => {
      if (!prev) return prev;
      const updatedSteps = { ...prev.steps };
      updatedSteps[stepKey] = { ...makeEmptyStepResult(stepKey), status: 'running' };
      delete stepStartTimesRef.current[stepKey];
      return { ...prev, steps: updatedSteps };
    });
    setAssembledModule(null);
    setValidationErrors([]);
    setValidityCard(null);
    setModuleReview(null);
    setExportResult(null);
  }, []);

  // Allow the user to manually paste/edit JSON for a step and re-mark it done
  const overwriteStepJson = useCallback((stepKey: string, json: unknown) => {
    setJob((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: {
          ...prev.steps,
          [stepKey]: {
            ...prev.steps[stepKey],
            parsedJson: json,
            status: 'done',
            rawOutput: JSON.stringify(json, null, 2)
          }
        }
      };
    });
  }, []);

  const applyStepPatch = useCallback(
    (stepKey: string, patch: { rawOutput: string; parsedJson: unknown; tokensUsed?: number }) => {
      setJob((prev) => {
        if (!prev) return prev;
        const existing = prev.steps[stepKey] ?? makeEmptyStepResult(stepKey);
        const addedTokens = patch.tokensUsed ?? 0;
        return {
          ...prev,
          steps: {
            ...prev.steps,
            [stepKey]: {
              ...existing,
              status: 'done',
              rawOutput: patch.rawOutput,
              parsedJson: patch.parsedJson
            }
          },
          actualTokensUsed: prev.actualTokensUsed + addedTokens
        };
      });
      setTelemetry((prev) => {
        if (!prev) return prev;
        const addedTokens = patch.tokensUsed ?? 0;
        if (addedTokens <= 0) return prev;
        const existing = prev.steps[stepKey] ?? makeEmptyStepTelemetry(stepKey);
        const nextSteps = {
          ...prev.steps,
          [stepKey]: {
            ...existing,
            totalTokensUsed: existing.totalTokensUsed + addedTokens
          }
        };
        return { steps: nextSteps, totals: summarizeTelemetry(nextSteps) };
      });
    },
    []
  );

  const getNextPendingKey = useCallback((): string | null => {
    if (!job) return null;
    return nextPendingStep(job);
  }, [job]);

  const runValidation = useCallback((jobOverride?: GenerationJob) => {
    const sourceJob = jobOverride ?? job;
    if (!sourceJob) return;
    setAssembleError(null);
    setAssembledModule(null);
    setValidationInProgress(true);

    void (async () => {
      try {
        const assembled = assembleModule(sourceJob);
        setAssembledModule(assembled);

        const errors = validateCurriculum(
          assembled.curriculum,
          assembled.missions,
          sourceJob.stageCount,
          sourceJob.lessonsPerStage,
          sourceJob.missionCount,
          {
            placementAssessment: assembled.placementAssessment,
            lessonMissionMap: assembled.lessonMissionMap,
            sourceCatalog: assembled.sourceCatalog,
            citationMap: assembled.citationMap,
            factCheck: assembled.factCheck,
            advancedArtifacts: assembled.advancedArtifacts,
            sourceReferenceCount: sourceJob.sourceReferences.length,
            objectives: sourceJob.objectives
          }
        );
        const sourceErrors = await validateSourceReachability(assembled.sourceCatalog);
        let aiReviewErrors: ValidationError[] = [];
        try {
          const apiKey = getCredentialsStore().getStoredApiKey();
          if (apiKey.trim().length > 10) {
            aiReviewErrors = await validateCurriculumWithAI({
              client: createAIClient(apiKey),
              moduleId: sourceJob.moduleId,
              domainPrompt: sourceJob.domainPrompt,
              objectives: sourceJob.objectives,
              curriculum: assembled.curriculum,
              missions: assembled.missions,
              placementAssessment: assembled.placementAssessment,
              lessonMissionMap: assembled.lessonMissionMap,
              sourceCatalog: assembled.sourceCatalog,
              factCheck: assembled.factCheck,
              advancedArtifacts: assembled.advancedArtifacts
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[Studio] AI validation pass skipped:', msg);
        }
        let externalEvidenceErrors: ValidationError[] = [];
        try {
          externalEvidenceErrors = await runExternalEvidenceValidation({
            moduleId: sourceJob.moduleId,
            domainPrompt: sourceJob.domainPrompt,
            objectives: sourceJob.objectives,
            assembled
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[Studio] External evidence validation skipped:', msg);
        }

        const allErrors = [...errors, ...sourceErrors, ...aiReviewErrors, ...externalEvidenceErrors];
        setValidationErrors(allErrors);
        setValidityCard(buildValidityCard(sourceJob, assembled, allErrors));
        setModuleReview(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAssembleError(msg);
        setValidityCard(null);
      } finally {
        setValidationInProgress(false);
      }
    })();
  }, [job]);

  const runModuleReview = useCallback(async () => {
    if (!job) return;
    setModuleReviewInProgress(true);
    try {
      const assembled = assembledModule ?? assembleModule(job);
      const apiKey = getCredentialsStore().getStoredApiKey();
      if (!apiKey.trim()) throw new Error('API key missing');
      const review = await generateFullModuleReviewWithAI({
        client: createAIClient(apiKey),
        moduleId: job.moduleId,
        domainPrompt: job.domainPrompt,
        objectives: job.objectives,
        curriculum: assembled.curriculum,
        missions: assembled.missions,
        placementAssessment: assembled.placementAssessment,
        lessonMissionMap: assembled.lessonMissionMap,
        sourceCatalog: assembled.sourceCatalog,
        factCheck: assembled.factCheck,
        advancedArtifacts: assembled.advancedArtifacts
      });
      setModuleReview(review);
    } finally {
      setModuleReviewInProgress(false);
    }
  }, [assembledModule, job]);

  const buildExport = useCallback(
    (domainPrompt: string) => {
      if (!job || !assembledModule) return;
      const result = buildExportResult(
        job.moduleId,
        domainPrompt,
        assembledModule.curriculum,
        assembledModule.missions,
        assembledModule.placementAssessment,
        assembledModule.lessonMissionMap,
        assembledModule.sourceCatalog,
        assembledModule.citationMap,
        assembledModule.factCheck,
        assembledModule.advancedArtifacts,
        assembledModule.themeShell
      );
      setExportResult(result);
    },
    [job, assembledModule]
  );

  return {
    panel,
    setPanel,
    job,
    initJob,
    updateStep,
    markStepRunning,
    markStepError,
    rerunStep,
    overwriteStepJson,
    applyStepPatch,
    currentlyRunningKey,
    setCurrentlyRunningKey,
    getNextPendingKey,
    parallelRunningKeys,
    setParallelRunningKeys,
    markMultipleStepsRunning,
    assembledModule,
    validationErrors,
    validityCard,
    runValidation,
    validationInProgress,
    moduleReview,
    moduleReviewInProgress,
    runModuleReview,
    assembleError,
    exportResult,
    buildExport,
    telemetry
  };
}

async function validateSourceReachability(
  sourceCatalog: Array<{
    id: string;
    title: string;
    url: string;
    notes?: string;
    publisher?: string;
    reliability?: 'authoritative' | 'reputable' | 'secondary';
    year?: number;
    lastVerified?: string;
  }>
): Promise<ValidationError[]> {
  const checks = await Promise.all(
    sourceCatalog.map(async (source, idx) => {
      const url = source.url;
      const path = `sourceCatalog[${idx}].url`;
      if (!/^https?:\/\//.test(url)) {
        return {
          severity: 'error' as const,
          path,
          rule: 'SOURCE_URL_UNREACHABLE',
          message: `Source "${source.id}" has invalid URL for live verification: ${url}`
        };
      }
      const checkedAt = new Date().toISOString();
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 6000);
        try {
          const head = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
          window.clearTimeout(timeout);
          if (head.status >= 400) {
            return {
              severity: 'error' as const,
              path,
              rule: 'SOURCE_URL_UNREACHABLE',
              message: `Source "${source.id}" returned HTTP ${head.status} on ${checkedAt}`
            };
          }
          return null;
        } catch {
          window.clearTimeout(timeout);
          const fallback = await fetch(url, { method: 'GET', mode: 'no-cors' });
          if (fallback.type === 'opaque') {
            // Official .gov/.gov.uk URLs always return opaque responses from the browser —
            // this is expected CORS behaviour, not a reachability failure. Suppress noise.
            const isGovUrl = (() => {
              try { const h = new URL(url).hostname.toLowerCase(); return h.endsWith('.gov') || h.endsWith('.gov.uk'); }
              catch { return false; }
            })();
            if (isGovUrl) return null;
            return {
              severity: 'warning' as const,
              path,
              rule: 'SOURCE_URL_STATUS_UNKNOWN',
              message: `Source "${source.id}" reachable check is opaque (CORS) on ${checkedAt}; verify manually if needed`
            };
          }
          return null;
        }
      } catch {
        return {
          severity: 'error' as const,
          path,
          rule: 'SOURCE_URL_UNREACHABLE',
          message: `Source "${source.id}" failed live reachability check on ${checkedAt}`
        };
      }
    })
  );
  return checks.filter((entry): entry is ValidationError => Boolean(entry));
}

function buildValidityCard(
  job: GenerationJob,
  assembled: AssembledModule,
  errors: ValidationError[]
): {
  objectiveEvidenceCoveragePct: number;
  criticalCitationDepthPct: number;
  missionGateAlignmentPct: number;
  placementStabilityPct: number;
  overallPct: number;
} {
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

  const objectiveTotal = job.objectives.length;
  const objectiveMissingPaths = new Set(
    errors
      .filter((e) =>
        ['OBJECTIVE_EVIDENCE_LESSON_MISSING', 'OBJECTIVE_EVIDENCE_STAGE_TEST_MISSING', 'OBJECTIVE_EVIDENCE_MISSION_MISSING'].includes(e.rule)
      )
      .map((e) => e.path)
  );
  const objectiveEvidenceCoveragePct =
    objectiveTotal > 0 ? clamp(((objectiveTotal - objectiveMissingPaths.size) / objectiveTotal) * 100) : 100;

  const criticalPattern = /\b(safety|legal|regulat|compliance|incident|breach|emergency|hazard|risk|policy|standard|procedure|step|diagnos|forensic|secure|vulnerability|threat)\b/i;
  const lessonCriticalCount = assembled.curriculum
    .flatMap((stage) => stage.lessons.map((lesson) => ({ id: lesson.id, text: `${lesson.title} ${lesson.objective} ${lesson.workedExample}` })))
    .filter((item) => criticalPattern.test(item.text));
  const missionCriticalCount = assembled.missions
    .map((mission) => ({ id: mission.id, text: `${mission.title} ${mission.description} ${mission.whyItMatters ?? ''}` }))
    .filter((item) => criticalPattern.test(item.text));
  const criticalTotal = lessonCriticalCount.length + missionCriticalCount.length;
  const criticalWithDepth =
    lessonCriticalCount.filter((item) => (assembled.citationMap.lessonCitations[item.id] ?? []).length >= 2).length +
    missionCriticalCount.filter((item) => (assembled.citationMap.missionCitations[item.id] ?? []).length >= 2).length;
  const criticalCitationDepthPct = criticalTotal > 0 ? clamp((criticalWithDepth / criticalTotal) * 100) : 100;

  const mapTotal = Object.keys(assembled.lessonMissionMap ?? {}).length;
  const mapIssueCount = errors.filter((e) =>
    [
      'LESSON_MISSION_MAP_STAGE_MISMATCH',
      'LESSON_MISSION_MAP_SEMANTIC_MISMATCH',
      'LESSON_MISSION_MAP_RATIONALE_THIN',
      'LESSON_MISSION_MAP_UNKNOWN_MISSION',
      'LESSON_MISSION_MAP_UNKNOWN_LESSON'
    ].includes(e.rule)
  ).length;
  const missionGateAlignmentPct = mapTotal > 0 ? clamp(100 - (mapIssueCount / mapTotal) * 100) : 100;

  const placementRelevant = errors.filter((e) =>
    e.rule.startsWith('SYNTHETIC_') ||
    [
      'PLACEMENT_THRESHOLD_GAP_TOO_SMALL',
      'PLACEMENT_TOP_THRESHOLD_LOW',
      'PLACEMENT_THRESHOLD_STAGE_MONOTONICITY',
      'PLACEMENT_THRESHOLDS_NOT_SORTABLE'
    ].includes(e.rule)
  );
  const placementPenalty = placementRelevant.reduce((sum, err) => sum + (err.severity === 'error' ? 20 : 8), 0);
  const placementStabilityPct = clamp(100 - placementPenalty);

  const overallPct = clamp(
    (objectiveEvidenceCoveragePct + criticalCitationDepthPct + missionGateAlignmentPct + placementStabilityPct) / 4
  );

  return {
    objectiveEvidenceCoveragePct,
    criticalCitationDepthPct,
    missionGateAlignmentPct,
    placementStabilityPct,
    overallPct
  };
}
