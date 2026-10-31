// ─── RAMS Prompt Builders ─────────────────────────────────────────────────────
// Four prompts for the RAMS pipeline:
//   1. ramsHazardId      — identify hazards from task + source docs
//   2. ramsRiskAssessment — L×S matrix, controls per hazard
//   3. ramsDraftBuild     — assemble complete RAMS document
//   4. ramsFactCheck      — verify controls trace to source docs/regs

import type {
  RamsGenerationJob,
  RamsHazardIdOutput,
  RamsRiskAssessmentOutput,
} from './ramsTypes.js';

interface PromptPair { system: string; user: string; }

// ─── Shared blocks ──────────────────────────────────────────────────────────

function buildRegulatoryBlock(job: RamsGenerationJob): string {
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

const MAX_SOURCE_CHARS = 150_000;

function buildSourceDocsBlock(job: RamsGenerationJob): string {
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

// ─── 1. ramsHazardId ────────────────────────────────────────────────────────

export function buildRamsHazardIdPrompt(job: RamsGenerationJob): PromptPair {
  const sourceDocs = buildSourceDocsBlock(job);
  const regulatoryBlock = buildRegulatoryBlock(job);

  const system = `You are the Legal Agent for a UK Health & Safety compliance platform.
Your task is to identify ALL hazards associated with a work activity from the uploaded source documentation and task description.

CRITICAL RULES:
1. Extract hazards ONLY from information in the source documents and task description. Do not invent hazards from general knowledge.
2. Each hazard must describe a specific risk, not a generic category.
3. Assign a unique string ID to each hazard (e.g. "H1", "H2").
4. Identify ALL persons at risk for each hazard (workers, visitors, public, contractors).
5. If a hazard can be traced to a source document, provide the sourceRef. If not, set sourceRef to null — this will surface as a Cat A finding.

${regulatoryBlock}

Task: ${job.taskDescription}
Location: ${job.location}
Equipment: ${job.equipment.join(', ')}

Output JSON:
{
  "ramsHazardId": {
    "hazards": [
      {
        "id": string,
        "hazard": string,
        "activity": string,
        "personsAtRisk": string[],
        "sourceRef": string | null
      }
    ]
  }
}`;

  const user = `Identify all hazards for this task: ${job.taskDescription}
Location: ${job.location}
Equipment: ${job.equipment.join(', ')}

${sourceDocs}

Return only the JSON object.`;

  return { system, user };
}

// ─── 2. ramsRiskAssessment ──────────────────────────────────────────────────

export function buildRamsRiskAssessmentPrompt(
  job: RamsGenerationJob,
  hazards: RamsHazardIdOutput['ramsHazardId']['hazards'],
): PromptPair {
  const regulatoryBlock = buildRegulatoryBlock(job);

  const system = `You are the Legal Agent for a UK Health & Safety compliance platform.
Your task is to assess the risk for each identified hazard using a 5×5 Likelihood × Severity matrix and specify control measures.

Likelihood scale (1-5):
1 = Very unlikely, 2 = Unlikely, 3 = Possible, 4 = Likely, 5 = Very likely

Severity scale (1-5):
1 = Negligible, 2 = Minor injury, 3 = Major injury / RIDDOR reportable, 4 = Life-changing / permanent disability, 5 = Fatal

Risk score = Likelihood × Severity
- 1-4: Low risk (acceptable)
- 5-9: Medium risk (reduce if reasonably practicable)
- 10-15: High risk (action required before work proceeds)
- 16-25: Intolerable (work must not proceed)

CONTROL HIERARCHY (apply in order):
1. Elimination — remove the hazard entirely
2. Substitution — replace with less hazardous alternative
3. Engineering controls — physical barriers, ventilation, guards
4. Administrative controls — permits, procedures, training, signage
5. PPE — last resort

CRITICAL RULES:
1. Apply the control hierarchy — don't jump straight to PPE.
2. Every control must cite a specific regulatory basis: "REGULATION Year Reg N(sub)".
3. After controls, the residual risk score must be lower than the initial score.
4. If controls cannot reduce risk below 10, the hazard requires a permit-to-work.

${regulatoryBlock}

Output JSON:
{
  "ramsRiskAssessment": {
    "hazards": [
      {
        "id": string,
        "initialLikelihood": number,
        "initialSeverity": number,
        "initialRiskScore": number,
        "controls": string[],
        "regulatoryBasis": string[],
        "residualLikelihood": number,
        "residualSeverity": number,
        "residualRiskScore": number
      }
    ]
  }
}`;

  const user = `Assess risk and specify controls for these hazards on task: ${job.taskDescription}

Identified hazards:
${JSON.stringify(hazards, null, 2)}

Workplace: ${job.workplaceContext.industryLabel} — ${job.workplaceContext.operations}

Return only the JSON object.`;

  return { system, user };
}

// ─── 3. ramsDraftBuild ──────────────────────────────────────────────────────

export function buildRamsDraftBuildPrompt(
  job: RamsGenerationJob,
  hazards: RamsHazardIdOutput['ramsHazardId']['hazards'],
  riskAssessment: RamsRiskAssessmentOutput['ramsRiskAssessment'],
): PromptPair {
  const regulatoryBlock = buildRegulatoryBlock(job);

  const system = `You are the Legal Agent for a UK Health & Safety compliance platform.
Assemble the complete Risk Assessment & Method Statement (RAMS) document by merging:
- The identified hazards with their source references
- The risk assessment with controls and regulatory basis

The output MUST include:
1. A complete hazard matrix (merging hazard identification + risk assessment)
2. A step-by-step method statement for the task
3. Emergency procedures
4. Required permits
5. Review frequency

METHOD STATEMENT RULES:
1. Each step must reference which hazards (by ID) are relevant.
2. Each step must list the specific controls from the risk assessment.
3. Include PPE requirements per step.
4. Include checkpoints (hold points) where supervisor verification is required.
5. If a step cannot be traced to source docs, set sourceRef to null.

${regulatoryBlock}

Output JSON:
{
  "ramsDraftBuild": {
    "title": string,
    "taskDescription": string,
    "location": string,
    "equipment": string[],
    "scope": string,
    "version": string,
    "applicableRegulations": string[],
    "hazardMatrix": [
      {
        "id": string, "hazard": string, "activity": string,
        "personsAtRisk": string[],
        "initialLikelihood": number, "initialSeverity": number, "initialRiskScore": number,
        "controls": string[], "regulatoryBasis": string[],
        "residualLikelihood": number, "residualSeverity": number, "residualRiskScore": number,
        "sourceRef": string | null
      }
    ],
    "methodStatement": [
      {
        "stepNumber": number, "action": string,
        "hazardRefs": string[], "controls": string[],
        "ppe": string[], "checkpoints": string[],
        "sourceRef": string | null
      }
    ],
    "emergencyProcedures": string[],
    "permits": string[],
    "reviewFrequency": string
  }
}`;

  const user = `Build the complete RAMS for: ${job.taskDescription}
Location: ${job.location}
Equipment: ${job.equipment.join(', ')}

Identified hazards:
${JSON.stringify(hazards, null, 2)}

Risk assessment:
${JSON.stringify(riskAssessment, null, 2)}

Return only the JSON object.`;

  return { system, user };
}

// ─── 4. ramsFactCheck ───────────────────────────────────────────────────────

export function buildRamsFactCheckPrompt(
  job: RamsGenerationJob,
  hazardMatrix: RamsDraftBuildOutput['ramsDraftBuild']['hazardMatrix'],
  methodStatement: RamsDraftBuildOutput['ramsDraftBuild']['methodStatement'],
): PromptPair {
  const sourceDocs = buildSourceDocsBlock(job);

  const system = `You are the verification agent for a UK H&S RAMS generation platform.
Your task is to verify that every hazard and method step can be attributed to uploaded source documentation.

For each hazard:
- If sourceRef is null: attributed = false, confidence = 'low'
- If sourceRef is present: search source documents for evidence. Rate confidence accordingly.

For each method step:
- If sourceRef is null: attributed = false, confidence = 'low'
- If sourceRef is present: verify the action/control is evidenced in source docs.

CRITICAL: Do not invent attributions. Unattributed items become Category A findings.

Output JSON:
{
  "ramsFactCheck": {
    "hazards": [
      { "id": string, "attributed": boolean, "confidence": "high"|"medium"|"low", "note": string|null }
    ],
    "methodSteps": [
      { "stepNumber": number, "attributed": boolean, "confidence": "high"|"medium"|"low", "note": string|null }
    ],
    "unattributedCount": number,
    "summary": string
  }
}`;

  const user = `Verify attribution for RAMS: ${job.taskDescription}

Hazard matrix:
${JSON.stringify(hazardMatrix, null, 2)}

Method statement:
${JSON.stringify(methodStatement, null, 2)}

${sourceDocs}

Return only the JSON object.`;

  return { system, user };
}

// Re-export type for fact check prompt signature
import type { RamsDraftBuildOutput } from './ramsTypes.js';
export type { RamsDraftBuildOutput };
