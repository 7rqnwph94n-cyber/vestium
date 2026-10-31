// ─── SOP Prompt Builders ──────────────────────────────────────────────────────
// Four prompts for the SOP pipeline:
//   1. sopExtract    — extract procedure steps from uploaded source docs
//   2. sopRegulatoryMap — map regulatory controls to each step
//   3. sopDraftBuild — assemble the final SOP document
//   4. sopFactCheck  — verify every step's sourceRef attribution

import type { SopGenerationJob, SopExtractOutput, SopRegulatoryMapOutput } from './sopTypes.js';

interface PromptPair { system: string; user: string; }

// ─── Shared regulatory context block ────────────────────────────────────────

function buildRegulatoryBlock(job: SopGenerationJob): string {
  const rc = job.regulatoryClassification;
  const schemas = rc.applicableSchemas
    .map((s) => `• ${s.schema.shortTitle} (weight: ${s.weight}${s.mandatoryForContext ? ', MANDATORY' : ''})`)
    .join('\n');
  return `<APPLICABLE_REGULATIONS>
Primary: ${rc.primarySchema.schema.id}
Applicable schemas:
${schemas}
</APPLICABLE_REGULATIONS>`;
}

// ─── Source document injection ───────────────────────────────────────────────
// Caps total injected text at ~40k tokens (≈160k chars) to stay within context.

const MAX_SOURCE_CHARS = 150_000;

function buildSourceDocsBlock(job: SopGenerationJob): string {
  let totalChars = 0;
  const blocks: string[] = [];
  for (const doc of job.sourceDocuments) {
    const header = `<SOURCE_DOCUMENT title="${doc.filename}" type="${doc.docType}">`;
    const remaining = MAX_SOURCE_CHARS - totalChars;
    if (remaining <= 0) break;
    const content = doc.content.slice(0, remaining);
    blocks.push(`${header}\n${content}\n</SOURCE_DOCUMENT>`);
    totalChars += content.length;
  }
  return blocks.join('\n\n');
}

// ─── 1. sopExtract ───────────────────────────────────────────────────────────

export function buildSopExtractPrompt(job: SopGenerationJob): PromptPair {
  const sourceDocs = buildSourceDocsBlock(job);
  const system = `You are the Legal Agent for a UK Health & Safety compliance platform.
Your task is to extract a structured procedure from uploaded manufacturer or technical documentation.

CRITICAL RULES:
1. You may ONLY describe steps that are explicitly stated or clearly implied in the source documents.
2. You must NEVER invent steps from general knowledge. If you cannot find a step in the source, omit it and note the gap.
3. Every step must include a sourceRef pointing to the source document, page/section, and a short verbatim quote (max 100 chars) that evidences the step.
4. If a step cannot be attributed to any uploaded source document, set sourceRef to null — this will surface as a Cat A finding.
5. Extract all critical values (torque values, pressures, temperatures, clearances, cooldown times) with exact units as stated in the source.
6. Extract all warnings and hazards stated in the source.

Procedure being extracted: ${job.procedureName}
Equipment: ${job.equipment}

Output JSON matching this schema exactly:
{
  "sopExtract": {
    "equipment": string,
    "prerequisites": {
      "ppe": string[],
      "conditions": string[],
      "documents": string[]
    },
    "steps": [
      {
        "stepNumber": number,
        "action": string,
        "warnings": string[],
        "criticalValues": [{ "label": string, "value": string, "unit": string }],
        "sourceRef": { "docTitle": string, "page": number|null, "section": string|null, "quote": string } | null
      }
    ],
    "postProcedure": string[],
    "emergencyActions": string[]
  }
}`;

  const user = `Extract the procedure for: ${job.procedureName} on ${job.equipment}

${sourceDocs}

Return only the JSON object. No explanation.`;

  return { system, user };
}

// ─── 2. sopRegulatoryMap ─────────────────────────────────────────────────────

