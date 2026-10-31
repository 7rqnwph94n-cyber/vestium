// ─── Regulatory prompt injector ───────────────────────────────────────────────
// Formats the regulatory classification result into a structured context block
// for injection into generation prompts.
//
// The injected block appears in every prompt that generates lesson content,
// blueprint stages, fact-check items, and missions.
// It is NOT injected into structural prompts (theme shell, simulator design, etc.)

import type { WorkplaceClassificationResult, ClassifiedSchema } from './types.js';

// ─── Main injector ────────────────────────────────────────────────────────────

export function buildRegulatoryContextBlock(
  classification: WorkplaceClassificationResult,
  options: { includeFullDuties?: boolean; includeValidationRules?: boolean } = {}
): string {
  const { includeFullDuties = true, includeValidationRules = true } = options;

  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    'REGULATORY CONTEXT — VESTIUM GENERATION CONSTRAINT LAYER',
    '═══════════════════════════════════════════════════════════════',
    '',
    'This module is being generated for a regulated compliance training context.',
    'The following constraints are HARD REQUIREMENTS — they cannot be relaxed.',
    '',
    `WORKPLACE: ${classification.workplaceContext.industryLabel || classification.workplaceContext.industryType}`,
    `OPERATIONS: ${classification.workplaceContext.operations || '(as specified in module domain)'}`,
    '',
    '───────────────────────────────────────────────────────────────',
    'APPLICABLE REGULATORY SCHEMAS',
    '───────────────────────────────────────────────────────────────',
  ];

  for (const classified of classification.applicableSchemas) {
    const availMark = classified.schema.siNumber ? '' : ' [SCHEMA PENDING — reference only, do not generate content for this regulation]';
    lines.push(`${classified.schema.shortTitle} (weight: ${classified.weight.toFixed(2)}) — ${classified.mandatoryForContext ? 'MANDATORY' : 'APPLICABLE'}${availMark}`);
    lines.push(`  Reason: ${classified.applicabilityReason}`);
    lines.push('');
  }

  // Add full duty detail for the primary schema (MHSWR) and any mandatory schemas
  // with full schema data
  const schemasWithData = classification.applicableSchemas.filter(
    (c) => c.schema.siNumber && c.schema.keyDuties.length > 0
  );

  if (includeFullDuties && schemasWithData.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('REGULATORY DUTIES — GENERATION MUST REFLECT THESE ACCURATELY');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');

    for (const classified of schemasWithData) {
      lines.push(...buildDutiesBlock(classified));
    }
  }

  if (includeValidationRules && schemasWithData.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('HARD CONSTRAINTS — VIOLATION = REGULATORY-SEVERITY FINDING');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');

    for (const classified of schemasWithData) {
      for (const rule of classified.schema.validationRules) {
        if (rule.severity === 'regulatory') {
          lines.push(`[${rule.ruleId}] ${rule.description}`);
          lines.push(`  → FAILURE: ${rule.failureMessage}`);
          lines.push('');
        }
      }
    }
  }

  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('ABSOLUTE GENERATION GUARDRAILS (UK COMPLIANCE MODULES)');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('');
  lines.push('1. DO NOT invent regulation numbers. If you cite a regulation, cite it exactly');
  lines.push('   as it appears in the statutory instrument — e.g. "Reg 3 of MHSWR 1999".');
  lines.push('   Do not paraphrase regulation numbers or conflate different regulations.');
  lines.push('');
  lines.push('2. DO NOT state numeric thresholds (e.g. "5 or more employees") unless the');
  lines.push('   specific regulation or ACOP paragraph is cited as the source.');
  lines.push('');
  lines.push('3. DO NOT claim UK-wide application for Great Britain regulations. MHSWR 1999');
  lines.push('   applies in Great Britain (England, Wales, Scotland). Northern Ireland has');
  lines.push('   separate but equivalent legislation.');
  lines.push('');
  lines.push('4. DO NOT present ACOP guidance as legally binding law. An Approved Code of');
  lines.push('   Practice has evidential but not primary legislative status.');
  lines.push('');
  lines.push('5. DO NOT invent penalty figures, fine amounts, or prosecution statistics.');
  lines.push('   Enforcement consequences must trace to HSWA 1974 or HSE published statistics.');
  lines.push('');
  lines.push('6. DUTY HOLDERS must be accurately identified. The employer bears primary duties');
  lines.push('   under MHSWR — not the health and safety officer, manager, or HR team,');
  lines.push('   unless the specific regulation names a different duty holder.');
  lines.push('');
  lines.push('7. The legal standard for risk assessment is "suitable and sufficient" (Reg 3(1)).');
  lines.push('   Do not substitute with "adequate", "thorough", "comprehensive", or similar.');
  lines.push('');
  lines.push('8. ALL regulatory claims must be flagged in the fact-check step with severity');
  lines.push('   matching the fact-check severity configuration for the applicable schemas.');
  lines.push('   Regulatory-severity claims are non-dismissable without a recorded rationale.');
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ─── Duty block formatter ─────────────────────────────────────────────────────

