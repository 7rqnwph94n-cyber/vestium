// ─── SOP Pipeline Types ───────────────────────────────────────────────────────
// Separate from GenerationJob — the SOP pipeline is 4 sequential steps and has
// a different input shape (uploaded source docs, not regulatory schemas alone).

import type { StepResult, GroundTruth } from './types.js';
import type { WorkplaceContext, WorkplaceClassificationResult } from '../regulatory/types.js';

// ─── SOP step document ───────────────────────────────────────────────────────

export interface SopCriticalValue {
  label: string;   // e.g. "Torque"
  value: string;   // e.g. "25"
  unit?: string;   // e.g. "Nm"
}

export interface SopSourceRef {
  docTitle: string;
  page?: number;
  section?: string;
  quote?: string;   // verbatim excerpt from source doc (max 200 chars)
}

export interface SopStep {
  stepNumber: number;
  action: string;
  safetyControls: string[];
  regulatoryBasis: string[];   // e.g. ["PUWER Reg 8(1)(a)", "COSHH Reg 7(1)"]
  sourceRef: SopSourceRef | null;  // null = unattributed → Cat A finding
  criticalValues?: SopCriticalValue[];
  warnings?: string[];
}

export interface SopPrerequisites {
  ppe: string[];
  conditions: string[];    // environmental/operational conditions required before start
  documents: string[];     // permits, certificates, records to check
}

export interface SopDocument {
  title: string;
  procedureName: string;
  equipment: string;
  scope: string;
  version: string;
  applicableRegulations: string[];
  prerequisites: SopPrerequisites;
  steps: SopStep[];
  postProcedure: string[];
  emergencyActions: string[];
}

// ─── Source document (in-memory, loaded at job start) ────────────────────────

export interface SopSourceDocContent {
  id: string;
  filename: string;
  docType: string;
  content: string;   // extracted text
}

// ─── Step output types ────────────────────────────────────────────────────────

export interface SopExtractOutput {
  sopExtract: {
    equipment: string;
    prerequisites: SopPrerequisites;
    steps: Array<{
      stepNumber: number;
      action: string;
      warnings?: string[];
      criticalValues?: SopCriticalValue[];
      sourceRef: SopSourceRef | null;
    }>;
    postProcedure: string[];
    emergencyActions: string[];
  };
}

export interface SopRegulatoryMapOutput {
  sopRegulatoryMap: {
    steps: Array<{
      stepNumber: number;
      safetyControls: string[];
      regulatoryBasis: string[];
    }>;
    applicableRegulations: string[];
  };
}

export interface SopDraftBuildOutput {
  sopDraftBuild: SopDocument;
}

export interface SopFactCheckOutput {
  sopFactCheck: {
    steps: Array<{
      stepNumber: number;
      attributed: boolean;
      confidence: 'high' | 'medium' | 'low';
      note?: string;
    }>;
    unattributedCount: number;
    summary: string;
  };
}

// ─── Job accumulator ──────────────────────────────────────────────────────────

export interface SopGenerationJob {
  sopId: string;
  title: string;
  procedureName: string;
  equipment: string;
  sourceDocuments: SopSourceDocContent[];
  workplaceContext: WorkplaceContext;
  regulatoryClassification: WorkplaceClassificationResult;
  moduleGroundTruth?: GroundTruth;   // injected from parent module for paired mode
  steps: Record<string, StepResult>;
  stepSequence: string[];
  currentStepKey: string;
  actualTokensUsed: number;
}

export const SOP_STEP_SEQUENCE = ['sopExtract', 'sopRegulatoryMap', 'sopDraftBuild', 'sopFactCheck'] as const;
export type SopStepKey = typeof SOP_STEP_SEQUENCE[number];

export function makeInitialSopJob(
  sopId: string,
  title: string,
  procedureName: string,
  equipment: string,
  sourceDocuments: SopSourceDocContent[],
  workplaceContext: WorkplaceContext,
  regulatoryClassification: WorkplaceClassificationResult,
  moduleGroundTruth?: GroundTruth,
): SopGenerationJob {
  const steps: Record<string, StepResult> = {};
  for (const key of SOP_STEP_SEQUENCE) {
    steps[key] = {
      stepKey: key, status: 'pending', rawOutput: '',
      parsedJson: null, validationErrors: [], tokensUsed: 0, retryCount: 0,
    };
  }
  return {
    sopId, title, procedureName, equipment,
    sourceDocuments, workplaceContext, regulatoryClassification, moduleGroundTruth,
    steps, stepSequence: [...SOP_STEP_SEQUENCE], currentStepKey: SOP_STEP_SEQUENCE[0],
    actualTokensUsed: 0,
  };
}