export function buildSopRegulatoryMapPrompt(
  job: SopGenerationJob,
  extractedSteps: SopExtractOutput['sopExtract']['steps'],
): PromptPair {
  const regulatoryBlock = buildRegulatoryBlock(job);
  const stepsJson = JSON.stringify(extractedSteps, null, 2);

  const system = `You are the Legal Agent for a UK Health & Safety compliance platform.
Your task is to map applicable UK regulatory controls to each step of a standard operating procedure.

For each step, identify:
- safetyControls: specific control measures required at this step (from the control hierarchy: elimination → substitution → engineering → administrative → PPE)
- regulatoryBasis: the specific regulation and regulation number that mandates each control
  Format: "REGULATION NAME Year Reg N(sub)" e.g. "PUWER 1998 Reg 8(1)(a)", "COSHH 2002 Reg 7(1)"

CRITICAL RULES:
1. Only cite regulations from the applicable schemas provided.
2. Every cited regulation must be a real regulation that applies to this step — do not pad with generic duties.
3. If LOLER applies (lifting equipment), require examination certificate check as a prerequisite document.
4. If COSHH substances are present, each handling step must reference COSHH Reg 7.
5. PUWER Reg 6 (inspection) and Reg 8 (information/training) apply to any equipment operation.

${regulatoryBlock}

Output JSON:
{
  "sopRegulatoryMap": {
    "steps": [
      {
        "stepNumber": number,
        "safetyControls": string[],
        "regulatoryBasis": string[]
      }
    ],
    "applicableRegulations": string[]
  }
}`;

  const user = `Map regulatory controls to these procedure steps for ${job.procedureName} on ${job.equipment}:

${stepsJson}

Workplace: ${job.workplaceContext.industryLabel} — ${job.workplaceContext.operations}

Return only the JSON object.`;

  return { system, user };
}

// ─── 3. sopDraftBuild ────────────────────────────────────────────────────────

export function buildSopDraftBuildPrompt(
  job: SopGenerationJob,
  extractedData: SopExtractOutput['sopExtract'],
  regulatoryData: SopRegulatoryMapOutput['sopRegulatoryMap'],
): PromptPair {
  const regulatoryBlock = buildRegulatoryBlock(job);

  const system = `You are the Legal Agent for a UK Health & Safety compliance platform.
Assemble the final Standard Operating Procedure document by merging:
- The extracted procedure steps with their sourceRefs and criticalValues
- The regulatory controls and regulatory basis for each step

Rules:
1. Merge steps by stepNumber — every step must have BOTH technical content (from extraction) AND regulatory controls.
2. Preserve all sourceRefs exactly as provided in the extraction — do not modify them.
3. Preserve all criticalValues exactly — do not round or alter numeric values.
4. The scope must describe what the procedure covers and its limitations.
5. Version: "1.0 — Draft"

${regulatoryBlock}

Output JSON matching:
{
  "sopDraftBuild": {
    "title": string,
    "procedureName": string,
    "equipment": string,
    "scope": string,
    "version": string,
    "applicableRegulations": string[],
    "prerequisites": {
      "ppe": string[],
      "conditions": string[],
      "documents": string[]
    },
    "steps": [
      {
        "stepNumber": number,
        "action": string,
        "safetyControls": string[],
        "regulatoryBasis": string[],
        "sourceRef": { "docTitle": string, "page": number|null, "section": string|null, "quote": string } | null,
        "criticalValues": [{ "label": string, "value": string, "unit": string }] | null,
        "warnings": string[] | null
      }
    ],
    "postProcedure": string[],
    "emergencyActions": string[]
  }
}`;

  const user = `Build the SOP for: ${job.procedureName} on ${job.equipment}

Extracted procedure:
${JSON.stringify(extractedData, null, 2)}

Regulatory controls:
${JSON.stringify(regulatoryData, null, 2)}

Return only the JSON object.`;

  return { system, user };
}

// ─── 4. sopFactCheck ────────────────────────────────────────────────────────

export function buildSopFactCheckPrompt(
  job: SopGenerationJob,
  draft: SopExtractOutput['sopExtract']['steps'],
): PromptPair {
  const sourceDocs = buildSourceDocsBlock(job);

  const system = `You are the verification agent for a UK H&S SOP generation platform.
Your task is to verify that every procedural step in the draft SOP can be attributed to the uploaded source documentation.

For each step:
- If sourceRef is null: attributed = false, confidence = 'low'
- If sourceRef is present: search the source documents for the cited quote/section/page.
  - If found verbatim or clearly paraphrased: attributed = true, confidence = 'high'
  - If plausible but not directly confirmed: attributed = true, confidence = 'medium'
  - If not found: attributed = false, confidence = 'low', note: "Cannot locate cited text in source"

CRITICAL: Do not invent attributions. If you cannot confirm a step is in the source, mark it as unattributed.
Unattributed steps will become Category A findings — hard stops before attestation.

Output JSON:
{
  "sopFactCheck": {
    "steps": [
      {
        "stepNumber": number,
        "attributed": boolean,
        "confidence": "high" | "medium" | "low",
        "note": string | null
      }
    ],
    "unattributedCount": number,
    "summary": string
  }
}`;

  const user = `Verify attribution for each step of: ${job.procedureName} on ${job.equipment}

Steps to verify:
${JSON.stringify(draft, null, 2)}

${sourceDocs}

Return only the JSON object.`;

  return { system, user };
}
