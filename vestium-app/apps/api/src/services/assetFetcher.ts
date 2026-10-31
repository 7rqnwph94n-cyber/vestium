// ─── Asset Fetcher Service ────────────────────────────────────────────────────
// Resolves ISO 7010 / IEC 60417 proxy assets for a given mission context.
//
// The fetcher is the intelligence layer between the generation pipeline and the
// vetted symbol registry. Given regulatory schema IDs and hazard keywords, it
// returns:
//   canonical  — symbols that are legally tied to the applicable regulations
//   contextual — symbols matched by hazard keyword scoring
//
// Both sets carry full OGL attribution metadata.

import { sql } from '../db/client.js';
import {
  SCHEMA_CANONICAL_ASSETS,
  HAZARD_TAG_ASSETS,
  OGL_ATTRIBUTION,
} from '../regulatory/assetMapper.js';
import type { ProxyAssetRecord, AssetResolveResult } from '@complianceforge/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssetRequest {
  regulatorySchemaIds: string[];   // from regulatoryClassification.applicableSchemas[].schema.id
  hazardTags: string[];            // from workplaceContext.hazardKeywords
  limit?: number;                  // max contextual results (default 12)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function rowToProxyAsset(
  row: Record<string, unknown>,
  svgBaseUrl: string,
): ProxyAssetRecord {
  const svgPath = row.svg_path as string | null;
  return {
    id: row.id as string,
    symbolCode: row.symbol_code as string,
    standard: row.standard as 'iso7010' | 'iec60417',
    category: row.category as ProxyAssetRecord['category'],
    description: row.description as string,
    tags: row.tags as string[],
    schemaRefs: row.schema_refs as string[],
    svgUrl: svgPath ? `${svgBaseUrl}/${svgPath}` : null,
    licence: row.licence as string,
    attribution: row.attribution as string,
  };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function buildScoreMap(
  regulatorySchemaIds: string[],
  hazardTags: string[],
): Map<string, number> {
  const scores = new Map<string, number>();

  const addScore = (code: string, points: number) => {
    scores.set(code, (scores.get(code) ?? 0) + points);
  };

  // Canonical schema matches: +3 per schema that lists this code
  for (const schemaId of regulatorySchemaIds) {
    const codes = SCHEMA_CANONICAL_ASSETS[schemaId] ?? [];
    for (const code of codes) {
      addScore(code, 3);
    }
  }

  // Hazard tag matches: +2 per tag that references this code
  for (const tag of hazardTags) {
    const lowerTag = tag.toLowerCase();
    const codes = HAZARD_TAG_ASSETS[lowerTag] ?? [];
    for (const code of codes) {
      addScore(code, 2);
    }
  }

  return scores;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function resolveAssets(
  request: AssetRequest,
  svgBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001/assets',
): Promise<AssetResolveResult> {
  const { regulatorySchemaIds, hazardTags, limit = 12 } = request;

  // Build the score map across all relevant codes
  const scoreMap = buildScoreMap(regulatorySchemaIds, hazardTags);

  if (scoreMap.size === 0) {
    return { canonical: [], contextual: [], attribution: OGL_ATTRIBUTION };
  }

  // Collect all codes that scored at all
  const allCodes = Array.from(scoreMap.keys());

  // Single DB round-trip: fetch all matching assets
  const rows = (await sql`
    SELECT * FROM proxy_assets
    WHERE symbol_code = ANY(${allCodes})
    ORDER BY standard, category, symbol_code
  `) as Record<string, unknown>[];

  // Attach scores and sort descending
  const scored = rows.map((row) => ({
    asset: rowToProxyAsset(row, svgBaseUrl),
    score: scoreMap.get(row.symbol_code as string) ?? 0,
  }));
  scored.sort((a, b) => b.score - a.score);

  // Canonical = score ≥ 3 (at least one schema-canonical match)
  // Contextual = score < 3 but > 0 (hazard-tag match only)
  const canonical = scored
    .filter(({ score }) => score >= 3)
    .map(({ asset }) => asset);

  const contextual = scored
    .filter(({ score }) => score > 0 && score < 3)
    .slice(0, limit)
    .map(({ asset }) => asset);

  return { canonical, contextual, attribution: OGL_ATTRIBUTION };
}
