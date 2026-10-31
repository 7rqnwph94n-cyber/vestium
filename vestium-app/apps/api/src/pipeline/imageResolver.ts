// ─── Server-side image resolver ───────────────────────────────────────────────
// Post-processes each stage output to inject vetted ISO 7010 / IEC 60417 safety
// symbols into the first lesson's diagrams array.
//
// Symbol selection:
//   - Calls resolveAssets() with the job's regulatory schema IDs + hazard tags
//   - Only injects assets where svgUrl is non-null (file physically served)
//   - ISO 7010 symbols only (IEC 60417 is commercial — no SVG content)
//   - Max 3 canonical symbols per stage, added to the first lesson
//
// If no regulatory classification is present (non-compliance module), or no
// canonical assets resolve, the stage output is returned unchanged.
//
// SVGs must be downloaded first:
//   pnpm --filter @complianceforge/api run assets:fetch-svgs

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StageLessonsOutput } from './types.js';
import type { WorkplaceClassificationResult } from '../regulatory/types.js';
import type { LessonDiagram } from '../lib/training-core/types.js';
import { resolveAssets } from '../services/assetFetcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ASSETS_DIR = join(__dirname, '../../public/assets');

// ─── Context ──────────────────────────────────────────────────────────────────

export interface ImageResolverContext {
  domainPrompt: string;
  sourceReferences: string[];
  regulatoryClassification?: WorkplaceClassificationResult;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function resolveLessonImages(
  stageOutput: StageLessonsOutput,
  context: ImageResolverContext,
): Promise<StageLessonsOutput> {
  if (!context.regulatoryClassification) return stageOutput;

  const lessons = stageOutput.stage?.lessons;
  if (!lessons?.length) return stageOutput;

  const classification = context.regulatoryClassification;
  const schemaIds = classification.applicableSchemas.map((s) => s.schema.id);
  const hazardTags = classification.workplaceContext.hazardKeywords;

  let resolved;
  try {
    resolved = await resolveAssets({ regulatorySchemaIds: schemaIds, hazardTags, limit: 6 });
  } catch {
    // Asset resolution failure must never break generation
    return stageOutput;
  }

  // ISO 7010 only — IEC 60417 has no hosted SVG content.
  // svgUrl is set in the DB by the seed even before the file is downloaded,
  // so we also verify the file physically exists before injecting it.
  const available = resolved.canonical.filter((a) => {
    if (a.svgUrl === null || a.standard !== 'iso7010') return false;
    // Extract relative path after '/assets/' from the URL
    const match = a.svgUrl.match(/\/assets\/(.+)$/);
    if (!match) return false;
    return existsSync(join(PUBLIC_ASSETS_DIR, match[1]));
  });

  if (available.length === 0) return stageOutput;

  // Use stage id (1-based) to rotate which symbols appear — avoids every stage
  // showing the same 3 symbols when the same classification applies throughout.
  const stageId = stageOutput.stage.id ?? 1;
  const offset = (stageId - 1) % available.length;
  const rotated = [...available.slice(offset), ...available.slice(0, offset)];
  const toInject = rotated.slice(0, 3);

  const symbolDiagrams: LessonDiagram[] = toInject.map((asset) => ({
    id: `sym-${asset.symbolCode.toLowerCase()}`,
    title: `${asset.symbolCode}: ${asset.description}`,
    kind: 'image' as const,
    nodes: [],
    imageUrl: asset.svgUrl!,
    alt: `ISO 7010 ${asset.symbolCode} safety symbol — ${asset.description}`,
    caption: `${asset.symbolCode} — ${asset.description}`,
    attribution: {
      sourceName: 'Health & Safety Executive / BSI (BS EN ISO 7010:2020)',
      sourceUrl: 'https://www.hse.gov.uk/safety-signs/',
      licenseName: 'Open Government Licence v3.0',
      licenseUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      rightsStatus: 'other' as const,
    },
  }));

  const firstLesson = lessons[0];
  const updatedFirst = {
    ...firstLesson,
    diagrams: [...(firstLesson.diagrams ?? []), ...symbolDiagrams],
  };

  return {
    ...stageOutput,
    stage: {
      ...stageOutput.stage,
      lessons: [updatedFirst, ...lessons.slice(1)],
    },
  };
}
