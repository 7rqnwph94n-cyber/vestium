// ─── Proxy Asset Library routes ───────────────────────────────────────────────
// Read-only routes — no org scoping, no audit logging.
//
//   GET  /api/assets                — list all assets (optional ?standard= ?category= filter)
//   POST /api/assets/resolve        — resolve assets for a mission context

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { resolveAssets } from '../services/assetFetcher.js';
import { OGL_ATTRIBUTION } from '../regulatory/assetMapper.js';
import type { ProxyAssetRecord, AssetResolveRequest, AssetResolveResult, ApiResponse } from '@complianceforge/types';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const AssetResolveSchema = z.object({
  regulatorySchemaIds: z.array(z.string()).min(1),
  hazardTags: z.array(z.string()).default([]),
  operationType: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

// ─── Row mapper ───────────────────────────────────────────────────────────────

function rowToProxyAsset(row: Record<string, unknown>): ProxyAssetRecord {
  const svgPath = row.svg_path as string | null;
  const base = process.env.API_BASE_URL ?? 'http://localhost:3001';
  return {
    id: row.id as string,
    symbolCode: row.symbol_code as string,
    standard: row.standard as 'iso7010' | 'iec60417',
    category: row.category as ProxyAssetRecord['category'],
    description: row.description as string,
    tags: row.tags as string[],
    schemaRefs: row.schema_refs as string[],
    svgUrl: svgPath ? `${base}/assets/${svgPath}` : null,
    licence: row.licence as string,
    attribution: row.attribution as string,
  };
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export const assetsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/assets
  // Returns all assets. Optional query filters: ?standard= ?category=
  app.get<{
    Querystring: { standard?: string; category?: string };
  }>('/', async (request): Promise<ApiResponse<{
    assets: ProxyAssetRecord[];
    total: number;
    attribution: string;
  }>> => {
    const { standard, category } = request.query;

    const rows = (await sql`
      SELECT * FROM proxy_assets
      WHERE
        (${standard ?? null} IS NULL OR standard = ${standard ?? null})
        AND (${category ?? null} IS NULL OR category = ${category ?? null})
      ORDER BY standard, category, symbol_code
    `) as Record<string, unknown>[];

    const assets = rows.map(rowToProxyAsset);
    return {
      ok: true,
      data: { assets, total: assets.length, attribution: OGL_ATTRIBUTION },
    };
  });

  // GET /api/assets/:symbolCode
  // Look up a single asset by symbol code and optional standard.
  app.get<{
    Params: { symbolCode: string };
    Querystring: { standard?: string };
  }>('/:symbolCode', async (request, reply): Promise<ApiResponse<ProxyAssetRecord>> => {
    const { symbolCode } = request.params;
    const { standard } = request.query;

    const rows = (await sql`
      SELECT * FROM proxy_assets
      WHERE symbol_code = ${symbolCode.toUpperCase()}
        AND (${standard ?? null} IS NULL OR standard = ${standard ?? null})
      LIMIT 1
    `) as Record<string, unknown>[];
    if (!rows[0]) {
      reply.status(404);
      return { ok: false, error: `Asset ${symbolCode} not found` };
    }
    return { ok: true, data: rowToProxyAsset(rows[0]) };
  });

  // POST /api/assets/resolve
  // Core Asset Fetcher endpoint.
  // Takes mission/module context and returns ranked ISO 7010 / IEC 60417 assets.
  app.post<{ Body: AssetResolveRequest }>('/resolve', async (request, reply): Promise<ApiResponse<AssetResolveResult>> => {
    const parsed = AssetResolveSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: 'Invalid request body', code: parsed.error.message };
    }

    const result = await resolveAssets({
      regulatorySchemaIds: parsed.data.regulatorySchemaIds,
      hazardTags: parsed.data.hazardTags,
      limit: parsed.data.limit,
    });

    return { ok: true, data: result };
  });
};
