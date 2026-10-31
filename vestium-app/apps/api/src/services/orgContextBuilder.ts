// ─── Org Context Builder ──────────────────────────────────────────────────────
// Called after each module deployment to distill the org's accumulated
// knowledge into a compact prompt block for future generations.
//
// Extracts from all deployed modules:
// - Stage topics (from blueprint)
// - Domain insights (from domainSurvey ground truth)
// - Reviewer corrections (amended/escalated findings only)
// - Module summaries (title, deployed date, topics)
//
// Caps: 50 corrections, 30 topics, 20 insights (prompt size budget)

import { sql } from '../db/client.js';
import type { DistilledOrgContextDTO } from '@complianceforge/types';

const MAX_CORRECTIONS = 50;
const MAX_TOPICS = 30;
const MAX_INSIGHTS = 20;

// ─── Types for raw DB/JSON extraction ────────────────────────────────────────

interface BlueprintStage {
  title: string;
  stageObjective?: string;
  lessons?: Array<{ title: string }>;
}

interface BlueprintOutput {
  blueprint?: BlueprintStage[];
}

interface GroundTruth {
  mandatoryTopics?: string[];
  enforcementPriorities?: string[];
  keyDutyHolders?: string[];
  regulatoryRefs?: string[];
}

interface FindingRow {
  module_id: string;
  severity: string;
  category: string;
  description: string;
  location: string;
  regulatory_ref: string | null;
  disposition: string;
  disposition_rationale: string | null;
  module_title: string;
}

interface DeployedModuleRow {
  id: string;
  title: string;
  deployed_at: string;
  job_state: {
    steps?: Record<string, { parsedJson?: unknown }>;
    groundTruth?: GroundTruth;
  } | null;
}

// ─── Core builder ────────────────────────────────────────────────────────────

export function extractStageTopics(jobState: DeployedModuleRow['job_state']): string[] {
  if (!jobState?.steps?.['blueprint']?.parsedJson) return [];
  const bp = jobState.steps['blueprint'].parsedJson as BlueprintOutput;
  if (!bp.blueprint || !Array.isArray(bp.blueprint)) return [];

  const topics: string[] = [];
  for (const stage of bp.blueprint) {
    if (stage.title) topics.push(stage.title);
    if (stage.lessons) {
      for (const lesson of stage.lessons) {
        if (lesson.title) topics.push(lesson.title);
      }
    }
  }
  return topics;
}

export function extractDomainInsights(jobState: DeployedModuleRow['job_state']): string[] {
  const gt = jobState?.groundTruth;
  if (!gt) return [];

  const insights: string[] = [];
  if (gt.mandatoryTopics) insights.push(...gt.mandatoryTopics);
  if (gt.enforcementPriorities) insights.push(...gt.enforcementPriorities);
  return insights;
}

export function extractCoveredRegulations(jobState: DeployedModuleRow['job_state']): string[] {
  const gt = jobState?.groundTruth;
  if (!gt?.regulatoryRefs) return [];
  return gt.regulatoryRefs;
}

export async function buildDistilledContext(dbOrgId: string): Promise<{
  distilled: DistilledOrgContextDTO;
  modulesDeployed: number;
}> {
  // 1. Load all deployed modules with their job state
  const moduleRows = await sql`
    SELECT m.id, m.title, m.deployed_at, gj.job_state
    FROM modules m
    LEFT JOIN generation_jobs gj ON gj.module_id = m.id
    WHERE m.org_id = ${dbOrgId} AND m.status = 'deployed'
    ORDER BY m.deployed_at ASC
  ` as DeployedModuleRow[];

  // 2. Load all reviewer corrections (amended/escalated findings across deployed modules)
  const findingRows = await sql`
    SELECT rf.module_id, rf.severity, rf.category, rf.description,
           rf.location, rf.regulatory_ref, rf.disposition,
           rf.disposition_rationale, m.title AS module_title
    FROM review_findings rf
    JOIN modules m ON m.id = rf.module_id
    WHERE m.org_id = ${dbOrgId}
      AND m.status = 'deployed'
      AND rf.disposition IN ('amended', 'escalated')
    ORDER BY rf.created_at DESC
  ` as FindingRow[];

  // 3. Extract from each module
  const allTopics: string[] = [];
  const allRegulations: string[] = [];
  const allInsights: string[] = [];
  const moduleSummaries: DistilledOrgContextDTO['moduleSummaries'] = [];

  for (const mod of moduleRows) {
    const stageTopics = extractStageTopics(mod.job_state);
    allTopics.push(...stageTopics);
    allRegulations.push(...extractCoveredRegulations(mod.job_state));
    allInsights.push(...extractDomainInsights(mod.job_state));

    moduleSummaries.push({
      moduleId: mod.id,
      title: mod.title,
      deployedAt: mod.deployed_at,
      stageTopics,
    });
  }

  // 4. Build corrections from findings
  const reviewerCorrections: DistilledOrgContextDTO['reviewerCorrections'] = findingRows
    .slice(0, MAX_CORRECTIONS)
    .map((f) => ({
      moduleTitle: f.module_title,
      finding: f.description,
      disposition: f.disposition as 'amended' | 'escalated',
      rationale: f.disposition_rationale ?? '',
      regulatoryRef: f.regulatory_ref ?? undefined,
    }));

  // 5. Deduplicate and cap
  const distilled: DistilledOrgContextDTO = {
    coveredTopics: [...new Set(allTopics)].slice(0, MAX_TOPICS),
    coveredRegulations: [...new Set(allRegulations)].slice(0, MAX_TOPICS),
    reviewerCorrections,
    domainInsights: [...new Set(allInsights)].slice(0, MAX_INSIGHTS),
    moduleSummaries,
  };

  return { distilled, modulesDeployed: moduleRows.length };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function updateDistilledOrgContext(dbOrgId: string): Promise<void> {
  const { distilled, modulesDeployed } = await buildDistilledContext(dbOrgId);

  await sql`
    UPDATE org_contexts
    SET distilled_context = ${JSON.stringify(distilled)},
        modules_deployed = ${modulesDeployed},
        last_distilled_at = now(),
        updated_at = now()
    WHERE org_id = ${dbOrgId}
  `;
}
