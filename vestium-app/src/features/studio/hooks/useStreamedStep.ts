import { useState, useRef, useCallback } from 'react';
import { createAIClient } from '../api/clientFactory';
import { runFix, runStep } from '../generator/stepRunners';
import type { GenerationJob, StepResult, ValidationError } from '../generator/types';

export interface UseStreamedStepReturn {
  streamedText: string;
  isStreaming: boolean;
  error: string | null;
  runStepNow: (
    stepKey: string,
    job: GenerationJob,
    apiKey: string,
    onDone: (result: StepResult) => void
  ) => void;
  runFixNow: (
    params: {
      sectionType: string;
      sectionId: string;
      offendingJson: unknown;
      errors: ValidationError[];
    },
    job: GenerationJob,
    apiKey: string
  ) => Promise<StepResult>;
  cancel: () => void;
}

export function useStreamedStep(): UseStreamedStepReturn {
  const [streamedText, setStreamedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setError('Cancelled by user');
  }, []);

  const isTransientError = (err: unknown): boolean => {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      msg.includes('connection error') ||
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('timeout') ||
      msg.includes('temporar') ||
      msg.includes('econn') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('504') ||
      msg.includes('429')
    );
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const STEP_ATTEMPT_TIMEOUT_MS = 3 * 60 * 1000;

  const runStepNow = useCallback(
    (
      stepKey: string,
      job: GenerationJob,
      apiKey: string,
      onDone: (result: StepResult) => void
    ) => {
      // Abort any in-flight run
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStreamedText('');
      setError(null);
      setIsStreaming(true);

      const client = createAIClient(apiKey);
      const execute = async () => {
        let lastErr: unknown;
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const timeoutController = new AbortController();
          const onParentAbort = () => timeoutController.abort();
          controller.signal.addEventListener('abort', onParentAbort);
          const timeoutId = setTimeout(() => {
            timeoutController.abort();
          }, STEP_ATTEMPT_TIMEOUT_MS);
          try {
            const result = await runStep(
              stepKey,
              client,
              job,
              (chunk: string) => {
                setStreamedText((prev) => prev + chunk);
              },
              timeoutController.signal
            );
            clearTimeout(timeoutId);
            controller.signal.removeEventListener('abort', onParentAbort);
            if (!controller.signal.aborted) {
              setIsStreaming(false);
              onDone(result);
            }
            return;
          } catch (err: unknown) {
            clearTimeout(timeoutId);
            controller.signal.removeEventListener('abort', onParentAbort);
            lastErr = err;
            if (controller.signal.aborted) {
              setIsStreaming(false);
              return;
            }
            const timedOut = timeoutController.signal.aborted && !controller.signal.aborted;
            const retryable = timedOut || isTransientError(err);
            const shouldRetry = retryable && attempt < maxAttempts;
            if (!shouldRetry) break;
            const delayMs = attempt === 1 ? 1200 : 2500;
            await wait(delayMs);
          }
        }

        if (!controller.signal.aborted) {
          const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
          setError(msg);
          setIsStreaming(false);
        }
      };

      void execute();
    },
    []
  );

  const runFixNow = useCallback(
    (
      params: {
        sectionType: string;
        sectionId: string;
        offendingJson: unknown;
        errors: ValidationError[];
      },
      job: GenerationJob,
      apiKey: string,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStreamedText('');
      setError(null);
      setIsStreaming(true);

      const client = createAIClient(apiKey);
      const execute = async (): Promise<StepResult> => {
        let lastErr: unknown;
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const timeoutController = new AbortController();
          const onParentAbort = () => timeoutController.abort();
          controller.signal.addEventListener('abort', onParentAbort);
          const timeoutId = setTimeout(() => {
            timeoutController.abort();
          }, STEP_ATTEMPT_TIMEOUT_MS);
          try {
            const result = await runFix(
              {
                client,
                job,
                onChunk: (chunk: string) => setStreamedText((prev) => prev + chunk),
                signal: timeoutController.signal
              },
              params.sectionType,
              params.sectionId,
              params.offendingJson,
              params.errors
            );
            clearTimeout(timeoutId);
            controller.signal.removeEventListener('abort', onParentAbort);
            if (!controller.signal.aborted) {
              setIsStreaming(false);
              return result;
            }
            throw new Error('Fix run was cancelled');
          } catch (err: unknown) {
            clearTimeout(timeoutId);
            controller.signal.removeEventListener('abort', onParentAbort);
            lastErr = err;
            if (controller.signal.aborted) {
              setIsStreaming(false);
              throw err;
            }
            const timedOut = timeoutController.signal.aborted && !controller.signal.aborted;
            const retryable = timedOut || isTransientError(err);
            const shouldRetry = retryable && attempt < maxAttempts;
            if (!shouldRetry) break;
            const delayMs = attempt === 1 ? 1200 : 2500;
            await wait(delayMs);
          }
        }

        if (!controller.signal.aborted) {
          const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
          setError(msg);
          setIsStreaming(false);
        }
        throw (lastErr instanceof Error ? lastErr : new Error(String(lastErr)));
      };

      return execute();
    },
    []
  );

  return { streamedText, isStreaming, error, runStepNow, runFixNow, cancel };
}
