// ─── useBackendGeneration ─────────────────────────────────────────────────────
// Replaces the browser-side orchestrator for the full generation run.
// Connects to the Fastify API, streams SSE step events, and drives the
// existing useGeneratorState callbacks with results.
//
// Design:
// - Uses fetch() streaming (not EventSource) — required for POST + auth headers
// - Each step_done event carries parsedJson + rawOutput so gs.updateStep() works
// - cancelGeneration() aborts the fetch and calls DELETE on the backend
// - Falls through to a no-op if backend mode is not configured (VITE_API_URL unset)

import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  createModule,
  startGenerationStream,
  cancelGeneration as apiCancelGeneration,
} from '../../../lib/api/client';
import type { JobStepEvent } from '../../../lib/api/client';
import type { CreateModuleRequest } from '@complianceforge/types';
import type { GenerationJob, StepResult } from '../generator/types';
import type { DomainConfig } from '../generator/types';

export interface BackendGenerationCallbacks {
  onStepStarted?: (stepKey: string) => void;
  onStepDone: (stepKey: string, result: StepResult) => void;
  onStepError: (stepKey: string, error: string) => void;
  onJobComplete: (totalTokensUsed: number) => void;
  onJobFailed: (error: string) => void;
}

export interface UseBackendGenerationReturn {
  isRunning: boolean;
  completedModuleId: string | null;
  lastCreatedModuleId: string | null;
  startGeneration: (job: GenerationJob, callbacks: BackendGenerationCallbacks, options?: { isRerun?: boolean }) => Promise<void>;
  cancelGeneration: () => void;
}

