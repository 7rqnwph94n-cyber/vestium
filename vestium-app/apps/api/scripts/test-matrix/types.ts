// ─── Test Matrix Types ───────────────────────────────────────────────────────

import type { WorkplaceContextDTO, ClassificationSummaryDTO } from '@complianceforge/types';

export interface TestCase {
  id: string;                     // TM-01 through TM-05
  name: string;                   // Human label
  purpose: string;                // What failure mode it targets
  title: string;                  // Module title for this test case
  workplaceContext: WorkplaceContextDTO;
  hazardKeywords: string[];       // For classification (separate from the DTO which stores them in hazardKeywords)
  additionalContext: string;
  expectedBehavior: string[];     // Checklist of things to verify
}

export interface TestCaseWithClassification extends TestCase {
  regulatoryClassification: ClassificationSummaryDTO;
}

export interface FindingSummary {
  total: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  byDisposition: Record<string, number>;
  catACount: number;
  regulatoryCount: number;
}

export interface StepSummary {
  stepKey: string;
  status: string;
  tokensUsed: number;
}

export interface CostBreakdown {
  anthropicTokens: number;
  geminiTokens: number;
  estimatedUsdCost: number;
}

export interface TestResult {
  testCaseId: string;
  testCaseName: string;
  purpose: string;
  moduleId: string | null;
  generationStatus: 'complete' | 'failed' | 'error';
  error?: string;
  durationMs: number;
  totalTokensUsed: number;
  cost?: CostBreakdown;
  steps: StepSummary[];
  findings: FindingSummary;
  expectedBehavior: Array<{ check: string; passed: boolean | null; notes: string }>;
  timestamp: string;
}