function buildDutiesBlock(classified: ClassifiedSchema): string[] {
  const schema = classified.schema;
  const lines: string[] = [
    `${schema.shortTitle} — ${schema.fullTitle}`,
    `SI Number: ${schema.siNumber} | Jurisdiction: ${schema.jurisdiction} | In force: ${schema.inForce ? 'Yes' : 'No'}`,
    `Scope: ${schema.applicabilityScope}`,
    '',
    'KEY LEGAL DUTIES:',
  ];

  for (const duty of schema.keyDuties) {
    lines.push(`  ${duty.regulation} — ${duty.title}`);
    lines.push(`  Duty holders: ${duty.dutyHolders.join(', ')}`);
    lines.push(`  Summary: ${duty.summary}`);
    if (duty.conditionNote) {
      lines.push(`  Condition: ${duty.conditionNote}`);
    }
    if (duty.acopReference) {
      lines.push(`  ACOP reference: ${duty.acopReference}`);
    }
    lines.push('');
  }

  if (schema.complianceCriteria.length > 0) {
    lines.push('COMPLIANCE CRITERIA (content must cover these):');
    for (const criterion of schema.complianceCriteria) {
      lines.push(`  • ${criterion}`);
    }
    lines.push('');
  }

  if (schema.learningArcStages.length > 0) {
    lines.push('STANDARD LEARNING ARC FOR THIS REGULATION:');
    schema.learningArcStages.forEach((stage, i) => {
      lines.push(`  Stage ${i + 1}: ${stage}`);
    });
    lines.push('');
  }

  lines.push('SOURCE DOCUMENTS (all references must trace to one of these):');
  for (const doc of schema.sourceDocuments) {
    lines.push(`  [${doc.id}] ${doc.title} — ${doc.url} (${doc.year})`);
  }
  lines.push('');

  return lines;
}

// ─── Compact injector for subsequent steps ────────────────────────────────────
// Used in lesson-level prompts where the full block would be too long.
// Includes schema list and guardrails but not the full duty breakdown.

export function buildRegulatoryContextCompact(
  classification: WorkplaceClassificationResult
): string {
  return buildRegulatoryContextBlock(classification, {
    includeFullDuties: false,
    includeValidationRules: false,
  });
}

// ─── Fact-check severity config for the fact-check step ──────────────────────
// Returns a formatted config block to inject into the fact-check prompt,
// telling the AI which claim patterns must be flagged at which severity.

export function buildFactCheckSeverityConfig(
  classification: WorkplaceClassificationResult
): string {
  const lines: string[] = [
    'REGULATORY FACT-CHECK SEVERITY CONFIGURATION',
    '',
    'Claims matching these patterns MUST be flagged at the specified severity.',
    '"regulatory" severity = non-dismissable in the reviewer portal without recorded rationale.',
    '"high" severity = source verification required.',
    '"medium" severity = reviewable with documented rationale.',
    '',
  ];

  const regulatoryPatterns: string[] = [];
  const highPatterns: string[] = [];
  const mediumPatterns: string[] = [];

  for (const classified of classification.applicableSchemas) {
    const config = classified.schema.factCheckSeverityConfig;
    regulatoryPatterns.push(...config.regulatoryPatterns);
    highPatterns.push(...config.highPatterns);
    mediumPatterns.push(...config.mediumPatterns);
  }

  const dedupe = (arr: string[]) => [...new Set(arr)];

  lines.push('REGULATORY severity — flag when claim contains or implies:');
  for (const p of dedupe(regulatoryPatterns)) {
    lines.push(`  • ${p}`);
  }
  lines.push('');
  lines.push('HIGH severity — flag when claim contains or implies:');
  for (const p of dedupe(highPatterns)) {
    lines.push(`  • ${p}`);
  }
  lines.push('');
  lines.push('MEDIUM severity — flag when claim contains or implies:');
  for (const p of dedupe(mediumPatterns)) {
    lines.push(`  • ${p}`);
  }

  return lines.join('\n');
}