export function useBackendGeneration(): UseBackendGenerationReturn {
  const { getToken } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [completedModuleId, setCompletedModuleId] = useState<string | null>(null);
  const [lastCreatedModuleId, setLastCreatedModuleId] = useState<string | null>(null);
  // Ref mirrors lastCreatedModuleId state so closures always read the latest value
  // regardless of when useCallback was created (avoids stale-closure rerun bug).
  const lastCreatedModuleIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const moduleIdRef = useRef<string | null>(null);
  const BACKEND_ID_PREFIX = 'studio-backend-module-id:';

  const readStoredBackendModuleId = (studioModuleId: string): string | null => {
    try { return window.sessionStorage.getItem(`${BACKEND_ID_PREFIX}${studioModuleId}`); } catch { return null; }
  };
  const writeStoredBackendModuleId = (studioModuleId: string, backendModuleId: string): void => {
    try { window.sessionStorage.setItem(`${BACKEND_ID_PREFIX}${studioModuleId}`, backendModuleId); } catch { /* ignore */ }
  };

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    const id = moduleIdRef.current;
    if (id) {
      // Fire-and-forget: cancel the backend job
      void getToken().then((token) => {
        if (token) apiCancelGeneration(token, id).catch(() => {});
      });
    }
    setIsRunning(false);
  }, [getToken]);

  const startGeneration = useCallback(
    async (job: GenerationJob, callbacks: BackendGenerationCallbacks, options?: { isRerun?: boolean }) => {
      if (isRunning) return;

      const token = await getToken();
      if (!token) {
        callbacks.onJobFailed('Not authenticated — cannot start generation');
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      moduleIdRef.current = job.moduleId;
      setIsRunning(true);
      setCompletedModuleId(null);

      const config: DomainConfig = {
        moduleId: job.moduleId,
        domainPrompt: job.domainPrompt,
        audienceDescription: job.audienceDescription,
        objectives: job.objectives,
        stageCount: job.stageCount,
        lessonsPerStage: job.lessonsPerStage,
        missionCount: job.missionCount,
        fastMode: job.fastMode,
        sourceReferences: job.sourceReferences,
        workplaceContext: job.workplaceContext,
        regulatoryClassification: job.regulatoryClassification,
      };

      // Rerun: reuse the existing backend module (skip createModule to avoid orphans).
      // Use the ref (not state) to guarantee the latest value regardless of when this
      // closure was created — prevents the stale-closure bug where a new module is
      // created and all prior DB-saved steps are lost.
      console.log(`[startGeneration] isRerun=${options?.isRerun}, lastCreatedModuleIdRef=${lastCreatedModuleIdRef.current}`);
      const canReuseExisting =
        options?.isRerun ||
        (!!lastCreatedModuleIdRef.current && completedModuleId === null);
      let backendModuleId = canReuseExisting
        ? (lastCreatedModuleIdRef.current ?? readStoredBackendModuleId(job.moduleId))
        : null;
      console.log(`[startGeneration] backendModuleId after rerun check=${backendModuleId} (will create new=${!backendModuleId})`);

      // Token-safety guard: a rerun must target an existing backend module.
      // If linkage is lost (refresh/crash/old session), do NOT create a new module
      // implicitly — that can restart full lesson waves and waste tokens.
      if (options?.isRerun && !backendModuleId) {
        setIsRunning(false);
        abortRef.current = null;
        moduleIdRef.current = null;
        callbacks.onJobFailed('Cannot resume this run safely (backend module link missing). Start a new run from Estimate to avoid unintended full regeneration.');
        return;
      }

      if (!backendModuleId) {
        const moduleReq = toCreateModuleRequest(job);
        if (!moduleReq) {
          setIsRunning(false);
          abortRef.current = null;
          moduleIdRef.current = null;
          callbacks.onJobFailed('Missing workplace/regulatory context for backend module creation');
          return;
        }

        const createRes = await createModule(token, moduleReq);
        if (!createRes.ok) {
          setIsRunning(false);
          abortRef.current = null;
          moduleIdRef.current = null;
          callbacks.onJobFailed(`Module create failed: ${createRes.error}`);
          return;
        }

        backendModuleId = createRes.data.id;
        lastCreatedModuleIdRef.current = backendModuleId;
        setLastCreatedModuleId(backendModuleId);
        writeStoredBackendModuleId(job.moduleId, backendModuleId);
      }

      moduleIdRef.current = backendModuleId;

      const handleEvent = (event: JobStepEvent) => {
        switch (event.event) {
          case 'step_started':
            if (event.stepKey) callbacks.onStepStarted?.(event.stepKey);
            break;

          case 'step_done':
            if (event.stepKey) {
              callbacks.onStepDone(event.stepKey, {
                stepKey: event.stepKey,
                status: 'done',
                parsedJson: event.parsedJson ?? null,
                rawOutput: event.rawOutput ?? '',
                validationErrors: [],
                tokensUsed: event.tokensUsed ?? 0,
                retryCount: 0,
              });
            }
            break;

          case 'step_error':
            if (event.stepKey) {
              callbacks.onStepError(event.stepKey, event.error ?? 'Unknown step error');
            }
            break;

          case 'job_complete':
            setCompletedModuleId(backendModuleId);
            callbacks.onJobComplete(event.totalTokensUsed ?? 0);
            break;

          case 'job_failed':
            callbacks.onJobFailed(event.error ?? 'Generation failed');
            break;
        }
      };

      try {
        await startGenerationStream(
          token,
          backendModuleId,
          {
            title: job.domainPrompt.slice(0, 80),
            domainPrompt: config.domainPrompt,
            audienceDescription: config.audienceDescription,
            objectives: config.objectives,
            sourceReferences: config.sourceReferences,
          },
          handleEvent,
          controller.signal
        );
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : String(err);
          callbacks.onJobFailed(msg);
        }
      } finally {
        setIsRunning(false);
        abortRef.current = null;
        moduleIdRef.current = null;
      }
    },
    [getToken, isRunning]
  );

  return { isRunning, completedModuleId, lastCreatedModuleId, startGeneration, cancelGeneration };
}

function toCreateModuleRequest(job: GenerationJob): CreateModuleRequest | null {
  const rc = job.regulatoryClassification;
  const wc = job.workplaceContext ?? rc?.workplaceContext;
  if (!rc || !wc) return null;

  const primary = rc.primarySchema?.schema;
  if (!primary) return null;

  return {
    title: job.domainPrompt.slice(0, 120),
    workplaceContext: {
      industryType: wc.industryType,
      industryLabel: wc.industryLabel,
      operations: wc.operations,
      workforceProfile: wc.workforceProfile,
      hazardKeywords: wc.hazardKeywords,
      additionalContext: wc.additionalContext,
    },
    regulatoryClassification: {
      primarySchemaId: primary.id,
      primarySchemaTitle: primary.shortTitle,
      applicableSchemas: rc.applicableSchemas.map((s) => ({
        schemaId: s.schema.id,
        shortTitle: s.schema.shortTitle,
        weight: s.weight,
        mandatory: s.mandatoryForContext,
        pending: false,
      })),
      classificationNotes: rc.classificationNotes,
    },
  };
}
