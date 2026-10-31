// ─── RAMS Pipeline Types ──────────────────────────────────────────────────────
// 4-step sequential pipeline for Risk Assessment & Method Statement generation:
//   ramsHazardId → ramsRiskAssessment → ramsDraftBuild → ramsFactCheck

import type { StepResult } from './types.js';
import type { WorkplaceContext, WorkplaceClassificationResult } from '../regulatory/types.js';

// ─── Source document (loaded at job start) ───────────────────────────────────

export interface RamsSourceDocContent {
  id: string;
  filename: string;
  docType: string;
  content: string;
}

// ─── Step 1: Hazard Identification output ─────────────────────────────────────

export interface RamsHazardIdOutput {
  ramsHazardId: {
    hazards: Array<{
      id: string;
      hazard: string;
      activity: string;
      personsAtRisk: string[];
      sourceRef: string | null;
    }>;
  };
}

// ─── Step 2: Risk Assessment output ──────────────────────────────────────────

export interface RamsRiskAssessmentOutput {
  ramsRiskAssessment: {
    hazards: Array<{
      id: string;
      initialLikelihood: number;
      initialSeverity: number;
      initialRiskScore: number;
      controls: string[];
      regulatoryBasis: string[];
      residualLikelihood: number;
      residualSeverity: number;
      residualRiskScore: number;
    }>;
  };
}

// ─── Step 3: Draft Build output ──────────────────────────────────────────────

export interface RamsMethodStep {
  stepNumber: number;
  action: string;
  hazardRefs: string[];       // IDs of hazards relevant to this step
  controls: string[];
  ppe: string[];
  checkpoints: string[];      // hold points / verification actions
  sourceRef: string | null;
}

export interface RamsDraftBuildOutput {
  ramsDraftBuild: {
    title: string;
    taskDescription: string;
    location: string;
    equipment: string[];
    scope: string;
    version: string;
    applicableRegulations: string[];
    hazardMatrix: Array<{
      id: string;
      hazard: string;
      activity: string;
      personsAtRisk: string[];
      initialLikelihood: number;
      initialSeverity: number;
      initialRiskScore: number;
      controls: string[];
      regulatoryBasis: string[];
      residualLikelihood: number;
      residualSeverity: number;
      residualRiskScore: number;
      sourceRef: string | null;
    }>;
    methodStatement: RamsMethodStep[];
    emergencyProcedures: string[];
    permits: string[];
    reviewFrequency: string;
  };
}

// ─── Step 4: Fact Check output ───────────────────────────────────────────────

export interface RamsFactCheckOutput {
  ramsFactCheck: {
    hazards: Array<{
      id: string;
      attributed: boolean;
      confidence: 'high' | 'medium' | 'low';
      note?: string | null;
    }>;
    methodSteps: Array<{
      stepNumber: number;
      attributed: boolean;
      confidence: 'high' | 'medium' | 'low';
      note?: string | null;
    }>;
    unattributedCount: number;
    summary: string;
  };
}

// ─── Job accumulator ─────────────────────────────────────────────────────────

export interface RamsGenerationJob {
  ramsId: string;
  registryId: string;
  title: string;
  taskDescription: string;
  location: string;
  equipment: string[];
  sourceDocuments: RamsSourceDocContent[];
  workplaceContext: WorkplaceContext;
  regulatoryClassification: WorkplaceClassificationResult;
  steps: Record<string, StepResult>;
  stepSequence: string[];
  currentStepKey: string;
  actualTokensUsed: number;
}

export const RAMS_STEP_SEQUENCE = [
  'ramsHazardId',
  'ramsRiskAssessment',
  'ramsDraftBuild',
  'ramsFactCheck',
] as const;

export type RamsStepKey = typeof RAMS_STEP_SEQUENCE[number];

export function makeInitialRamsJob(
  ramsId: string,
  registryId: string,
  title: string,
  taskDescription: string,
  location: string,
  equipment: string[],
  sourceDocuments: RamsSourceDocContent[],
  workplaceContext: WorkplaceContext,
  regulatoryClassification: WorkplaceClassificationResult,
): RamsGenerationJob {
  const steps: Record<string, StepResult> = {};
  for (const key of RAMS_STEP_SEQUENCE) {
    steps[key] = {
      stepKey: key, status: 'pending', rawOutput: '',
      parsedJson: null, validationErrors: [], tokensUsed: 0, retryCount: 0,
    };
  }
  return {
    ramsId, registryId, title, taskDescription, location, equipment,
    sourceDocuments, workplaceContext, regulatoryClassification,
    steps, stepSequence: [...RAMS_STEP_SEQUENCE], currentStepKey: RAMS_STEP_SEQUENCE[0],
    actualTokensUsed: 0,
  };
}
